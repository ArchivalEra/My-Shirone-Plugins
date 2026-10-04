import test from "node:test";
import assert from "node:assert/strict";

import {
	list,
	selectDiscovered,
	serializeInventory,
} from "../dist/index.js";

function makeAdapter({ factsByName, dirs = [], generatedAt = "2026-09-26T00:00:00.000Z" }) {
	const calls = [];
	return {
		calls,
		facts: async (name) => {
			calls.push(name);
			return factsByName[name] ?? null;
		},
		acceleratedDirs: async () => dirs,
		now: () => generatedAt,
	};
}

const LISTING = [
	{ name: "alpha", private: false },
	{ name: "beta", private: true },
	{ name: "ArchivalEra", private: false },
	{ name: "gamma-fork", private: false },
	{ name: "alpha", private: false },
];

test("selectDiscovered keeps every public repository and drops private ones", () => {
	assert.deepEqual(selectDiscovered(LISTING), [
		"alpha",
		"ArchivalEra",
		"gamma-fork",
	]);
});

test("selectDiscovered drops exactly the excluded names, and nothing else", () => {
	const names = selectDiscovered(LISTING, ["ArchivalEra"]);
	assert.deepEqual(names, ["alpha", "gamma-fork"]);
});

test("selectDiscovered drops public forks: 2026-10-04 规则变更（原「fork 故意保留」作废）", () => {
	// 旧规则：「fork 保留——账号公开的东西就是它有的」。后果：依赖 fork
	// （gl4es/OpenBLAS/…）以无图标 discovered 卡淹没展台。新规则：fork 一律不进。
	const names = selectDiscovered([
		{ name: "real-project", private: false },
		{ name: "dep-fork", private: false, fork: true },
	]);
	assert.deepEqual(names, ["real-project"]);
});

test("selectDiscovered drops repos flagged fork=true even when named like a project", () => {
	const names = selectDiscovered([
		{ name: "real-project", private: false },
		{ name: "dep-fork", private: false, fork: true },
	]);
	assert.deepEqual(names, ["real-project"]);
});

test("selectDiscovered normalizes and de-duplicates names, and ignores unusable ones", () => {
	const names = selectDiscovered([
		{ name: " alpha " },
		{ name: "alpha" },
		{ name: "alpha.git" },
		{ name: "" },
		{ name: "bad name" },
	]);
	assert.deepEqual(names, ["alpha"]);
});

test("selectDiscovered tolerates an empty listing", () => {
	assert.deepEqual(selectDiscovered([]), []);
});

test("list classifies an enabled, built mirror as ready", async () => {
	const adapter = makeAdapter({
		factsByName: {
			alpha: { hasPages: true, pushedAt: "2026-09-20T00:00:00Z", status: "built" },
		},
	});
	const inventory = await list(["alpha"], adapter);
	assert.equal(inventory.entries.length, 1);
	assert.equal(inventory.entries[0].pages, "ready");
	assert.equal(inventory.entries[0].status, "built");
	assert.equal(inventory.entries[0].pushedAt, "2026-09-20T00:00:00Z");
});

test("list carries the description and language through untouched", async () => {
	const adapter = makeAdapter({
		factsByName: {
			alpha: {
				hasPages: false,
				pushedAt: "",
				status: null,
				description: "我牛逼",
				language: "Shell",
				url: "https://github.com/ArchivalEra/alpha",
			},
		},
	});
	const inventory = await list(["alpha"], adapter);
	assert.equal(inventory.entries[0].description, "我牛逼");
	assert.equal(inventory.entries[0].language, "Shell");
	assert.equal(inventory.entries[0].url, "https://github.com/ArchivalEra/alpha");
});

test("list carries a repository icon data URI through, and defaults an absent one to empty", async () => {
	const withIcon = makeAdapter({
		factsByName: {
			alpha: {
				hasPages: false,
				pushedAt: "",
				status: null,
				icon: "data:image/svg+xml;base64,PHN2Zy8+",
			},
			beta: { hasPages: false, pushedAt: "", status: null },
		},
	});
	const inventory = await list(["alpha", "beta"], withIcon);
	assert.equal(inventory.entries[0].icon, "data:image/svg+xml;base64,PHN2Zy8+");
	assert.equal(inventory.entries[1].icon, "");
});

