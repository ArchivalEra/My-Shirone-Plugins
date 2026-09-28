import test from "node:test";
import assert from "node:assert/strict";

import { chooseEngine, engineContainer } from "../dist/index.js";

/** Reachable origin and an available engine, so each case is about the source. */
const base = { mellowAvailable: true, mellowReadable: true };

test("engineContainer maps the containers ADR-0002 covers", () => {
	assert.equal(engineContainer("/videos/a.mkv"), "matroska");
	assert.equal(engineContainer("/videos/a.webm"), "matroska");
	assert.equal(engineContainer("/videos/a.mp4"), "bmff");
	assert.equal(engineContainer("/videos/a.m4v"), "bmff");
	assert.equal(engineContainer("/videos/a.mov"), "bmff");
	assert.equal(engineContainer("/videos/a.ts"), "mpegts");
	assert.equal(engineContainer("/videos/a.MP4"), "bmff");
	assert.equal(engineContainer("https://cdn.example.com/a/b/clip.WebM"), "matroska");
});

test("engineContainer declines what the engine refuses", () => {
	// `.flv` is still rejected upstream, and anything unknown must not be
	// guessed at: a wrong guess surfaces as an error rather than a fallback.
	assert.equal(engineContainer("/videos/a.flv"), null);
	assert.equal(engineContainer("/videos/a.avi"), null);
	assert.equal(engineContainer("/videos/a.m3u8"), null);
	assert.equal(engineContainer("/videos/mp4"), null);
});

test("engineContainer is not fooled by a dotted host, query or fragment", () => {
	assert.equal(engineContainer("https://cdn.example.com/video"), null);
	assert.equal(engineContainer("https://cdn.example.com/"), null);
	assert.equal(engineContainer("/stream?name=a.mp4"), null);
	assert.equal(engineContainer("/stream#a.mkv"), null);
});

test("chooseEngine honours a forced native preference whatever the source", () => {
	assert.deepEqual(
		chooseEngine({ ...base, src: "/videos/a.mp4", preference: "native" }),
		{ engine: "native", reason: "forced-native" },
	);
});

test("chooseEngine routes each supported container and names the family", () => {
	for (const [src, reason] of [
		["/videos/a.mkv", "matroska-source"],
		["/videos/a.mp4", "mp4-source"],
		["/videos/a.mov", "mp4-source"],
		["/videos/a.ts", "mpegts-source"],
	]) {
		assert.deepEqual(
			chooseEngine({ ...base, src, preference: "auto" }),
			{ engine: "mellow", reason },
			src,
		);
	}
});

test("chooseEngine keeps unsupported containers on the native element", () => {
	assert.deepEqual(
		chooseEngine({ ...base, src: "/videos/a.flv", preference: "auto" }),
		{ engine: "native", reason: "native-container" },
	);
	assert.deepEqual(
		chooseEngine({ ...base, src: "/videos/a.avi", preference: "auto" }),
		{ engine: "native", reason: "native-container" },
	);
});

test("chooseEngine reports an unconfigured engine before looking at the source", () => {
	assert.deepEqual(
		chooseEngine({
			src: "/videos/a.mkv",
			preference: "mellow",
			mellowAvailable: false,
			mellowReadable: true,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
	assert.deepEqual(
		chooseEngine({
			src: "/videos/a.mkv",
			preference: "auto",
			mellowAvailable: false,
			mellowReadable: true,
		}),
		{ engine: "native", reason: "mellow-unavailable" },
	);
});

test("a forced Mellow preference still works on a container it cannot demux", () => {
	// The author asked for it explicitly; the engine will refuse at load and
	// the surface will say so. Overriding the author silently would be worse.
	assert.deepEqual(
		chooseEngine({ ...base, src: "/videos/a.avi", preference: "mellow" }),
		{ engine: "mellow", reason: "forced-mellow" },
	);
});

test("an unreadable origin keeps a supported container on the native element", () => {
	// The trial that motivated the probe: a drive-backed CDN serves a valid
	// file over bounded ranges but grants no CORS, so the engine's `fetch`
	// never sees a byte. The container alone would have chosen the engine and
	// left the reader with a failed surface.
	assert.deepEqual(
		chooseEngine({
			src: "https://cdn.example.com/drive/a.mkv",
			preference: "auto",
			mellowAvailable: true,
			mellowReadable: false,
		}),
		{ engine: "native", reason: "mellow-unreadable" },
	);
	assert.deepEqual(
		chooseEngine({
			src: "https://cdn.example.com/drive/a.mp4",
			preference: "mellow",
			mellowAvailable: true,
			mellowReadable: false,
		}),
		{ engine: "native", reason: "mellow-unreadable" },
	);
});
