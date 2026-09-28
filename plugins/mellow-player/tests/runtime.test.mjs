import test from "node:test";
import assert from "node:assert/strict";

import {
	disposeArtPlayerSurfaces,
	enhanceArtPlayer,
	pruneArtPlayerSurfaces,
	readArtPlayerTarget,
} from "../dist/index.js";

function makeVideo({ src = "/videos/movie.mkv", title = "Clip", preload }) {
	const attributes = new Map();
	if (src !== null) attributes.set("src", src);
	if (title !== null) attributes.set("aria-label", title);
	if (preload !== undefined) attributes.set("preload", preload);
	return {
		hidden: false,
		removedSrc: 0,
		attributes,
		getAttribute(name) {
			return attributes.has(name) ? attributes.get(name) : null;
		},
		removeAttribute(name) {
			if (name === "src") this.removedSrc += 1;
			attributes.delete(name);
		},
	};
}

function makeFigure(video) {
	const attributes = new Map();
	return {
		dataset: {},
		hiddenChildren: [],
		getAttribute(name) {
			return attributes.has(name) ? attributes.get(name) : null;
		},
		setAttribute(name, value) {
			attributes.set(name, String(value));
		},
		querySelector(selector) {
			return selector === "video" ? video : null;
		},
		querySelectorAll() {
			return [];
		},
		insertBefore(node) {
			this.inserted = node;
		},
	};
}

function makeRoot(figures) {
	return { querySelectorAll: () => figures };
}

/** A container the runtime can create and later prune. */
function installDocument() {
	const created = [];
	globalThis.document = {
		createElement() {
			const host = {
				className: "",
				isConnected: true,
				removed: 0,
				remove() {
					this.removed += 1;
					this.isConnected = false;
				},
			};
			created.push(host);
			return host;
		},
	};
	return created;
}

const CONFIG = {
	engine: "auto",
	engineUrl: "/vendor/mellow-player.js",
	engineTimeoutMs: 100,
	diagnostics: false,
	labels: {},
	routeFilter: [],
};

function makeDeps(overrides = {}) {
	const disposed = [];
	return {
		disposed,
		deps: {
			config: { ...CONFIG },
			createNativeEngine: () => ({
				name: "native",
				capabilities: {},
				destroy() {
					disposed.push("native");
				},
			}),
			mountSurface: async (host) => {
				disposed.push(host);
				return {
					dispose() {
						disposed.push(`dispose:${host.className}`);
					},
				};
			},
			// An origin that grants cross-origin reads, so the container decides.
			probeOrigin: async () => true,
			...overrides,
		},
	};
}

/**
 * Mounting awaits the origin probe before touching the DOM, because the player
 * the reader already has must stay usable until the engine is actually chosen.
 */
