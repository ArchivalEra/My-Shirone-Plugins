import test from "node:test";
import assert from "node:assert/strict";

import {
	createOriginProbe,
	probeBoundedRanges,
} from "../dist/index.js";

function makeFetch(response, options = {}) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		if (options.throws) throw new TypeError("Failed to fetch");
		return { status: response, ok: response >= 200 && response < 300 };
	};
	return { fetchImpl, calls };
}

test("a 206 means the engine can read the source", async () => {
	const { fetchImpl, calls } = makeFetch(206);
	const result = await probeBoundedRanges("/videos/a.mkv", { fetchImpl });

	assert.deepEqual(result, { readable: true, detail: "HTTP 206" });
	assert.equal(calls.length, 1);
	// One byte, one bounded range: the probe asks the smallest question that
	// still proves the origin honours the engine's only read shape.
	assert.equal(calls[0].init.headers.Range, "bytes=0-0");
	assert.equal(calls[0].init.mode, "cors");
});

test("a 200 is not readable, because the engine refuses it", async () => {
	// A 200 means the origin ignored `Range` and started streaming the whole
	// file. Mellow-Player aborts on exactly that, so a probe that accepted it
	// would hand the engine a source it is about to reject.
	const { fetchImpl } = makeFetch(200);
	assert.deepEqual(await probeBoundedRanges("/videos/a.mkv", { fetchImpl }), {
		readable: false,
		detail: "HTTP 200",
	});
});

test("a blocked cross-origin read reads as unreadable, not as an error", async () => {
	// This is the case the probe exists for: the media element plays the file
	// fine, but `fetch` fails because the origin grants no CORS.
	const { fetchImpl } = makeFetch(206, { throws: true });
	const result = await probeBoundedRanges("/videos/a.mkv", { fetchImpl });

	assert.equal(result.readable, false);
	assert.match(result.detail, /Failed to fetch/);
});

test("other statuses are reported with their code", async () => {
	for (const status of [404, 416, 500]) {
		const { fetchImpl } = makeFetch(status);
		assert.deepEqual(
			await probeBoundedRanges("/videos/a.mkv", { fetchImpl }),
			{ readable: false, detail: `HTTP ${status}` },
		);
	}
});

test("the per-origin cache asks once for several embeds from one host", async () => {
	const seen = [];
	const probe = async (src) => {
		seen.push(src);
		return { readable: true, detail: "HTTP 206" };
	};
	const readableFor = createOriginProbe(probe);

	assert.equal(await readableFor("https://cdn.example.com/a/one.mkv"), true);
	assert.equal(await readableFor("https://cdn.example.com/b/two.mkv"), true);
	assert.equal(await readableFor("https://cdn.example.com/three.mkv"), true);
	assert.deepEqual(seen, ["https://cdn.example.com/a/one.mkv"]);

	// A different origin is a different question.
	await readableFor("https://other.example.com/a.mkv");
	assert.equal(seen.length, 2);
});

test("the per-origin cache remembers a refusal too", async () => {
	let calls = 0;
	const readableFor = createOriginProbe(async () => {
		calls += 1;
		return { readable: false, detail: "Failed to fetch" };
	});

	assert.equal(await readableFor("https://drive.example.com/a.mkv"), false);
	assert.equal(await readableFor("https://drive.example.com/b.mkv"), false);
	assert.equal(calls, 1);
});
