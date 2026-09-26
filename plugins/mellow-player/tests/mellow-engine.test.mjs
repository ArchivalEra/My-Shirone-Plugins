import test from "node:test";
import assert from "node:assert/strict";

import {
	EngineCapabilityError,
	MellowMediaEngine,
	loadEngineModule,
} from "../dist/index.js";

class FakeCanvas {
	constructor() {
		this.className = "";
		this.removed = 0;
	}

	remove() {
		this.removed += 1;
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

/**
 * A stand-in for `HeadlessPlayer` that records the order of every call, so the
 * adapter's one non-obvious requirement — that the canvas sink is bound before
 * `load()`, because the pacer adopts whichever sink the player holds at that
 * moment — is a test rather than a comment.
 */
function makeMellowModule(options = {}) {
	const record = {
		calls: [],
		constructorArgs: [],
		observers: new Map(),
		events: new Map(),
		unsubscribed: [],
		destroyed: 0,
	};

	class FakeHeadlessPlayer {
		constructor(args) {
			record.constructorArgs.push(args);
		}

		async attachCanvas(canvas) {
			record.calls.push(["attachCanvas", canvas]);
		}

		async load(url) {
			record.calls.push(["load", url]);
			if (options.refuseLoad) {
				throw new Error("container exclusivity: ftyp detected");
			}
		}

		async seek(seconds) {
			record.calls.push(["seek", seconds]);
			// The real player resolves only with the keyframe it landed on;
			// the `seek` event is what it emits once the decoder has moved.
			return { targetTime: seconds, actualTime: seconds };
		}

		play() {
			record.calls.push(["play"]);
		}

		pause() {
			record.calls.push(["pause"]);
		}

		setVolume(volume) {
			record.calls.push(["setVolume", volume]);
		}

		setMute(mute) {
			record.calls.push(["setMute", mute]);
		}

		observeProperty(name, callback) {
			record.observers.set(name, callback);
			return () => record.unsubscribed.push(`property:${name}`);
		}

		on(event, callback) {
			record.events.set(event, callback);
			return () => record.unsubscribed.push(`event:${event}`);
		}

		stats() {
			return {
				requests: 7,
				bytes: 1_234_567,
				startup_ms: 118,
				seek_ms: 42,
				isHardwareAccelerated: true,
				decodedFrames: 900,
				duration: 86_801,
			};
		}

		ranges() {
			return ["bytes=0-65535", "bytes=64439115860-64440539111"];
		}

		destroy() {
			record.destroyed += 1;
		}
	}

	return {
		record,
		module: options.noExport ? {} : { HeadlessPlayer: FakeHeadlessPlayer },
	};
}

function makeEngine(module, options = {}) {
	const imported = [];
	const engine = new MellowMediaEngine({
		engineUrl: "/vendor/mellow-player.js",
		timeoutMs: 50,
		importModule: async (url) => {
			imported.push(url);
			return module;
		},
		createCanvas: () => new FakeCanvas(),
		...options,
	});
	return { engine, imported };
}

test("the engine module is not resolved until the media is actually loaded", async () => {
	const { record, module } = makeMellowModule();
	const { engine, imported } = makeEngine(module);
	const host = new FakeHost();

	await engine.attach(host);
	engine.setVolume(0.5);
	engine.setMuted(true);
	engine.pause();

	// Everything above is cheap by construction: a reader who never presses
	// play must never download the WebAssembly core.
	assert.deepEqual(imported, []);
	assert.equal(record.calls.length, 0);

	await engine.load("/videos/movie.mkv");
	assert.deepEqual(imported, ["/vendor/mellow-player.js"]);
});

test("the canvas sink is bound before load, and the module is resolved once", async () => {
	const { record, module } = makeMellowModule();
	const { engine, imported } = makeEngine(module);
	const host = new FakeHost();
	await engine.attach(host);

	await engine.load("/videos/movie.mkv");
	await engine.load("/videos/other.mkv");

	assert.deepEqual(
		record.calls.map((call) => call[0]),
		["attachCanvas", "load", "load"],
	);
	assert.equal(record.calls[0][1], host.children[0]);
	assert.deepEqual(imported, ["/vendor/mellow-player.js"]);
	assert.equal(record.constructorArgs.length, 1);
});

test("load refuses a container the engine will not demux", async () => {
	const { module } = makeMellowModule({ refuseLoad: true });
	const { engine } = makeEngine(module);
	await engine.attach(new FakeHost());

	await assert.rejects(
		engine.load("/videos/movie.mp4"),
		/container exclusivity: ftyp detected/,
	);
});

test("a module without HeadlessPlayer is refused by name", async () => {
	const { module } = makeMellowModule({ noExport: true });
	const { engine } = makeEngine(module);
	await engine.attach(new FakeHost());

	await assert.rejects(
		engine.load("/videos/movie.mkv"),
		/does not export HeadlessPlayer/,
	);
});

test("loadEngineModule gives up on a module that never resolves", async () => {
	await assert.rejects(
		loadEngineModule("/vendor/slow.js", 20, () => new Promise(() => {})),
		/timed out after 20 ms/,
	);
});

test("loadEngineModule reports a failed import as a diagnosable error", async () => {
	await assert.rejects(
		loadEngineModule("/vendor/gone.js", 100, async () => {
			throw new Error("404 Not Found");
		}),
		/404 Not Found/,
	);
});

test("the engine reports what it observes, translated onto the seam's names", async () => {
	const { record, module } = makeMellowModule();
	const { engine } = makeEngine(module);
	const host = new FakeHost();
	await engine.attach(host);
	await engine.load("/videos/movie.mkv");

	const times = [];
	const loaded = [];
	const plays = [];
	const volumes = [];
	const landings = [];
	engine.on("time", (payload) => times.push(payload));
	engine.on("loaded", (payload) => loaded.push(payload));
	engine.on("playstate", (payload) => plays.push(payload.paused));
	engine.on("volume", (payload) => volumes.push(payload));
	engine.on("seek", (payload) => landings.push(payload));

	// `observeProperty` replays the current value on subscribe, which is how
	// the surface learns the duration and the starting pause state.
	record.observers.get("duration")(86_801);
	record.observers.get("time-pos")(12.5);
	record.observers.get("pause")(false);
	record.observers.get("volume")(0.25);
	record.observers.get("mute")(true);
	record.events.get("seek")({ targetTime: 120.5, actualTime: 120.2 });
	record.events.get("end-file")({ reason: "eof" });

	assert.deepEqual(loaded, [{ duration: 86_801 }]);
	assert.equal(times.at(-1).currentTime, 12.5);
	assert.equal(times.at(-1).duration, 86_801);
	assert.deepEqual(plays, [false]);
	// The seam's volume event carries both halves of the state, so each
	// observed change is published even though only one field moved.
	assert.deepEqual(volumes, [
		{ volume: 0.25, muted: false },
		{ volume: 0.25, muted: true },
	]);
	assert.deepEqual(landings, [{ targetTime: 120.5, actualTime: 120.2 }]);
});

test("the seek report comes from the engine's own landing event", async () => {
	const { record, module } = makeMellowModule();
	const { engine } = makeEngine(module);
	await engine.attach(new FakeHost());
	await engine.load("/videos/movie.mkv");

	const landings = [];
	engine.on("seek", (payload) => landings.push(payload));
	await engine.seek(120.5);

	// Nothing is reported until the engine says the decoder actually landed,
	// so the surface never shows an optimistic position.
	assert.deepEqual(landings, []);
	record.events.get("seek")({ targetTime: 120.5, actualTime: 120.2 });
	assert.deepEqual(landings, [{ targetTime: 120.5, actualTime: 120.2 }]);
});

test("diagnostics translate the engine's accounting into the seam's shape", async () => {
	const { module } = makeMellowModule();
	const { engine } = makeEngine(module);

	// Before the module is resolved there is nothing to report.
	assert.equal(engine.diagnostics(), null);

	await engine.attach(new FakeHost());
	await engine.load("/videos/movie.mkv");

	assert.deepEqual(engine.diagnostics(), {
		requests: 7,
		bytes: 1_234_567,
		hardwareDecode: true,
		startupMs: 118,
		seekMs: 42,
		decodedFrames: 900,
		ranges: ["bytes=0-65535", "bytes=64439115860-64440539111"],
	});
});

test("the engine advertises no rate control, and refuses one loudly", async () => {
	const { module } = makeMellowModule();
	const { engine } = makeEngine(module);

	assert.deepEqual(engine.capabilities, {
		boundedRanges: true,
		canvas: true,
		keyframeSeek: true,
		selectableRate: false,
	});
	assert.throws(() => engine.setRate(1.5), EngineCapabilityError);
});

test("volume and mute are clamped on the way to the engine", async () => {
	const { record, module } = makeMellowModule();
	const { engine } = makeEngine(module);
	await engine.attach(new FakeHost());
	await engine.load("/videos/movie.mkv");
	record.calls.length = 0;

	engine.setVolume(4);
	engine.setVolume(Number.NaN);
	engine.setMuted(1);

	assert.deepEqual(record.calls, [
		["setVolume", 1],
		["setVolume", 0],
		["setMute", true],
	]);
});

test("destroy unsubscribes, tears the player down and drops the canvas", async () => {
	const { record, module } = makeMellowModule();
	const { engine } = makeEngine(module);
	const host = new FakeHost();
	await engine.attach(host);
	await engine.load("/videos/movie.mkv");

	const canvas = host.children[0];
	engine.destroy();

	assert.equal(record.destroyed, 1);
	assert.equal(canvas.removed, 1);
	assert.deepEqual(record.unsubscribed.sort(), [
		"event:end-file",
		"event:error",
		"event:seek",
		"property:duration",
		"property:mute",
		"property:pause",
		"property:time-pos",
		"property:volume",
	]);

	// A surface can be torn down twice during a Swup replacement.
	engine.destroy();
	assert.equal(record.destroyed, 1);
});
