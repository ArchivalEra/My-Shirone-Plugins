#!/usr/bin/env node
/**
 * @shirone-plugins/repo-inventory CLI
 *
 * Build-time probe: read the curated whitelist's GitHub state and the mirror
 * repository's `repo/` tree, then write the inventory the theme's projects page
 * consumes (baked into the build, and published as `/sites.json` for the page's
 * manual refresh).
 *
 * Requires `pnpm build` in this plugin first — the fetching below is only an
 * adapter, the module in `../dist/index.js` owns the model.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	list,
	parseWhitelist,
	serializeInventory,
} from "../dist/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
	owner: "ArchivalEra",
	mirrorRepo: "isui.ren-heart",
	mirrorBranch: "deploy",
	mirrorDir: "repo",
	api: "https://api.github.com",
};

const USAGE = `@shirone-plugins/repo-inventory CLI

Read the curated whitelist's GitHub state plus the mirror repository's repo/
tree, and write the inventory JSON consumed by the Shirone projects page.

Usage:
  shirone-repo-inventory --whitelist <file> --out <file> [options]

Options:
  --owner <user>          GitHub user/org (default: "${DEFAULTS.owner}")
  --whitelist <file>      Shirone projects data module holding the curated list (required)
  --out <file>            Inventory JSON to write (required)
  --mirror-repo <name>    Repository whose tree holds the accelerated mirrors (default: "${DEFAULTS.mirrorRepo}")
  --mirror-branch <ref>   Branch to read that tree from (default: "${DEFAULTS.mirrorBranch}")
  --mirror-dir <path>     Directory inside that repository (default: "${DEFAULTS.mirrorDir}")
  --api <base>            GitHub API base (default: "${DEFAULTS.api}")
  --help                  Show this message

Environment:
  GITHUB_TOKEN            Optional. Without it the probe runs on GitHub's
                          anonymous budget and fails fast on rate limits.
`;

function parseArgs(argv) {
	const flags = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") return { help: true };
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`Missing value for --${key}`);
		}
		flags[key] = value;
		i += 1;
	}
	return flags;
}

function makeAdapter({ api, owner, mirrorRepo, mirrorBranch, mirrorDir, token }) {
	const headers = {
		Accept: "application/vnd.github+json",
		"User-Agent": "shirone-repo-inventory",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	async function request(endpoint) {
		return fetch(`${api}${endpoint}`, { headers });
	}

	function warn(message) {
		console.error(`[repo-inventory] ${message}`);
	}

	return {
		async facts(name) {
			const repoResponse = await request(`/repos/${owner}/${name}`);
			if (!repoResponse.ok) {
				warn(`${name}: repository read failed (HTTP ${repoResponse.status}) — omitted`);
				return null;
			}
			const repo = await repoResponse.json();
			const hasPages = Boolean(repo.has_pages);

			// The build status costs one extra request per repository and only
			// refines an enabled mirror, so it is skipped when Pages is off.
			let status = null;
			if (hasPages) {
				const pagesResponse = await request(`/repos/${owner}/${name}/pages`);
				if (pagesResponse.ok) {
					const pages = await pagesResponse.json();
					status = typeof pages.status === "string" ? pages.status : null;
				} else if (pagesResponse.status !== 404) {
					warn(`${name}: pages status read failed (HTTP ${pagesResponse.status}) — treated as unknown`);
				}
			}

			return {
				hasPages,
				pushedAt: typeof repo.pushed_at === "string" ? repo.pushed_at : "",
				status,
			};
		},

		async acceleratedDirs() {
			const endpoint = `/repos/${owner}/${mirrorRepo}/contents/${mirrorDir}?ref=${mirrorBranch}`;
			const response = await request(endpoint);
			if (!response.ok) {
				warn(`mirror tree read failed (HTTP ${response.status}) — no accelerated repositories reported`);
				return [];
			}
			const listing = await response.json();
			if (!Array.isArray(listing)) {
				warn("mirror tree listing was not an array — no accelerated repositories reported");
				return [];
			}
			return listing
				.filter((item) => item && item.type === "dir" && typeof item.name === "string")
				.map((item) => item.name);
		},

		now() {
			return new Date().toISOString();
		},
	};
}

async function main() {
	const flags = parseArgs(process.argv.slice(2));
	if (flags.help) {
		process.stdout.write(USAGE);
		return 0;
	}

	const owner = flags.owner || DEFAULTS.owner;
	const whitelistPath = flags.whitelist;
	const outPath = flags.out;
	if (!whitelistPath || !outPath) {
		throw new Error("--whitelist and --out are both required (see --help)");
	}

	const source = fs.readFileSync(whitelistPath, "utf8");
	const whitelist = parseWhitelist(source, owner);
	if (whitelist.length === 0) {
		throw new Error(
			`no ${owner} repositories found in ${whitelistPath} — refusing to write an empty inventory`,
		);
	}

	const adapter = makeAdapter({
		api: flags.api || DEFAULTS.api,
		owner,
		mirrorRepo: flags["mirror-repo"] || DEFAULTS.mirrorRepo,
		mirrorBranch: flags["mirror-branch"] || DEFAULTS.mirrorBranch,
		mirrorDir: flags["mirror-dir"] || DEFAULTS.mirrorDir,
		token: process.env.GITHUB_TOKEN || "",
	});

	const inventory = await list(whitelist, adapter);

	fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
	fs.writeFileSync(outPath, serializeInventory(inventory));

	const counts = { ready: 0, absent: 0, pending: 0 };
	for (const entry of inventory.entries) counts[entry.pages] += 1;
	const accelerated = inventory.entries.filter((entry) => entry.accelerated).length;

	console.log(
		`[repo-inventory] ${inventory.entries.length}/${whitelist.length} repositories ` +
			`(ready ${counts.ready} · absent ${counts.absent} · pending ${counts.pending} · ` +
			`accelerated ${accelerated}) -> ${outPath}`,
	);

	const known = new Set(whitelist);
	const orphans = inventory.acceleratedDirs.filter((name) => !known.has(name));
	if (orphans.length > 0) {
		console.log(
			`[repo-inventory] mirror tree holds ${orphans.length} director${orphans.length === 1 ? "y" : "ies"} ` +
				`with no whitelist entry: ${orphans.join(", ")}`,
		);
	}

	return 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error) => {
		console.error(`[repo-inventory] ${error instanceof Error ? error.message : String(error)}`);
		console.error(`[repo-inventory] run with --help for usage`);
		process.exitCode = 1;
	},
);
