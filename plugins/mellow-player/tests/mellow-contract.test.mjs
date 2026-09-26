import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Checks the interface `MellowMediaEngine` declares against a real build of
 * Mellow-Player, so an upstream rename becomes a failing test rather than a
 * runtime `undefined is not a function` on a reader's first play.
 *
 * The engine is a separate artifact by design — this package never depends on
 * it — so the check skips when the build is not on disk. Produce one by
 * building the sibling checkout in library mode:
 *
 *   cd ../Mellow-Player && npx vite build --config <lib-mode config>
 *
 * then point `MELLOW_ENGINE_BUNDLE` at the emitted file, or drop it at
 * `vendor/mellow-player.js`.
 */
const candidates = [
	process.env.MELLOW_ENGINE_BUNDLE,
	fileURLToPath(new URL("../vendor/mellow-player.js", import.meta.url)),
].filter(Boolean);

const bundlePath = candidates.find((candidate) => existsSync(candidate));

const contractTest = bundlePath ? test : test.skip;

contractTest(
	`the engine build satisfies the adapter's declared interface (${bundlePath ?? "no bundle"})`,
	async () => {
		const module = await import(bundlePath);
		assert.equal(typeof module.HeadlessPlayer, "function");

		const player = new module.HeadlessPlayer();
		try {
			for (const name of [
				"load",
				"seek",
				"play",
				"pause",
				"setVolume",
				"setMute",
				"observeProperty",
				"on",
				"attachCanvas",
				"stats",
				"ranges",
				"destroy",
			]) {
				assert.equal(
					typeof player[name],
					"function",
					`HeadlessPlayer.${name} is part of the adapter's contract`,
				);
			}

			// `stats()` is what the diagnostics panel is built from, so a
			// renamed field would silently blank a column.
			const stats = player.stats();
			for (const field of [
				"requests",
				"bytes",
				"startup_ms",
				"seek_ms",
				"decodedFrames",
			]) {
				assert.equal(typeof stats[field], "number", `stats().${field}`);
			}
			assert.equal(typeof stats.isHardwareAccelerated, "boolean");

			// The surface relies on subscribing being undoable.
			assert.equal(typeof player.observeProperty("time-pos", () => {}), "function");
			assert.equal(typeof player.on("error", () => {}), "function");
			assert.ok(Array.isArray(player.ranges()));
		} finally {
			player.destroy();
		}
	},
);
