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
	| "mellow-unreadable"
	| "matroska-source"
	| "non-matroska-source";

export interface EngineChoiceInput {
	src: string;
	preference: EnginePreference;
	/** False when no engine URL is configured, or the module failed to load. */
	mellowAvailable: boolean;
	/**
	 * False when the origin refuses cross-origin reads. The engine reads with
	 * `fetch`, so a source that plays fine in a media element can still be
	 * unreadable to it — see `probeBoundedRanges`.
	 */
	mellowReadable: boolean;
}

export interface EngineChoice {
	engine: EngineName;
	reason: EngineChoiceReason;
}

/**
 * Picks the engine for one embed.
 *
 * Forcing Mellow on a source it cannot demux, or cannot read, would trade a
 * working element for an error, so a forced Mellow that is unavailable or
 * unreadable falls back and says why; the surface prints the reason in its
 * diagnostics panel.
 */
export function chooseEngine(input: EngineChoiceInput): EngineChoice {
	const { src, preference, mellowAvailable, mellowReadable } = input;

	if (preference === "native") {
		return { engine: "native", reason: "forced-native" };
	}

	if (!mellowAvailable) {
		return { engine: "native", reason: "mellow-unavailable" };
	}

	if (preference === "mellow") {
		return mellowReadable
			? { engine: "mellow", reason: "forced-mellow" }
			: { engine: "native", reason: "mellow-unreadable" };
	}

	if (matroskaExtension(src) === null) {
		return { engine: "native", reason: "non-matroska-source" };
	}

	return mellowReadable
		? { engine: "mellow", reason: "matroska-source" }
		: { engine: "native", reason: "mellow-unreadable" };
}
