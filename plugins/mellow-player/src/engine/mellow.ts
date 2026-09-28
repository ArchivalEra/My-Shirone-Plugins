/**
 * `MellowMediaEngine` — Mellow-Player behind the engine seam.
 *
 * The engine is never part of the host bundle. `load()` resolves the configured
 * module URL on first use, so a reader who never presses play never downloads a
 * byte of WASM, and the module is what supplies `HeadlessPlayer` rather than
 * this package depending on it at build time. The dependency is the URL.
 */

import { clamp, describeFailure } from "../format.js";
import {
	EngineCapabilityError,
	EngineEmitter,
	type EngineCapabilities,
	type EngineDiagnostics,
	type EngineEvents,
	type EngineHandler,
	type MediaEngine,
} from "./engine.js";

export interface MellowPlayerStatsLike {
	requests: number;
	bytes: number;
	startup_ms: number;
	seek_ms: number;
	isHardwareAccelerated: boolean;
	decodedFrames: number;
	duration: number;
}

export interface MellowSeekResultLike {
	targetTime: number;
	actualTime: number;
}

/** The slice of `HeadlessPlayer` this adapter binds to. */
export interface MellowPlayerLike {
	load(url: string): Promise<unknown>;
	seek(seconds: number): Promise<MellowSeekResultLike>;
	play(): void;
	pause(): void;
	setVolume(volume: number): void;
	setMute(mute: boolean): void;
	observeProperty(
		property: string,
		callback: (value: unknown) => void,
	): () => void;
	on(event: string, callback: (payload: unknown) => void): () => void;
	attachCanvas(canvas: HTMLCanvasElement): Promise<unknown>;
	stats(): MellowPlayerStatsLike;
	ranges(): string[];
	destroy(): void;
}

/** What the configured module URL must export. */
export interface MellowPlayerModule {
	HeadlessPlayer: new (
		options?: Record<string, unknown>,
	) => MellowPlayerLike;
}

/**
 * Default module resolver: a runtime URL the bundler must leave alone.
 *
 * The specifier is assembled at run time rather than passed straight through,
 * because Vite refuses to serve a `/public` asset that source code imports
 * ("This file is in /public and will be copied as-is during build … should not
 * be imported from source code"), which turned every engine load into a 500 in
 * dev. A non-literal expression cannot be resolved statically, so the import is
 * left to the browser — a plain fetch of the URL — in dev and in production
 * alike, which is what the engine contract wants.
 */
export function importEngineModule(url: string): Promise<unknown> {
	const parts = [url];
	return import(/* @vite-ignore */ parts.join(""));
}

/**
 * Resolves and validates the engine module. A module that resolves but does
 * not export `HeadlessPlayer` is a configuration mistake, and saying so beats
 * a `undefined is not a constructor` from inside the first play.
 */
