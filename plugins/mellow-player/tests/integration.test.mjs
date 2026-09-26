import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeScript, mellowPlayer, serializePlayerConfig } from "../dist/index.js";

const LABELS = {
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

function collect(options) {
	const injected = [];
	mellowPlayer(options).hooks["astro:config:setup"]({
		injectScript: (stage, content) => injected.push({ stage, content }),
	});
	return injected;
}

test("a complete configuration injects exactly one page script", () => {
	const injected = collect({ labels: LABELS, engineUrl: "/vendor/mellow.js" });

	assert.equal(injected.length, 1);
	assert.equal(injected[0].stage, "page");
	assert.match(injected[0].content, /__MELLOW_PLAYER_CONFIG__/);
	assert.match(injected[0].content, /\/vendor\/mellow\.js/);
	assert.match(injected[0].content, /runtime\/enhance\.js/);
});

test("the runtime module is reached only through a guarded dynamic import", () => {
	const [script] = collect({ labels: LABELS });

	// Exactly one import, never a static one: a page without the syntax must
	// not download the surface, the adapters or the engine.
	assert.equal(script.content.match(/import\(/g).length, 1);
	assert.ok(!/^\s*import\s+["']/m.test(script.content));

	// The only call that reaches it sits behind the presence check.
	assert.match(
		script.content,
		/if \(document\.querySelector\(SELECTOR\) !== null\) \{\s*activate\(\);/,
	);

	// A later client navigation can introduce the first embed.
	assert.match(script.content, /swup:content:replace/);
});

test("an explicit disable injects nothing at all", () => {
	assert.deepEqual(collect({ labels: LABELS, enabled: false }), []);
});

test("an incomplete label set injects nothing rather than blank controls", () => {
	assert.deepEqual(collect({ labels: { play: "Play" } }), []);
	assert.deepEqual(collect({ labels: { ...LABELS, seek: "" } }), []);
});

test("serializePlayerConfig escapes markup so a label cannot close the tag", () => {
	const serialized = serializePlayerConfig({
		engine: "auto",
		engineUrl: null,
		engineTimeoutMs: 100,
		diagnostics: false,
		labels: { ...LABELS, pause: "</script><script>alert(1)</script>" },
		routeFilter: [],
	});

	assert.ok(!serialized.includes("</script>"));
	assert.match(serialized, /\\u003c\/script>/);

	// The escaped form still round-trips to the original string.
	const parsed = JSON.parse(serialized.replace(/\\u003c/g, "<"));
	assert.equal(parsed.labels.pause, "</script><script>alert(1)</script>");
});

test("buildRuntimeScript embeds the configuration as data, not as markup", () => {
	const script = buildRuntimeScript(
		{
			engine: "mellow",
			engineUrl: "https://cdn.example.com/mellow.js",
			engineTimeoutMs: 9000,
			diagnostics: true,
			labels: LABELS,
			routeFilter: ["/posts"],
		},
		"/abs/runtime/enhance.js",
	);

	assert.match(script, /"engine":"mellow"/);
	assert.match(script, /"engineTimeoutMs":9000/);
	assert.match(script, /"diagnostics":true/);
	assert.match(script, /"routeFilter":\["\/posts"\]/);
	assert.match(script, /import\("\/abs\/runtime\/enhance\.js"\)/);
});
