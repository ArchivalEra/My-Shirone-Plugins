/**
 * The docking runtime.
 *
 * The theme renders `::artplayer` as a server-side `<video controls>` and
 * stays fully usable that way. This module is the enhancement: it swaps that
 * element for the M3E surface, and it does so lazily — the surface module, the
 * engine adapters and the Mellow engine are all resolved only once a page
 * actually contains an embed, and the engine module only once a reader presses
 * play. With the plugin disabled none of this is ever referenced.
 */

import type { MediaEngine } from "../engine/engine.js";
import type { MellowPlayerModule } from "../engine/mellow.js";
import { MellowMediaEngine } from "../engine/mellow.js";
import { NativeMediaEngine } from "../engine/native.js";
import { createOriginProbe } from "../engine/probe.js";
import { chooseEngine, engineContainer } from "../engine/selection.js";
import { describeFailure } from "../format.js";
import type { ResolvedPlayerConfig } from "../protocol/types.js";

const FIGURE_SELECTOR = "figure[data-artplayer]";
const ENHANCED_FLAG = "mpEnhanced";
const SURFACE_CLASS = "mp-host";
const APPROACH_MARGIN = "240px 0px";

/** Page-lifetime, per-origin: CORS is granted per origin, so one read covers all. */
const probeOrigin = createOriginProbe();

declare global {
	interface Window {
		__MELLOW_PLAYER_CONFIG__?: ResolvedPlayerConfig;
	}
}

/** One server-rendered embed, read back from the DOM. */
export interface ArtPlayerTarget {
	figure: HTMLElement;
	video: HTMLElement;
	src: string;
	title: string;
	preload: string;
}

interface MountedSurface {
	dispose(): void;
}

const surfaces = new Map<HTMLElement, MountedSurface>();

export interface EnhanceDeps {
	config: ResolvedPlayerConfig;
	/** Injected so the native adapter can be exercised without a DOM. */
	createNativeEngine?: () => MediaEngine;
	/** Injected so the engine contract is testable without a network. */
	importEngineModule?: (url: string) => Promise<unknown>;
	/** Injected so origin reachability is testable without a network. */
	probeOrigin?: (src: string) => Promise<boolean>;
	/** Arms the on-approach callback. Defaults to an IntersectionObserver. */
	armApproach?: (element: Element, run: () => void) => void;
	/** Injected so mounting is observable without a Svelte runtime. */
	mountSurface?: (host: HTMLElement, target: ArtPlayerTarget, engine: MediaEngine) => Promise<MountedSurface>;
}

/**
 * Reads one SSR figure. Deliberately duck-typed rather than
 * `instanceof HTMLVideoElement`, so the contract stays testable outside a
 * browser and a figure rendered by a future template still binds.
 */
export function readArtPlayerTarget(figure: Element): ArtPlayerTarget | null {
	if (!figure || typeof figure.querySelector !== "function") return null;
	const video = figure.querySelector("video");
	if (!video || typeof video.getAttribute !== "function") return null;
	const src = video.getAttribute("src")?.trim() ?? "";
	if (!src) return null;
	return {
		figure: figure as HTMLElement,
		video: video as unknown as HTMLElement,
		src,
		title: video.getAttribute("aria-label")?.trim() ?? "",
		preload: video.getAttribute("preload")?.trim() || "none",
	};
}

function collectFigures(root: ParentNode): Element[] {
	if (!root || typeof root.querySelectorAll !== "function") return [];
	const found: Element[] = [];
	if (
		typeof (root as Element).matches === "function" &&
		(root as Element).matches(FIGURE_SELECTOR)
	) {
		found.push(root as Element);
	}
	for (const figure of root.querySelectorAll(FIGURE_SELECTOR)) found.push(figure);
	return found;
}
/** Drops surfaces whose page region Swup has already replaced. */
export function pruneArtPlayerSurfaces(): number {
	let dropped = 0;
	for (const [host, surface] of surfaces) {
		if (host.isConnected) continue;
		surfaces.delete(host);
		dropped += 1;
		try {
			surface.dispose();
		} catch (error) {
			console.error("[mellow-player] surface teardown failed:", error);
		}
	}
	return dropped;
}

/** Tears every surface down. Exported for tests and for route teardown. */
export function disposeArtPlayerSurfaces(): void {
	for (const [host, surface] of surfaces) {
		surfaces.delete(host);
		try {
			surface.dispose();
		} catch (error) {
			console.error("[mellow-player] surface teardown failed:", error);
		}
	}
}

function defaultArmApproach(element: Element, run: () => void): void {
	if (typeof IntersectionObserver === "function") {
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				run();
			},
			{ rootMargin: APPROACH_MARGIN },
		);
		observer.observe(element);
		return;
	}

	const idleWindow = window as Window & {
		requestIdleCallback?: (
			callback: IdleRequestCallback,
			options?: IdleRequestOptions,
		) => number;
	};
	if (typeof idleWindow.requestIdleCallback === "function") {
		idleWindow.requestIdleCallback(run, { timeout: 1500 });
		return;
	}
	setTimeout(run, 0);
}

