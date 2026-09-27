import test from "node:test";
import assert from "node:assert/strict";

import { chooseEngine, matroskaExtension } from "../dist/index.js";

/** Readable origin, so each case is about the container or the preference. */
const base = { mellowAvailable: true, mellowReadable: true };

test("matroskaExtension reads only the last path segment", () => {
	assert.equal(matroskaExtension("/videos/movie.mkv"), ".mkv");
	assert.equal(matroskaExtension("/videos/movie.webm"), ".webm");
	assert.equal(matroskaExtension("/videos/movie.MKV"), ".mkv");
	assert.equal(matroskaExtension("https://cdn.example.com/a/b/clip.WebM"), ".webm");
});

test("matroskaExtension is not fooled by a dotted host, query or fragment", () => {
	// The dot belongs to the host, not to a file name.
	assert.equal(matroskaExtension("https://cdn.example.com/video"), null);
	assert.equal(matroskaExtension("https://cdn.example.com/"), null);
	// A `.mkv` that appears only in the query selects nothing.
	assert.equal(matroskaExtension("/stream?name=movie.mkv"), null);
	assert.equal(matroskaExtension("/stream#movie.mkv"), null);
	// Mellow-Player refuses these outright, so they must not select it.
	assert.equal(matroskaExtension("/videos/movie.mp4"), null);
	assert.equal(matroskaExtension("/videos/movie.m3u8"), null);
	assert.equal(matroskaExtension("/videos/mkv"), null);
});

test("chooseEngine honours a forced native preference whatever the source", () => {
	assert.deepEqual(
		chooseEngine({
			...base,
			src: "/videos/movie.mkv",
			preference: "native",
		}),
		{ engine: "native", reason: "forced-native" },
	);
});

test("chooseEngine honours a forced Mellow preference when the engine is there", () => {
	assert.deepEqual(
		chooseEngine({
			...base,
			src: "/videos/movie.mp4",
			preference: "mellow",
		}),
		{ engine: "mellow", reason: "forced-mellow" },
	);
});

test("chooseEngine reports an unconfigured engine before anything else", () => {
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mkv",
			preference: "mellow",
			mellowAvailable: false,
			mellowReadable: true,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mkv",
			preference: "auto",
			mellowAvailable: false,
			mellowReadable: true,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
});

test("chooseEngine gives Mellow exactly the container it accepts", () => {
	assert.deepEqual(
		chooseEngine({
			...base,
			src: "/videos/movie.mkv",
			preference: "auto",
		}),
		{ engine: "mellow", reason: "matroska-source" },
	);
	assert.deepEqual(
		chooseEngine({
			...base,
			src: "/videos/movie.mp4",
			preference: "auto",
		}),
		{ engine: "native", reason: "non-matroska-source" },
	);
});

test("an unreadable origin keeps Matroska on the native element", () => {
	// The trial that motivated the probe: a drive-backed CDN serves a valid
	// Matroska file over bounded ranges, but grants no CORS, so the engine's
	// `fetch` never sees a byte. The container alone would have chosen Mellow
	// and left the reader with a failed surface.
	assert.deepEqual(
		chooseEngine({
			src: "https://cdn.example.com/drive/movie.mkv",
			preference: "auto",
			mellowAvailable: true,
			mellowReadable: false,
		}),
		{ engine: "native", reason: "mellow-unreadable" },
	);
});

test("an unreadable origin overrides a forced Mellow preference too", () => {
	assert.deepEqual(
		chooseEngine({
			src: "https://cdn.example.com/drive/movie.mkv",
			preference: "mellow",
			mellowAvailable: true,
			mellowReadable: false,
		}),
		{ engine: "native", reason: "mellow-unreadable" },
	);
});
