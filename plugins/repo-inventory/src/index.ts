/**
 * @shirone-plugins/repo-inventory
 *
 * Build-time repository inventory for the isui.ren cluster: which repositories in
 * the curated whitelist have a usable GitHub Pages mirror, which are served from
 * this cluster's own mirror tree, and when each was last pushed.
 *
 * The module owns the model and the classification, and never touches the network
 * or the filesystem — every fact arrives through the injected `InventoryDeps`. So
 * the whole of `list()` is testable with a fake adapter, and the CLI that does the
 * fetching stays a thin shell around the same interface.
 */

export type RepoPagesState = "ready" | "absent" | "pending";

export interface RepoState {
	/** Repository name, as it appears in the whitelist and in `/repo/<name>/`. */
	name: string;
	/**
	 * `ready`   — Pages is enabled and the last build succeeded, or its build
	 *             status is unknown while Pages itself is on.
	 * `absent`  — Pages is not enabled for this repository.
	 * `pending` — Pages is enabled but its last build is not `built` (GitHub
	 *             reports `building` / `errored`), so the mirror may be stale.
	 */
	pages: RepoPagesState;
	/** Served from the mirror repository's own `repo/` tree instead of proxied. */
	accelerated: boolean;
	/** ISO timestamp of the last push, straight from GitHub. */
	pushedAt: string;
	/**
	 * Raw GitHub Pages build status (`built` / `building` / `errored`), or null
	 * when it could not be read. Carried for diagnostics; never rendered.
	 */
	status: string | null;
}

export interface RepoInventory {
	generatedAt: string;
	/**
	 * Every directory name found under the mirror tree, including ones no longer
	 * in the whitelist. Those orphans are what this list exists to expose.
	 */
	acceleratedDirs: string[];
	/** Only repositories whose facts were actually read. A failed read is an omission, never a guess. */
	entries: RepoState[];
}

/** The per-repository facts an adapter must supply. */
export interface RepoFacts {
	hasPages: boolean;
	pushedAt: string;
	status: string | null;
}

/**
 * Injected dependencies. Returning null from `facts` means "could not read",
 * which omits the repository from the inventory rather than inventing a state.
 */
export interface InventoryDeps {
	facts(name: string): Promise<RepoFacts | null>;
	acceleratedDirs(): Promise<string[]>;
	now(): string;
}

const OWNER_FILTER = /^[A-Za-z0-9._-]+$/;

function normalizeName(raw: string): string {
	return raw
		.trim()
		.replace(/\.git$/i, "")
		.replace(/^\/+|\/+$/g, "");
}

function normalizeWhitelist(names: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = normalizeName(raw);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out;
}

function classifyPages(hasPages: boolean, status: string | null): RepoPagesState {
	if (!hasPages) return "absent";
	// Pages is on but the build status is unreadable: the mirror exists, so claim
	// what we know (`ready`) rather than hedge into `pending`, which means "on but
	// not built". The distinction only matters when the status was actually read.
	if (status === null) return "ready";
	return status === "built" ? "ready" : "pending";
}

function buildInventory(
	whitelist: string[],
	facts: Map<string, RepoFacts>,
	acceleratedDirs: string[],
	generatedAt: string,
): RepoInventory {
	const accelerated = new Set(acceleratedDirs);
	const entries: RepoState[] = [];
	for (const name of whitelist) {
		const found = facts.get(name);
		if (!found) continue;
		entries.push({
			name,
			pages: classifyPages(found.hasPages, found.status),
			accelerated: accelerated.has(name),
			pushedAt: found.pushedAt,
			status: found.status,
		});
	}
	return {
		generatedAt,
		acceleratedDirs: [...acceleratedDirs].sort(),
		entries,
	};
}

/**
 * Pull repository names out of a Shirone projects data module.
 *
 * Only `repository` fields on the given owner count: the whitelist is the
 * curated project list, so a repository that is not presented there has no
 * business appearing in the inventory.
 */
export function parseWhitelist(source: string, owner: string): string[] {
	const wanted = owner.trim().toLowerCase();
	if (!wanted) return [];
	const found: string[] = [];
	const pattern = /repository\s*:\s*["'`]([^"'`]+)["'`]/g;
	for (const match of source.matchAll(pattern)) {
		let url: URL;
		try {
			url = new URL(match[1]);
		} catch {
			continue;
		}
		if (url.hostname.toLowerCase() !== "github.com") continue;
		const segments = url.pathname.replace(/^\/+/, "").split("/");
		const [repoOwner, repoName] = segments;
		if (!repoOwner || !repoName) continue;
		if (repoOwner.toLowerCase() !== wanted) continue;
		const name = normalizeName(repoName);
		if (!name || !OWNER_FILTER.test(name)) continue;
		found.push(name);
	}
	return normalizeWhitelist(found);
}

/**
 * Read the inventory for a curated whitelist.
 *
 * Facts are read concurrently; the returned order follows the whitelist, so the
 * projects page renders in its curated order rather than in API order.
 */
export async function list(
	whitelist: string[],
	deps: InventoryDeps,
): Promise<RepoInventory> {
	const names = normalizeWhitelist(whitelist);
	const [acceleratedDirs, read] = await Promise.all([
		deps.acceleratedDirs(),
		Promise.all(
			names.map(async (name) => [name, await deps.facts(name)] as const),
		),
	]);
	const facts = new Map<string, RepoFacts>();
	for (const [name, value] of read) {
		if (value) facts.set(name, value);
	}
	return buildInventory(names, facts, acceleratedDirs, deps.now());
}

/** Stable on-disk form: two-space JSON with a trailing newline. */
export function serializeInventory(inventory: RepoInventory): string {
	return `${JSON.stringify(inventory, null, 2)}\n`;
}