test("list reports an absent description and language as empty, not undefined", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: false, pushedAt: "", status: null } },
	});
	const inventory = await list(["alpha"], adapter);
	assert.equal(inventory.entries[0].description, "");
	assert.equal(inventory.entries[0].language, null);
	assert.equal(inventory.entries[0].url, "");
});

test("list classifies an enabled mirror whose build is not built as pending", async () => {
	for (const status of ["building", "errored"]) {
		const adapter = makeAdapter({
			factsByName: { alpha: { hasPages: true, pushedAt: "", status } },
		});
		const inventory = await list(["alpha"], adapter);
		assert.equal(inventory.entries[0].pages, "pending", `status=${status}`);
	}
});

test("list classifies a repository without Pages as absent", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: false, pushedAt: "", status: null } },
	});
	const inventory = await list(["alpha"], adapter);
	assert.equal(inventory.entries[0].pages, "absent");
});

test("list treats an enabled mirror with an unreadable build status as ready, not pending", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: true, pushedAt: "", status: null } },
	});
	const inventory = await list(["alpha"], adapter);
	assert.equal(inventory.entries[0].pages, "ready");
	assert.equal(inventory.entries[0].status, null);
});

test("list omits a repository whose facts could not be read instead of guessing", async () => {
	const adapter = makeAdapter({
		factsByName: {
			alpha: { hasPages: true, pushedAt: "", status: "built" },
		},
	});
	const inventory = await list(["alpha", "ghost"], adapter);
	assert.deepEqual(
		inventory.entries.map((entry) => entry.name),
		["alpha"],
	);
});

test("list marks a repository accelerated when its name is in the mirror tree", async () => {
	const adapter = makeAdapter({
		factsByName: {
			alpha: { hasPages: false, pushedAt: "", status: null },
			beta: { hasPages: true, pushedAt: "", status: "built" },
		},
		dirs: ["beta"],
	});
	const inventory = await list(["alpha", "beta"], adapter);
	assert.equal(inventory.entries[0].accelerated, false);
	assert.equal(inventory.entries[1].accelerated, true);
});

test("list keeps mirror-tree orphans in acceleratedDirs so they can be spotted", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: false, pushedAt: "", status: null } },
		dirs: ["beta-legacy", "alpha"],
	});
	const inventory = await list(["alpha"], adapter);
	assert.deepEqual(inventory.acceleratedDirs, ["alpha", "beta-legacy"]);
	assert.deepEqual(
		inventory.entries.map((entry) => entry.name),
		["alpha"],
	);
});

test("list follows the order it is given, not the adapter's response order", async () => {
	const adapter = makeAdapter({
		factsByName: {
			zeta: { hasPages: false, pushedAt: "", status: null },
			alpha: { hasPages: false, pushedAt: "", status: null },
		},
	});
	const inventory = await list(["zeta", "alpha"], adapter);
	assert.deepEqual(
		inventory.entries.map((entry) => entry.name),
		["zeta", "alpha"],
	);
});

test("list normalizes its input, so each name is read once", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: false, pushedAt: "", status: null } },
	});
	await list([" alpha ", "alpha", "alpha.git", "", "  "], adapter);
	assert.deepEqual(adapter.calls, ["alpha"]);
});

test("list stamps the inventory with the injected clock", async () => {
	const adapter = makeAdapter({
		factsByName: {},
		generatedAt: "2026-01-02T03:04:05.000Z",
	});
	const inventory = await list([], adapter);
	assert.equal(inventory.generatedAt, "2026-01-02T03:04:05.000Z");
	assert.deepEqual(inventory.entries, []);
});

test("serializeInventory emits Biome-shaped JSON, not JSON.stringify's shape", async () => {
	const adapter = makeAdapter({
		factsByName: {
			alpha: { hasPages: true, pushedAt: "2026-01-01T00:00:00Z", status: "built" },
		},
		dirs: ["beta", "alpha"],
	});
	const text = serializeInventory(await list(["alpha"], adapter));

	assert.ok(text.startsWith("{\n\t"), "top-level object is expanded with tab indent");
	assert.ok(
		text.includes('\t"acceleratedDirs": ["alpha", "beta"],'),
		"a short scalar array collapses onto one line",
	);
	assert.ok(
		text.includes('\n\t"entries": [\n\t\t{\n'),
		"objects stay expanded rather than collapsing",
	);
	assert.ok(text.endsWith("}\n"), "trailing newline");
	assert.equal(JSON.parse(text).entries[0].name, "alpha");
});
