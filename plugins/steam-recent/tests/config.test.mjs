import assert from "node:assert/strict";
import test from "node:test";

import { resolveSteamRecentOptions } from "../dist/index.js";

test("defaults fill missing overrides and clamp maxItems into 1..8", () => {
	const resolved = resolveSteamRecentOptions({ enable: true, maxItems: 99 });
	assert.equal(resolved.enable, true);
	assert.equal(resolved.maxItems, 8);
	assert.equal(resolved.title, "最近在玩");
	assert.equal(resolved.playtimeLabel, "近两周游玩");
	assert.equal(resolved.emptyLabel, "最近两周没有游玩记录");
});

test("overrides win over defaults; zero-size clamps to 1", () => {
	const resolved = resolveSteamRecentOptions({
		enable: true,
		maxItems: 0,
		title: "  Recently Playing  ",
		emptyLabel: "",
	});
	assert.equal(resolved.maxItems, 1);
	assert.equal(resolved.title, "Recently Playing");
	assert.equal(resolved.emptyLabel, "最近两周没有游玩记录");
});

test("disable keeps everything else resolved", () => {
	const resolved = resolveSteamRecentOptions({ enable: false });
	assert.equal(resolved.enable, false);
	assert.equal(resolved.maxItems, 4);
});
