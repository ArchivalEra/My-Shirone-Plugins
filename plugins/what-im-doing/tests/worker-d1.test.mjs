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
					if (this.params.length === 6) {
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
					} else {
						const [
							id,
							name,
							status,
							appName,
							windowTitle,
							osInfo,
							lastSeen,
							updatedAt,
						] = this.params;
						db.rows.set(id, {
							id,
							name,
							type: "server",
							status,
							app_name: appName,
							window_title: windowTitle,
							idle_seconds: 0,
							os_info: osInfo,
							media_title: "",
							media_artist: "",
							token: "system_origin_cache",
							last_seen: lastSeen,
							updated_at: updatedAt,
						});
					}
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
				if (
					q.includes(
						"SELECT status, window_title, last_seen, updated_at FROM devices WHERE id = ?",
					)
				) {
					const [id] = this.params;
					const row = db.rows.get(id);
					return row
						? {
								status: row.status,
								window_title: row.window_title,
								last_seen: row.last_seen,
								updated_at: row.updated_at,
							}
						: null;
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

test("Cloudflare Worker + D1: Origin Cache Watchdog Telemetry & 15m Timeout", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	// 1. Send normal heartbeat (agent fixture)
	const heartbeatPayload = {
		schema: "origin-cache/status/1",
		event: "heartbeat",
		ts: new Date().toISOString(),
		host: "origin-1",
		service: "origin-cache",
		version: "0.1.0",
		status: "active",
		degraded_reasons: [],
		entries: 12480,
		bytes: 0,
		disk_free_bytes: 172730806272,
		disk_reserve_bytes: 536870912,
		flights_active: 0,
		store_state: "ready",
		rebuilt_rows: 0,
	};

	const postReq = new Request("http://localhost/api/activity/origin-cache", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(heartbeatPayload),
	});
	const postRes = await worker.fetch(postReq, env);
	assert.equal(postRes.status, 200);
	const postData = await postRes.json();
	assert.equal(postData.ok, true);
	assert.equal(postData.id, "origin-cache-origin-1");

	// 2. Query activity snapshot
	const actReq = new Request("http://localhost/api/activity");
	const actRes = await worker.fetch(actReq, env);
	const actData = await actRes.json();
	const nodeDev = actData.devices.find((d) => d.id === "origin-cache-origin-1");
	assert.ok(nodeDev);
	assert.equal(nodeDev.type, "server");
	assert.equal(nodeDev.status, 1);
	assert.equal(nodeDev.windowTitle, "运行正常 · 缓存条目 12,480");

	// 3. Report Degraded Status
	const degradedPayload = {
		...heartbeatPayload,
		ts: new Date(Date.now() + 2000).toISOString(),
		event: "heartbeat",
		status: "degraded",
		degraded_reasons: ["disk_below_reserve"],
		entries: 15000,
	};
	const degReq = new Request("http://localhost/api/origin-cache/report", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(degradedPayload),
	});
	const degRes = await worker.fetch(degReq, env);
	assert.equal(degRes.status, 200);

	const degActRes = await worker.fetch(new Request("http://localhost/api/activity"), env);
	const degActData = await degActRes.json();
	const degDev = degActData.devices.find((d) => d.id === "origin-cache-origin-1");
	assert.equal(degDev.status, 3);
	assert.match(degDev.windowTitle, /服务降级 \[磁盘低于预留线\]/);

	// 4. Report Down / Crash Status
	const downPayload = {
		...heartbeatPayload,
		ts: new Date(Date.now() + 4000).toISOString(),
		event: "down",
		status: "down",
		death: { result: "signal", exit_code: "killed", exit_status: "9" },
	};
	const downReq = new Request("http://localhost/api/activity/origin-cache", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(downPayload),
	});
	const downRes = await worker.fetch(downReq, env);
	assert.equal(downRes.status, 200);

	const downActRes = await worker.fetch(new Request("http://localhost/api/activity"), env);
	const downActData = await downActRes.json();
	const downDev = downActData.devices.find((d) => d.id === "origin-cache-origin-1");
	assert.equal(downDev.status, 4);
	assert.equal(downDev.windowTitle, "进程异常退出 (signal: 9)");

	// 5. Verify 15-minute server timeout (Dead Man's Switch)
	// At 10 minutes (600s), server is still NOT timed out
	const now = Date.now();
	db.rows.set("origin-cache-origin-1", {
		id: "origin-cache-origin-1",
		name: "云盘 CDN 存储 (origin-1)",
		type: "server",
		status: 1,
		app_name: "origin-cache",
		window_title: "运行正常",
		idle_seconds: 0,
		token: "system_origin_cache",
		last_seen: now - 600_000, // 10 minutes ago
		updated_at: now - 600_000,
	});
	const tenMinRes = await worker.fetch(new Request("http://localhost/api/activity"), env);
	const tenMinData = await tenMinRes.json();
	const tenMinDev = tenMinData.devices.find((d) => d.id === "origin-cache-origin-1");
	assert.equal(tenMinDev.offline, false); // Alive at 10 minutes!

	// At 16 minutes (960s), server transitions to offline (> 15 min)
	db.rows.get("origin-cache-origin-1").last_seen = now - 960_000;
	const sixteenMinRes = await worker.fetch(new Request("http://localhost/api/activity"), env);
	const sixteenMinData = await sixteenMinRes.json();
	const sixteenMinDev = sixteenMinData.devices.find((d) => d.id === "origin-cache-origin-1");
	assert.equal(sixteenMinDev.offline, true); // Offline at 16 minutes!
});

