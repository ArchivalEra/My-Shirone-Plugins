import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/worker.js";

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

test("Checklist 1: 鉴权严格性 (401/403 拒绝非白名单或错误 Token)", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	// 未注册设备 -> 401
	const unregRes = await worker.fetch(
		new Request("http://localhost/api/activity/report", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer sk_dev_abc",
			},
			body: JSON.stringify({ id: "unknown-device" }),
		}),
		env,
	);
	assert.equal(unregRes.status, 401);

	// 注册设备
	await worker.fetch(
		new Request("http://localhost/admin/devices", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: "valid-device",
				name: "Valid",
				type: "desktop",
			}),
		}),
		env,
	);

	// 错误 Token -> 403
	const badTokenRes = await worker.fetch(
		new Request("http://localhost/api/activity/report", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer sk_dev_wrong",
			},
			body: JSON.stringify({ id: "valid-device" }),
		}),
		env,
	);
	assert.equal(badTokenRes.status, 403);
});

test("Checklist 2: 多设备隔离性 (设备 A 上报绝不影响或串改设备 B)", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	// 注册两台设备
	const regA = await (
		await worker.fetch(
			new Request("http://localhost/admin/devices", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: "dev-a",
					name: "Device A",
					type: "desktop",
				}),
			}),
			env,
		)
	).json();

	const regB = await (
		await worker.fetch(
			new Request("http://localhost/admin/devices", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: "dev-b", name: "Device B", type: "laptop" }),
			}),
			env,
		)
	).json();

	const tokenA = regA.device.token;
	const tokenB = regB.device.token;

	// 设备 A 上报
	await worker.fetch(
		new Request("http://localhost/api/activity/report", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${tokenA}`,
			},
			body: JSON.stringify({
				id: "dev-a",
				status: 1,
				appName: "AppA",
				windowTitle: "TitleA",
			}),
		}),
		env,
	);

	// 设备 B 上报
	await worker.fetch(
		new Request("http://localhost/api/activity/report", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${tokenB}`,
			},
			body: JSON.stringify({
				id: "dev-b",
				status: 1,
				appName: "AppB",
				windowTitle: "TitleB",
			}),
		}),
		env,
	);

	// 获取状态聚合
	const snapshot = await (
		await worker.fetch(new Request("http://localhost/api/activity"), env)
	).json();
	const devA = snapshot.devices.find((d) => d.id === "dev-a");
	const devB = snapshot.devices.find((d) => d.id === "dev-b");

	assert.equal(devA.appName, "AppA");
	assert.equal(devB.appName, "AppB");
	assert.equal(devA.type, "desktop");
	assert.equal(devB.type, "laptop");

	// 零破坏向下兼容别名验证
	assert.equal(devA.deviceId, "dev-a");
	assert.equal(devA.deviceName, "Device A");
	assert.equal(devA.timestamp, devA.lastSeen);
});

test("Checklist 3: 120s 自动离线测试与时间戳保留", async () => {
	const db = new MockD1Database();
	const env = { DB: db };
	const pastTime = Date.now() - 150000; // 150s ago (> 120s)

	db.rows.set("sleeping-laptop", {
		id: "sleeping-laptop",
		name: "Sleeping Laptop",
		type: "laptop",
		status: 1,
		app_name: "VS Code",
		window_title: "Project",
		idle_seconds: 50,
		token: "sk_dev_test",
		last_seen: pastTime,
		updated_at: pastTime,
	});

	const snapshot = await (
		await worker.fetch(new Request("http://localhost/api/activity"), env)
	).json();
	const dev = snapshot.devices.find((d) => d.id === "sleeping-laptop");

	assert.equal(dev.offline, true);
	assert.equal(dev.status, 4); // 自动置为离线
	assert.equal(dev.lastSeen, pastTime); // 严格保留最后上报时间戳
});

test("Checklist 4: 冷启动与无数据健壮性", async () => {
	const db = new MockD1Database();
	const env = { DB: db };

	const snapshot = await (
		await worker.fetch(new Request("http://localhost/api/activity"), env)
	).json();
	assert.deepEqual(snapshot.devices, []);
	assert.equal(snapshot.current, null);
	assert.ok(typeof snapshot.serverTime === "number");
});
