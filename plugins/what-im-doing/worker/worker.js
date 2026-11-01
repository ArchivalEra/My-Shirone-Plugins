/**
 * What-Im-Doing Fleet Edge Hub
 * Cloudflare Worker + Cloudflare D1 Edition (Deepened Architecture)
 *
 * This file serves as a thin HTTP Adapter over the deep FleetStore module.
 */

import { renderAdminHtml } from "./admin-ui.js";
import {
	FleetAuthError,
	FleetStore,
	parseTunnelToken,
} from "./fleet-store.js";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, Accept, CF-Access-Client-Id, CF-Access-Client-Secret",
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

/**
 * Admin authorisation: a valid Cloudflare Tunnel token for this account, or a
 * configured `ADMIN_KEY` presented as bearer / `x-admin-key` / `?admin_key`.
 * With neither present the route stays open, relying on Cloudflare Zero Trust
 * Access in front of the Worker - that is the documented deployment model.
 */
function checkAdminAuth({ request, url, env, store }) {
	const authHeader = request.headers.get("authorization") || "";
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const bearerToken = match ? match[1].trim() : "";
	const adminHeader = request.headers.get("x-admin-key") || "";
	const queryKey = url.searchParams.get("admin_key") || "";

	// A. A valid Cloudflare Tunnel token belonging to this account grants admin
	if (bearerToken) {
		const tunnelInfo = parseTunnelToken(bearerToken);
		if (
			tunnelInfo &&
			(!store.accountId || tunnelInfo.accountId === store.accountId)
		) {
			return true;
		}
	}

	// B. An ADMIN_KEY configured in env must match one of the presented forms
	if (env?.ADMIN_KEY) {
		return (
			bearerToken === env.ADMIN_KEY ||
			adminHeader === env.ADMIN_KEY ||
			queryKey === env.ADMIN_KEY
		);
	}

	// C. No ADMIN_KEY configured -> open, protected by Zero Trust Access
	return true;
}

/** Route: admin device management (list, register, revoke). */
async function handleAdminDevices(pathname, method, ctx) {
	const { store, checkAdmin } = ctx;

	if (pathname === "/admin/devices" && method === "GET") {
		if (!checkAdmin()) return errorResponse("Unauthorized admin access", 401);
		try {
			const devices = await store.listDevices();
			return jsonResponse({ devices });
		} catch (err) {
			return errorResponse(`Database query error: ${err.message}`, 500);
		}
	}

	if (pathname === "/admin/devices" && method === "POST") {
		if (!checkAdmin()) return errorResponse("Unauthorized admin access", 401);
		// The original kept JSON parsing and the registration call inside one
		// try, so an unparsable body surfaced as `Registration error`. That is
		// the observable behaviour of this route and is preserved deliberately.
		try {
			const body = await ctx.request.json();
			const device = await store.registerDevice(body.id, body.name, body.type);
			return jsonResponse({ ok: true, device });
		} catch (err) {
			return errorResponse(`Registration error: ${err.message}`, 400);
		}
	}

	if (pathname.startsWith("/admin/devices/") && method === "DELETE") {
		if (!checkAdmin()) return errorResponse("Unauthorized admin access", 401);
		const id = pathname.replace("/admin/devices/", "").trim();
		try {
			const success = await store.revokeDevice(id);
			return jsonResponse({ ok: success, deleted: id });
		} catch (err) {
			return errorResponse(`Revocation error: ${err.message}`, 500);
		}
	}

	return null;
}

/** Route: public telemetry reporting, both device activity and origin-cache. */
async function handleReport(pathname, method, ctx) {
	const { store, request } = ctx;

	const isActivity =
		(pathname === "/activity/report" || pathname === "/api/activity/report") &&
		method === "POST";
	const isOriginCache =
		(pathname === "/activity/origin-cache" ||
			pathname === "/api/activity/origin-cache" ||
			pathname === "/origin-cache/report" ||
			pathname === "/api/origin-cache/report") &&
		method === "POST";

	if (!isActivity && !isOriginCache) return null;

	let body;
	try {
		body = await request.json();
	} catch {
		return errorResponse("Invalid JSON payload", 400);
	}

	if (isOriginCache) {
		try {
			const result = await store.recordOriginCacheReport(body);
			return jsonResponse(result, 200);
		} catch (err) {
			return errorResponse(`Origin-cache ingestion error: ${err.message}`, 400);
		}
	}

	const authHeader = request.headers.get("authorization") || "";
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const bearerToken = match ? match[1].trim() : "";

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

/** Route: public telemetry consumer snapshot. */
async function handleActivityRead(url, method, ctx) {
	if (method !== "GET") return null;
	const { pathname } = url;
	if (pathname !== "/activity" && pathname !== "/api/activity") return null;

	const isBrief = url.searchParams.get("brief") === "1";
	try {
		const snapshot = await ctx.store.getSnapshot(isBrief);
		return jsonResponse(snapshot, 200, {
			"Cache-Control": "public, max-age=5, s-maxage=5",
		});
	} catch (err) {
		return errorResponse(`Failed to fetch activity: ${err.message}`, 500);
	}
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

		// 1. Health Probe - answered before the DB check so a misconfigured
		// deployment still reports liveness instead of a binding error.
		if (
			(pathname === "/health" ||
				pathname === "/activity/health" ||
				pathname === "/api/activity/health") &&
			method === "GET"
		) {
			return jsonResponse({ ok: true, timestamp: Date.now() }, 200, {
				"Cache-Control": "no-store",
			});
		}

		// Ensure Cloudflare D1 database binding
		const db = env?.DB;
		if (!db) {
			return errorResponse("Cloudflare D1 binding 'DB' is missing", 500);
		}

		const store = new FleetStore(db, {
			accountId: env?.ACCOUNT_ID || "9bd2e738536b0a16b01635ab14ea9503",
		});

		const ctx = {
			request,
			url,
			env,
			store,
			checkAdmin: () => checkAdminAuth({ request, url, env, store }),
		};

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

		// 3-5. Admin device management
		const adminResult = await handleAdminDevices(pathname, method, ctx);
		if (adminResult) return adminResult;

		// 6, 6b. Public telemetry reporting
		const reportResult = await handleReport(pathname, method, ctx);
		if (reportResult) return reportResult;

		// 7. Public telemetry consumer
		const activityResult = await handleActivityRead(url, method, ctx);
		if (activityResult) return activityResult;

		return errorResponse("Endpoint not found", 404);
	},
};