export async function loadEngineModule(
	url: string,
	timeoutMs: number,
	importModule: (url: string) => Promise<unknown> = importEngineModule,
): Promise<MellowPlayerModule> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error(
						`[mellow-player] engine module timed out after ${timeoutMs} ms: ${url}`,
					),
				),
			timeoutMs,
		);
	});

	try {
		const loaded = (await Promise.race([
			importModule(url),
			timeout,
		])) as Partial<MellowPlayerModule> | null;
		if (typeof loaded?.HeadlessPlayer !== "function") {
			throw new Error(
				`[mellow-player] engine module does not export HeadlessPlayer: ${url}`,
			);
		}
		return loaded as MellowPlayerModule;
	} catch (error) {
		throw new Error(
			`[mellow-player] could not load the engine module: ${describeFailure(error)}`,
		);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export interface MellowEngineOptions {
	/** Site-root path or absolute URL of the engine module. */
	engineUrl: string;
	timeoutMs?: number;
	/** Injected so the adapter's contract is testable without a network. */
	importModule?: (url: string) => Promise<unknown>;
	/** Injected so the adapter runs without a DOM. */
	createCanvas?: () => HTMLCanvasElement;
}

export class MellowMediaEngine implements MediaEngine {
	readonly name = "mellow" as const;
	readonly capabilities: EngineCapabilities = {
		boundedRanges: true,
		canvas: true,
		keyframeSeek: true,
		// HeadlessPlayer exposes no rate control; see setRate below.
		selectableRate: false,
	};

	private readonly options: MellowEngineOptions;
	private readonly emitter = new EngineEmitter();
	private canvas: HTMLCanvasElement | null = null;
	private player: MellowPlayerLike | null = null;
	private detachers: Array<() => void> = [];
	private duration = 0;
	private currentTime = 0;

	constructor(options: MellowEngineOptions) {
		this.options = options;
	}

	on<K extends keyof EngineEvents>(
		event: K,
		handler: EngineHandler<EngineEvents[K]>,
	): () => void {
		return this.emitter.on(event, handler);
	}

	async attach(host: HTMLElement): Promise<void> {
		if (this.canvas) return;
		const create =
			this.options.createCanvas ?? (() => document.createElement("canvas"));
		const canvas = create();
		canvas.className = "mp-stage__media";
		host.appendChild(canvas);
		this.canvas = canvas;
	}

	/** Resolves the module and constructs the player once per engine instance. */
	private async resolvePlayer(): Promise<MellowPlayerLike> {
		if (this.player) return this.player;

		const module = await loadEngineModule(
			this.options.engineUrl,
			this.options.timeoutMs ?? 15_000,
			this.options.importModule,
		);
		const canvas = this.canvas;
		if (!canvas) {
			throw new Error("[mellow-player] engine not attached");
		}

		const player = new module.HeadlessPlayer({ volume: 1 });
		// The canvas sink must be bound before `load()`, because the pacer is
		// constructed with whichever sink the player holds at that moment.
		if (typeof player.attachCanvas === "function") {
			await player.attachCanvas(canvas);
		}
		this.player = player;
		this.observe(player);
		return player;
	}

	private observe(player: MellowPlayerLike): void {
		const track = (off: () => void) => this.detachers.push(off);

		track(
			player.observeProperty("time-pos", (value) => {
				this.currentTime = Number(value) || 0;
				this.emitter.emit("time", {
					currentTime: this.currentTime,
					duration: this.duration,
				});
			}),
		);
		track(
			player.observeProperty("duration", (value) => {
				this.duration = Number(value) || 0;
				this.emitter.emit("loaded", { duration: this.duration });
				this.emitter.emit("time", {
					currentTime: this.currentTime,
					duration: this.duration,
				});
			}),
		);
		track(
			player.observeProperty("pause", (value) => {
				this.emitter.emit("playstate", { paused: Boolean(value) });
			}),
		);
		const emitVolume = (volume: unknown, muted: unknown) =>
			this.emitter.emit("volume", {
				volume: Number(volume) || 0,
				muted: Boolean(muted),
			});
		let lastVolume = 1;
		let lastMuted = false;
		track(
			player.observeProperty("volume", (value) => {
				lastVolume = Number(value) || 0;
				emitVolume(lastVolume, lastMuted);
			}),
		);
		track(
			player.observeProperty("mute", (value) => {
				lastMuted = Boolean(value);
				emitVolume(lastVolume, lastMuted);
			}),
		);

		track(
			player.on("seek", (payload) => {
				const result = payload as Partial<MellowSeekResultLike> | null;
				this.emitter.emit("seek", {
					targetTime: Number(result?.targetTime ?? 0),
					actualTime: Number(result?.actualTime ?? 0),
				});
			}),
		);
		track(
			player.on("end-file", (payload) => {
				const reason = (payload as { reason?: string } | null)?.reason;
				this.emitter.emit("ended", { reason: reason ?? "eof" });
			}),
		);
		track(
			player.on("error", (payload) => {
				const message = (payload as { message?: string } | null)?.message;
				this.emitter.emit("error", {
					message: message ?? "Mellow-Player reported an error",
				});
			}),
		);
	}

	async load(src: string): Promise<void> {
		const player = await this.resolvePlayer();
		this.duration = 0;
		this.currentTime = 0;
		try {
			await player.load(src);
		} catch (error) {
			throw new Error(
				`[mellow-player] the engine refused ${src}: ${describeFailure(error)}`,
			);
		}
	}

	async play(): Promise<void> {
		const player = await this.resolvePlayer();
		player.play();
	}

	pause(): void {
		this.player?.pause();
	}

	async seek(seconds: number): Promise<void> {
		const player = this.player;
		if (!player) return;
		const target =
			this.duration > 0 ? clamp(seconds, 0, this.duration) : Math.max(0, seconds);
		await player.seek(target);
	}

	setVolume(volume: number): void {
		this.player?.setVolume(clamp(volume, 0, 1));
	}

	setMuted(muted: boolean): void {
		this.player?.setMute(Boolean(muted));
	}

	setRate(rate: number): void {
		throw new EngineCapabilityError(this.name, `rate control (${rate})`);
	}

	diagnostics(): EngineDiagnostics | null {
		const player = this.player;
		if (!player) return null;
		try {
			const stats = player.stats();
			return {
				requests: stats.requests,
				bytes: stats.bytes,
				hardwareDecode: stats.isHardwareAccelerated,
				startupMs: stats.startup_ms,
				seekMs: stats.seek_ms,
				decodedFrames: stats.decodedFrames,
				ranges: player.ranges(),
			};
		} catch {
			return null;
		}
	}

	destroy(): void {
		for (const off of this.detachers) {
			try {
				off();
			} catch {
				// A player torn down with its context can throw on unsubscribe.
			}
		}
		this.detachers = [];
		this.emitter.clear();
		try {
			this.player?.destroy();
		} catch {
			// Already-closed decoders can throw here; the resources are gone.
		}
		this.player = null;
		this.canvas?.remove();
		this.canvas = null;
	}
}
