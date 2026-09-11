import assert from "node:assert/strict";
import test from "node:test";
import {
	ActivityStatus,
	decodeHistoryResponse,
	encodeDeviceActivity,
} from "../dist/protocol/index.js";
import { createActivityEndpoint, defaultStore } from "../dist/server/index.js";

test("Endpoint - POST JSON and GET JSON", async () => {
	defaultStore.clear();
	const endpoint = createActivityEndpoint();

	const postReq = new Request("http://localhost/api/activity", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			deviceId: "workstation-1",
			deviceName: "Workstation",
			appName: "Antigravity",
			windowTitle: "Coding Task",
			status: ActivityStatus.ACTIVE,
			osInfo: "Linux",
			idleSeconds: 5,
		}),
	});

	const postRes = await endpoint.POST(postReq);
	assert.equal(postRes.status, 200);

	const getReq = new Request("http://localhost/api/activity", {
		method: "GET",
		headers: { Accept: "application/json" },
	});
	const getRes = await endpoint.GET(getReq);
	assert.equal(getRes.status, 200);

	const data = await getRes.json();
	assert.ok(data.current);
	assert.equal(data.current.appName, "Antigravity");
	assert.equal(data.devices.length, 1);
});

test("Endpoint - POST Protobuf binary and GET Protobuf binary", async () => {
	defaultStore.clear();
	const endpoint = createActivityEndpoint();

	const act = {
		timestamp: Date.now(),
		deviceId: "kde-wayland",
		deviceName: "KDE Plasma 6.7",
		appName: "Firefox",
		windowTitle: "Documentation - Browser",
		status: ActivityStatus.ACTIVE,
		osInfo: "Linux 6.12",
		idleSeconds: 0,
		metadata: {},
	};

	const bytes = encodeDeviceActivity(act);

	const postReq = new Request("http://localhost/api/activity", {
		method: "POST",
		headers: { "Content-Type": "application/x-protobuf" },
		body: bytes,
	});

	const postRes = await endpoint.POST(postReq);
	assert.equal(postRes.status, 200);

	// Fetch via Protobuf
	const getReq = new Request("http://localhost/api/activity", {
		method: "GET",
		headers: { Accept: "application/x-protobuf" },
	});
	const getRes = await endpoint.GET(getReq);
	assert.equal(getRes.status, 200);
	assert.equal(getRes.headers.get("Content-Type"), "application/x-protobuf");

	const resBuffer = await getRes.arrayBuffer();
	const decoded = decodeHistoryResponse(new Uint8Array(resBuffer));

	assert.ok(decoded.current);
	assert.equal(decoded.current.appName, "Firefox");
	assert.equal(decoded.current.deviceId, "kde-wayland");
});

test("Endpoint - Bearer Auth validation", async () => {
	const endpoint = createActivityEndpoint({ authToken: "my-secret-token" });

	// Unauthorized attempt
	const badReq = new Request("http://localhost/api/activity", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer wrong-token",
		},
		body: JSON.stringify({ deviceId: "x" }),
	});
	const badRes = await endpoint.POST(badReq);
	assert.equal(badRes.status, 401);

	// Authorized attempt
	const goodReq = new Request("http://localhost/api/activity", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer my-secret-token",
		},
		body: JSON.stringify({
			deviceId: "laptop",
			appName: "Terminal",
			status: ActivityStatus.ACTIVE,
		}),
	});
	const goodRes = await endpoint.POST(goodReq);
	assert.equal(goodRes.status, 200);
});
