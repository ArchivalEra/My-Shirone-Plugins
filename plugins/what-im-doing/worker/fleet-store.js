/**
 * What-Im-Doing FleetStore (Deep Module)
 *
 * Encapsulates all Cloudflare D1 SQL operations, token authentication,
 * 120-second dynamic offline auto-detection, and multi-device arbitration
 * behind a unified, cohesive interface.
 */

export class FleetAuthError extends Error {
	constructor(message, status = 401) {
		super(message);
		this.name = "FleetAuthError";
		this.status = status;
	}
}

export class FleetStore {
	constructor(db) {
		if (!db)
			throw new Error(
				"FleetStore requires a valid Cloudflare D1 database binding",
			);
		this.db = db;
	}

	/**
	 * Generates a cryptographically random high-entropy device token
	 */
	static generateToken() {
		const bytes = new Uint8Array(12);
		crypto.getRandomValues(bytes);
		let hex = "";
		for (const b of bytes) {
			hex += b.toString(16).padStart(2, "0");
		}
		return `sk_dev_${hex}`;
	}

	/**
	 * Enrolls or updates a device in the D1 registry
	 */
	async registerDevice(rawId, rawName, rawType = "desktop") {
		const id = (rawId || "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, "");
		const name = (rawName || "").trim();
		const type = rawType || "desktop";

		if (!id || !name) {
			throw new Error("Both id and name are required to register a device");
		}

		const token = FleetStore.generateToken();
		const now = Date.now();

		await this.db
			.prepare(`
        INSERT INTO devices (id, name, type, status, app_name, window_title, idle_seconds, token, last_seen, updated_at)
        VALUES (?, ?, ?, 4, '', '', 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          token = excluded.token,
          updated_at = excluded.updated_at
      `)
			.bind(id, name, type, token, now, now)
			.run();

		return { id, name, type, token };
	}

	/**
	 * Revokes and removes a device from D1
	 */
	async revokeDevice(rawId) {
		const id = (rawId || "").trim();
		if (!id) return false;
		await this.db.prepare("DELETE FROM devices WHERE id = ?").bind(id).run();
		return true;
	}

	/**
	 * Lists all registered devices for admin auditing
	 */
	async listDevices() {
		const { results } = await this.db
			.prepare(
				"SELECT id, name, type, status, token, last_seen, updated_at FROM devices ORDER BY last_seen DESC",
			)
			.all();
		return results || [];
	}

	/**
	 * Authenticates and records an incoming activity report from an edge probe
	 */
	async recordReport(payload, bearerToken) {
		if (!bearerToken) {
			throw new FleetAuthError(
				"Missing or malformed Authorization header",
				401,
			);
		}

		const deviceId = (payload.id || payload.deviceId || "").trim();
		if (!deviceId) {
			throw new Error("Missing device id in report payload");
		}

		// Verify token against D1 registry
		const device = await this.db
			.prepare("SELECT token FROM devices WHERE id = ?")
			.bind(deviceId)
			.first();

		if (!device) {
			throw new FleetAuthError(`Device '${deviceId}' is not registered`, 401);
		}

		if (device.token !== bearerToken) {
			throw new FleetAuthError("Unauthorized: device token mismatch", 403);
		}

		const status = typeof payload.status === "number" ? payload.status : 1;
		const appName = String(payload.appName || payload.process_name || "").slice(
			0,
			128,
		);
		const windowTitle = String(payload.windowTitle || "").slice(0, 256);
		const idleSeconds = Number(payload.idleSeconds) || 0;
		const reportTimestamp = Number(payload.timestamp) || Date.now();
		const now = Date.now();

		// Atomic update of state in D1
		await this.db
			.prepare(`
        UPDATE devices SET
          status = ?,
          app_name = ?,
          window_title = ?,
          idle_seconds = ?,
          last_seen = ?,
          updated_at = ?
        WHERE id = ?
      `)
			.bind(
				status,
				appName,
				windowTitle,
				idleSeconds,
				reportTimestamp,
				now,
				deviceId,
			)
			.run();

		return { ok: true, id: deviceId, lastSeen: reportTimestamp };
	}

	/**
	 * Builds the raw fleet telemetry snapshot with dynamic 120s offline calculation
	 */
	async getSnapshot(brief = false) {
		const now = Date.now();
		const { results } = await this.db
			.prepare(
				"SELECT id, name, type, status, app_name, window_title, idle_seconds, last_seen FROM devices",
			)
			.all();

		const allDevices = results || [];

		// Dynamically calculate offline status without modifying D1 table
		const processedDevices = allDevices.map((dev) => {
			const isOffline = now - dev.last_seen > 120_000;
			return {
				id: dev.id,
				deviceId: dev.id,
				name: dev.name,
				deviceName: dev.name,
				type: dev.type,
				status: isOffline ? 4 : dev.status, // 4 = OFFLINE
				appName: dev.app_name || "",
				windowTitle: dev.window_title || "",
				idleSeconds: dev.idle_seconds || 0,
				lastSeen: dev.last_seen,
				timestamp: dev.last_seen,
				offline: isOffline,
			};
		});

		// Multi-Device Arbitration:
		// Active devices (status 1) with lowest idleSeconds take precedence;
		// Prefer desktop > laptop > server;
		// If all offline, choose the most recently active device.
		const typePriority = {
			desktop: 3,
			laptop: 2,
			server: 1,
			mobile: 1,
			other: 0,
		};
		const sorted = [...processedDevices].sort((a, b) => {
			if (!a.offline && b.offline) return -1;
			if (a.offline && !b.offline) return 1;
			if (!a.offline && !b.offline) {
				const priDiff =
					(typePriority[b.type] || 0) - (typePriority[a.type] || 0);
				if (priDiff !== 0) return priDiff;
				return (a.idleSeconds || 0) - (b.idleSeconds || 0);
			}
			return b.lastSeen - a.lastSeen;
		});

		const current = sorted.length > 0 ? sorted[0] : null;

		if (brief) {
			return {
				current,
				serverTime: now,
			};
		}

		const groups = {
			desktop: processedDevices.filter(
				(d) => d.type === "desktop" && !d.offline,
			).length,
			laptop: processedDevices.filter((d) => d.type === "laptop" && !d.offline)
				.length,
			server: processedDevices.filter((d) => d.type === "server" && !d.offline)
				.length,
		};

		return {
			current,
			devices: processedDevices,
			groups,
			serverTime: now,
		};
	}
}
