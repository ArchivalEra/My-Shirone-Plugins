import assert from "node:assert/strict";
import test from "node:test";

import { mintTicket, needsTicket, TicketedEngine } from "../dist/index.js";

const CDN = "https://cdn.example.com";
const SIGNED = (tag) => `${CDN}/drive/movie.mkv?X-Amz-Signature=${tag}`;

function futureIso(ms = 60 * 60_000) {
	return new Date(Date.now() + ms).toISOString();
}

function makeScheduler() {
	const timers = [];
	const schedule = (callback, ms) => {
		const timer = { callback, ms, cancelled: false };
		timers.push(timer);
		return () => {
			timer.cancelled = true;
		};
	};
	return {
		timers,
		schedule,
		fire(index = timers.length - 1) {
			const timer = timers[index];
			if (timer && !timer.cancelled) timer.callback();
		},
	};
}

function makeInnerEngine({ name = "native" } = {}) {
	const handlers = new Map();
	const calls = { load: [], seek: [], play: 0, pause: 0, destroy: 0 };
	const engine = {
		calls,
		handlers,
		name,
		capabilities: {
			boundedRanges: name === "mellow",
			canvas: name === "mellow",
			keyframeSeek: name === "mellow",
			selectableRate: true,
		},
		on(event, handler) {
			let bucket = handlers.get(event);
			if (!bucket) {
				bucket = new Set();
				handlers.set(event, bucket);
			}
			bucket.add(handler);
			return () => bucket.delete(handler);
		},
		emit(event, payload) {
			for (const handler of handlers.get(event) ?? []) handler(payload);
		},
		attach: async () => {},
		load(src) {
			calls.load.push(src);
			return engine.failLoad
				? Promise.reject(new Error("load failed"))
				: Promise.resolve();
		},
		play: async () => {
			calls.play += 1;
		},
		pause() {
			calls.pause += 1;
		},
		seek: async (seconds) => {
			calls.seek.push(seconds);
		},
		setVolume() {},
		setMuted() {},
		setRate() {},
		diagnostics: () => null,
		destroy() {
			calls.destroy += 1;
		},
	};
	return engine;
}

function makeWrapper({
	inner = makeInnerEngine(),
	ticket,
	mints,
	scheduler = makeScheduler(),
} = {}) {
	const mintCalls = [];
	const mint = async (src) => {
		mintCalls.push(src);
		if (!mints) {
			return {
				url: SIGNED(`mint-${mintCalls.length}`),
				expiresAt: futureIso(),
			};
		}
		return mints(mintCalls.length);
	};
	const wrapper = new TicketedEngine(inner, {
		src: `${CDN}/drive/movie.mkv`,
		ticket: ticket ?? { url: SIGNED("initial"), expiresAt: futureIso() },
		endpoint: "/mp-ticket",
		mint,
		schedule: scheduler.schedule,
	});
	return { wrapper, inner, mintCalls, scheduler };
}

async function settle(turns = 12) {
	for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

test("needsTicket matches by host, exactly and case-insensitively", () => {
	const route = { endpoint: "/mp-ticket", hosts: ["CDN.Example.com"] };
	assert.equal(needsTicket(route, `${CDN}/drive/movie.mkv`), true);
	assert.equal(
		needsTicket(route, "https://cdn.example.com:443/drive/movie.mkv"),
		true,
	);
	assert.equal(
		needsTicket(route, "https://other.example.com/drive/movie.mkv"),
		false,
	);
	assert.equal(needsTicket(route, "/videos/movie.mkv"), false);
	assert.equal(needsTicket(route, "data:video/mp4;base64,AAAA"), false);
});

test("needsTicket ignores a route with no hosts", () => {
	const route = { endpoint: "/mp-ticket", hosts: [] };
	assert.equal(needsTicket(route, `${CDN}/drive/movie.mkv`), false);
});

test("mintTicket POSTs the source and accepts a well-formed answer", async () => {
	const requests = [];
	const fetchImpl = async (url, init) => {
		requests.push({ url, init });
		return {
			ok: true,
			json: async () => ({
				url: SIGNED("abc"),
				expiresAt: futureIso(),
			}),
		};
	};

	const ticket = await mintTicket("/mp-ticket", `${CDN}/drive/movie.mkv`, {
		fetchImpl,
	});

	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, "/mp-ticket");
	assert.equal(requests[0].init.method, "POST");
	assert.equal(
		requests[0].init.body,
		JSON.stringify({ src: `${CDN}/drive/movie.mkv` }),
	);
	assert.equal(ticket.url, SIGNED("abc"));
	assert.equal(typeof Date.parse(ticket.expiresAt), "number");
});

