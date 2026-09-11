import {
	decodeBatchUploadRequest,
	decodeDeviceActivity,
	encodeHistoryResponse,
} from "../protocol/protobuf.js";
import type { DeviceActivity } from "../protocol/types.js";
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
			const url = new URL(request.url);
			const isBrief =
				url.searchParams.get("brief") === "1" ||
				url.searchParams.get("brief") === "true";
			const responseData = isBrief
				? defaultStore.getBriefResponse()
				: defaultStore.getResponse(maxDisplay);

			const cacheHeader =
				"public, max-age=10, s-maxage=15, stale-while-revalidate=30";

			// Return Protobuf binary if requested
			if (accept.includes("application/x-protobuf")) {
				const bytes = encodeHistoryResponse(responseData);
				return new Response(bytes as unknown as BodyInit, {
					status: 200,
					headers: {
						...CORS_HEADERS,
						"Content-Type": "application/x-protobuf",
						"Cache-Control": cacheHeader,
					},
				});
			}

			// Default to JSON
			return new Response(JSON.stringify(responseData), {
				status: 200,
				headers: {
					...CORS_HEADERS,
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": cacheHeader,
				},
			});
		},

		async POST(request: Request) {
			const url = new URL(request.url);
			const authHeader = request.headers.get("authorization") ?? "";
			const queryKey = url.searchParams.get("key");

			let body: Record<string, unknown> | null = null;
			let bytes: Uint8Array | null = null;

			const contentType = request.headers.get("content-type") ?? "";

			try {
				if (contentType.includes("application/x-protobuf")) {
					const arrayBuffer = await request.arrayBuffer();
					bytes = new Uint8Array(arrayBuffer);
				} else {
					body = (await request.json()) as Record<string, unknown>;
				}

				// Check auth token if configured (supports Bearer token, ?key=, or body.api_key / body.key)
				if (config.authToken) {
					const expectedBearer = `Bearer ${config.authToken}`;
					const bodyKey = body
						? (body.api_key as string) || (body.key as string)
						: undefined;
					const isAuthorized =
						authHeader === expectedBearer ||
						queryKey === config.authToken ||
						bodyKey === config.authToken;

					if (!isAuthorized) {
						return new Response(JSON.stringify({ error: "Unauthorized" }), {
							status: 401,
							headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
						});
					}
				}

				if (bytes) {
					// Try batch upload first, fallback to single activity
					try {
						const batch = decodeBatchUploadRequest(bytes);
						if (batch.events && batch.events.length > 0) {
							defaultStore.recordBatch(batch.events);
							return new Response(
								JSON.stringify({ success: true, count: batch.events.length }),
								{
									status: 200,
									headers: {
										...CORS_HEADERS,
										"Content-Type": "application/json",
									},
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
								headers: {
									...CORS_HEADERS,
									"Content-Type": "application/json",
								},
							});
						}
					}
				} else if (body) {
					// JSON upload (supports standard and Mix Space / Shiro formats)
					if (Array.isArray(body.events)) {
						defaultStore.recordBatch(body.events as DeviceActivity[]);
						return new Response(
							JSON.stringify({ success: true, count: body.events.length }),
							{
								status: 200,
								headers: {
									...CORS_HEADERS,
									"Content-Type": "application/json",
								},
							},
						);
					}

					// Single item check (our schema or Mix Space schema)
					const hasValidField =
						body.deviceId ||
						body.device_id ||
						body.appName ||
						body.process_name ||
						body.process;

					if (hasValidField) {
						defaultStore.record(body as unknown as DeviceActivity);
						return new Response(JSON.stringify({ success: true, count: 1 }), {
							status: 200,
							headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
						});
					}
				}

				return new Response(
					JSON.stringify({ error: "Invalid payload format" }),
					{
						status: 400,
						headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
					},
				);
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
