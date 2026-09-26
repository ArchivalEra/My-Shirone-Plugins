/**
 * Engine selection. Pure: the policy is a function of the source, the author's
 * preference, and whether a Mellow module is configured at all.
 */

import type { EngineName, EnginePreference } from "../protocol/types.js";

/** Matroska is the only container Mellow-Player accepts. */
const MATROSKA_EXTENSIONS = new Set([".mkv", ".webm"]);

/**
 * Returns the Matroska extension of `src`, or `null` when the source is not
 * Matroska. Only the last path segment is inspected, so a dotted host such as
 * `https://cdn.example.com/video` is not mistaken for an extension, and a
 * query or fragment that happens to contain `.mkv` does not count.
 */
export function matroskaExtension(src: string): string | null {
	const path = src.trim().split("#")[0].split("?")[0];
	const lastSlash = path.lastIndexOf("/");
	const lastDot = path.lastIndexOf(".");
	if (lastDot <= lastSlash) return null;
	const extension = path.slice(lastDot).toLowerCase();
	return MATROSKA_EXTENSIONS.has(extension) ? extension : null;
}

export type EngineChoiceReason =
	| "forced-native"
	| "forced-mellow"
	| "mellow-unavailable"
	| "matroska-source"
	| "non-matroska-source";

export interface EngineChoiceInput {
	src: string;
	preference: EnginePreference;
	/** False when no engine URL is configured, or the module failed to load. */
	mellowAvailable: boolean;
}

export interface EngineChoice {
	engine: EngineName;
	reason: EngineChoiceReason;
}

/**
 * Picks the engine for one embed.
 *
 * Forcing Mellow on a source it cannot demux would trade a working element for
 * an exclusivity error, so a forced Mellow that is unavailable falls back and
 * says so; the surface prints the reason in its diagnostics panel.
 */
export function chooseEngine(input: EngineChoiceInput): EngineChoice {
	const { src, preference, mellowAvailable } = input;

	if (preference === "native") {
		return { engine: "native", reason: "forced-native" };
	}

	if (preference === "mellow") {
		return mellowAvailable
			? { engine: "mellow", reason: "forced-mellow" }
			: { engine: "native", reason: "mellow-unavailable" };
	}

	if (!mellowAvailable) {
		return { engine: "native", reason: "mellow-unavailable" };
	}

	return matroskaExtension(src) !== null
		? { engine: "mellow", reason: "matroska-source" }
		: { engine: "native", reason: "non-matroska-source" };
}
