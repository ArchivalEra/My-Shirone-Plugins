import assert from "node:assert/strict";
import test from "node:test";
import {
	detectActiveWindow,
	getIdleSeconds,
	getOsInfo,
} from "../collector/detect-window.mjs";

test("Collector - getOsInfo returns valid desktop and session info", () => {
	const info = getOsInfo();
	assert.ok(typeof info === "string");
	assert.ok(info.includes("Linux") || info.includes("wayland") || info.includes("KDE"));
});

test("Collector - getIdleSeconds returns a non-negative integer", () => {
	const idle = getIdleSeconds();
	assert.ok(typeof idle === "number");
	assert.ok(idle >= 0);
});

test("Collector - detectActiveWindow returns appName and windowTitle", () => {
	const win = detectActiveWindow();
	assert.ok(win);
	assert.ok(typeof win.appName === "string");
	assert.ok(typeof win.windowTitle === "string");
	assert.ok(win.appName.length > 0);
});