async function defaultMountSurface(
	host: HTMLElement,
	target: ArtPlayerTarget,
	engine: MediaEngine,
	deps: EnhanceDeps,
): Promise<MountedSurface> {
	const [{ default: PlayerSurface }, { mount, unmount }] = await Promise.all([
		import("../ui/PlayerSurface.svelte"),
		import("svelte"),
	]);

	const instance = mount(PlayerSurface, {
		target: host,
		props: {
			engine,
			labels: deps.config.labels,
			title: target.title,
			sourceUrl: target.src,
			diagnostics: deps.config.diagnostics,
			autoLoad: target.preload === "auto",
		},
	});

	return {
		dispose() {
			try {
				unmount(instance);
			} catch (error) {
				console.error("[mellow-player] unmount failed:", error);
			}
			// The component's own teardown destroys the engine; both adapters
			// tolerate a second call, and this keeps a failed unmount from
			// leaking a decoder or an audio context.
			try {
				engine.destroy();
			} catch (error) {
				console.error("[mellow-player] engine teardown failed:", error);
			}
		},
	};
}

/**
 * Whether the bounded-range engine could read this source at all.
 *
 * Only asked when the answer can change the outcome — an embed the engine
 * cannot demux, or a site with no engine configured, goes to the native
 * element either way and must not spend a request finding that out.
 */
async function resolveReadability(
	target: ArtPlayerTarget,
	deps: EnhanceDeps,
): Promise<boolean> {
	const { config } = deps;
	if (config.engine === "native" || config.engineUrl === null) return false;
	const matters =
		config.engine === "mellow" || engineContainer(target.src) !== null;
	if (!matters) return true;
	return (deps.probeOrigin ?? probeOrigin)(target.src);
}

async function mountTarget(
	target: ArtPlayerTarget,
	deps: EnhanceDeps,
): Promise<void> {
	const { config } = deps;
	const mellowAvailable = config.engineUrl !== null;
	// Awaited before anything is hidden or replaced: while the origin is being
	// asked, the server-rendered player is still there and still usable.
	const mellowReadable = await resolveReadability(target, deps);
	const choice = chooseEngine({
		src: target.src,
		preference: config.engine,
		mellowAvailable,
		mellowReadable,
	});

	target.figure.dataset.mpEngine = choice.engine;
	target.figure.dataset.mpEngineReason = choice.reason;

	const host = document.createElement("div");
	host.className = SURFACE_CLASS;
	target.figure.insertBefore(host, target.video);
	target.video.hidden = true;

	const engine =
		choice.engine === "mellow" && config.engineUrl
			? new MellowMediaEngine({
					engineUrl: config.engineUrl,
					timeoutMs: config.engineTimeoutMs,
					importModule: deps.importEngineModule,
				})
			: (deps.createNativeEngine?.() ?? new NativeMediaEngine());

	if (choice.engine === "mellow") {
		// The element must stop fetching: the engine reads the same bytes over
		// its own bounded scheduler, and a live `src` would race it.
		target.video.removeAttribute("src");
		const reload = (target.video as HTMLVideoElement).load;
		if (typeof reload === "function") {
			try {
				reload.call(target.video);
			} catch {
				// A media element already torn down has nothing to abort.
			}
		}
	}

	try {
		const mountFn = deps.mountSurface ?? ((h, t, e) => defaultMountSurface(h, t, e, deps));
		const surface = await mountFn(host, target, engine);
		surfaces.set(host, surface);
	} catch (error) {
		console.error(
			`[mellow-player] could not mount the surface for ${target.src}:`,
			describeFailure(error),
		);
		try {
			engine.destroy();
		} catch {
			// The engine never attached; there is nothing to release.
		}
		host.remove();
		target.video.hidden = false;
	}
}

/**
 * Binds every not-yet-bound embed under `root` and returns how many were
 * taken over. Idempotent: a figure is claimed before it is mounted, so a Swup
 * re-run cannot double-mount one.
 */
export function enhanceArtPlayer(root: ParentNode, deps: EnhanceDeps): number {
	if (typeof document === "undefined") return 0;
	const arm = deps.armApproach ?? defaultArmApproach;
	let bound = 0;

	for (const figure of collectFigures(root)) {
		if ((figure as HTMLElement).dataset[ENHANCED_FLAG] === "true") continue;
		const target = readArtPlayerTarget(figure);
		if (!target) continue;
		target.figure.dataset[ENHANCED_FLAG] = "true";
		bound += 1;

		const start = () => {
			void mountTarget(target, deps);
		};
		if (target.preload === "auto") {
			arm(figure, start);
		} else {
			start();
		}
	}

	return bound;
}

function isRouteAllowed(config: ResolvedPlayerConfig): boolean {
	if (typeof window === "undefined") return false;
	if (config.routeFilter.length === 0) return true;
	const pathname = window.location.pathname.toLowerCase();
	return config.routeFilter.some((prefix) =>
		pathname.startsWith(prefix.toLowerCase()),
	);
}

/**
 * Installs the document-level lifecycle: one initial pass, then one pass per
 * Swup replacement, because elements outside `#swup-container` are never
 * rerendered and a reader can arrive at the first embed by client navigation.
 */
export function watchArtPlayer(config: ResolvedPlayerConfig): void {
	if (typeof document === "undefined") return;
	if (document.documentElement.dataset.mpBound === "true") return;
	document.documentElement.dataset.mpBound = "true";

	const run = () => {
		pruneArtPlayerSurfaces();
		if (!isRouteAllowed(config)) return;
		const container = document.getElementById("swup-container") ?? document;
		enhanceArtPlayer(container, { config });
	};

	run();
	document.addEventListener("swup:content:replace", () => {
		queueMicrotask(run);
	});
}
