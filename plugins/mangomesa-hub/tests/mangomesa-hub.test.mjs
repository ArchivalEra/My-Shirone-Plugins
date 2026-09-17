import assert from "node:assert/strict";
import test from "node:test";
import {
	MANGOMESA_STATION_LINKS,
	getStationLink,
} from "../dist/index.js";

test("all station links have valid prefixes and keys", () => {
	assert.ok(MANGOMESA_STATION_LINKS.length >= 4);

	const compass = getStationLink("compass");
	assert.ok(compass);
	assert.equal(compass.href, "/MangoMesa/compass/");

	const projects = getStationLink("projects");
	assert.ok(projects);
	assert.equal(projects.href, "/MangoMesa/projects/");

	const bahnhof = getStationLink("bahnhof");
	assert.ok(bahnhof);
	assert.equal(bahnhof.href, "/Bahnhof/");

	const repoMirrors = getStationLink("repo-mirrors");
	assert.ok(repoMirrors);
	assert.ok(repoMirrors.href.startsWith("/repo/"));
});
