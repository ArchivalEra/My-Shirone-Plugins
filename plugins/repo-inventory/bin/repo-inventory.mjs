#!/usr/bin/env node
/**
 * @shirone-plugins/repo-inventory CLI
 *
 * Build-time probe: list every public repository the owner has, read each one's
 * Pages state and the mirror repository's `repo/` tree, then write the inventory
 * the theme's projects page consumes (baked into the build, and published as a
 * static file for the page's manual refresh).
 *
 * Requires `pnpm build` in this plugin first — the fetching below is only an
 * adapter, the module in `../dist/index.js` owns the model.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	list,
	selectDiscovered,
	serializeInventory,
} from "../dist/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Site-icon probing limits: a slow site must not stall the whole inventory. */
const SITE_ICON_TIMEOUT_MS = 8000;
/** Cap for inlined icons — favicons are a few KB; anything larger is not one. */
const MAX_ICON_BYTES = 256 * 1024;

const DEFAULTS = {
	owner: "ArchivalEra",
	mirrorRepo: "isui.ren-heart",
	mirrorBranch: "deploy",
	mirrorDir: "repo",
	api: "https://api.github.com",
};

const USAGE = `@shirone-plugins/repo-inventory CLI

Inventory every public repository of a GitHub owner: Pages state, mirror
acceleration and last push, as JSON for a Shirone projects page.

Usage:
  shirone-repo-inventory --out <file> [options]

Options:
  --owner <user>          GitHub user/org (default: "${DEFAULTS.owner}")
  --out <file>            Inventory JSON to write (required)
  --exclude-file <file>   Names to leave out, one per line ("#" comments allowed)
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
	// A `while` loop, not `for`: the body consumes the value after a `--key`, so
	// the cursor advance is part of the parse rather than bookkeeping the `for`
	// header already performs. Reassigning `i` inside a `for` head reads as a
	// redundant double-advance to linters; here it is the whole point.
	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") return { help: true };
		if (!arg.startsWith("--")) {
			i += 1;
			continue;
		}
		const key = arg.slice(2);
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`Missing value for --${key}`);
		}
		flags[key] = value;
		i += 2;
	}
	return flags;
}

/** Read an exclusion list: one repository name per line, `#` starts a comment. */
function readExclusions(file) {
	if (!file) return [];
	const text = fs.readFileSync(file, "utf8");
	return text
		.split("\n")
		.map((line) => line.split("#")[0].trim())
		.filter(Boolean);
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

	/**
	 * Candidate icon paths inside a repository, most specific first. The
	 * showcase reads the icon from the repository itself, so no per-entry icon
	 * has to be hand-written; a repository that carries none just renders its
	 * fallback glyph. Root-level names come first so any repo can drop an icon
	 * in without a convention directory.
	 */
	const ICON_CANDIDATES = [
		"icon.svg",
		".github/icon.svg",
		"docs/icon.svg",
		"assets/icon.svg",
		"public/icon.svg",
		"icon.png",
		"docs/icon.png",
		"assets/icon.png",
		"public/icon.png",
	];

	const ICON_MIME = {
		svg: "image/svg+xml",
		png: "image/png",
		webp: "image/webp",
		gif: "image/gif",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		ico: "image/x-icon",
	};

	/**
	 * Category buckets inferred from machine facts only. Deliberately coarse and
	 * ordered: first match wins, `other` is the honest default when nothing
	 * matches. No editorial knowledge lives here — a repository's name, language
	 * and description are the only inputs.
	 */
	const CATEGORY_RULES = [
		{
			key: "theme",
			test: (f) => /theme|blog|shirone/i.test(f.name),
		},
		{
			key: "site",
			test: (f) => f.hasPages && /\.ren$|isui/i.test(f.name),
		},
		{
			key: "tool",
			test: (f) =>
				["Shell", "C", "C++", "Assembly", "Makefile"].includes(f.language ?? ""),
		},
		{
			key: "app",
			test: (f) =>
				["Rust", "TypeScript", "JavaScript", "Go", "Python", "C#", "Kotlin", "Swift"].includes(
					f.language ?? "",
				),
		},
	];

	/** @param {{name:string,hasPages:boolean,language:string|null,description:string}} facts */
	function inferCategory(facts) {
		for (const rule of CATEGORY_RULES) {
			try {
				if (rule.test(facts)) return rule.key;
			} catch {
				/* a rule that cannot read the facts simply does not match */
			}
		}
		return "other";
	}

	/**
	 * Read the favicon a repository's **published site** declares.
	 *
	 * Covers both hosting arrangements the cluster uses: a GitHub Pages site at
	 * `<owner>.github.io/<name>/`, and the cluster mirror at
	 * `https://isui.ren/repo/<name>/`. The first one that answers with an HTML
	 * document wins; its `<link rel="icon">` (any `rel` containing `icon`) is
	 * resolved against the page URL and inlined as a data URI so consumers issue
	 * no extra request.
	 *
	 * Returns "" when the site is unreachable, publishes no HTML, or declares no
	 * icon — an omission, never a guess. This is why a repository with no site
	 * simply keeps its repository icon.
	 */
	async function readSiteIcon(name, hasPages) {
		// Candidate publishing layouts. Six arrangements coexist in this cluster:
		// the mirror tree (`/repo/<name>/`), a top-level slot named after the
		// repository (`/Mijo/`), a top-level slot named after the site
		// (`/Bahnhof/` — repo is `isui.ren-Bahnhof`), and GitHub Pages. Probing all
		// of them is what lets an icon be found regardless of which one a repo used.
		const shortName = name.replace(/^isui\.ren-/, "");
		const candidates = [
			`https://isui.ren/repo/${name}/`,
			`https://isui.ren/${name}/`,
			...(shortName !== name ? [`https://isui.ren/${shortName}/`] : []),
			...(hasPages ? [`https://${owner.toLowerCase()}.github.io/${name}/`] : []),
		];
		for (const pageUrl of candidates) {
			let html;
			try {
				const response = await fetch(pageUrl, {
					headers: { "User-Agent": "repo-inventory/1.0", Accept: "text/html,*/*" },
					signal: AbortSignal.timeout(SITE_ICON_TIMEOUT_MS),
				});
				if (!response.ok) continue;
				const type = response.headers.get("content-type") ?? "";
				if (!/html/i.test(type) && !/html/i.test(await peek(response))) continue;
				html = await response.text();
			} catch {
				continue;
			}
			const href = extractIconHref(html);
			if (!href) continue;
			let iconUrl;
			try {
				iconUrl = new URL(href, pageUrl).toString();
			} catch {
				continue;
			}
			const inlined = await inlineRemoteIcon(iconUrl);
			if (inlined) return inlined;
		}
		return "";
	}

	/** Read a response's first bytes without consuming the body for the caller. */
	async function peek(response) {
		try {
			const clone = response.clone();
			const buf = await clone.arrayBuffer();
			return new TextDecoder().decode(buf.slice(0, 512));
		} catch {
			return "";
		}
	}

	/**
	 * Pull an icon path out of an HTML document. Handles the three shapes that
	 * actually occur: `<link rel="icon" href="...">`, `rel="shortcut icon"`, and
	 * the attribute order reversed. Deliberately not a full HTML parser — the
	 * input is one `<head>` of a static site.
	 */
	function extractIconHref(html) {
		const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
		for (const tag of linkTags) {
			const rel = /\brel\s*=\s*["']?([^"'>]+)["']?/i.exec(tag);
			if (!rel || !/icon/i.test(rel[1])) continue;
			const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
			if (href && !href[1].startsWith("data:")) return href[1];
		}
		return "";
	}

	/** Fetch a remote icon and inline it, guarding size and content type. */
	async function inlineRemoteIcon(url) {
		let response;
		try {
			response = await fetch(url, {
				headers: { "User-Agent": "repo-inventory/1.0" },
				signal: AbortSignal.timeout(SITE_ICON_TIMEOUT_MS),
			});
		} catch {
			return "";
		}
		if (!response.ok) return "";
		const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
		if (!type.startsWith("image/")) return "";
		if (type === "image/svg+xml") {
			const text = await response.text();
			if (text.length > MAX_ICON_BYTES) return "";
			return `data:image/svg+xml;base64,${Buffer.from(text, "utf8").toString("base64")}`;
		}
		const buf = Buffer.from(await response.arrayBuffer());
		if (buf.byteLength > MAX_ICON_BYTES) return "";
		return `data:${type};base64,${buf.toString("base64")}`;
	}

	/**
	 * Read one repository's icon and inline it as a data URI. Tries each
	 * candidate path (GitHub's Contents API resolves them against the default
	 * branch, so this is branch-agnostic). Returns "" when none is found or every
	 * read fails — a missing icon is an omission, never an error that sinks the
	 * whole inventory.
	 */
	async function readIcon(name) {
		for (const candidate of ICON_CANDIDATES) {
			const response = await request(
				`/repos/${owner}/${name}/contents/${candidate}`,
			);
			if (!response.ok) continue;
			let payload;
			try {
				payload = await response.json();
			} catch {
				continue;
			}
			if (!payload || payload.type !== "file" || typeof payload.content !== "string") {
				continue;
			}
			const ext = candidate.split(".").pop().toLowerCase();
			const mime = ICON_MIME[ext] ?? "application/octet-stream";
			// The Contents API returns base64 with embedded newlines.
			const base64 = payload.content.replace(/\s+/g, "");
			return `data:${mime};base64,${base64}`;
		}
		return "";
	}

	return {
		/** The only place that knows GitHub's list shape. */
		async discover() {
			const endpoint = `/users/${owner}/repos?per_page=100&type=owner&sort=pushed`;
			const response = await request(endpoint);
			if (!response.ok) {
				throw new Error(
					`repository listing failed (HTTP ${response.status}) — refusing to write a partial inventory`,
				);
			}
			const listing = await response.json();
			if (!Array.isArray(listing)) {
				throw new Error("repository listing was not an array");
			}
			if (listing.length === 100) {
				warn(
					"listing returned exactly 100 repositories: the page limit was hit, so the tail is missing",
				);
			}
			return listing.map((repo) => ({
				name: typeof repo?.name === "string" ? repo.name : "",
				private: Boolean(repo?.private),
				fork: Boolean(repo?.fork),
			}));
		},

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
				description: typeof repo.description === "string" ? repo.description : "",
				language: typeof repo.language === "string" ? repo.language : null,
				url: typeof repo.html_url === "string" ? repo.html_url : "",
				icon: await readIcon(name),
				// Site icon wins over the repository icon in every consumer: a
				// project's public face is its site. Both are inlined so the page
				// issues no extra request either way.
				siteIcon: await readSiteIcon(name, hasPages),
				category: inferCategory({
					name,
					hasPages,
					language: typeof repo.language === "string" ? repo.language : null,
					description: typeof repo.description === "string" ? repo.description : "",
				}),
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
	const outPath = flags.out;
	if (!outPath) {
		throw new Error("--out is required (see --help)");
	}

	const exclude = readExclusions(flags["exclude-file"]);
	const adapter = makeAdapter({
		api: flags.api || DEFAULTS.api,
		owner,
		mirrorRepo: flags["mirror-repo"] || DEFAULTS.mirrorRepo,
		mirrorBranch: flags["mirror-branch"] || DEFAULTS.mirrorBranch,
		mirrorDir: flags["mirror-dir"] || DEFAULTS.mirrorDir,
		token: process.env.GITHUB_TOKEN || "",
	});

	const discovered = await adapter.discover();
	const names = selectDiscovered(discovered, exclude);
	if (names.length === 0) {
		throw new Error(
			`no repositories selected for ${owner} (${discovered.length} listed, ${exclude.length} excluded)`,
		);
	}

	const inventory = await list(names, adapter);

	fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
	fs.writeFileSync(outPath, serializeInventory(inventory));

	const counts = { ready: 0, absent: 0, pending: 0 };
	for (const entry of inventory.entries) counts[entry.pages] += 1;
	const accelerated = inventory.entries.filter((entry) => entry.accelerated).length;
	const skipped = discovered.length - names.length;

	const skippedNote = skipped > 0 ? ` · ${skipped} excluded/private` : "";

	console.log(
		`[repo-inventory] ${inventory.entries.length}/${names.length} repositories ` +
			`(ready ${counts.ready} · absent ${counts.absent} · pending ${counts.pending} · ` +
			`accelerated ${accelerated})${skippedNote} -> ${outPath}`,
	);

	const known = new Set(names);
	const orphans = inventory.acceleratedDirs.filter((name) => !known.has(name));
	if (orphans.length > 0) {
		console.log(
			`[repo-inventory] mirror tree holds ${orphans.length} director${orphans.length === 1 ? "y" : "ies"} ` +
				`nothing selects: ${orphans.join(", ")}`,
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
