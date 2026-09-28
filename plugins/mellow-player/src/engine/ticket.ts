/**
 * Per-session ticketing for sources behind a signed-read origin (ADR-0027).
 *
 * A signed origin refuses unsigned byte reads, so a bare CDN URL only plays
 * while the edge happens to hold a warm cache copy. The mint endpoint — run
 * by the operator, who keeps the secret — hands out one presigned URL per
 * viewing session. This module is the client half: ask once per embed before
 * the engine is chosen, feed the signed URL to everything downstream, and
 * keep a long viewing session alive by re-minting on a timer and on a
 * mid-play failure, always with the same session (the endpoint keys it to a
 * cookie it issued, so the client's only duty is to send credentials).
 *
 * The signed URL never leaves the runtime: the surface and the engines see
 * it only through the wrapper's `load`, and the diagnostics panel keeps
 * showing the original source.
 */

import {
	type EngineCapabilities,
	type EngineDiagnostics,
	EngineEmitter,
	type EngineEvents,
	type EngineHandler,
	type MediaEngine,
} from "./engine.js";

/** One minted ticket: the URL to read and when it stops working. */
export interface Ticket {
	/** A presigned URL for the same object as the original source. */
	url: string;
	/** ISO 8601 instant, or `null` when the endpoint did not say. */
	expiresAt: string | null;
}

/** Which sources are ticketed, and where to take a ticket. */
export interface TicketRoute {
	endpoint: string;
	hosts: string[];
}

function isHttpUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "https:" || protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * Whether this source must go through the mint endpoint. Relative and
 * non-HTTP sources never match — they are site assets, not CDN objects.
 */
export function needsTicket(route: TicketRoute, src: string): boolean {
	if (!isHttpUrl(src)) return false;
	let host: string;
	try {
		host = new URL(src).host.toLowerCase();
	} catch {
		return false;
	}
	return route.hosts.some((allowed) => allowed.toLowerCase() === host);
}

export interface MintTicketOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

/**
 * Asks the endpoint for one ticket. Every failure — network, non-2xx,
 * malformed body, a URL that does not point back at the same host as the
 * source — resolves to `null`, and the caller falls back to the bare source
 * exactly as it would without ticketing at all. A ticket is a credential for
 * its lifetime, so it is also kept out of logs here: nothing is printed.
 */
export async function mintTicket(
	endpoint: string,
	src: string,
	options: MintTicketOptions = {},
): Promise<Ticket | null> {
	const { fetchImpl = fetch, timeoutMs = 8_000 } = options;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ src }),
			signal: controller.signal,
		});
		if (!response.ok) return null;
		const data: unknown = await response.json();
		if (!data || typeof data !== "object") return null;
		const url = (data as { url?: unknown }).url;
		if (typeof url !== "string" || !url || !isHttpUrl(url)) return null;
		// A minted ticket reads the same object on the same host; anything
		// else would send the reader's bytes elsewhere.
		if (new URL(url).host.toLowerCase() !== new URL(src).host.toLowerCase()) {
			return null;
		}
		const expiresAt = (data as { expiresAt?: unknown }).expiresAt;
		return {
			url,
			expiresAt:
				typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt))
					? expiresAt
					: null,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** How long before expiry a refresh is worth its disruption. */
const REFRESH_MARGIN_MS = 5 * 60_000;
/** Re-mint cadence after a failed refresh: once a minute until it answers. */
const RETRY_INTERVAL_MS = 60_000;
/** A scheduled refresh never fires sooner than this after arming. */
const MIN_REFRESH_DELAY_MS = 1_000;

/** Arms a timer; returns its cancel. Injectable so tests run synchronously. */
export type TimerSchedule = (callback: () => void, ms: number) => () => void;

function defaultSchedule(callback: () => void, ms: number): () => void {
	const id = setTimeout(callback, ms);
	return () => clearTimeout(id);
}

export interface TicketedEngineDeps {
	/** The original (unsigned) source the ticket is minted for. */
	src: string;
	/** The ticket minted before the engine was chosen; the first load uses it. */
	ticket: Ticket;
	endpoint: string;
	/** Minting, injectable for tests. Defaults to {@link mintTicket}. */
	mint?: (src: string) => Promise<Ticket | null>;
	schedule?: TimerSchedule;
	now?: () => number;
}

/**
 * A `MediaEngine` that translates loads of the original source into loads of
 * the current ticket. Everything else — capabilities, events, controls — is
 * the wrapped engine verbatim, so the surface cannot tell the difference.
 *
 * A long session stays alive two ways, per the signed-read rollout contract:
 * a refresh timer armed short of the ticket's expiry, and one retry when the
 * wrapped engine reports an error mid-play — re-mint, reload, and resume at
 * the last reported position. The same `session` is kept on every re-mint
 * because the endpoint pins it to its own cookie; the client must only keep
 * sending credentials, never mint a second identity.
 */
export class TicketedEngine implements MediaEngine {
	readonly name: MediaEngine["name"];
	readonly capabilities: EngineCapabilities;

	private readonly inner: MediaEngine;
	private readonly emitter = new EngineEmitter();
	private readonly src: string;
	private readonly endpoint: string;
	private readonly mint: (src: string) => Promise<Ticket | null>;
	private readonly schedule: TimerSchedule;
	private readonly now: () => number;
	private cancelTimer: (() => void) | null = null;
	private ticket: Ticket;
	private loaded = false;
	private playing = false;
	private lastTime = 0;
	private recovering = false;

