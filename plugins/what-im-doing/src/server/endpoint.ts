import {
	decodeBatchUploadRequest,
	decodeDeviceActivity,
	encodeHistoryResponse,
} from "../protocol/protobuf.js";
import type { ActivityHistoryResponse, DeviceActivity } from "../protocol/types.js";
import { defaultStore } from "./storage.js";

export interface EndpointConfig {
	authToken?: string;
	maxHistoryDisplay?: number;
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

/**
 * Astro API route handler for /api/activity
 */
export function createActivityEndpoint(config: EndpointConfig = {}) {
	const maxDisplay = config.maxHistoryDisplay ?? 5;

	return {
		async OPTIONS() {
			return new Response(null, {
				status: 204,
				headers: CORS_HEADERS,
			});
		},

		async GET(request: Request) {
			const accept = request.headers.get("accept") ?? "";
			const responseData = defaultStore.getResponse(maxDisplay);

			// Return Protobuf binary if requested
			if (accept.includes("application/x-protobuf")) {
				const bytes = encodeHistoryResponse(responseData);
				return new Response(bytes as unknown as BodyInit, {
					status: 200,
					headers: {
						...CORS_HEADERS,
						"Content-Type": "application/x-protobuf",
						"Cache-Control": "no-store, no-cache, must-revalidate",
					},
				});
			}

			// Default to JSON
			return new Response(JSON.stringify(responseData), {
				status: 200,
				headers: {
					...CORS_HEADERS,
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store, no-cache, must-revalidate",
				},
			});
		},

		async POST(request: Request) {
			// Check auth token if configured
			if (config.authToken) {
				const authHeader = request.headers.get("authorization") ?? "";
				const expectedBearer = `Bearer ${config.authToken}`;
				if (authHeader !== expectedBearer) {
					return new Response(JSON.stringify({ error: "Unauthorized" }), {
						status: 401,
						headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
					});
				}
			}

			const contentType = request.headers.get("content-type") ?? "";

			try {
				if (contentType.includes("application/x-protobuf")) {
					const arrayBuffer = await request.arrayBuffer();
					const bytes = new Uint8Array(arrayBuffer);

					// Try batch upload first, fallback to single activity
					try {
						const batch = decodeBatchUploadRequest(bytes);
						if (batch.events && batch.events.length > 0) {
							defaultStore.recordBatch(batch.events);
							return new Response(
								JSON.stringify({ success: true, count: batch.events.length }),
								{
									status: 200,
									headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
								},
							);
						}
					} catch {
						// Fallback to single device activity
						const single = decodeDeviceActivity(bytes);
						if (single.deviceId) {
							defaultStore.record(single);
							return new Response(JSON.stringify({ success: true, count: 1 }), {
								status: 200,
								headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
							});
						}
					}
				} else {
					// JSON upload
					const body = await request.json();
					if (Array.isArray(body.events)) {
						defaultStore.recordBatch(body.events as DeviceActivity[]);
						return new Response(
							JSON.stringify({ success: true, count: body.events.length }),
							{
								status: 200,
								headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
							},
						);
					}
					if (body.deviceId) {
						defaultStore.record(body as DeviceActivity);
						return new Response(JSON.stringify({ success: true, count: 1 }), {
							status: 200,
							headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
						});
					}
				}

				return new Response(JSON.stringify({ error: "Invalid payload format" }), {
					status: 400,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				});
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return new Response(JSON.stringify({ error: message }), {
					status: 500,
					headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
				});
			}
		},
	};
}
