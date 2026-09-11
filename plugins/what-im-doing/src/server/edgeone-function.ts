/**
 * Tencent Cloud EdgeOne Pages Function / Cloudflare Worker Handler
 *
 * Deployed to EdgeOne Pages Functions (e.g. /api/activity.ts)
 * Configured with KV Binding: ACTIVITY_KV
 * Configured with Environment Variable: AUTH_TOKEN
 */

import {
	decodeBatchUploadRequest,
	decodeDeviceActivity,
	encodeHistoryResponse,
} from "../protocol/protobuf.js";
import type {
	ActivityHistoryResponse,
	DeviceActivity,
} from "../protocol/types.js";

interface Env {
	ACTIVITY_KV?: {
		get(key: string, type?: "json" | "text" | "arrayBuffer"): Promise<unknown>;
		put(
			key: string,
			value: string | ArrayBuffer,
			options?: { expirationTtl?: number },
		): Promise<void>;
		list(options?: {
			prefix?: string;
			limit?: number;
		}): Promise<{ keys: Array<{ name: string }> }>;
	};
	AUTH_TOKEN?: string;
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { method } = request;

		if (method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		if (method === "GET") {
			const accept = request.headers.get("accept") ?? "";
			let history: DeviceActivity[] = [];
			let devices: DeviceActivity[] = [];

			if (env.ACTIVITY_KV) {
				const raw = await env.ACTIVITY_KV.get("activity:history", "json");
				if (Array.isArray(raw)) {
					history = raw as DeviceActivity[];
				}
				const rawDevices = await env.ACTIVITY_KV.get(
					"activity:devices",
					"json",
				);
				if (rawDevices && typeof rawDevices === "object") {
					devices = Object.values(rawDevices as Record<string, DeviceActivity>);
				}
			}

			devices.sort((a, b) => b.timestamp - a.timestamp);
			const current = devices.length > 0 ? devices[0] : null;

			const responseData: ActivityHistoryResponse = {
				current,
				devices,
				history: history.slice(0, 10),
				serverTime: Date.now(),
			};

			if (accept.includes("application/x-protobuf")) {
				const bytes = encodeHistoryResponse(responseData);
				return new Response(bytes as unknown as BodyInit, {
					status: 200,
					headers: {
						...CORS_HEADERS,
						"Content-Type": "application/x-protobuf",
						"Cache-Control": "public, max-age=15",
					},
				});
			}

			return new Response(JSON.stringify(responseData), {
				status: 200,
				headers: {
					...CORS_HEADERS,
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "public, max-age=15",
				},
			});
		}

		if (method === "POST") {
			if (env.AUTH_TOKEN) {
				const auth = request.headers.get("authorization") ?? "";
				if (auth !== `Bearer ${env.AUTH_TOKEN}`) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
					});
				}
			}

			const contentType = request.headers.get("content-type") ?? "";
			const newEvents: DeviceActivity[] = [];

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
				const body = (await request.json()) as {
					events?: DeviceActivity[];
					deviceId?: string;
				};
				if (Array.isArray(body.events)) {
					newEvents.push(...body.events);
				} else if (body.deviceId) {
					newEvents.push(body as DeviceActivity);
				}
			}

			if (newEvents.length === 0) {
				return new Response(JSON.stringify({ error: "No events parsed" }), {
					status: 400,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				});
			}

			if (env.ACTIVITY_KV) {
				// Read current KV state
				let history =
					((await env.ACTIVITY_KV.get(
						"activity:history",
						"json",
					)) as DeviceActivity[]) || [];
				const devices =
					((await env.ACTIVITY_KV.get("activity:devices", "json")) as Record<
						string,
						DeviceActivity
					>) || {};

				for (const ev of newEvents) {
					if (!ev.timestamp) ev.timestamp = Date.now();
					devices[ev.deviceId] = ev;
					history.unshift(ev);
				}

				// Keep up to 3000 items in KV for self-inspection as requested
				if (history.length > 3000) {
					history = history.slice(0, 3000);
				}

				await env.ACTIVITY_KV.put("activity:history", JSON.stringify(history));
				await env.ACTIVITY_KV.put("activity:devices", JSON.stringify(devices));
			}

			return new Response(
				JSON.stringify({ success: true, count: newEvents.length }),
				{
					status: 200,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				},
			);
		}

		return new Response("Method not allowed", {
			status: 405,
			headers: CORS_HEADERS,
		});
	},
};
