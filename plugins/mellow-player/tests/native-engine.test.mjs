import test from "node:test";
import assert from "node:assert/strict";

import { NativeMediaEngine } from "../dist/index.js";

/** The smallest thing the adapter treats as a media element. */
class FakeVideoElement {
	constructor() {
		this.listeners = new Map();
		this.attributes = new Map();
		this.className = "";
		this.currentTime = 0;
		this.duration = Number.NaN;
		this.volume = 1;
		this.muted = false;
		this.playbackRate = 1;
		this.readyState = 0;
		this.error = null;
		this.loadCalls = 0;
		this.removeCalls = 0;
		this.playRefusals = 0;
	}

	addEventListener(type, handler) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type).add(handler);
	}

	removeEventListener(type, handler) {
		this.listeners.get(type)?.delete(handler);
	}

	listenerCount(type) {
		return this.listeners.get(type)?.size ?? 0;
	}

	fire(type) {
		for (const handler of [...(this.listeners.get(type) ?? [])]) {
			handler({ type });
		}
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}

	removeAttribute(name) {
		this.attributes.delete(name);
	}

	appendChild() {}

	remove() {
		this.removeCalls += 1;
	}

	play() {
		if (this.playRefusals > 0) {
			return Promise.reject(new DOMException("blocked", "NotAllowedError"));
		}
		return Promise.resolve();
	}

	pause() {}

	load() {
		this.loadCalls += 1;
	}
}

class FakeHost {
	constructor() {
		this.children = [];
	}

	appendChild(child) {
		this.children.push(child);
	}
}

function makeEngine() {
	const video = new FakeVideoElement();
	const host = new FakeHost();
	let created = 0;
	const engine = new NativeMediaEngine({
		createElement: () => {
			created += 1;
			return video;
		},
	});
	return { engine, video, host, created: () => created };
}

test("native engine declares what a media element cannot do", () => {
	const { engine } = makeEngine();
	assert.equal(engine.name, "native");
	assert.deepEqual(engine.capabilities, {
		boundedRanges: false,
		canvas: false,
		keyframeSeek: false,
		selectableRate: true,
	});
	// The element is the one engine whose accounting is unobservable.
	assert.equal(engine.diagnostics(), null);
});

test("attach creates one element and attaches it only once", async () => {
	const { engine, host, video, created } = makeEngine();
	await engine.attach(host);
	await engine.attach(host);

	assert.equal(created(), 1);
	assert.deepEqual(host.children, [video]);
	assert.equal(video.className, "mp-stage__media");
	assert.equal(video.getAttribute("preload"), "metadata");
});

test("load resolves once metadata arrives and reports the duration", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	const seen = [];
	engine.on("loaded", (payload) => seen.push(payload));

	const pending = engine.load("/videos/movie.mp4");
	assert.equal(video.getAttribute("src"), "/videos/movie.mp4");
	assert.equal(video.loadCalls, 1);

	video.duration = 42;
	video.fire("loadedmetadata");
	await pending;

	assert.deepEqual(seen, [{ duration: 42 }]);
});

test("load reuses a source that is already resolved instead of refetching", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	const first = engine.load("/videos/movie.mp4");
	video.duration = 42;
	video.readyState = 1;
	video.fire("loadedmetadata");
	await first;

	await engine.load("/videos/movie.mp4");
	assert.equal(video.loadCalls, 1);
});

test("load rejects when the element reports a media error", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	const failures = [];
	engine.on("error", (payload) => failures.push(payload));

	const pending = engine.load("/videos/movie.mp4");
	video.error = { code: 4, message: "no decoder for vp9" };
	video.fire("error");

	await assert.rejects(pending, /native engine failed to load/);
	assert.deepEqual(failures, [
		{ message: "MEDIA_ERR_SRC_NOT_SUPPORTED: no decoder for vp9" },
	]);
});

test("load rejects when the engine was never attached", async () => {
	const { engine } = makeEngine();
	await assert.rejects(engine.load("/videos/movie.mp4"), /not attached/);
});

test("the transport maps onto engine events", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	const plays = [];
	const volumes = [];
	const rates = [];
	const ends = [];
	engine.on("playstate", (payload) => plays.push(payload.paused));
	engine.on("volume", (payload) => volumes.push(payload));
	engine.on("rate", (payload) => rates.push(payload.rate));
	engine.on("ended", (payload) => ends.push(payload.reason));

	video.fire("play");
	video.fire("pause");
	video.volume = 0.4;
	video.muted = true;
	video.fire("volumechange");
	video.playbackRate = 1.5;
	video.fire("ratechange");
	video.fire("ended");

	assert.deepEqual(plays, [false, true]);
	assert.deepEqual(volumes, [{ volume: 0.4, muted: true }]);
	assert.deepEqual(rates, [1.5]);
	assert.deepEqual(ends, ["eof"]);
});

test("seek clamps to the known duration and reports where it landed", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);
	video.duration = 100;

	const landings = [];
	engine.on("seek", (payload) => landings.push(payload));

	await engine.seek(150);
	assert.equal(video.currentTime, 100);
	video.fire("seeked");
	assert.deepEqual(landings, [{ targetTime: 100, actualTime: 100 }]);

	await engine.seek(-20);
	assert.equal(video.currentTime, 0);
	video.fire("seeked");
	assert.deepEqual(landings[1], { targetTime: 0, actualTime: 0 });
});

test("volume, mute and rate are clamped before they reach the element", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	engine.setVolume(2);
	assert.equal(video.volume, 1);
	engine.setVolume(Number.NaN);
	assert.equal(video.volume, 0);

	engine.setMuted(true);
	assert.equal(video.muted, true);
	engine.setMuted(0);
	assert.equal(video.muted, false);

	engine.setRate(99);
	assert.equal(video.playbackRate, 4);
	engine.setRate(0.1);
	assert.equal(video.playbackRate, 0.25);
});

test("play surfaces a refused autoplay as a diagnosable error", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);
	video.playRefusals = 1;

	await assert.rejects(engine.play(), /native playback refused/);
});

test("destroy releases the element and stops listening", async () => {
	const { engine, host, video } = makeEngine();
	await engine.attach(host);

	const seen = [];
	engine.on("playstate", (payload) => seen.push(payload));

	engine.destroy();

	assert.equal(video.removeCalls, 1);
	assert.equal(video.getAttribute("src"), null);
	assert.equal(video.listenerCount("play"), 0);
	video.fire("play");
	assert.deepEqual(seen, []);

	// A second teardown must not throw: the surface and the runtime both
	// release the engine during a Swup replacement.
	engine.destroy();
});
