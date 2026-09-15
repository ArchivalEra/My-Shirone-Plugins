import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { rehypeDynamicSvg } from "../dist/index.js";

test("rehypeDynamicSvg - leaves normal images untouched", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "img",
				properties: {
					src: "/assets/banner.png",
					alt: "Banner",
				},
				children: [],
			},
			{
				type: "element",
				tagName: "img",
				properties: {
					src: "/assets/vector.svg",
					alt: "Vector",
				},
				children: [],
			},
		],
	};

	const plugin = rehypeDynamicSvg();
	plugin(tree, { path: "/workspace/post.md" });

	assert.equal(tree.children.length, 2);
	assert.equal(tree.children[0].tagName, "img");
	assert.equal(tree.children[1].tagName, "img");
});

test("rehypeDynamicSvg - inlines SVG marked with #dynamic", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dyn-svg-test-"));
	const svgFile = path.join(tmpDir, "diagram.svg");
	fs.writeFileSync(
		svgFile,
		`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
			<circle cx="50" cy="50" r="40" fill="var(--primary)" />
		</svg>`,
	);

	const tree = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "img",
				properties: {
					src: `${svgFile}#dynamic`,
					alt: "Architecture Diagram",
					className: ["custom-class"],
				},
				children: [],
			},
		],
	};

	const plugin = rehypeDynamicSvg();
	plugin(tree, { path: path.join(tmpDir, "test.md") });

	assert.equal(tree.children.length, 1);
	const inlined = tree.children[0];
	assert.equal(inlined.tagName, "svg");
	assert.equal(inlined.properties.role, "img");
	assert.equal(inlined.properties["aria-label"], "Architecture Diagram");
	assert.equal(inlined.properties["data-no-enhance"], "true");
	assert.ok(inlined.properties.className.includes("dynamic-svg"));
	assert.ok(inlined.properties.className.includes("custom-class"));

	// Cleanup
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("rehypeDynamicSvg - graceful fallback when SVG file is missing", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "img",
				properties: {
					src: "/non-existent/file.svg#dynamic",
					alt: "Missing",
				},
				children: [],
			},
		],
	};

	const plugin = rehypeDynamicSvg();
	plugin(tree, { path: "/workspace/test.md" });

	assert.equal(tree.children.length, 1);
	assert.equal(tree.children[0].tagName, "img");
	assert.equal(tree.children[0].properties.src, "/non-existent/file.svg#dynamic");
});

test("rehypeDynamicSvg - Pretext linkage converts text into tspans", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dyn-svg-pretext-"));
	const svgFile = path.join(tmpDir, "pretext-diagram.svg");
	fs.writeFileSync(
		svgFile,
		`<svg viewBox="0 0 500 200" xmlns="http://www.w3.org/2000/svg">
			<text x="20" y="40" data-pretext="true" data-pretext-max-width="120" data-pretext-line-height="20">
				First long phrase second long phrase third
			</text>
		</svg>`,
	);

	const tree = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "img",
				properties: {
					src: `${svgFile}#dynamic`,
					alt: "Pretext Test",
				},
				children: [],
			},
		],
	};

	const plugin = rehypeDynamicSvg({
		pretext: {
			enabled: true,
		},
	});
	plugin(tree, { path: path.join(tmpDir, "test.md") });

	const inlined = tree.children[0];
	assert.equal(inlined.tagName, "svg");

	const textNode = inlined.children.find((c) => c.tagName === "text");
	assert.ok(textNode);
	assert.ok(textNode.children.length > 1);
	assert.equal(textNode.children[0].tagName, "tspan");

	// Cleanup
	fs.rmSync(tmpDir, { recursive: true, force: true });
});
