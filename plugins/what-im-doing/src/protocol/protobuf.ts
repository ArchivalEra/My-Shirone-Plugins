import {
	type ActivityBatchUploadRequest,
	type ActivityHistoryResponse,
	ActivityStatus,
	type DeviceActivity,
} from "./types.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Protobuf wire types
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

/**
 * Lightweight Protobuf binary writer
 */
export class ProtoWriter {
	private chunks: Uint8Array[] = [];
	private size = 0;

	writeTag(fieldNo: number, wireType: number): void {
		const tag = (fieldNo << 3) | wireType;
		this.writeVarint(tag);
	}

	writeVarint(value: number | bigint): void {
		let v = BigInt(value);
		const bytes: number[] = [];
		while (v >= 0x80n) {
			bytes.push(Number((v & 0x7fn) | 0x80n));
			v >>= 7n;
		}
		bytes.push(Number(v & 0x7fn));
		const u8 = new Uint8Array(bytes);
		this.chunks.push(u8);
		this.size += u8.length;
	}

	writeString(fieldNo: number, str: string): void {
		if (!str) return;
		const encoded = textEncoder.encode(str);
		this.writeTag(fieldNo, WIRE_LENGTH_DELIMITED);
		this.writeVarint(encoded.length);
		this.chunks.push(encoded);
		this.size += encoded.length;
	}

	writeInt64(fieldNo: number, val: number): void {
		if (!val && val !== 0) return;
		this.writeTag(fieldNo, WIRE_VARINT);
		this.writeVarint(val);
	}

	writeInt32(fieldNo: number, val: number): void {
		if (!val && val !== 0) return;
		this.writeTag(fieldNo, WIRE_VARINT);
		this.writeVarint(val);
	}

	writeMessage(fieldNo: number, msgBytes: Uint8Array): void {
		this.writeTag(fieldNo, WIRE_LENGTH_DELIMITED);
		this.writeVarint(msgBytes.length);
		this.chunks.push(msgBytes);
		this.size += msgBytes.length;
	}

	finish(): Uint8Array {
		const result = new Uint8Array(this.size);
		let offset = 0;
		for (const chunk of this.chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	}
}

/**
 * Lightweight Protobuf binary reader
 */
export class ProtoReader {
	private pos = 0;

	constructor(private buffer: Uint8Array) {}

	get hasMore(): boolean {
		return this.pos < this.buffer.length;
	}

	readVarint(): bigint {
		let result = 0n;
		let shift = 0n;
		while (this.pos < this.buffer.length) {
			const byte = this.buffer[this.pos++];
			result |= BigInt(byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				return result;
			}
			shift += 7n;
			if (shift >= 64n) {
				throw new Error("Varint overflow while decoding Protobuf");
			}
		}
		throw new Error("Unexpected EOF reading Varint");
	}

	readTag(): { fieldNo: number; wireType: number } | null {
		if (!this.hasMore) return null;
		const tag = Number(this.readVarint());
		const fieldNo = tag >> 3;
		const wireType = tag & 0x07;
		return { fieldNo, wireType };
	}

	readString(): string {
		const bytes = this.readBytes();
		return textDecoder.decode(bytes);
	}

	readBytes(): Uint8Array {
		const len = Number(this.readVarint());
		if (this.pos + len > this.buffer.length) {
			throw new Error("Buffer underflow reading length-delimited bytes");
		}
		const bytes = this.buffer.subarray(this.pos, this.pos + len);
		this.pos += len;
		return bytes;
	}

