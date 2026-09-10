#!/usr/bin/env node

/**
 * Linux (Wayland / KDE 6.7) Activity Collector Daemon
 * Gathers active window/app and uploads via Protobuf binary stream.
 */

import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ActivityStatus,
	encodeBatchUploadRequest,
	encodeDeviceActivity,
} from "../dist/protocol/index.js";
import { detectActiveWindow, getIdleSeconds, getOsInfo } from "./detect-window.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config file if present
let fileConfig = {};
const configPath = join(__dirname, "collector.config.json");
if (existsSync(configPath)) {
	try {
		fileConfig = JSON.parse(readFileSync(configPath, "utf8"));
	} catch (e) {
		console.error("Warning: Failed to parse collector.config.json:", e.message);
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(flag, fallback) {
	const idx = args.indexOf(flag);
	if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
	return fallback;
}
const isOnce = args.includes("--once");
const isDryRun = args.includes("--dry-run");
const intervalSec = Number(getArg("--interval", fileConfig.intervalSeconds || 15));
const endpoint = getArg("--endpoint", fileConfig.endpoint || "http://localhost:4321/api/activity");
const token = getArg("--token", fileConfig.token || process.env.ACTIVITY_TOKEN || "");
const deviceId = getArg("--device-id", fileConfig.deviceId || hostname().toLowerCase().replace(/[^a-z0-9_-]/g, "-"));
const deviceName = getArg("--device-name", fileConfig.deviceName || `${hostname()} (Linux)`);

console.log("┌─────────────────────────────────────────────────────────────┐");
console.log("│         What-Im-Doing Linux Activity Collector Daemon       │");
console.log("└─────────────────────────────────────────────────────────────┘");
console.log(`• Device ID:   ${deviceId}`);
console.log(`• Device Name: ${deviceName}`);
console.log(`• Endpoint:    ${endpoint}`);
console.log(`• Interval:    ${intervalSec}s`);
console.log(`• Mode:        ${isDryRun ? "Dry-Run" : isOnce ? "Once" : "Continuous Daemon"}`);
console.log("───────────────────────────────────────────────────────────────");

async function collectAndSend() {
	const now = Date.now();
	const { appName, windowTitle } = detectActiveWindow();
	const idleSeconds = getIdleSeconds();
	const osInfo = getOsInfo();

	// Determine activity status
	let status = ActivityStatus.ACTIVE;
	if (idleSeconds > 1800) {
		status = ActivityStatus.AWAY;
	} else if (idleSeconds > 180) {
		status = ActivityStatus.IDLE;
	}

	const activity = {
		timestamp: now,
		deviceId,
		deviceName,
		appName,
		windowTitle,
		status,
		osInfo,
		idleSeconds,
		metadata: {
			hostname: hostname(),
			platform: process.platform,
		},
	};

	if (isDryRun) {
		console.log("\n[Dry-Run Preview]");
		console.log(JSON.stringify(activity, null, 2));
		const protoBytes = encodeDeviceActivity(activity);
		console.log(`Protobuf binary payload size: ${protoBytes.length} bytes`);
		return;
	}

	// Prepare Protobuf payload
	const batchPayload = {
		token,
		events: [activity],
	};
	const binaryData = encodeBatchUploadRequest(batchPayload);

	try {
		const headers = {
			"Content-Type": "application/x-protobuf",
		};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const res = await fetch(endpoint, {
			method: "POST",
			headers,
			body: binaryData,
		});

		if (!res.ok) {
			const text = await res.text();
			console.warn(`[${new Date().toLocaleTimeString()}] Upload failed (${res.status}): ${text}`);
		} else {
			console.log(
				`[${new Date().toLocaleTimeString()}] Uploaded activity: [${appName}] "${windowTitle.slice(0, 35)}" (${binaryData.length} bytes)`,
			);
		}
	} catch (err) {
		console.error(`[${new Date().toLocaleTimeString()}] Network error sending activity:`, err.message);
	}
}

// Initial execution
await collectAndSend();

if (!isOnce && !isDryRun) {
	setInterval(collectAndSend, intervalSec * 1000);
}
