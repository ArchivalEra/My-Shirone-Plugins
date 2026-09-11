import assert from "node:assert/strict";
import test from "node:test";
import {
	formatActivitySentence,
	formatDateTime,
	formatOfflineTime,
	formatRelativeTime,
} from "../dist/components/RelativeTime.js";
import { ActivityStatus } from "../dist/protocol/types.js";

test("RelativeTime - formatRelativeTime formatting", () => {
	const now = 1773190000000;

	assert.equal(formatRelativeTime(now - 10000, now, "zh"), "刚刚");
	assert.equal(formatRelativeTime(now - 10 * 60 * 1000, now, "zh"), "10分钟前");
	assert.equal(formatRelativeTime(now - 2 * 3600 * 1000, now, "zh"), "2小时前");
	assert.equal(formatRelativeTime(now - 25 * 3600 * 1000, now, "zh"), "昨天");
	assert.equal(formatRelativeTime(now - 3 * 86400 * 1000, now, "zh"), "3天前");
});

test("RelativeTime - formatActivitySentence matches user requirement exactly", () => {
	const now = 1773190000000;

	// Case 1: 10 minutes ago used Antigravity on Arch PC
	const tenMinsAgo = {
		timestamp: now - 10 * 60 * 1000,
		deviceId: "arch-pc",
		deviceName: "Arch Workstation",
		appName: "Antigravity",
		windowTitle: "isui.ren-Blog",
		status: ActivityStatus.ACTIVE,
		osInfo: "Linux / Wayland (KDE 6.7)",
		idleSeconds: 600,
		metadata: {},
	};

	const res1 = formatActivitySentence(tenMinsAgo, now, "zh");
	assert.equal(res1.sentence, "10分钟前在 Arch Workstation 使用 Antigravity");
	assert.equal(res1.statusType, "idle"); // > 180s ago -> idle

	// Case 2: Currently active (< 2 mins)
	const rightNow = {
		timestamp: now - 30 * 1000,
		deviceId: "arch-pc",
		deviceName: "Arch Workstation",
		appName: "Antigravity",
		windowTitle: "isui.ren-Blog",
		status: ActivityStatus.ACTIVE,
		osInfo: "Linux / Wayland (KDE 6.7)",
		idleSeconds: 0,
		metadata: {},
	};

	const res2 = formatActivitySentence(rightNow, now, "zh");
	assert.equal(res2.sentence, "正在 Arch Workstation 使用 Antigravity");
	assert.equal(res2.statusType, "active");

	// Case 3: Offline or empty
	const res3 = formatActivitySentence(null, now, "zh");
	assert.equal(res3.statusType, "offline");
	assert.equal(res3.sentence, "当前无活跃设备");

	// Case 4: Explicit offline device
	const offlineDev = {
		timestamp: now - 3600 * 1000,
		deviceId: "thinkpad-x1",
		deviceName: "ThinkPad 便携本",
		appName: "Zen Browser",
		windowTitle: "GitHub",
		status: ActivityStatus.OFFLINE,
		offline: true,
		osInfo: "Linux / Sway",
		idleSeconds: 3600,
		metadata: {},
	};

	const res4 = formatActivitySentence(offlineDev, now, "zh");
	assert.equal(res4.statusType, "offline");
	assert.equal(res4.sentence, "最后在使用: Zen Browser");
});

test("RelativeTime - formatDateTime and formatOfflineTime formatting", () => {
	const now = 1773190000000;
	// 2026-03-11T...
	const dtStr = formatDateTime(now);
	assert.match(dtStr, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

	const offlineStr = formatOfflineTime(now - 3600 * 1000, now, "zh");
	assert.match(
		offlineStr,
		/^最后活跃时间: \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(1小时前\)$/,
	);

	const offlineStrEn = formatOfflineTime(now - 3600 * 1000, now, "en");
	assert.match(
		offlineStrEn,
		/^Last active: \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(1h ago\)$/,
	);
});
