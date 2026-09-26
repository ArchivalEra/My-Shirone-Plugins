import assert from "node:assert/strict";
import test from "node:test";
import {
	getDomesticRepoUrl,
	getOriginalGitHubPagesUrl,
	rewriteForPrefix,
} from "../dist/index.js";

test("URL generation matches specification", () => {
	const domestic = getDomesticRepoUrl("Shirone-personalized");
	assert.equal(domestic, "https://isui.ren/repo/Shirone-personalized/");

	const original = getOriginalGitHubPagesUrl("Shirone-personalized");
	assert.equal(
		original,
		"https://archivalera.github.io/Shirone-personalized/",
	);
});

test("rewriteForPrefix injects a base tag into a bare head", () => {
	const html = `<!DOCTYPE html><html><head><title>My Docs</title></head><body></body></html>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "Shirone-personalized",
		prefix: "/repo",
	});

	assert.ok(rewritten.includes('<base href="/repo/Shirone-personalized/">'));
	assert.ok(rewritten.includes("<title>My Docs</title>"));
});

test("rewriteForPrefix handles a head tag carrying attributes", () => {
	const html = `<!DOCTYPE html><html><head lang="zh-CN"><meta charset="utf-8"></head><body></body></html>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "My-Shirone-Plugins",
		prefix: "/repo",
	});

	assert.ok(rewritten.includes('<base href="/repo/My-Shirone-Plugins/">'));
});

test("rewriteForPrefix replaces an existing base instead of adding a second one", () => {
	const html = `<head><base href="/"><title>t</title></head>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "isui.ren-Bahnhof",
		prefix: "/repo",
	});

	assert.equal(
		rewritten.match(/<base\s/gi).length,
		1,
		"two base tags means a browser honours the first and the rewrite is dead weight",
	);
	assert.ok(rewritten.includes('<base href="/repo/isui.ren-Bahnhof/">'));
	assert.ok(!rewritten.includes('<base href="/">'));
});

test("rewriteForPrefix rewrites root-absolute references into the repo's own subpath", () => {
	const html = `<head></head><body>
		<a href="/isui.ren-Bahnhof/departures/">Departures</a>
		<img src="/isui.ren-Bahnhof/logo.png" />
		<script src="/isui.ren-Bahnhof/assets/app.js"></script>
	</body>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "isui.ren-Bahnhof",
		prefix: "/repo",
	});

	assert.ok(rewritten.includes('href="/repo/isui.ren-Bahnhof/departures/"'));
	assert.ok(rewritten.includes('src="/repo/isui.ren-Bahnhof/logo.png"'));
	assert.ok(rewritten.includes('src="/repo/isui.ren-Bahnhof/assets/app.js"'));
});

test("rewriteForPrefix treats a dotted repo name literally, not as a pattern", () => {
	const html = `<head></head><body>
		<a href="/isui.ren-heart/">real</a>
		<a href="/isuiXren-heart/">decoy</a>
	</body>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "isui.ren-heart",
		prefix: "/repo",
	});

	assert.ok(
		rewritten.includes('href="/repo/isui.ren-heart/"'),
		"the repo's own path is rewritten",
	);
	assert.ok(
		rewritten.includes('href="/isuiXren-heart/"'),
		"an unescaped dot would rewrite this unrelated path too",
	);
});

test("rewriteForPrefix takes the prefix as a parameter", () => {
	const html = `<head></head><body><a href="/demo/x">x</a></body>`;
	const rewritten = rewriteForPrefix(html, { repo: "demo", prefix: "/mirror/" });

	assert.ok(rewritten.includes('<base href="/mirror/demo/">'));
	assert.ok(rewritten.includes('href="/mirror/demo/x"'));
});

test("rewriteForPrefix leaves foreign and external references intact", () => {
	const html = `<head></head><body>
		<a href="https://github.com/ArchivalEra">GitHub</a>
		<a href="/other/path">Other</a>
		<img src="https://cdn.example.com/x.png" />
	</body>`;
	const rewritten = rewriteForPrefix(html, {
		repo: "Shirone-personalized",
		prefix: "/repo",
	});

	assert.ok(rewritten.includes('href="https://github.com/ArchivalEra"'));
	assert.ok(rewritten.includes('href="/other/path"'));
	assert.ok(rewritten.includes('src="https://cdn.example.com/x.png"'));
});

test("rewriteForPrefix returns non-string input untouched", () => {
	assert.equal(rewriteForPrefix(undefined, { repo: "x", prefix: "/repo" }), undefined);
	assert.equal(rewriteForPrefix("", { repo: "x", prefix: "/repo" }), "");
});