	skip(wireType: number): void {
		switch (wireType) {
			case 0:
				this.readVarint();
				break;
			case 1:
				this.pos += 8;
				break;
			case 2: {
				const len = Number(this.readVarint());
				this.pos += len;
				break;
			}
			case 5:
				this.pos += 4;
				break;
			default:
				throw new Error(`Unsupported wire type: ${wireType}`);
		}
	}
}

/**
 * Encodes a DeviceActivity message into Protobuf binary
 */
export function encodeDeviceActivity(act: DeviceActivity): Uint8Array {
	const writer = new ProtoWriter();

	writer.writeInt64(1, act.timestamp);
	writer.writeString(2, act.deviceId);
	writer.writeString(3, act.deviceName);
	writer.writeString(4, act.appName);
	writer.writeString(5, act.windowTitle);
	writer.writeInt32(6, act.status);
	writer.writeString(7, act.osInfo);
	writer.writeInt64(8, act.idleSeconds);

	if (act.metadata && Object.keys(act.metadata).length > 0) {
		for (const [k, v] of Object.entries(act.metadata)) {
			const mapWriter = new ProtoWriter();
			mapWriter.writeString(1, k);
			mapWriter.writeString(2, v);
			writer.writeMessage(9, mapWriter.finish());
		}
	}

	return writer.finish();
}

/**
 * Decodes a Protobuf binary into DeviceActivity
 */
export function decodeDeviceActivity(bytes: Uint8Array): DeviceActivity {
	const reader = new ProtoReader(bytes);
	const act: DeviceActivity = {
		timestamp: 0,
		deviceId: "",
		deviceName: "",
		appName: "",
		windowTitle: "",
		status: ActivityStatus.ACTIVITY_STATUS_UNKNOWN,
		osInfo: "",
		idleSeconds: 0,
		metadata: {},
	};

	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;

		switch (tag.fieldNo) {
			case 1:
				act.timestamp = Number(reader.readVarint());
				break;
			case 2:
				act.deviceId = reader.readString();
				break;
			case 3:
				act.deviceName = reader.readString();
				break;
			case 4:
				act.appName = reader.readString();
				break;
			case 5:
				act.windowTitle = reader.readString();
				break;
			case 6:
				act.status = Number(reader.readVarint()) as ActivityStatus;
				break;
			case 7:
				act.osInfo = reader.readString();
				break;
			case 8:
				act.idleSeconds = Number(reader.readVarint());
				break;
			case 9: {
				const mapBytes = reader.readBytes();
				const mapReader = new ProtoReader(mapBytes);
				let key = "";
				let val = "";
				while (mapReader.hasMore) {
					const mapTag = mapReader.readTag();
					if (!mapTag) break;
					if (mapTag.fieldNo === 1) key = mapReader.readString();
					else if (mapTag.fieldNo === 2) val = mapReader.readString();
					else mapReader.skip(mapTag.wireType);
				}
				if (key && act.metadata) {
					act.metadata[key] = val;
				}
				break;
			}
			default:
				reader.skip(tag.wireType);
		}
	}

	return act;
}

/**
 * Encodes ActivityBatchUploadRequest
 */
export function encodeBatchUploadRequest(
	req: ActivityBatchUploadRequest,
): Uint8Array {
	const writer = new ProtoWriter();
	writer.writeString(1, req.token);

	for (const event of req.events) {
		writer.writeMessage(2, encodeDeviceActivity(event));
	}

	return writer.finish();
}

/**
 * Decodes ActivityBatchUploadRequest
 */
export function decodeBatchUploadRequest(
	bytes: Uint8Array,
): ActivityBatchUploadRequest {
	const reader = new ProtoReader(bytes);
	const req: ActivityBatchUploadRequest = {
		token: "",
		events: [],
	};

	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;

		switch (tag.fieldNo) {
			case 1:
				req.token = reader.readString();
				break;
			case 2: {
				const eventBytes = reader.readBytes();
				req.events.push(decodeDeviceActivity(eventBytes));
				break;
			}
			default:
				reader.skip(tag.wireType);
		}
	}

	return req;
}

/**
 * Encodes ActivityHistoryResponse
 */
export function encodeHistoryResponse(
	res: ActivityHistoryResponse,
): Uint8Array {
	const writer = new ProtoWriter();

	if (res.current) {
		writer.writeMessage(1, encodeDeviceActivity(res.current));
	}

	for (const dev of res.devices) {
		writer.writeMessage(2, encodeDeviceActivity(dev));
	}

	for (const h of res.history ?? []) {
		writer.writeMessage(3, encodeDeviceActivity(h));
	}

	writer.writeInt64(4, res.serverTime);

	return writer.finish();
}

/**
 * Decodes ActivityHistoryResponse
 */
export function decodeHistoryResponse(
	bytes: Uint8Array,
): ActivityHistoryResponse {
	const reader = new ProtoReader(bytes);
	let current: DeviceActivity | null = null;
	const devices: DeviceActivity[] = [];
	const history: DeviceActivity[] = [];
	let serverTime = Date.now();

	while (reader.hasMore) {
		const tag = reader.readTag();
		if (!tag) break;

		switch (tag.fieldNo) {
			case 1: {
				const curBytes = reader.readBytes();
				current = decodeDeviceActivity(curBytes);
				break;
			}
			case 2: {
				const devBytes = reader.readBytes();
				devices.push(decodeDeviceActivity(devBytes));
				break;
			}
			case 3: {
				const hBytes = reader.readBytes();
				history.push(decodeDeviceActivity(hBytes));
				break;
			}
			case 4:
				serverTime = Number(reader.readVarint());
				break;
			default:
				reader.skip(tag.wireType);
		}
	}

	return {
		current,
		devices,
		history,
		serverTime,
	};
}
