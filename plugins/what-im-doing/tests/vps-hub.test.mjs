import { ok, strictEqual } from "node:assert";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import {
	decodeHistoryResponse,
	encodeDeviceActivity,
} from "../dist/protocol/index.js";

const TEST_PORT = 18088;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("Oracle VPS Activity Hub (vps-hub.mjs)", () => {
	let serverProc = null;

	before(async () => {
		serverProc = spawn("node", ["server/vps-hub.mjs"], {
			env: {
				...process.env,
				PORT: String(TEST_PORT),
				HOST: "127.0.0.1",
				STATE_FILE: "none",
				AUTH_TOKEN: "test-vps-secret",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		// Wait for server to listen
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("Hub failed to start in 5s")),
				5000,
			);
			serverProc.stdout.on("data", (chunk) => {
				if (chunk.toString().includes("Oracle Cloud VPS Activity Hub Online")) {
					clearTimeout(timeout);
					resolve();
				}
			});
			serverProc.on("error", reject);
		});
	});

	after(async () => {
		if (serverProc) {
			serverProc.kill("SIGTERM");
			await new Promise((resolve) => serverProc.on("close", resolve));
		}
	});

	it("GET /health reports ok and zero devices initially", async () => {
		const res = await fetch(`${BASE_URL}/health`);
		strictEqual(res.status, 200);
		const data = await res.json();
		strictEqual(data.status, "ok");
		strictEqual(typeof data.uptime, "number");
	});

	it("POST /api/activity rejects invalid auth token", async () => {
		const res = await fetch(`${BASE_URL}/api/activity`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ deviceId: "hacker" }),
		});
		strictEqual(res.status, 401);
	});

	it("POST /api/activity accepts JSON single device with Bearer token", async () => {
		const payload = {
			timestamp: Date.now(),
			deviceId: "workstation-pc",
			deviceName: "Workstation (KDE 6.7)",
			appName: "Antigravity",
			windowTitle: "isui.ren-Blog - Antigravity",
			status: 1, // ACTIVE
			osInfo: "Arch Linux / Wayland",
			idleSeconds: 5,
		};

		const res = await fetch(`${BASE_URL}/api/activity`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-vps-secret",
			},
			body: JSON.stringify(payload),
		});

		strictEqual(res.status, 200);
		const json = await res.json();
		strictEqual(json.success, true);
		strictEqual(json.count, 1);
	});

	it("GET /api/activity?brief=1 returns minimal active payload", async () => {
		const res = await fetch(`${BASE_URL}/api/activity?brief=1`);
		strictEqual(res.status, 200);
		const data = await res.json();
		ok(data.current);
		strictEqual(data.current.deviceId, "workstation-pc");
		strictEqual(data.current.appName, "Antigravity");
		// Brief response leaves history array empty to save bandwidth
		strictEqual(data.history.length, 0);
	});

	it("Multi-Device arbitration: active device wins over idle device", async () => {
		// Laptop reports being idle (idleSeconds: 600)
		const laptopPayload = {
			timestamp: Date.now() + 1000,
			deviceId: "thinkpad-laptop",
			deviceName: "ThinkPad X1 (KDE 6.7)",
			appName: "Terminal",
			windowTitle: "zsh",
			status: 2, // IDLE
			osInfo: "Arch Linux / Wayland",
			idleSeconds: 600,
		};

		await fetch(`${BASE_URL}/api/activity`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-vps-secret",
			},
			body: JSON.stringify(laptopPayload),
		});

		// Workstation reports active (idleSeconds: 10)
		const workstationPayload = {
			timestamp: Date.now(),
			deviceId: "workstation-pc",
			deviceName: "Workstation (KDE 6.7)",
			appName: "Visual Studio Code",
			windowTitle: "main.rs",
			status: 1, // ACTIVE
			osInfo: "Arch Linux / Wayland",
			idleSeconds: 10,
		};

		await fetch(`${BASE_URL}/api/activity`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-vps-secret",
			},
			body: JSON.stringify(workstationPayload),
		});

		// Fetch full history
		const res = await fetch(`${BASE_URL}/api/activity?history=1`);
		strictEqual(res.status, 200);
		const data = await res.json();

		// Workstation must be current because it is active with 10s idle vs 600s
		strictEqual(data.current.deviceId, "workstation-pc");
		strictEqual(data.devices.length, 2);
	});

	it("POST Protobuf binary and GET Protobuf binary stream", async () => {
		const binaryPayload = encodeDeviceActivity({
			timestamp: Date.now(),
			deviceId: "workstation-pc",
			deviceName: "Workstation (KDE 6.7)",
			appName: "Firefox",
			windowTitle: "GitHub — My-Shirone-Plugins",
			status: 1,
			osInfo: "Arch Linux / Wayland",
			idleSeconds: 0,
		});

		const postRes = await fetch(`${BASE_URL}/api/activity`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-protobuf",
				Authorization: "Bearer test-vps-secret",
			},
			body: binaryPayload,
		});
		strictEqual(postRes.status, 200);

		// Query Protobuf binary
		const getRes = await fetch(`${BASE_URL}/api/activity?history=1`, {
			headers: {
				Accept: "application/x-protobuf",
			},
		});
		strictEqual(getRes.status, 200);
		strictEqual(getRes.headers.get("content-type"), "application/x-protobuf");

		const buffer = await getRes.arrayBuffer();
		const decoded = decodeHistoryResponse(new Uint8Array(buffer));
		ok(decoded.current);
		strictEqual(decoded.current.appName, "Firefox");
		ok(decoded.history.length > 0);
	});

	it("POST /fn/ps/update accepts Mix Space (ProcessReporter) payload with body key", async () => {
		const mixSpacePayload = {
			process_name: "NetEase Cloud Music",
			media_title: "海阔天空",
			media_artist: "Beyond",
			device: "Arch Linux (KDE 6.7)",
			key: "test-vps-secret",
			timestamp: Math.floor(Date.now() / 1000) + 5,
		};

		const res = await fetch(`${BASE_URL}/fn/ps/update`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(mixSpacePayload),
		});

		strictEqual(res.status, 200);
		const json = await res.json();
		strictEqual(json.success, true);

		// Verify retrieval
		const queryRes = await fetch(`${BASE_URL}/fn/ps/update`);
		strictEqual(queryRes.status, 200);
		const queryData = await queryRes.json();
		ok(queryData.current);
		strictEqual(queryData.current.appName, "NetEase Cloud Music");
		strictEqual(queryData.current.process_name, "NetEase Cloud Music");
		ok(queryData.current.media);
		strictEqual(queryData.current.media.title, "海阔天空");
		strictEqual(queryData.current.media.artist, "Beyond");
	});
});
