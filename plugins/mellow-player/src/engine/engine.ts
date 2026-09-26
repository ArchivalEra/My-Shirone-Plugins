/**
 * The engine seam.
 *
 * A `MediaEngine` is the whole playback contract: attach a visual stage, drive
 * the transport, report accounting. The native video element and the
 * Mellow-Player WebCodecs pipeline both implement it, and the surface is
 * written against nothing else — which is what lets one UI serve both.
 */

import type { EngineName } from "../protocol/types.js";

/**
 * What an engine can actually do. The surface reads this instead of testing
 * `name`, so a capability never has to be inferred from which engine is bound.
 */
export interface EngineCapabilities {
	/** Reads arrive as strictly bounded `bytes=A-B` requests. */
	readonly boundedRanges: boolean;
	/** Frames are drawn into a canvas rather than shown by a media element. */
	readonly canvas: boolean;
	/** A seek lands on a keyframe and reports where it actually landed. */
	readonly keyframeSeek: boolean;
	/** Playback rate can be changed. */
	readonly selectableRate: boolean;
}

/** Transport accounting an engine may or may not be able to report. */
export interface EngineDiagnostics {
	requests: number;
	bytes: number;
	hardwareDecode: boolean;
	startupMs: number;
	seekMs: number;
	decodedFrames: number;
	/** Every range header the engine put on the wire, for the audit panel. */
	ranges: string[];
}

export interface EngineEvents {
	loaded: { duration: number };
	time: { currentTime: number; duration: number };
	playstate: { paused: boolean };
	volume: { volume: number; muted: boolean };
	rate: { rate: number };
	seek: { targetTime: number; actualTime: number };
	ended: { reason: string };
	error: { message: string };
}

export type EngineHandler<T> = (payload: T) => void;

/**
 * Fan-out shared by both adapters. `on` returns its own unsubscribe so the
 * surface can hand the array straight back to an effect cleanup.
 */
export class EngineEmitter {
	private handlers = new Map<string, Set<(payload: unknown) => void>>();

	on<K extends keyof EngineEvents>(
		event: K,
		handler: EngineHandler<EngineEvents[K]>,
	): () => void {
		let bucket = this.handlers.get(event);
		if (!bucket) {
			bucket = new Set();
			this.handlers.set(event, bucket);
		}
		const entry = handler as (payload: unknown) => void;
		bucket.add(entry);
		return () => {
			bucket?.delete(entry);
		};
	}

	emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
		const bucket = this.handlers.get(event);
		if (!bucket) return;
		for (const handler of bucket) {
			try {
				handler(payload);
			} catch (error) {
				console.error(
					`[mellow-player] listener for "${event}" threw:`,
					error,
				);
			}
		}
	}

	clear(): void {
		this.handlers.clear();
	}
}

export interface MediaEngine {
	readonly name: EngineName;
	readonly capabilities: EngineCapabilities;

	/** Creates the engine's element inside `host`. Called once, by the surface. */
	attach(host: HTMLElement): Promise<void>;
	/** Prepares `src`. Safe to call again; replaces the previous media. */
	load(src: string): Promise<void>;
	play(): Promise<void>;
	pause(): void;
	seek(seconds: number): Promise<void>;
	setVolume(volume: number): void;
	setMuted(muted: boolean): void;
	/** Throws when `capabilities.selectableRate` is false. */
	setRate(rate: number): void;
	/** Snapshot of accounting, or `null` when the engine cannot report it. */
	diagnostics(): EngineDiagnostics | null;
	destroy(): void;
	on<K extends keyof EngineEvents>(
		event: K,
		handler: EngineHandler<EngineEvents[K]>,
	): () => void;
}

/** Raised when a caller uses a control the bound engine does not have. */
export class EngineCapabilityError extends Error {
	constructor(engine: EngineName, capability: string) {
		super(`[mellow-player] the "${engine}" engine has no ${capability}`);
		this.name = "EngineCapabilityError";
	}
}