test("mintTicket refuses an answer that points somewhere else", async () => {
	const fetchImpl = async () => ({
		ok: true,
		json: async () => ({
			url: "https://elsewhere.example.net/drive/movie.mkv?sig=1",
			expiresAt: futureIso(),
		}),
	});
	assert.equal(
		await mintTicket("/mp-ticket", `${CDN}/drive/movie.mkv`, { fetchImpl }),
		null,
	);
});

test("mintTicket resolves to null on every failure shape", async () => {
	const refusing = async () => ({ ok: false, status: 500 });
	const malformed = async () => ({ ok: true, json: async () => ({ nope: 1 }) });
	const missingUrl = async () => ({
		ok: true,
		json: async () => ({ url: "", expiresAt: futureIso() }),
	});
	const throwing = async () => {
		throw new Error("down");
	};

	for (const fetchImpl of [refusing, malformed, missingUrl, throwing]) {
		const ticket = await mintTicket("/mp-ticket", `${CDN}/drive/movie.mkv`, {
			fetchImpl,
		});
		assert.equal(ticket, null, fetchImpl.name);
	}
});

test("an unparseable expiry degrades to none instead of refusing the ticket", async () => {
	const fetchImpl = async () => ({
		ok: true,
		json: async () => ({ url: SIGNED("abc"), expiresAt: "not-a-date" }),
	});
	const ticket = await mintTicket("/mp-ticket", `${CDN}/drive/movie.mkv`, {
		fetchImpl,
	});
	assert.equal(ticket.url, SIGNED("abc"));
	assert.equal(ticket.expiresAt, null);
});

test("a load of the original source reads the current ticket", async () => {
	const { wrapper, inner } = makeWrapper();
	await wrapper.load(`${CDN}/drive/movie.mkv`);
	assert.deepEqual(inner.calls.load, [SIGNED("initial")]);
});

test("a load past the ticket's margin re-mints first", async () => {
	const { wrapper, inner, mintCalls } = makeWrapper({
		ticket: {
			url: SIGNED("stale"),
			expiresAt: new Date(Date.now() - 1_000).toISOString(),
		},
	});
	await wrapper.load(`${CDN}/drive/movie.mkv`);
	assert.equal(mintCalls.length, 1);
	assert.deepEqual(inner.calls.load, [SIGNED("mint-1")]);
});

test("a fresh ticket costs no extra mint on load", async () => {
	const { wrapper, mintCalls } = makeWrapper();
	await wrapper.load(`${CDN}/drive/movie.mkv`);
	assert.equal(mintCalls.length, 0);
});

test("a mid-play failure re-mints, reloads and resumes at the last position", async () => {
	const { wrapper, inner, mintCalls } = makeWrapper();
	const seen = [];
	wrapper.on("error", (payload) => seen.push(payload));

	await wrapper.load(`${CDN}/drive/movie.mkv`);
	inner.emit("time", { currentTime: 42, duration: 100 });
	inner.emit("playstate", { paused: false });
	inner.emit("error", { message: "MEDIA_ERR_NETWORK" });
	await settle();

	assert.equal(mintCalls.length, 1);
	assert.deepEqual(inner.calls.load, [SIGNED("initial"), SIGNED("mint-1")]);
	assert.deepEqual(inner.calls.seek, [42]);
	assert.equal(inner.calls.play, 1);
	// The reader never sees the recovered failure.
	assert.deepEqual(seen, []);
});

test("a failure with no answer from the endpoint reaches the reader", async () => {
	const { wrapper, inner } = makeWrapper({ mints: () => null });
	const seen = [];
	wrapper.on("error", (payload) => seen.push(payload));

	await wrapper.load(`${CDN}/drive/movie.mkv`);
	inner.emit("error", { message: "MEDIA_ERR_NETWORK" });
	await settle();

	assert.equal(seen.length, 1);
	assert.equal(seen[0].message, "MEDIA_ERR_NETWORK");
});

