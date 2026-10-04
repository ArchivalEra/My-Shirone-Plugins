/**
 * @shirone-plugins/repo-inventory
 *
 * Build-time repository inventory for the isui.ren cluster: every public
 * repository the owner has, with whether it has a usable GitHub Pages mirror,
 * whether it is served from this cluster's own mirror tree, and when it was last
 * pushed.
 *
 * The module owns the model, the selection rule and the classification, and never
 * touches the network or the filesystem — every fact arrives through the injected
 * `InventoryDeps`. So the whole of `list()` is testable with a fake adapter, and
 * the CLI that does the fetching stays a thin shell around the same interface.
 */

export type RepoPagesState = "ready" | "absent" | "pending";

export interface RepoState {
	/** Repository name, as it appears on GitHub and in `/repo/<name>/`. */
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
	/** GitHub description, verbatim and possibly empty. Nothing here is editorial. */
	description: string;
	/** Primary language GitHub reports, or null when it reports none. */
	language: string | null;
	/** Canonical GitHub URL. Carried so a consumer never has to know the owner. */
	url: string;
	/**
	 * Repository icon, inlined as a data URI (empty when the repository carries
	 * none). Read from the repository itself at a conventional path so the
	 * showcase needs no hand-written icon per entry; see the adapter's candidate
	 * list. Kept as a data URI so consumers render it with zero runtime requests.
	 */
	icon: string;
}

export interface RepoInventory {
	generatedAt: string;
	/**
	 * Every directory name found under the mirror tree, including ones nothing
	 * selects any more. Those orphans are what this list exists to expose.
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
	description?: string;
	language?: string | null;
	url?: string;
	/** Repository icon as a data URI; omitted/empty when the repository has none. */
	icon?: string;
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

/** What the adapter must know about a repository for it to be selected at all. */
export interface DiscoveredRepo {
	name: string;
	private?: boolean;
	/** GitHub 的 fork 字段：true = 上游镜像/依赖 fork，一律不进清单。 */
	fork?: boolean;
}

const NAME_FILTER = /^[A-Za-z0-9._-]+$/;

function normalizeName(raw: string): string {
	return raw
		.trim()
		.replace(/\.git$/i, "")
		.replace(/^\/+|\/+$/g, "");
}

function normalizeNames(names: readonly string[]): string[] {
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
	names: readonly string[],
	facts: Map<string, RepoFacts>,
	acceleratedDirs: readonly string[],
	generatedAt: string,
): RepoInventory {
	const accelerated = new Set(acceleratedDirs);
	const entries: RepoState[] = [];
	for (const name of names) {
		const found = facts.get(name);
		if (!found) continue;
		entries.push({
			name,
			pages: classifyPages(found.hasPages, found.status),
			accelerated: accelerated.has(name),
			pushedAt: found.pushedAt,
			status: found.status,
			description: found.description ?? "",
			language: found.language ?? null,
			url: found.url ?? "",
			icon: found.icon ?? "",
		});
	}
	return {
		generatedAt,
		acceleratedDirs: [...acceleratedDirs].sort(),
		entries,
	};
}

/**
 * Decide which repositories the inventory covers: everything the owner has that
 * is not private and not explicitly excluded.
 *
 * Forks are included on purpose — the rule is "not private, not excluded", and a
 * fork the owner keeps public is part of what they have. Exclusion is a list of
 * names rather than a pattern so that hiding one repository never hides a
 * neighbour by accident.
 */
export function selectDiscovered(
	repos: readonly DiscoveredRepo[],
	exclude: readonly string[] = [],
): string[] {
	const excluded = new Set(normalizeNames(exclude));
	const names: string[] = [];
	for (const repo of repos) {
		if (!repo || repo.private) continue;
		// fork 一律不进清单：它们是上游的镜像/依赖，不是这个账号的项目。
		// GitHub 的 fork 字段是机器事实，先于任何排除表生效。
		if (repo.fork) continue;
		const name = normalizeName(typeof repo.name === "string" ? repo.name : "");
		if (!name || excluded.has(name) || !NAME_FILTER.test(name)) continue;
		names.push(name);
	}
	return normalizeNames(names);
}

/**
 * Read the inventory for the given repositories.
 *
 * Facts are read concurrently; the returned order follows `names`, so the caller
 * decides the order by the order it passes (most recently pushed first, say)
 * rather than getting whatever the API happened to return.
 */
export async function list(
	names: readonly string[],
	deps: InventoryDeps,
): Promise<RepoInventory> {
	const selected = normalizeNames(names);
	const [acceleratedDirs, read] = await Promise.all([
		deps.acceleratedDirs(),
		Promise.all(
			selected.map(async (name) => [name, await deps.facts(name)] as const),
		),
	]);
	const facts = new Map<string, RepoFacts>();
	for (const [name, value] of read) {
		if (value) facts.set(name, value);
	}
	return buildInventory(selected, facts, acceleratedDirs, deps.now());
}

/** Biome's default print width. The ecosystem formats with `indentStyle: tab`. */
const LINE_WIDTH = 80;
const INDENT = "\t";

function isScalar(value: unknown): boolean {
	return value === null || typeof value !== "object";
}

/** Inline form of a flat array, or null when it has to break onto its own lines. */
function inlineArrayText(items: unknown[]): string | null {
	if (items.length === 0) return "[]";
	if (!items.every(isScalar)) return null;
	return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

/**
 * Format a value the way Biome formats JSON: tab indentation, objects always
 * expanded, arrays collapsed onto one line while they fit the print width.
 *
 * `column` is how many characters precede the value on its line, so the
 * collapse decision matches the formatter that will read this file back.
 */
function formatJson(value: unknown, depth: number, column: number): string {
	if (Array.isArray(value)) {
		const inline = inlineArrayText(value);
		if (inline !== null && column + inline.length + 1 <= LINE_WIDTH) {
			return inline;
		}
		if (value.length === 0) return "[]";
		const pad = INDENT.repeat(depth + 1);
		const body = value
			.map((item) => pad + formatJson(item, depth + 1, pad.length))
			.join(",\n");
		return `[\n${body}\n${INDENT.repeat(depth)}]`;
	}

	if (value !== null && typeof value === "object") {
		const members = Object.entries(value as Record<string, unknown>);
		if (members.length === 0) return "{}";
		const pad = INDENT.repeat(depth + 1);
		const body = members
			.map(([key, item]) => {
				const prefix = `${JSON.stringify(key)}: `;
				const value0 = formatJson(item, depth + 1, pad.length + prefix.length);
				return `${pad}${prefix}${value0}`;
			})
			.join(",\n");
		return `{\n${body}\n${INDENT.repeat(depth)}}`;
	}

	return JSON.stringify(value) ?? "null";
}

/**
 * Stable on-disk form.
 *
 * Emitted in Biome's own JSON shape rather than `JSON.stringify`'s, because the
 * artifact is generated straight into a theme's `src/`: a file that fails
 * `biome ci` would have to be reformatted on every build, and exempting it
 * would be an exemption the contribution rules do not allow.
 */
export function serializeInventory(inventory: RepoInventory): string {
	return `${formatJson(inventory, 0, 0)}\n`;
}
