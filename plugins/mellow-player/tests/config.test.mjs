import test from "node:test";
import assert from "node:assert/strict";

import {
	DEFAULT_ENGINE_TIMEOUT_MS,
	normalizeEngineUrl,
	resolvePlayerConfig,
} from "../dist/index.js";

const FULL_LABELS = {
	play: "Play",
	pause: "Pause",
	mute: "Mute",
	unmute: "Unmute",
	seek: "Seek",
	volume: "Volume",
	rate: "Speed",
	fullscreen: "Fullscreen",
	exitFullscreen: "Exit fullscreen",
	loading: "Loading",
	error: "Playback failed",
	diagnostics: "Diagnostics",
	engine: "Engine",
	engineNative: "Native",
	engineMellow: "Mellow",
	requests: "Requests",
	transferred: "Transferred",
	hardware: "Hardware decode",
	hardwareEnabled: "Yes",
	hardwareDisabled: "No",
	startup: "Startup",
	seekLatency: "Seek latency",
};

test("resolvePlayerConfig refuses to install without a complete label set", () => {
	const resolution = resolvePlayerConfig({
		labels: { ...FULL_LABELS, pause: "", seek: "   " },
	});

	assert.equal(resolution.enabled, false);
	assert.equal(resolution.reason, "incomplete-labels");
	assert.equal(resolution.config, null);
	assert.deepEqual(resolution.missingLabels, ["pause", "seek"]);
});

test("resolvePlayerConfig reports every missing label when none are supplied", () => {
	const resolution = resolvePlayerConfig({});

	assert.equal(resolution.reason, "incomplete-labels");
	assert.equal(resolution.missingLabels.length, 22);
	assert.ok(resolution.missingLabels.includes("engineMellow"));
	assert.ok(resolution.missingLabels.includes("hardwareDisabled"));
});

test("resolvePlayerConfig lets an explicit disable win over missing labels", () => {
	const resolution = resolvePlayerConfig({ enabled: false, labels: {} });

	assert.equal(resolution.enabled, false);
	assert.equal(resolution.reason, "disabled");
	// The gap is still reported, so a host that re-enables the plugin knows
	// what to fix without a second build.
	assert.equal(resolution.missingLabels.length, 22);
});

test("resolvePlayerConfig fills defaults once the labels are complete", () => {
	const resolution = resolvePlayerConfig({ labels: FULL_LABELS });

	assert.equal(resolution.enabled, true);
	assert.equal(resolution.reason, null);
	assert.equal(resolution.config.engine, "auto");
	assert.equal(resolution.config.engineUrl, null);
	assert.equal(resolution.config.engineTimeoutMs, DEFAULT_ENGINE_TIMEOUT_MS);
	assert.equal(resolution.config.diagnostics, false);
	assert.deepEqual(resolution.config.routeFilter, []);
});

test("resolvePlayerConfig ignores an unknown engine preference", () => {
	const resolution = resolvePlayerConfig({
		labels: FULL_LABELS,
		engine: "webcodecs",
	});

	assert.equal(resolution.config.engine, "auto");
});

test("resolvePlayerConfig trims labels and accepts a diagnostic opt-in", () => {
	const resolution = resolvePlayerConfig({
		labels: { ...FULL_LABELS, play: "  Play  " },
		diagnostics: true,
		routeFilter: ["/posts", "  ", 7, "/videos"],
		engineTimeoutMs: -5,
	});

	assert.equal(resolution.config.labels.play, "Play");
	assert.equal(resolution.config.diagnostics, true);
	assert.deepEqual(resolution.config.routeFilter, ["/posts", "/videos"]);
	// A non-positive timeout would reject every load, so it falls back.
	assert.equal(resolution.config.engineTimeoutMs, DEFAULT_ENGINE_TIMEOUT_MS);
});

test("normalizeEngineUrl keeps only what a dynamic import can resolve anywhere", () => {
	assert.equal(normalizeEngineUrl("/vendor/mellow.js"), "/vendor/mellow.js");
	assert.equal(
		normalizeEngineUrl("https://cdn.example.com/mellow.js"),
		"https://cdn.example.com/mellow.js",
	);
	assert.equal(normalizeEngineUrl("  /vendor/mellow.js  "), "/vendor/mellow.js");

	// A relative specifier would resolve against the document URL, which is a
	// different module per route, and a protocol-relative URL inherits the
	// document's scheme: both are refused rather than half-working.
	assert.equal(normalizeEngineUrl("./mellow.js"), null);
	assert.equal(normalizeEngineUrl("//cdn.example.com/mellow.js"), null);
	assert.equal(normalizeEngineUrl("mellow.js"), null);
	assert.equal(normalizeEngineUrl("data:text/javascript,"), null);
	assert.equal(normalizeEngineUrl(""), null);
	assert.equal(normalizeEngineUrl(undefined), null);
	assert.equal(normalizeEngineUrl(42), null);
});
