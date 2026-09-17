import assert from "node:assert/strict";
import test from "node:test";
import {
	getDomesticRepoUrl,
	getOriginalGitHubPagesUrl,
	rewriteRepoHtml,
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

test("rewriteRepoHtml injects base tag into head", () => {
	const sampleHtml = `<!DOCTYPE html><html><head><title>My Docs</title></head><body><h1>Hello</h1></body></html>`;
	const rewritten = rewriteRepoHtml(sampleHtml, "Shirone-personalized");

	assert.ok(rewritten.includes('<base href="/repo/Shirone-personalized/">'));
	assert.ok(rewritten.includes("<title>My Docs</title>"));
});

test("rewriteRepoHtml handles head tag with attributes", () => {
	const sampleHtml = `<!DOCTYPE html><html><head lang="zh-CN"><meta charset="utf-8"></head><body></body></html>`;
	const rewritten = rewriteRepoHtml(sampleHtml, "My-Shirone-Plugins");

	assert.ok(rewritten.includes('<base href="/repo/My-Shirone-Plugins/">'));
});

test("rewriteRepoHtml replaces absolute links starting with /repoName/", () => {
	const sampleHtml = `
		<head></head>
		<body>
			<a href="/Shirone-personalized/docs/">Docs</a>
			<img src="/Shirone-personalized/logo.png" />
			<script src="/Shirone-personalized/assets/app.js"></script>
		</body>
	`;
	const rewritten = rewriteRepoHtml(sampleHtml, "Shirone-personalized");

	assert.ok(
		rewritten.includes('href="/repo/Shirone-personalized/docs/"'),
		"href should be rewritten",
	);
	assert.ok(
		rewritten.includes('src="/repo/Shirone-personalized/logo.png"'),
		"img src should be rewritten",
	);
	assert.ok(
		rewritten.includes('src="/repo/Shirone-personalized/assets/app.js"'),
		"script src should be rewritten",
	);
});

test("rewriteRepoHtml leaves unrelated paths intact", () => {
	const sampleHtml = `
		<head></head>
		<body>
			<a href="https://github.com/ArchivalEra">GitHub</a>
			<a href="/other/path">Other</a>
		</body>
	`;
	const rewritten = rewriteRepoHtml(sampleHtml, "Shirone-personalized");
	assert.ok(rewritten.includes('href="https://github.com/ArchivalEra"'));
	assert.ok(rewritten.includes('href="/other/path"'));
});
