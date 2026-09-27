/**
 * Reachability probe for the bounded-range engine.
 *
 * Mellow-Player reads media with `fetch`, so a cross-origin source has to grant
 * CORS — while a media element does not need it. That asymmetry means an origin
 * can look perfectly playable and still be unreadable to the engine, which is
 * the one failure a container check cannot predict: a `.mkv` from a drive-backed
 * CDN reads as Matroska, gets handed to Mellow, and dies on the first read.
 *
 * One bounded read of a single byte answers the question before an engine is
 * bound, so the reader gets a player instead of an error. The result is per
 * origin, because CORS is: one probe covers every embed served from the same
 * host.
 */

import { describeFailure } from "../format.js";

/**
 * The only status the engine will accept. Mellow-Player asserts that an origin
 * honours ranged reads and aborts on a `200` (which means the origin ignored
 * `Range` and started streaming the whole file), so a probe that accepted `200`
 * would report a source the engine then refuses.
 */
const BOUNDED_STATUS = 206;

export interface BoundedRangeProbe {
	readable: boolean;
	/** Diagnostic detail — the status seen or the failure — never rendered as copy. */
	detail: string;
}

export interface ProbeOptions {
	/** Injected so the probe is testable without a network. */
	fetchImpl?: typeof fetch;
	/** Upper bound before the probe gives up and the source is treated as unreadable. */
	timeoutMs?: number;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

/**
 * Reads one byte with a bounded range request and reports whether the engine
 * could do the same. Never throws: an unreadable origin is a legitimate answer,
 * and the caller's job is to pick the other engine rather than to fail.
 */
export async function probeBoundedRanges(
	src: string,
	options: ProbeOptions = {},
): Promise<BoundedRangeProbe> {
	const doFetch = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const controller =
		typeof AbortController === "function" ? new AbortController() : null;
	if (controller) {
		timer = setTimeout(() => controller.abort(), timeoutMs);
	}

	try {
		const response = await doFetch(src, {
			method: "GET",
			headers: { Range: "bytes=0-0" },
			// `cors` is the point: no matching header means a network error here,
			// which is exactly the condition being tested.
			mode: "cors",
			credentials: "omit",
			...(controller ? { signal: controller.signal } : {}),
		});
		if (response.status === BOUNDED_STATUS) {
			return { readable: true, detail: `HTTP ${response.status}` };
		}
		return { readable: false, detail: `HTTP ${response.status}` };
	} catch (error) {
		return { readable: false, detail: describeFailure(error) };
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

/**
 * Remembers a probe per origin for the life of the page, so a page with several
 * embeds from one host costs one request rather than one per embed.
 */
export function createOriginProbe(
	probe: (
		src: string,
		options?: ProbeOptions,
	) => Promise<BoundedRangeProbe> = probeBoundedRanges,
): (src: string) => Promise<boolean> {
	const cache = new Map<string, Promise<boolean>>();

	return (src: string): Promise<boolean> => {
		const key = originOf(src);
		let pending = cache.get(key);
		if (!pending) {
			pending = probe(src).then((result) => result.readable);
			cache.set(key, pending);
		}
		return pending;
	};
}

function originOf(src: string): string {
	try {
		return new URL(src, "https://placeholder.invalid").origin;
	} catch {
		return src;
	}
}
