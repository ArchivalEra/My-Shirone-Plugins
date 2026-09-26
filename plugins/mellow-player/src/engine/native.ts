/**
 * `NativeMediaEngine` — the `<video>` element behind the engine seam.
 *
 * This is the default engine and the one that keeps the plugin honest: it
 * plays every container the browser supports, reports no accounting, and
 * delegates nothing. The element is created through an injected factory so the
 * adapter is exercisable without a DOM.
 */

import { clamp, describeFailure } from "../format.js";
import {
	EngineEmitter,
	type EngineCapabilities,
	type EngineDiagnostics,
	type EngineHandler,
	type EngineEvents,
	type MediaEngine,
} from "./engine.js";

export interface NativeEngineDeps {
	/** Creates the media element the engine owns. */
	createElement(): HTMLVideoElement;
}

function defaultDeps(): NativeEngineDeps {
	return { createElement: () => document.createElement("video") };
}

/** Codes from `MediaError`, reported as diagnostics rather than copy. */
const MEDIA_ERROR_NAMES: Record<number, string> = {
	1: "MEDIA_ERR_ABORTED",
	2: "MEDIA_ERR_NETWORK",
	3: "MEDIA_ERR_DECODE",
	4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

export class NativeMediaEngine implements MediaEngine {
	readonly name = "native" as const;
	readonly capabilities: EngineCapabilities = {
		boundedRanges: false,
		canvas: false,
		keyframeSeek: false,
		selectableRate: true,
	};

	private readonly deps: NativeEngineDeps;
	private readonly emitter = new EngineEmitter();
	private element: HTMLVideoElement | null = null;
	private listeners: Array<() => void> = [];
	private pendingSeek: number | null = null;

	constructor(deps: NativeEngineDeps = defaultDeps()) {
		this.deps = deps;
	}

	on<K extends keyof EngineEvents>(
		event: K,
		handler: EngineHandler<EngineEvents[K]>,
	): () => void {
		return this.emitter.on(event, handler);
	}

	async attach(host: HTMLElement): Promise<void> {
		if (this.element) return;
		const element = this.deps.createElement();
		element.className = "mp-stage__media";
		element.setAttribute("playsinline", "");
		element.setAttribute("preload", "metadata");
		element.setAttribute("controls", "false");
		host.appendChild(element);
		this.element = element;
		this.listen();
	}

	private listen(): void {
		const element = this.element;
		if (!element) return;

		const bind = <K extends keyof HTMLElementEventMap>(
			type: K,
			handler: (event: HTMLElementEventMap[K]) => void,
		) => {
			element.addEventListener(type, handler as EventListener);
			this.listeners.push(() =>
				element.removeEventListener(type, handler as EventListener),
			);
		};

		bind("loadedmetadata", () => {
			this.emitter.emit("loaded", { duration: this.duration() });
		});
		bind("durationchange", () => {
			this.emitter.emit("time", {
				currentTime: this.currentTime(),
				duration: this.duration(),
			});
		});
		bind("timeupdate", () => {
			this.emitter.emit("time", {
				currentTime: this.currentTime(),
				duration: this.duration(),
			});
		});
		bind("play", () => this.emitter.emit("playstate", { paused: false }));
		bind("pause", () => this.emitter.emit("playstate", { paused: true }));
		bind("volumechange", () => {
			this.emitter.emit("volume", {
				volume: element.volume,
				muted: element.muted,
			});
		});
		bind("ratechange", () => {
			this.emitter.emit("rate", { rate: element.playbackRate });
		});
		bind("seeked", () => {
			this.emitter.emit("seek", {
				targetTime: this.pendingSeek ?? element.currentTime,
				actualTime: element.currentTime,
			});
			this.pendingSeek = null;
		});
		bind("ended", () => this.emitter.emit("ended", { reason: "eof" }));
		bind("error", () => {
			const mediaError = element.error;
			const name = mediaError
				? (MEDIA_ERROR_NAMES[mediaError.code] ??
					`MEDIA_ERR_${mediaError.code}`)
				: "MEDIA_ERR_UNKNOWN";
			const detail = mediaError?.message ? `: ${mediaError.message}` : "";
			this.emitter.emit("error", { message: `${name}${detail}` });
		});
	}

	private duration(): number {
		const value = this.element?.duration;
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	private currentTime(): number {
		const value = this.element?.currentTime;
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	load(src: string): Promise<void> {
		const element = this.element;
		if (!element) {
			return Promise.reject(new Error("[mellow-player] engine not attached"));
		}

		return new Promise<void>((resolve, reject) => {
			const settle = (settled: () => void) => {
				element.removeEventListener("loadedmetadata", onLoaded);
				element.removeEventListener("error", onError);
				settled();
			};
			// Metadata is announced by the listener installed in `listen()`,
			// which is the single source of the `loaded` event; this promise
			// only decides when `load()` has settled.
			const onLoaded = () => settle(resolve);
			const onError = () =>
				settle(() =>
					reject(
						new Error(
							`[mellow-player] native engine failed to load ${src}`,
						),
					),
				);

			element.addEventListener("loadedmetadata", onLoaded);
			element.addEventListener("error", onError);

			if (element.getAttribute("src") === src && element.readyState >= 1) {
				onLoaded();
				return;
			}

			element.setAttribute("src", src);
			element.load();
		});
	}

	async play(): Promise<void> {
		const element = this.element;
		if (!element) throw new Error("[mellow-player] engine not attached");
		try {
			await element.play();
		} catch (error) {
			throw new Error(
				`[mellow-player] native playback refused: ${describeFailure(error)}`,
			);
		}
	}

	pause(): void {
		this.element?.pause();
	}

	async seek(seconds: number): Promise<void> {
		const element = this.element;
		if (!element) return;
		const duration = this.duration();
		const target = duration > 0 ? clamp(seconds, 0, duration) : Math.max(0, seconds);
		this.pendingSeek = target;
		element.currentTime = target;
	}

	setVolume(volume: number): void {
		if (!this.element) return;
		this.element.volume = clamp(volume, 0, 1);
	}

	setMuted(muted: boolean): void {
		if (!this.element) return;
		this.element.muted = Boolean(muted);
	}

	setRate(rate: number): void {
		if (!this.element) return;
		this.element.playbackRate = clamp(rate, 0.25, 4);
	}

	diagnostics(): EngineDiagnostics | null {
		return null;
	}

	destroy(): void {
		for (const off of this.listeners) off();
		this.listeners = [];
		this.emitter.clear();
		const element = this.element;
		this.element = null;
		if (!element) return;
		element.pause();
		element.removeAttribute("src");
		try {
			element.load();
		} catch {
			// Detached elements can refuse `load()`; nothing left to release.
		}
		element.remove();
	}
}
