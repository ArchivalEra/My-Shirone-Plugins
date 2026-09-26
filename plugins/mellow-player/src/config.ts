/**
 * Configuration normalisation. Pure: no DOM, no network, no clock.
 */

import {
	DEFAULT_ENGINE_TIMEOUT_MS,
	PLAYER_LABEL_KEYS,
	type PlayerConfigResolution,
	type PlayerLabels,
	type PlayerOptionsInput,
	type ResolvedPlayerConfig,
} from "./protocol/types.js";

const ENGINE_PREFERENCES = new Set(["auto", "native", "mellow"]);

function normalizeEngine(value: PlayerOptionsInput["engine"]) {
	return value && ENGINE_PREFERENCES.has(value) ? value : "auto";
}

/**
 * Accepts only the two shapes a dynamic `import()` can resolve from any route:
 * a site-root path or an absolute URL. Everything else disables the Mellow
 * engine rather than failing at play time with an opaque module error.
 */
export function normalizeEngineUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const url = value.trim();
	if (!url) return null;
	if (url.startsWith("//")) return null;
	if (url.startsWith("/")) return url;
	try {
		const protocol = new URL(url).protocol;
		return protocol === "https:" || protocol === "http:" ? url : null;
	} catch {
		return null;
	}
}

function normalizeTimeout(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_ENGINE_TIMEOUT_MS;
	}
	return Math.floor(value);
}

function normalizeRouteFilter(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function collectLabels(input: Partial<PlayerLabels> | undefined): {
	labels: PlayerLabels;
	missing: (keyof PlayerLabels)[];
} {
	const source = input ?? {};
	const labels = {} as PlayerLabels;
	const missing: (keyof PlayerLabels)[] = [];

	for (const key of PLAYER_LABEL_KEYS) {
		const value = source[key];
		if (typeof value !== "string" || value.trim() === "") {
			missing.push(key);
			labels[key] = "";
			continue;
		}
		// An accessible name never wants the padding a translation string
		// sometimes carries.
		labels[key] = value.trim();
	}

	return { labels, missing };
}

/**
 * Turns author configuration into either a ready-to-run config or a refusal
 * that names what to fix. Explicit disabling wins over missing labels so a
 * host that turned the plugin off is never told about its labels.
 */
export function resolvePlayerConfig(
	input: PlayerOptionsInput = {},
): PlayerConfigResolution {
	const { labels, missing } = collectLabels(input.labels);

	if (input.enabled === false) {
		return {
			enabled: false,
			reason: "disabled",
			missingLabels: missing,
			config: null,
		};
	}

	if (missing.length > 0) {
		return {
			enabled: false,
			reason: "incomplete-labels",
			missingLabels: missing,
			config: null,
		};
	}

	return {
		enabled: true,
		reason: null,
		missingLabels: [],
		config: {
			engine: normalizeEngine(input.engine),
			engineUrl: normalizeEngineUrl(input.engineUrl),
			engineTimeoutMs: normalizeTimeout(input.engineTimeoutMs),
			diagnostics: input.diagnostics === true,
			labels,
			routeFilter: normalizeRouteFilter(input.routeFilter),
		},
	};
}
