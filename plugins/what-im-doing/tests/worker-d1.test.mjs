import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/worker.js";

// Minimal in-memory mock of Cloudflare D1 Database
class MockD1Database {
	constructor() {
		this.rows = new Map();
	}

	prepare(query) {
		const db = this;
		return {
			bind(...params) {
				this.params = params;
				return this;
			},
			async run() {
				const q = query.trim();
				if (q.includes("INSERT INTO devices")) {
					const [id, name, type, token, lastSeen, updatedAt] = this.params;
					db.rows.set(id, {
						id,
						name,
						type,
						status: 4,
						app_name: "",
						window_title: "",
						idle_seconds: 0,
						os_info: "",
						media_title: "",
						media_artist: "",
						token,
						last_seen: lastSeen,
						updated_at: updatedAt,
					});
					return { success: true };
				}
				if (q.includes("UPDATE devices SET")) {
					const [
						status,
						appName,
						windowTitle,
						idleSeconds,
						osInfo,
						mediaTitle,
						mediaArtist,
						lastSeen,
						updatedAt,
						id,
					] = this.params;
					const existing = db.rows.get(id);
					if (existing) {
						existing.status = status;
						existing.app_name = appName;
						existing.window_title = windowTitle;
						existing.idle_seconds = idleSeconds;
						existing.os_info = osInfo;
						existing.media_title = mediaTitle;
						existing.media_artist = mediaArtist;
						existing.last_seen = lastSeen;
						existing.updated_at = updatedAt;
					}
					return { success: true };
				}
				if (q.includes("DELETE FROM devices")) {
					const [id] = this.params;
					db.rows.delete(id);
					return { success: true };
				}
				return { success: true };
			},
			async first() {
				const q = query.trim();
				if (q.includes("SELECT token FROM devices WHERE id = ?")) {
					const [id] = this.params;
					const row = db.rows.get(id);
					return row ? { token: row.token } : null;
				}
				return null;
			},
			async all() {
				return { results: Array.from(db.rows.values()) };
			},
		};
	}
}

test("Cloudflare Worker + D1: Health Probe", async () => {
	const env = { DB: new MockD1Database() };
	const req = new Request("http://localhost/health");
	const res = await worker.fetch(req, env);
	assert.equal(res.status, 200);
	const data = await res.json();
	assert.equal(data.ok, true);
});

test("Cloudflare Worker + D1: Register Device and Authenticate Report", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	// 1. Register device
	const regReq = new Request("http://localhost/admin/devices", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			id: "debian-desktop",
			name: "Debian 13 开发工作站",
			type: "desktop",
		}),
	});
	const regRes = await worker.fetch(regReq, env);
	assert.equal(regRes.status, 200);
	const regData = await regRes.json();
	assert.equal(regData.ok, true);
	assert.equal(regData.device.id, "debian-desktop");
	const token = regData.device.token;
	assert.ok(token.startsWith("sk_dev_"));

	// 2. Report with invalid token -> 403
	const badAuthReq = new Request("http://localhost/api/activity/report", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer sk_wrong_token",
		},
		body: JSON.stringify({
			id: "debian-desktop",
			appName: "Antigravity",
			windowTitle: "Coding",
		}),
	});
	const badAuthRes = await worker.fetch(badAuthReq, env);
	assert.equal(badAuthRes.status, 403);

	// 3. Report with valid token -> 200
	const goodReq = new Request("http://localhost/api/activity/report", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			id: "debian-desktop",
			status: 1,
			appName: "Antigravity",
			windowTitle: "Coding Shirone",
			idleSeconds: 0,
			timestamp: Date.now(),
		}),
	});
	const goodRes = await worker.fetch(goodReq, env);
	assert.equal(goodRes.status, 200);

	// 4. Fetch public activity
	const actReq = new Request("http://localhost/api/activity");
	const actRes = await worker.fetch(actReq, env);
	assert.equal(actRes.status, 200);
	const actData = await actRes.json();
	assert.equal(actData.devices.length, 1);
	assert.equal(actData.devices[0].appName, "Antigravity");
	assert.equal(actData.devices[0].offline, false);
	assert.equal(actData.current.id, "debian-desktop");
});

test("Cloudflare Worker + D1: 120s Offline Auto-Detection & Timestamp Preservation", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	const pastTime = Date.now() - 300000; // 5 minutes ago

	db.rows.set("thinkpad-x1", {
		id: "thinkpad-x1",
		name: "ThinkPad X1",
		type: "laptop",
		status: 1,
		app_name: "Zen Browser",
		window_title: "GitHub",
		idle_seconds: 600,
		token: "sk_dev_123",
		last_seen: pastTime,
		updated_at: pastTime,
	});

	const actReq = new Request("http://localhost/api/activity");
	const actRes = await worker.fetch(actReq, env);
	const actData = await actRes.json();

	const dev = actData.devices.find((d) => d.id === "thinkpad-x1");
	assert.ok(dev);
	assert.equal(dev.offline, true);
	assert.equal(dev.status, 4); // Automatically mapped to OFFLINE
	assert.equal(dev.lastSeen, pastTime); // Exact timestamp preserved!
});

test("Cloudflare Worker + D1: ADMIN_KEY Authentication Isolation", async () => {
	const db = new MockD1Database();
	const env = { DB: db, ADMIN_KEY: "super_secret_admin_key" };

	// 1. Without auth -> 401
	const unauthReq = new Request("http://localhost/admin/devices");
	const unauthRes = await worker.fetch(unauthReq, env);
	assert.equal(unauthRes.status, 401);

	// 2. With invalid key -> 401
	const badKeyReq = new Request("http://localhost/admin/devices", {
		headers: { "x-admin-key": "wrong_key" },
	});
	const badKeyRes = await worker.fetch(badKeyReq, env);
	assert.equal(badKeyRes.status, 401);

	// 3. With valid x-admin-key header -> 200
	const goodKeyReq = new Request("http://localhost/admin/devices", {
		headers: { "x-admin-key": "super_secret_admin_key" },
	});
	const goodKeyRes = await worker.fetch(goodKeyReq, env);
	assert.equal(goodKeyRes.status, 200);

	// 4. With Bearer token -> 200
	const bearerReq = new Request("http://localhost/admin/devices", {
		headers: { Authorization: "Bearer super_secret_admin_key" },
	});
	const bearerRes = await worker.fetch(bearerReq, env);
	assert.equal(bearerRes.status, 200);

	// 5. Public route /api/activity remains unaffected -> 200
	const publicReq = new Request("http://localhost/api/activity");
	const publicRes = await worker.fetch(publicReq, env);
	assert.equal(publicRes.status, 200);
});
