/**
 * What-Im-Doing Fleet Edge Hub
 * Cloudflare Worker + Cloudflare D1 Edition (Deepened Architecture)
 *
 * This file serves as a thin HTTP Adapter over the deep FleetStore module.
 */

import { renderAdminHtml } from "./admin-ui.js";
import { FleetAuthError, FleetStore } from "./fleet-store.js";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret",
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			...CORS_HEADERS,
			"Content-Type": "application/json; charset=utf-8",
			...extraHeaders,
		},
	});
}

function errorResponse(message, status = 400) {
	return jsonResponse({ error: message }, status);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const { pathname } = url;
		const { method } = request;

		// 0. CORS Preflight
		if (method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		// 1. Health Probe
		if (pathname === "/health" && method === "GET") {
			return jsonResponse({ ok: true, timestamp: Date.now() }, 200, {
				"Cache-Control": "no-store",
			});
		}

		// Ensure Cloudflare D1 database binding
		const db = env?.DB;
		if (!db) {
			return errorResponse("Cloudflare D1 binding 'DB' is missing", 500);
		}

		const store = new FleetStore(db);

		function checkAdminAuth() {
			if (!env?.ADMIN_KEY) return true;
			const authHeader = request.headers.get("authorization") || "";
			const match = authHeader.match(/^Bearer\s+(.+)$/i);
			const bearerToken = match ? match[1].trim() : "";
			const adminHeader = request.headers.get("x-admin-key") || "";
			const queryKey = url.searchParams.get("admin_key") || "";

			return (
				bearerToken === env.ADMIN_KEY ||
				adminHeader === env.ADMIN_KEY ||
				queryKey === env.ADMIN_KEY
			);
		}

		// 2. Admin Web UI (Protected by Cloudflare Zero Trust Access or ADMIN_KEY)
		if (pathname === "/admin" && method === "GET") {
			return new Response(renderAdminHtml(), {
				status: 200,
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-cache, no-store, must-revalidate",
				},
			});
		}

		// 3. Admin API: List Enrolled Devices
		if (pathname === "/admin/devices" && method === "GET") {
			if (!checkAdminAuth()) {
				return errorResponse("Unauthorized admin access", 401);
			}
			try {
				const devices = await store.listDevices();
				return jsonResponse({ devices });
			} catch (err) {
				return errorResponse(`Database query error: ${err.message}`, 500);
			}
		}

		// 4. Admin API: Register New Device
		if (pathname === "/admin/devices" && method === "POST") {
			if (!checkAdminAuth()) {
				return errorResponse("Unauthorized admin access", 401);
			}
			try {
				const body = await request.json();
				const device = await store.registerDevice(
					body.id,
					body.name,
					body.type,
				);
				return jsonResponse({ ok: true, device });
			} catch (err) {
				return errorResponse(`Registration error: ${err.message}`, 400);
			}
		}

		// 5. Admin API: Revoke Device
		if (pathname.startsWith("/admin/devices/") && method === "DELETE") {
			if (!checkAdminAuth()) {
				return errorResponse("Unauthorized admin access", 401);
			}
			const id = pathname.replace("/admin/devices/", "").trim();
			try {
				const success = await store.revokeDevice(id);
				return jsonResponse({ ok: success, deleted: id });
			} catch (err) {
				return errorResponse(`Revocation error: ${err.message}`, 500);
			}
		}

		// 6. Public Telemetry Reporting: POST /api/activity/report
		if (pathname === "/api/activity/report" && method === "POST") {
			const authHeader = request.headers.get("authorization") || "";
			const match = authHeader.match(/^Bearer\s+(.+)$/i);
			const bearerToken = match ? match[1].trim() : "";

			let body;
			try {
				body = await request.json();
			} catch {
				return errorResponse("Invalid JSON payload", 400);
			}

			try {
				const result = await store.recordReport(body, bearerToken);
				return jsonResponse(result);
			} catch (err) {
				if (err instanceof FleetAuthError) {
					return errorResponse(err.message, err.status);
				}
				return errorResponse(`Report ingestion error: ${err.message}`, 400);
			}
		}

		// 7. Public Telemetry Consumer: GET /api/activity
		if (pathname === "/api/activity" && method === "GET") {
			const isBrief = url.searchParams.get("brief") === "1";
			try {
				const snapshot = await store.getSnapshot(isBrief);
				return jsonResponse(snapshot, 200, {
					"Cache-Control": "public, max-age=5, s-maxage=5",
				});
			} catch (err) {
				return errorResponse(`Failed to fetch activity: ${err.message}`, 500);
			}
		}

		return errorResponse("Endpoint not found", 404);
	},
};