async function settle() {
	for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

test.beforeEach(() => {
	disposeArtPlayerSurfaces();
});

test("readArtPlayerTarget refuses a figure it cannot drive", () => {
	assert.equal(readArtPlayerTarget({ querySelector: () => null }), null);
	assert.equal(readArtPlayerTarget(makeFigure(makeVideo({ src: null }))), null);
	assert.equal(readArtPlayerTarget(makeFigure(makeVideo({ src: "   " }))), null);

	const target = readArtPlayerTarget(makeFigure(makeVideo({})));
	assert.equal(target.src, "/videos/movie.mkv");
	assert.equal(target.title, "Clip");
	// The SSR default is `none`, and it is what decides whether the surface
	// may prepare the media before a reader presses play.
	assert.equal(target.preload, "none");
});

test("a Matroska source is handed to the Mellow engine, and the element is silenced", async () => {
	installDocument();
	const video = makeVideo({ src: "/videos/movie.mkv" });
	const figure = makeFigure(video);
	const { deps } = makeDeps();

	assert.equal(enhanceArtPlayer(makeRoot([figure]), deps), 1);
	await settle();

	assert.equal(figure.dataset.mpEngine, "mellow");
	assert.equal(figure.dataset.mpEngineReason, "matroska-source");
	// The element keeps its place in the layout but stops fetching: the engine
	// reads the same bytes over its own scheduler.
	assert.equal(figure.dataset.mpEnhanced, "true");
	assert.equal(video.hidden, true);
	assert.equal(video.removedSrc, 1);
	assert.equal(figure.inserted.className, "mp-host");
});

test("a container the engine cannot demux stays native, untouched and unprobed", async () => {
	installDocument();
	const video = makeVideo({ src: "/videos/movie.flv" });
	const figure = makeFigure(video);
	const probed = [];
	const { deps } = makeDeps({
		probeOrigin: async (src) => {
			probed.push(src);
			return true;
		},
	});

	enhanceArtPlayer(makeRoot([figure]), deps);
	await settle();

	assert.equal(figure.dataset.mpEngine, "native");
	assert.equal(figure.dataset.mpEngineReason, "native-container");
	assert.equal(video.hidden, true);
	assert.equal(video.removedSrc, 0);
	// The native element was always going to be chosen, so asking the origin
	// whether the engine could read it would be a wasted request.
	assert.deepEqual(probed, []);
});

test("MP4 now reaches the engine, and the origin is asked before it does", async () => {
	// ADR-0002 added ISO BMFF and MPEG-TS demuxing upstream, so the container
	// gate is no longer Matroska-only — this pins that the policy moved with it.
	installDocument();
	const video = makeVideo({ src: "/videos/movie.mp4" });
	const figure = makeFigure(video);
	const probed = [];
	const { deps } = makeDeps({
		probeOrigin: async (src) => {
			probed.push(src);
			return true;
		},
	});

	enhanceArtPlayer(makeRoot([figure]), deps);
	await settle();

	assert.equal(figure.dataset.mpEngine, "mellow");
	assert.equal(figure.dataset.mpEngineReason, "mp4-source");
	// A supported container means the probe is worth its request.
	assert.deepEqual(probed, ["/videos/movie.mp4"]);
	// The engine reads the bytes itself, so the element stops fetching.
	assert.equal(video.removedSrc, 1);
});

test("an origin that refuses cross-origin reads keeps the native player", async () => {
	// The drive-backed CDN case: a valid Matroska file over bounded ranges, but
	// no CORS, so the engine's fetch never sees a byte. The reader must get a
	// working player rather than a failed surface.
	installDocument();
	const video = makeVideo({ src: "https://cdn.example.com/drive/movie.mkv" });
	const figure = makeFigure(video);
	const { deps } = makeDeps({ probeOrigin: async () => false });

	enhanceArtPlayer(makeRoot([figure]), deps);
	await settle();

	assert.equal(figure.dataset.mpEngine, "native");
	assert.equal(figure.dataset.mpEngineReason, "mellow-unreadable");
	// Nothing was silenced: the element is the player, so it keeps its source.
	assert.equal(video.removedSrc, 0);
	assert.equal(video.hidden, true);
});

test("a site with no engine configured never probes an origin", async () => {
	installDocument();
	const probed = [];
	const { deps } = makeDeps({
		config: { ...CONFIG, engineUrl: null },
		probeOrigin: async (src) => {
			probed.push(src);
			return true;
		},
	});

	const figure = makeFigure(makeVideo({ src: "/videos/movie.mkv" }));
	enhanceArtPlayer(makeRoot([figure]), deps);
	await settle();

	assert.equal(figure.dataset.mpEngine, "native");
	assert.equal(figure.dataset.mpEngineReason, "mellow-unavailable");
	assert.deepEqual(probed, []);
});

test("one figure is claimed once, however often the runtime re-runs", () => {
	installDocument();
	const figure = makeFigure(makeVideo({}));
	const root = makeRoot([figure]);
	const { deps } = makeDeps();

	assert.equal(enhanceArtPlayer(root, deps), 1);
	assert.equal(enhanceArtPlayer(root, deps), 0);
	assert.equal(enhanceArtPlayer(root, deps), 0);
});

test("`preload=auto` defers the mount until the embed is approached", async () => {
	installDocument();
	const figure = makeFigure(makeVideo({ preload: "auto" }));
	const armed = [];
	const { deps } = makeDeps({
		armApproach: (element, run) => armed.push({ element, run }),
	});

	assert.equal(enhanceArtPlayer(makeRoot([figure]), deps), 1);
	assert.equal(armed.length, 1);
	assert.equal(armed[0].element, figure);
	// Nothing is decided — not even the origin probe — until the embed is near
	// the viewport.
	assert.equal(figure.dataset.mpEngine, undefined);

	armed[0].run();
	await settle();
	assert.equal(figure.dataset.mpEngine, "mellow");
});

test("a failed mount restores the server-rendered element", async () => {
	installDocument();
	const video = makeVideo({ src: "/videos/movie.flv" });
	const figure = makeFigure(video);
	const released = [];
	const { deps } = makeDeps({
		mountSurface: async () => {
			throw new Error("no svelte runtime");
		},
		createNativeEngine: () => ({
			name: "native",
			capabilities: {},
			destroy() {
				released.push("engine");
			},
		}),
	});

	enhanceArtPlayer(makeRoot([figure]), deps);
	await settle();

	assert.equal(video.hidden, false);
	assert.equal(figure.inserted.removed, 1);
	assert.deepEqual(released, ["engine"]);
});

test("surfaces left behind by a Swup replacement are disposed of", async () => {
	installDocument();
	const hosts = [];
	const { deps } = makeDeps({
		mountSurface: async (host) => {
			hosts.push(host);
			return { dispose: () => {} };
		},
	});

	enhanceArtPlayer(makeRoot([makeFigure(makeVideo({}))]), deps);
	enhanceArtPlayer(makeRoot([makeFigure(makeVideo({}))]), deps);
	await settle();

	assert.equal(hosts.length, 2);
	assert.equal(pruneArtPlayerSurfaces(), 0);

	// Swup has replaced the region both hosts lived in.
	hosts[0].isConnected = false;
	assert.equal(pruneArtPlayerSurfaces(), 1);
	assert.equal(pruneArtPlayerSurfaces(), 0);

	disposeArtPlayerSurfaces();
});
