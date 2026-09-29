#!/usr/bin/env node
/**
 * what-im-doing: Machine Registration & Fleet Enrollment Tool (Node.js)
 * Registers a new machine at the What-Im-Doing Hub, retrieves a device token,
 * and generates/updates ~/.config/what-im-doing.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { dirname, resolve } from "node:path";

function parseArgs(args) {
	const parsed = {
		hub: "",
		adminKey: "",
		id: hostname().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
		name: `${hostname()} (Linux)`,
		type: "desktop",
		config: resolve(homedir(), ".config/what-im-doing.json"),
		cfId: "",
		cfSecret: "",
		dryRun: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--hub" || arg === "--endpoint") {
			parsed.hub = args[++i];
		} else if (arg === "--admin-key") {
			parsed.adminKey = args[++i];
		} else if (arg === "--id") {
			parsed.id = args[++i];
		} else if (arg === "--name") {
			parsed.name = args[++i];
		} else if (arg === "--type") {
			parsed.type = args[++i];
		} else if (arg === "--config") {
			parsed.config = resolve(args[++i]);
		} else if (arg === "--cf-id") {
			parsed.cfId = args[++i];
		} else if (arg === "--cf-secret") {
			parsed.cfSecret = args[++i];
		} else if (arg === "--dry-run") {
			parsed.dryRun = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
what-im-doing: Machine Registration Tool (Node.js)

Usage:
  node register-device.mjs --hub <URL> --admin-key <KEY> [OPTIONS]

Required Options:
  --hub <URL>          Hub base URL (e.g. https://api.mango-mesa.ccwu.cc)
  --admin-key <KEY>    Administrator secret key for Hub API access

Config Options:
  --id <ID>            Device identifier slug (default: ${parsed.id})
  --name <NAME>        Human-readable device name (default: "${parsed.name}")
  --type <TYPE>        Device type: desktop | laptop | server | mobile | other (default: ${parsed.type})
  --config <PATH>      Target config path (default: ${parsed.config})
  --cf-id <ID>         Cloudflare Access Service Token Client ID (optional)
  --cf-secret <SECRET> Cloudflare Access Service Token Client Secret (optional)
  --dry-run            Simulate registration request without saving configuration
  --help, -h           Show this help message
`);
			process.exit(0);
		}
	}

	return parsed;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (!args.hub) {
		console.error("Error: --hub <URL> is required.");
		process.exit(1);
	}
	if (!args.adminKey) {
		console.error("Error: --admin-key <KEY> is required.");
		process.exit(1);
	}

	let cleanHub = args.hub.replace(/\/+$/, "");
	cleanHub = cleanHub.replace(
		/(\/api)?\/activity(\/report)?|\/admin(\/devices)?$/,
		"",
	);

	const registerUrl = `${cleanHub}/admin/devices`;
	const reportUrl = `${cleanHub}/activity/report`;

	console.log("======================================================");
	console.log(" What-Im-Doing Machine Registration (Node.js)");
	console.log("======================================================");
	console.log(`Hub URL:      ${cleanHub}`);
	console.log(`Register URL: ${registerUrl}`);
	console.log(`Report URL:   ${reportUrl}`);
	console.log(`Device ID:    ${args.id}`);
	console.log(`Device Name:  ${args.name}`);
	console.log(`Device Type:  ${args.type}`);
	console.log(`Target Conf:  ${args.config}`);
	console.log("======================================================");

	const payload = {
		id: args.id,
		name: args.name,
		type: args.type,
	};

	if (args.dryRun) {
		console.log(`[dry-run] Would send POST to ${registerUrl}:`);
		console.log(
			"  Headers: Authorization: Bearer <ADMIN_KEY>, x-admin-key: <ADMIN_KEY>",
		);
		console.log(`  Body:    ${JSON.stringify(payload)}`);
		process.exit(0);
	}

	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${args.adminKey}`,
		"x-admin-key": args.adminKey,
	};

	if (args.cfId && args.cfSecret) {
		headers["CF-Access-Client-Id"] = args.cfId;
		headers["CF-Access-Client-Secret"] = args.cfSecret;
	}

	console.log("==> Registering device with Hub...");
	let res;
	try {
		res = await fetch(registerUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});
	} catch (err) {
		console.error(`Error connecting to Hub: ${err.message}`);
		process.exit(1);
	}

	const text = await res.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		console.error(`Error parsing Hub response: ${text}`);
		process.exit(1);
	}

	if (!res.ok || !data.ok) {
		console.error(
			`Error: Registration failed (HTTP ${res.status}): ${data.error || text}`,
		);
		process.exit(1);
	}

	const token = data.device?.token || data.token;
	if (!token) {
		console.error(
			"Error: Token not found in registration response.",
			data,
		);
		process.exit(1);
	}

	console.log("✓ Registration successful!");
	console.log(`  Assigned Token: ${token.slice(0, 10)}****************`);

	const configData = {
		endpoint: reportUrl,
		deviceId: args.id,
		deviceName: args.name,
		deviceType: args.type,
		token,
		cfAccessClientId: args.cfId,
		cfAccessClientSecret: args.cfSecret,
	};

	const confDir = dirname(args.config);
	if (!existsSync(confDir)) {
		mkdirSync(confDir, { recursive: true });
	}

	writeFileSync(args.config, `${JSON.stringify(configData, null, 2)}\n`, {
		mode: 0o600,
	});
	console.log(
		`✓ Configuration saved to: ${args.config} (permissions: 0600)`,
	);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
