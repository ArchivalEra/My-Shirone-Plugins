import assert from "node:assert/strict";
import test from "node:test";
import worker from "../edgeone/activity-worker.js";
import { encodeDeviceActivity } from "../dist/protocol/index.js";

// In-memory mock for EdgeOne KV
function createMockKV() {
	const store = new Map();
	return {
		async get(key, format) {
			const val = store.get(key);
			if (!val) return null;
			if (format === "json") return JSON.parse(val);
			return val;
		},
		async put(key, val) {
			store.set(key, typeof val === "string" ? val : JSON.stringify(val));
		},
	};
}

test("EdgeOne Worker - Ingest Protobuf and query via GET", async () => {
	const kv = createMockKV();
	const env = { ACTIVITY_KV: kv, AUTH_TOKEN: "secret-eo-token" };

	// 1. Post Protobuf binary with Auth
	const act = {
		timestamp: Date.now(),
		deviceId: "kde-workstation",
		deviceName: "Arch Workstation (KDE 6.7)",
		appName: "Antigravity",
		windowTitle: "what-im-doing - edgeone",
		status: 1,
		osInfo: "Linux / wayland",
		idleSeconds: 0,
	};
	const binary = encodeDeviceActivity(act);

	const postReq = new Request("https://eo.isui.ren/api/activity", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-protobuf",
			Authorization: "Bearer secret-eo-token",
		},
		body: binary,
	});

	const postRes = await worker.fetch(postReq, env);
	assert.equal(postRes.status, 200);

	// 2. Query JSON
	const getReq = new Request("https://eo.isui.ren/api/activity", {
		method: "GET",
		headers: { Accept: "application/json" },
	});
	const getRes = await worker.fetch(getReq, env);
	assert.equal(getRes.status, 200);

	const json = await getRes.json();
	assert.ok(json.current);
	assert.equal(json.current.appName, "Antigravity");
	assert.equal(json.current.deviceId, "kde-workstation");
	assert.equal(json.history.length, 1);
});
