/**
 * Engine selection. Pure: the policy is a function of the source, the author's
 * preference, and whether the engine can be reached at all.
 */

import type { EngineName, EnginePreference } from "../protocol/types.js";

/**
 * The container families the engine demuxes, per Mellow-Player's ADR-0002:
 * Matroska/WebM, ISO BMFF (MP4), and MPEG-2 transport streams. `.flv` and
 * anything else are still refused upstream, so they stay on the native element.
 *
 * This list mirrors upstream's own enumeration on purpose. Guessing wider would
 * be worse than guessing narrower: a source handed to an engine that cannot
 * demux it surfaces as an error, not as a fallback.
 */
const ENGINE_CONTAINERS: Record<string, EngineContainerFamily> = {
	".mkv": "matroska",
	".webm": "matroska",
	".mp4": "bmff",
	".m4v": "bmff",
	".mov": "bmff",
	".ts": "mpegts",
};

export type EngineContainerFamily = "matroska" | "bmff" | "mpegts";

/**
 * Returns the container family of `src`, or `null` when the engine should not
 * be asked. Only the last path segment is inspected, so a dotted host such as
 * `https://cdn.example.com/video` is not mistaken for an extension, and a
 * query or fragment that happens to contain `.mkv` does not count.
 */
export function engineContainer(src: string): EngineContainerFamily | null {
	const path = src.trim().split("#")[0].split("?")[0];
	const lastSlash = path.lastIndexOf("/");
	const lastDot = path.lastIndexOf(".");
	if (lastDot <= lastSlash) return null;
	return ENGINE_CONTAINERS[path.slice(lastDot).toLowerCase()] ?? null;
}

export type EngineChoiceReason =
	| "forced-native"
	| "forced-mellow"
	| "mellow-unavailable"
	| "mellow-unreadable"
	| "matroska-source"
	| "mp4-source"
	| "mpegts-source"
	| "native-container";

const CONTAINER_REASONS: Record<EngineContainerFamily, EngineChoiceReason> = {
	matroska: "matroska-source",
	bmff: "mp4-source",
	mpegts: "mpegts-source",
};

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
 * Forcing the engine on a source it cannot demux, or cannot read, would trade a
 * working element for an error, so a forced choice that is unavailable or
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

	const family = engineContainer(src);

	if (preference === "mellow") {
		return mellowReadable
			? { engine: "mellow", reason: "forced-mellow" }
			: { engine: "native", reason: "mellow-unreadable" };
	}

	if (family === null) {
		return { engine: "native", reason: "native-container" };
	}

	return mellowReadable
		? { engine: "mellow", reason: CONTAINER_REASONS[family] }
		: { engine: "native", reason: "mellow-unreadable" };
}
