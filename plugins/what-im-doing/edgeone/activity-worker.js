/**
 * Tencent Cloud EdgeOne Pages Function / Edge Function
 * Standalone Zero-Dependency Worker for What-Im-Doing
 *
 * Requirements:
 * 1. EdgeOne KV Binding: ACTIVITY_KV
 * 2. Optional Environment Variable: AUTH_TOKEN
 */

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
		const bytes = this.buffer.subarray(this.pos, this.pos + len);
		this.pos += len;
		return bytes;
	}
	skip(wireType) {
		if (wireType === 0) this.readVarint();
		else if (wireType === 1) this.pos += 8;
		else if (wireType === 2) this.pos += Number(this.readVarint());
		else if (wireType === 5) this.pos += 4;
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
	writer.writeInt64(8, act.idleSeconds);
	return writer.finish();
}

function decodeDeviceActivity(bytes) {
	const reader = new ProtoReader(bytes);
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
			default: reader.skip(tag.wireType);
		}
	}
	return act;
}

function decodeBatchUploadRequest(bytes) {
	const reader = new ProtoReader(bytes);
	const req = { token: "", events: [] };
	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;
		if (tag.fieldNo === 1) req.token = reader.readString();
		else if (tag.fieldNo === 2) req.events.push(decodeDeviceActivity(reader.readBytes()));
		else reader.skip(tag.wireType);
	}
	return req;
}

function encodeHistoryResponse(res) {
	const writer = new ProtoWriter();
	if (res.current) writer.writeMessage(1, encodeDeviceActivity(res.current));
	for (const dev of res.devices) writer.writeMessage(2, encodeDeviceActivity(dev));
	for (const h of res.history) writer.writeMessage(3, encodeDeviceActivity(h));
	writer.writeInt64(4, res.serverTime);
	return writer.finish();
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export default {
	async fetch(request, env) {
		const { method } = request;

		if (method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (method === "GET") {
			const accept = request.headers.get("accept") ?? "";
			let history = [];
			let devices = [];

			if (env?.ACTIVITY_KV) {
				const raw = await env.ACTIVITY_KV.get("activity:history", "json");
				if (Array.isArray(raw)) history = raw;

				const rawDevices = await env.ACTIVITY_KV.get("activity:devices", "json");
				if (rawDevices && typeof rawDevices === "object") {
					devices = Object.values(rawDevices);
				}
			}

			// Smart Multi-Device Arbitration:
			// Active devices (idle < 180s) take precedence over idle devices;
			// lower idle time wins; later timestamp breaks ties.
			devices.sort((a, b) => {
				const aIsActive = (a.status === 1 || a.status === "ACTIVE") && (a.idleSeconds || 0) < 180 ? 1 : 0;
				const bIsActive = (b.status === 1 || b.status === "ACTIVE") && (b.idleSeconds || 0) < 180 ? 1 : 0;
				if (aIsActive !== bIsActive) return bIsActive - aIsActive;
				if ((a.idleSeconds || 0) !== (b.idleSeconds || 0)) {
					return (a.idleSeconds || 0) - (b.idleSeconds || 0);
				}
				return b.timestamp - a.timestamp;
			});
			const current = devices.length > 0 ? devices[0] : null;

			const responseData = {
				current,
				devices,
				history: history.slice(0, 10),
				serverTime: Date.now(),
			};

			if (accept.includes("application/x-protobuf")) {
				const bytes = encodeHistoryResponse(responseData);
				return new Response(bytes, {
					status: 200,
					headers: {
						...CORS_HEADERS,
						"Content-Type": "application/x-protobuf",
						"Cache-Control": "public, max-age=10",
					},
				});
			}

			return new Response(JSON.stringify(responseData), {
				status: 200,
				headers: {
					...CORS_HEADERS,
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "public, max-age=10",
				},
			});
		}

		if (method === "POST") {
			if (env?.AUTH_TOKEN) {
				const auth = request.headers.get("authorization") ?? "";
				if (auth !== `Bearer ${env.AUTH_TOKEN}`) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
					});
				}
			}

			const contentType = request.headers.get("content-type") ?? "";
			const newEvents = [];

			try {
				if (contentType.includes("application/x-protobuf")) {
					const buffer = await request.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					try {
						const batch = decodeBatchUploadRequest(bytes);
						newEvents.push(...batch.events);
					} catch {
						const single = decodeDeviceActivity(bytes);
						if (single.deviceId) newEvents.push(single);
					}
				} else {
					const body = await request.json();
					if (Array.isArray(body.events)) newEvents.push(...body.events);
					else if (body.deviceId) newEvents.push(body);
				}

				if (newEvents.length === 0) {
					return new Response(JSON.stringify({ error: "No events parsed" }), {
						status: 400,
						headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
					});
				}

				if (env?.ACTIVITY_KV) {
					let history = (await env.ACTIVITY_KV.get("activity:history", "json")) || [];
					const devices = (await env.ACTIVITY_KV.get("activity:devices", "json")) || {};

					for (const ev of newEvents) {
						if (!ev.timestamp) ev.timestamp = Date.now();
						devices[ev.deviceId] = ev;
						history.unshift(ev);
					}

					// Retain up to 3000 items in KV for personal telemetry inspection
					if (history.length > 3000) history = history.slice(0, 3000);

					await env.ACTIVITY_KV.put("activity:history", JSON.stringify(history));
					await env.ACTIVITY_KV.put("activity:devices", JSON.stringify(devices));
				}

				return new Response(JSON.stringify({ success: true, count: newEvents.length }), {
					status: 200,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				});
			} catch (err) {
				return new Response(JSON.stringify({ error: err.message }), {
					status: 500,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				});
			}
		}

		return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
	},
};
