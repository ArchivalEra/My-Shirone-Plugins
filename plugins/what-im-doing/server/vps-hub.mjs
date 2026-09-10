#!/usr/bin/env node
/**
 * ==============================================================================
 * @shirone-plugins/what-im-doing — Oracle Cloud VPS Activity Hub
 *
 * Ultra-lightweight, zero-dependency Node.js HTTP/Protobuf daemon.
 * Provides real-time activity ingestion, multi-device arbitration,
 * SSE live streaming, and edge-cacheable REST/Protobuf APIs.
 *
 * Zero cloud KV write costs, zero rate limits, sub-millisecond updates.
 * Designed to run behind cloudflared tunnel or reverse proxy (Caddy/Nginx).
 * ==============================================================================
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const STATE_FILE = process.env.STATE_FILE || "./data/what-im-doing-state.json";
const MAX_STORAGE = parseInt(process.env.MAX_STORAGE || "5000", 10);
const DEFAULT_MAX_DISPLAY = parseInt(process.env.MAX_DISPLAY || "5", 10);

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

// ---------------------------------------------------------------------------
// Protobuf v3 Minimal Binary Codec (Zero Dependencies)
// ---------------------------------------------------------------------------
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

class ProtoWriter {
	constructor() {
		this.chunks = [];
		this.size = 0;
	}

	writeTag(fieldNo, wireType) {
		const tag = (fieldNo << 3) | wireType;
		this.writeVarint(tag);
	}

	writeVarint(value) {
		let v = BigInt(value);
		const bytes = [];
		while (v >= 0x80n) {
			bytes.push(Number((v & 0x7fn) | 0x80n));
			v >>= 7n;
		}
		bytes.push(Number(v & 0x7fn));
		const u8 = new Uint8Array(bytes);
		this.chunks.push(u8);
		this.size += u8.length;
	}

	writeString(fieldNo, str) {
		if (!str) return;
		const encoded = textEncoder.encode(str);
		this.writeTag(fieldNo, WIRE_LENGTH_DELIMITED);
		this.writeVarint(encoded.length);
		this.chunks.push(encoded);
		this.size += encoded.length;
	}

	writeInt64(fieldNo, val) {
		if (!val && val !== 0) return;
		this.writeTag(fieldNo, WIRE_VARINT);
		this.writeVarint(val);
	}

	writeInt32(fieldNo, val) {
		if (!val && val !== 0) return;
		this.writeTag(fieldNo, WIRE_VARINT);
		this.writeVarint(val);
	}

	writeMessage(fieldNo, msgBytes) {
		this.writeTag(fieldNo, WIRE_LENGTH_DELIMITED);
		this.writeVarint(msgBytes.length);
		this.chunks.push(msgBytes);
		this.size += msgBytes.length;
	}

	finish() {
		const result = new Uint8Array(this.size);
		let offset = 0;
		for (const chunk of this.chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	}
}

class ProtoReader {
	constructor(buffer) {
		this.buffer = buffer;
		this.pos = 0;
	}

	get hasMore() {
		return this.pos < this.buffer.length;
	}

	readVarint() {
		let result = 0n;
		let shift = 0n;
		while (this.pos < this.buffer.length) {
			const byte = this.buffer[this.pos++];
			result |= BigInt(byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return result;
			shift += 7n;
			if (shift >= 64n) throw new Error("Varint overflow");
		}
		throw new Error("Unexpected EOF");
	}

	readTag() {
		if (!this.hasMore) return null;
		const tag = Number(this.readVarint());
		return { fieldNo: tag >> 3, wireType: tag & 0x07 };
	}

	readString() {
		return textDecoder.decode(this.readBytes());
	}

	readBytes() {
		const len = Number(this.readVarint());
		if (this.pos + len > this.buffer.length) throw new Error("Buffer underflow");
		const slice = this.buffer.subarray(this.pos, this.pos + len);
		this.pos += len;
		return slice;
	}

	skipField(wireType) {
		if (wireType === WIRE_VARINT) this.readVarint();
		else if (wireType === WIRE_LENGTH_DELIMITED) {
			const len = Number(this.readVarint());
			this.pos += len;
		} else {
			this.pos++;
		}
	}
}

function encodeDeviceActivity(act) {
	const writer = new ProtoWriter();
	writer.writeInt64(1, act.timestamp);
	writer.writeString(2, act.deviceId);
	writer.writeString(3, act.deviceName);
	writer.writeString(4, act.appName);
	writer.writeString(5, act.windowTitle);
	writer.writeInt32(6, act.status);
	writer.writeString(7, act.osInfo);
	writer.writeInt32(8, act.idleSeconds || 0);
	return writer.finish();
}

function decodeDeviceActivity(buffer) {
	const reader = new ProtoReader(buffer);
	const act = {
		timestamp: 0,
		deviceId: "",
		deviceName: "",
		appName: "",
		windowTitle: "",
		status: 0,
		osInfo: "",
		idleSeconds: 0,
	};

	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;
		switch (tag.fieldNo) {
			case 1: act.timestamp = Number(reader.readVarint()); break;
			case 2: act.deviceId = reader.readString(); break;
			case 3: act.deviceName = reader.readString(); break;
			case 4: act.appName = reader.readString(); break;
			case 5: act.windowTitle = reader.readString(); break;
			case 6: act.status = Number(reader.readVarint()); break;
			case 7: act.osInfo = reader.readString(); break;
			case 8: act.idleSeconds = Number(reader.readVarint()); break;
			default: reader.skipField(tag.wireType); break;
		}
	}
	return act;
}

function encodeHistoryResponse(res) {
	const writer = new ProtoWriter();
	if (res.current) {
		writer.writeMessage(1, encodeDeviceActivity(res.current));
	}
	for (const dev of res.devices || []) {
		writer.writeMessage(2, encodeDeviceActivity(dev));
	}
	for (const item of res.history || []) {
		writer.writeMessage(3, encodeDeviceActivity(item));
	}
	writer.writeInt64(4, res.serverTime || Date.now());
	return writer.finish();
}

function decodeBatchUploadRequest(buffer) {
	const reader = new ProtoReader(buffer);
	const req = { token: "", events: [] };
	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;
		switch (tag.fieldNo) {
			case 1: req.token = reader.readString(); break;
			case 2: {
				const bytes = reader.readBytes();
				req.events.push(decodeDeviceActivity(bytes));
				break;
			}
			default: reader.skipField(tag.wireType); break;
		}
	}
	return req;
}

// ---------------------------------------------------------------------------
// Multi-Device In-Memory Store & Arbiter
// ---------------------------------------------------------------------------
class ActivityHubStore {
	constructor(maxItems = 5000) {
		this.maxItems = maxItems;
		this.devices = new Map();
		this.history = [];
		this.dirty = false;
	}

	record(activity) {
		if (!activity) return;

		const deviceId =
			activity.deviceId || activity.device_id || activity.device || "default";
		const deviceName = activity.deviceName || activity.device || deviceId;
		const appName =
			activity.appName || activity.process_name || activity.process || "Desktop";
		const windowTitle =
			activity.windowTitle || activity.window_title || "";
		let timestamp = activity.timestamp || Date.now();
		if (timestamp < 10_000_000_000) {
			timestamp *= 1000;
		}
		const status = activity.status ?? 1;
		const osInfo = activity.osInfo || activity.os_info || "Linux";
		const idleSeconds = activity.idleSeconds ?? activity.idle_seconds ?? 0;

		const media =
			activity.media ||
			(activity.media_title
				? {
						title: activity.media_title,
						artist: activity.media_artist || "",
						isPlaying: true,
					}
				: undefined);

		const normalized = {
			timestamp,
			deviceId,
			deviceName,
			appName,
			windowTitle,
			status,
			osInfo,
			idleSeconds,
			media,
			metadata: activity.metadata,
			process_name: appName,
			process: appName,
			media_title: media?.title,
			media_artist: media?.artist,
			device: deviceName,
			device_id: deviceId,
		};

		this.devices.set(deviceId, normalized);
		this.history.unshift(normalized);

		if (this.history.length > this.maxItems) {
			this.history = this.history.slice(0, this.maxItems);
		}
		this.dirty = true;
	}

	recordBatch(events) {
		for (const ev of events) {
			this.record(ev);
		}
	}

	getSortedDevices() {
		return Array.from(this.devices.values()).sort((a, b) => {
			const aActive = a.status === 1 && (a.idleSeconds || 0) < 180 ? 1 : 0;
			const bActive = b.status === 1 && (b.idleSeconds || 0) < 180 ? 1 : 0;
			if (aActive !== bActive) return bActive - aActive;
			if ((a.idleSeconds || 0) !== (b.idleSeconds || 0)) {
				return (a.idleSeconds || 0) - (b.idleSeconds || 0);
			}
			return b.timestamp - a.timestamp;
		});
	}

	getBriefResponse() {
		const sorted = this.getSortedDevices();
		const current = sorted.length > 0 ? sorted[0] : null;
		return {
			current,
			devices: current ? [current] : [],
			history: [],
			serverTime: Date.now(),
		};
	}

	getResponse(maxDisplay = 5) {
		const sorted = this.getSortedDevices();
		const current = sorted.length > 0 ? sorted[0] : null;
		return {
			current,
			devices: sorted,
			history: this.history.slice(0, maxDisplay),
			serverTime: Date.now(),
		};
	}

	saveToFile(filepath) {
		if (!filepath || filepath === "none") return;
		try {
			const dir = path.dirname(filepath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			const payload = {
				devices: Array.from(this.devices.entries()),
				history: this.history.slice(0, 500),
				savedAt: Date.now(),
			};
			fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf-8");
			this.dirty = false;
		} catch (err) {
			console.error("[hub-store] Failed to save state to file:", err.message);
		}
	}

	loadFromFile(filepath) {
		if (!filepath || !fs.existsSync(filepath)) return;
		try {
			const raw = fs.readFileSync(filepath, "utf-8");
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed.devices)) {
				this.devices = new Map(parsed.devices);
			}
			if (Array.isArray(parsed.history)) {
				this.history = parsed.history;
			}
			console.log(`[hub-store] Loaded ${this.devices.size} devices and ${this.history.length} history events from disk.`);
		} catch (err) {
			console.warn("[hub-store] Could not restore state from file:", err.message);
		}
	}
}

const store = new ActivityHubStore(MAX_STORAGE);
store.loadFromFile(STATE_FILE);

// Periodic persistence
setInterval(() => {
	if (store.dirty) {
		store.saveToFile(STATE_FILE);
	}
}, 60000);

// SSE Client subscribers
const sseClients = new Set();

function broadcastSSE(data) {
	if (sseClients.size === 0) return;
	const payload = `data: ${JSON.stringify(data)}\n\n`;
	for (const res of sseClients) {
		try {
			res.write(payload);
		} catch {
			sseClients.delete(res);
		}
	}
}

// ---------------------------------------------------------------------------
// HTTP Request Handlers
// ---------------------------------------------------------------------------
function handleOptions(res) {
	res.writeHead(204, CORS_HEADERS);
	res.end();
}

function handleHealth(res) {
	res.writeHead(200, {
		...CORS_HEADERS,
		"Content-Type": "application/json; charset=utf-8",
	});
	res.end(
		JSON.stringify({
			status: "ok",
			uptime: Math.floor(process.uptime()),
			deviceCount: store.devices.size,
			historyCount: store.history.length,
			serverTime: Date.now(),
		}),
	);
}

function handleGet(req, res, url) {
	const accept = req.headers.accept || "";
	const isBrief = url.searchParams.get("brief") === "1" || url.searchParams.get("brief") === "true";
	const maxDisplay = parseInt(url.searchParams.get("max") || String(DEFAULT_MAX_DISPLAY), 10);
	const responseData = isBrief ? store.getBriefResponse() : store.getResponse(maxDisplay);

	const cacheHeader = "public, max-age=10, s-maxage=15, stale-while-revalidate=30";

	if (accept.includes("application/x-protobuf")) {
		const bytes = encodeHistoryResponse(responseData);
		res.writeHead(200, {
			...CORS_HEADERS,
			"Content-Type": "application/x-protobuf",
			"Cache-Control": cacheHeader,
		});
		res.end(Buffer.from(bytes));
		return;
	}

	res.writeHead(200, {
		...CORS_HEADERS,
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": cacheHeader,
	});
	res.end(JSON.stringify(responseData));
}

function handleSSE(req, res) {
	res.writeHead(200, {
		...CORS_HEADERS,
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	// Send initial state immediately
	res.write(`data: ${JSON.stringify(store.getResponse(DEFAULT_MAX_DISPLAY))}\n\n`);
	sseClients.add(res);

	req.on("close", () => {
		sseClients.delete(res);
	});
}

function readBodyBuffer(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

async function handlePost(req, res, url) {
	const contentType = req.headers["content-type"] || "";
	const authHeader = req.headers.authorization || "";
	const queryKey = url.searchParams.get("key");

	try {
		const rawBuffer = await readBodyBuffer(req);
		let body = null;
		let u8 = null;

		if (contentType.includes("application/x-protobuf")) {
			u8 = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
		} else {
			body = JSON.parse(rawBuffer.toString("utf-8"));
		}

		// Auth Token validation (supports Bearer token, ?key=, or body.api_key / body.key)
		if (AUTH_TOKEN) {
			const expectedBearer = `Bearer ${AUTH_TOKEN}`;
			const bodyKey = body ? body.api_key || body.key : undefined;
			const isAuthorized =
				authHeader === expectedBearer ||
				queryKey === AUTH_TOKEN ||
				bodyKey === AUTH_TOKEN;

			if (!isAuthorized) {
				res.writeHead(401, { ...CORS_HEADERS, "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Unauthorized" }));
				return;
			}
		}

		if (u8) {
			try {
				const batch = decodeBatchUploadRequest(u8);
				if (batch.events && batch.events.length > 0) {
					store.recordBatch(batch.events);
					broadcastSSE(store.getBriefResponse());
					res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
					res.end(JSON.stringify({ success: true, count: batch.events.length }));
					return;
				}
			} catch {
				const single = decodeDeviceActivity(u8);
				if (single.deviceId) {
					store.record(single);
					broadcastSSE(store.getBriefResponse());
					res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
					res.end(JSON.stringify({ success: true, count: 1 }));
					return;
				}
			}
		} else if (body) {
			// JSON ingestion (supports standard and Mix Space / Shiro formats)
			if (Array.isArray(body.events)) {
				store.recordBatch(body.events);
				broadcastSSE(store.getBriefResponse());
				res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, count: body.events.length }));
				return;
			}

			const hasValidField =
				body.deviceId ||
				body.device_id ||
				body.appName ||
				body.process_name ||
				body.process;

			if (hasValidField) {
				store.record(body);
				broadcastSSE(store.getBriefResponse());
				res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, count: 1 }));
				return;
			}
		}

		res.writeHead(400, { ...CORS_HEADERS, "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Invalid payload: missing deviceId, process_name, or events" }));
	} catch (err) {
		res.writeHead(500, { ...CORS_HEADERS, "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: err.message }));
	}
}

// ---------------------------------------------------------------------------
// Server Bootstrap & Lifecycle
// ---------------------------------------------------------------------------
const isActivityRoute = (pathname) =>
	pathname === "/api/activity" ||
	pathname === "/activity" ||
	pathname === "/fn/ps/update" ||
	pathname === "/api/v2/fn/ps/update";

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

	if (req.method === "OPTIONS") {
		return handleOptions(res);
	}

	if (url.pathname === "/health") {
		return handleHealth(res);
	}

	if (url.pathname === "/api/activity/stream" && req.method === "GET") {
		return handleSSE(req, res);
	}

	if (isActivityRoute(url.pathname)) {
		if (req.method === "GET") {
			return handleGet(req, res, url);
		}
		if (req.method === "POST") {
			return handlePost(req, res, url);
		}
	}

	res.writeHead(404, { ...CORS_HEADERS, "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "Not Found" }));
});

// Clean shutdown handler
function handleShutdown(signal) {
	console.log(`\n[vps-hub] Received ${signal}, saving state and shutting down...`);
	store.saveToFile(STATE_FILE);
	server.close(() => {
		console.log("[vps-hub] Server terminated gracefully.");
		process.exit(0);
	});
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

server.listen(PORT, HOST, () => {
	console.log("===============================================================");
	console.log(`[what-im-doing-hub] Oracle Cloud VPS Activity Hub Online`);
	console.log(`Listening on: http://${HOST}:${PORT}`);
	console.log(`Ingestion:    POST http://${HOST}:${PORT}/api/activity (Protobuf/JSON)`);
	console.log(`Query:        GET  http://${HOST}:${PORT}/api/activity?brief=1`);
	console.log(`Streaming:    GET  http://${HOST}:${PORT}/api/activity/stream (SSE)`);
	console.log(`State File:   ${STATE_FILE}`);
	console.log("===============================================================");
});
