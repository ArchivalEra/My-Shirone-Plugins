import assert from "node:assert/strict";
import test from "node:test";
import {
	ActivityStatus,
	decodeBatchUploadRequest,
	decodeDeviceActivity,
	decodeHistoryResponse,
	encodeBatchUploadRequest,
	encodeDeviceActivity,
	encodeHistoryResponse,
} from "../dist/protocol/index.js";

test("Protobuf - encode and decode DeviceActivity with full UTF-8 and 64-bit timestamps", () => {
	const original = {
		timestamp: 1773190200123,
		deviceId: "arch-desktop",
		deviceName: "Arch Linux (KDE 6.7 Wayland)",
		appName: "Antigravity",
		windowTitle: "isui.ren-Blog - [contribute.md] - Antigravity IDE",
		status: ActivityStatus.ACTIVE,
		osInfo: "Linux 6.12-zen / Wayland Plasma 6.7.0",
		idleSeconds: 42,
		metadata: {
			cpu: "AMD Ryzen 9",
			uptime: "4h 20m",
		},
	};

	const bytes = encodeDeviceActivity(original);
	assert.ok(bytes instanceof Uint8Array);
	assert.ok(bytes.length > 50);

	const decoded = decodeDeviceActivity(bytes);
	assert.equal(decoded.timestamp, original.timestamp);
	assert.equal(decoded.deviceId, original.deviceId);
	assert.equal(decoded.deviceName, original.deviceName);
	assert.equal(decoded.appName, original.appName);
	assert.equal(decoded.windowTitle, original.windowTitle);
	assert.equal(decoded.status, original.status);
	assert.equal(decoded.osInfo, original.osInfo);
	assert.equal(decoded.idleSeconds, original.idleSeconds);
	assert.equal(decoded.metadata?.cpu, "AMD Ryzen 9");
	assert.equal(decoded.metadata?.uptime, "4h 20m");
});

test("Protobuf - encode and decode ActivityHistoryResponse with multiple devices", () => {
	const current = {
		timestamp: 1773190200000,
		deviceId: "desktop-kde",
		deviceName: "Desktop PC",
		appName: "Visual Studio Code",
		windowTitle: "workspace - Code",
		status: ActivityStatus.ACTIVE,
		osInfo: "Arch Linux",
		idleSeconds: 0,
		metadata: {},
	};

	const laptop = {
		timestamp: 1773188000000,
		deviceId: "thinkpad-x1",
		deviceName: "ThinkPad X1",
		appName: "Firefox",
		windowTitle: "GitHub · Pull Requests",
		status: ActivityStatus.IDLE,
		osInfo: "Fedora 42",
		idleSeconds: 600,
		metadata: {},
	};

	const response = {
		current,
		devices: [current, laptop],
		history: [current, laptop],
		serverTime: 1773190205000,
	};

	const bytes = encodeHistoryResponse(response);
	const decoded = decodeHistoryResponse(bytes);

	assert.equal(decoded.serverTime, 1773190205000);
	assert.ok(decoded.current);
	assert.equal(decoded.current.appName, "Visual Studio Code");
	assert.equal(decoded.devices.length, 2);
	assert.equal(decoded.devices[1].deviceId, "thinkpad-x1");
	assert.equal(decoded.history.length, 2);
});

test("Protobuf - encode and decode ActivityBatchUploadRequest", () => {
	const req = {
		token: "secret-token-12345",
		events: [
			{
				timestamp: 1773190100000,
				deviceId: "dev1",
				deviceName: "Dev 1",
				appName: "Terminal",
				windowTitle: "zsh",
				status: ActivityStatus.ACTIVE,
				osInfo: "Linux",
				idleSeconds: 10,
				metadata: {},
			},
		],
	};

	const bytes = encodeBatchUploadRequest(req);
	const decoded = decodeBatchUploadRequest(bytes);

	assert.equal(decoded.token, "secret-token-12345");
	assert.equal(decoded.events.length, 1);
	assert.equal(decoded.events[0].appName, "Terminal");
});