	constructor(inner: MediaEngine, deps: TicketedEngineDeps) {
		this.inner = inner;
		this.name = inner.name;
		this.capabilities = inner.capabilities;
		this.src = deps.src;
		this.endpoint = deps.endpoint;
		this.ticket = deps.ticket;
		this.mint = deps.mint ?? ((src) => mintTicket(this.endpoint, src));
		this.schedule = deps.schedule ?? defaultSchedule;
		this.now = deps.now ?? (() => Date.now());
		this.forward();
		this.armRefresh();
	}

	private forward(): void {
		const events: (keyof EngineEvents)[] = [
			"loaded",
			"time",
			"playstate",
			"volume",
			"rate",
			"seek",
			"ended",
		];
		for (const event of events) {
			this.inner.on(event, (payload) => {
				this.track(event, payload);
				this.emitter.emit(event, payload);
			});
		}
		// Errors are not plain forwards: one failure episode gets a re-mint
		// before the reader is told.
		this.inner.on("error", (payload) => {
			void this.onError(payload);
		});
	}

	private track(event: keyof EngineEvents, payload: unknown): void {
		if (event === "time") {
			this.lastTime = (payload as { currentTime: number }).currentTime;
		} else if (event === "playstate") {
			this.playing = !(payload as { paused: boolean }).paused;
		}
	}

	on<K extends keyof EngineEvents>(
		event: K,
		handler: EngineHandler<EngineEvents[K]>,
	): () => void {
		return this.emitter.on(event, handler);
	}

	private refreshDelayMs(): number {
		const { expiresAt } = this.ticket;
		if (!expiresAt) return RETRY_INTERVAL_MS;
		const due = Date.parse(expiresAt) - REFRESH_MARGIN_MS - this.now();
		return Math.max(due, MIN_REFRESH_DELAY_MS);
	}

	private armRefresh(): void {
		this.cancelTimer?.();
		this.cancelTimer = this.schedule(() => {
			void this.refresh();
		}, this.refreshDelayMs());
	}

	private armRetry(): void {
		this.cancelTimer?.();
		this.cancelTimer = this.schedule(() => {
			void this.refresh();
		}, RETRY_INTERVAL_MS);
	}

	/**
	 * Re-mints and, when the wrapped engine already holds media, swaps it in
	 * at the last known position; playback continues only if it was live.
	 */
	private async refresh(): Promise<boolean> {
		const next = await this.mint(this.src);
		if (!next) {
			this.armRetry();
			return false;
		}
		this.ticket = next;
		this.armRefresh();
		if (!this.loaded) return true;
		return this.swapMedia(next);
	}

	private async swapMedia(next: Ticket): Promise<boolean> {
		try {
			await this.inner.load(next.url);
			if (this.lastTime > 0) {
				try {
					await this.inner.seek(this.lastTime);
				} catch {
					// Position restore is best-effort; the media is already live.
				}
			}
			if (this.playing) {
				await this.inner.play();
			}
			return true;
		} catch {
			// The swap failed with a fresh ticket: the next reader action or
			// error event drives the surface, rather than looping here.
			return false;
		}
	}

	async attach(host: HTMLElement): Promise<void> {
		return this.inner.attach(host);
	}

	/**
	 * The argument is the original source the surface knows; the wrapper maps
	 * it onto the current ticket and never hands the signed URL back.
	 */
	async load(_src: string): Promise<void> {
		if (
			this.ticket.expiresAt !== null &&
			Date.parse(this.ticket.expiresAt) - REFRESH_MARGIN_MS <= this.now()
		) {
			await this.refresh();
		}
		await this.inner.load(this.ticket.url);
		this.loaded = true;
	}

	private async onError(payload: EngineEvents["error"]): Promise<void> {
		// One retry per failure episode: a second error during recovery is a
		// real failure and belongs to the reader.
		if (this.recovering) {
			this.emitter.emit("error", payload);
			return;
		}
		this.recovering = true;
		try {
			const next = await this.mint(this.src);
			if (!next) {
				this.armRetry();
				this.emitter.emit("error", payload);
				return;
			}
			this.ticket = next;
			this.armRefresh();
			const recovered = this.loaded ? await this.swapMedia(next) : true;
			if (!recovered) this.emitter.emit("error", payload);
		} catch {
			this.emitter.emit("error", payload);
		} finally {
			this.recovering = false;
		}
	}

	play(): Promise<void> {
		return this.inner.play();
	}

	pause(): void {
		this.inner.pause();
	}

	seek(seconds: number): Promise<void> {
		return this.inner.seek(seconds);
	}

	setVolume(volume: number): void {
		this.inner.setVolume(volume);
	}

	setMuted(muted: boolean): void {
		this.inner.setMuted(muted);
	}

	setRate(rate: number): void {
		this.inner.setRate(rate);
	}

	diagnostics(): EngineDiagnostics | null {
		return this.inner.diagnostics();
	}

	destroy(): void {
		this.cancelTimer?.();
		this.cancelTimer = null;
		this.emitter.clear();
		this.inner.destroy();
	}
}