test("only one recovery runs per failure episode", async () => {
	let mintCount = 0;
	const { wrapper, inner } = makeWrapper({
		mints: async () => {
			mintCount += 1;
			await new Promise((resolve) => setTimeout(resolve, 0));
			return { url: SIGNED(`recovery-${mintCount}`), expiresAt: futureIso() };
		},
	});
	const seen = [];
	wrapper.on("error", (payload) => seen.push(payload));

	await wrapper.load(`${CDN}/drive/movie.mkv`);
	inner.emit("error", { message: "first" });
	inner.emit("error", { message: "second" });
	await settle();

	assert.equal(mintCount, 1);
	// The second error arrived during recovery and is passed straight through.
	assert.deepEqual(
		seen.map((payload) => payload.message),
		["second"],
	);
});

test("the refresh timer re-mints short of expiry and keeps a live session playing", async () => {
	const scheduler = makeScheduler();
	const { wrapper, inner, mintCalls } = makeWrapper({ scheduler });
	await wrapper.load(`${CDN}/drive/movie.mkv`);
	inner.emit("time", { currentTime: 7, duration: 100 });
	inner.emit("playstate", { paused: false });

	const armed = scheduler.timers.at(-1);
	// An hour-long ticket refreshes five minutes before it dies.
	assert.ok(armed.ms > 54 * 60_000 - 5_000, `delay ${armed.ms}`);
	assert.ok(armed.ms <= 55 * 60_000, `delay ${armed.ms}`);

	scheduler.fire();
	await settle();

	assert.equal(mintCalls.length, 1);
	assert.deepEqual(inner.calls.load, [SIGNED("initial"), SIGNED("mint-1")]);
	assert.deepEqual(inner.calls.seek, [7]);
	assert.equal(inner.calls.play, 1);
	// Rearmed from the fresh ticket, not the spent one.
	assert.notEqual(scheduler.timers.at(-1), armed);
});

test("a timer refresh on an idle embed only replaces the pending ticket", async () => {
	const scheduler = makeScheduler();
	const { inner, mintCalls } = makeWrapper({ scheduler });

	scheduler.fire();
	await settle();

	assert.equal(mintCalls.length, 1);
	assert.deepEqual(inner.calls.load, []);
});

test("a timer that cannot mint backs off and tries again a minute later", async () => {
	const scheduler = makeScheduler();
	const { mintCalls } = makeWrapper({ scheduler, mints: () => null });

	scheduler.fire();
	await settle();
	assert.equal(mintCalls.length, 1);

	const backoff = scheduler.timers.at(-1);
	assert.equal(backoff.ms, 60_000);
	backoff.callback();
	await settle();
	assert.equal(mintCalls.length, 2);
});

test("a ticket without an expiry refreshes on the retry cadence", () => {
	const scheduler = makeScheduler();
	makeWrapper({
		scheduler,
		ticket: { url: SIGNED("initial"), expiresAt: null },
	});
	assert.equal(scheduler.timers[0].ms, 60_000);
});

test("controls and events pass through the wrapper untouched", async () => {
	const { wrapper, inner } = makeWrapper({
		inner: makeInnerEngine({ name: "mellow" }),
	});
	const seen = [];
	wrapper.on("time", (payload) => seen.push(payload));

	await wrapper.attach({});
	wrapper.pause();
	await wrapper.seek(3);
	wrapper.setVolume(0.5);
	wrapper.setMuted(true);
	wrapper.setRate(2);
	inner.emit("time", { currentTime: 5, duration: 10 });

	assert.equal(wrapper.name, "mellow");
	assert.equal(wrapper.capabilities.boundedRanges, true);
	assert.equal(inner.calls.pause, 1);
	assert.deepEqual(inner.calls.seek, [3]);
	assert.deepEqual(seen, [{ currentTime: 5, duration: 10 }]);
});

test("destroy stops the refresh timer and tears the inner engine down", async () => {
	const scheduler = makeScheduler();
	const { wrapper, inner, mintCalls } = makeWrapper({ scheduler });

	wrapper.destroy();
	scheduler.fire();
	await settle();

	assert.equal(mintCalls.length, 0);
	assert.equal(inner.calls.destroy, 1);
});
