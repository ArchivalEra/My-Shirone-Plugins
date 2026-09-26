import test from "node:test";
import assert from "node:assert/strict";

import { chooseEngine, matroskaExtension } from "../dist/index.js";

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
			src: "/videos/movie.mkv",
			preference: "native",
			mellowAvailable: true,
		}),
		{ engine: "native", reason: "forced-native" },
	);
});

test("chooseEngine honours a forced Mellow preference when the engine is there", () => {
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mp4",
			preference: "mellow",
			mellowAvailable: true,
		}),
		{ engine: "mellow", reason: "forced-mellow" },
	);
});

test("chooseEngine falls back rather than failing when Mellow is unavailable", () => {
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mkv",
			preference: "mellow",
			mellowAvailable: false,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mkv",
			preference: "auto",
			mellowAvailable: false,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
});

test("chooseEngine gives Mellow exactly the container it accepts", () => {
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mkv",
			preference: "auto",
			mellowAvailable: true,
		}),
		{ engine: "mellow", reason: "matroska-source" },
	);
	assert.deepEqual(
		chooseEngine({
			src: "/videos/movie.mp4",
			preference: "auto",
			mellowAvailable: true,
		}),
		{ engine: "native", reason: "non-matroska-source" },
	);
});
