import test from "node:test";
import assert from "node:assert/strict";

import {
	list,
	parseWhitelist,
	serializeInventory,
} from "../dist/index.js";

const PROJECTS_MODULE = `
export const projectsData: ProjectItem[] = [
	{
		key: "alpha",
		title: "Alpha",
		repository: "https://github.com/ArchivalEra/alpha",
	},
	{
		key: "beta",
		title: "Beta",
		repository: "https://github.com/ArchivalEra/beta.git",
	},
	{
		key: "upstream",
		title: "Upstream fork",
		repository: "https://github.com/SomeoneElse/not-mine",
	},
	{
		key: "elsewhere",
		title: "Elsewhere",
		repository: "https://gitlab.com/ArchivalEra/elsewhere",
	},
	{
		key: "dupe",
		title: "Alpha again",
		repository: "https://github.com/ArchivalEra/alpha/",
	},
	{
		key: "norepo",
		title: "No repository field",
	},
];
`;

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

test("parseWhitelist keeps only the given owner's repositories, in order, deduped", () => {
	assert.deepEqual(parseWhitelist(PROJECTS_MODULE, "ArchivalEra"), [
		"alpha",
		"beta",
	]);
});

test("parseWhitelist drops forks, other hosts and entries without a repository field", () => {
	const names = parseWhitelist(PROJECTS_MODULE, "ArchivalEra");
	assert.ok(!names.includes("not-mine"));
	assert.ok(!names.includes("elsewhere"));
	assert.equal(names.length, 2);
});

test("parseWhitelist normalizes a trailing slash and a .git suffix to one name", () => {
	const names = parseWhitelist(PROJECTS_MODULE, "ArchivalEra");
	assert.equal(names.filter((name) => name === "alpha").length, 1);
	assert.ok(names.includes("beta"));
});

test("parseWhitelist matches the owner case-insensitively and returns nothing without an owner", () => {
	assert.deepEqual(parseWhitelist(PROJECTS_MODULE, "archivalera"), [
		"alpha",
		"beta",
	]);
	assert.deepEqual(parseWhitelist(PROJECTS_MODULE, ""), []);
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

test("list follows the whitelist order, not the adapter's response order", async () => {
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

test("list normalizes the whitelist before reading facts, so each name is read once", async () => {
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

test("serializeInventory emits indented JSON with a trailing newline", async () => {
	const adapter = makeAdapter({
		factsByName: { alpha: { hasPages: true, pushedAt: "", status: "built" } },
	});
	const text = serializeInventory(await list(["alpha"], adapter));
	assert.ok(text.endsWith("}\n"));
	assert.deepEqual(JSON.parse(text).entries[0].name, "alpha");
});
