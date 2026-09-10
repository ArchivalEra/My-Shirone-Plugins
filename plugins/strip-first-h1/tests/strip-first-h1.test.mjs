import test from "node:test";
import assert from "node:assert/strict";
import { remarkStripFirstH1, stripFirstH1 } from "../dist/index.js";

test("remarkStripFirstH1 - strips first H1 at document start", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "第一篇" }],
			},
			{
				type: "paragraph",
				children: [{ type: "text", value: "这是正文第一段。" }],
			},
			{
				type: "heading",
				depth: 2,
				children: [{ type: "text", value: "1. 简介" }],
			},
		],
	};

	const plugin = remarkStripFirstH1();
	plugin(tree);

	assert.equal(tree.children.length, 2);
	assert.equal(tree.children[0].type, "paragraph");
	assert.equal(tree.children[1].type, "heading");
	assert.equal(tree.children[1].depth, 2);
	assert.equal(tree.children[1].children[0].value, "1. 简介");
});

test("remarkStripFirstH1 - strips first H1 even when preceded by paragraphs/quotes", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "blockquote",
				children: [{ type: "text", value: "引言摘要" }],
			},
			{
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "文章大标题" }],
			},
			{
				type: "paragraph",
				children: [{ type: "text", value: "正文内容" }],
			},
		],
	};

	const plugin = remarkStripFirstH1();
	plugin(tree);

	assert.equal(tree.children.length, 2);
	assert.equal(tree.children[0].type, "blockquote");
	assert.equal(tree.children[1].type, "paragraph");
});

test("remarkStripFirstH1 - does NOT strip when first heading is H2", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "heading",
				depth: 2,
				children: [{ type: "text", value: "第一节" }],
			},
			{
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "后续的标题" }],
			},
		],
	};

	const plugin = remarkStripFirstH1();
	plugin(tree);

	// First heading was H2, so nothing should be stripped
	assert.equal(tree.children.length, 2);
	assert.equal(tree.children[0].depth, 2);
	assert.equal(tree.children[1].depth, 1);
});

test("remarkStripFirstH1 - matchTitleOnly option matches title cleanly", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "折腾 Shirone 做博客的这两天" }],
			},
			{
				type: "paragraph",
				children: [{ type: "text", value: "正文" }],
			},
		],
	};

	const fileMatching = {
		data: {
			astro: {
				frontmatter: {
					title: "折腾 Shirone 做博客的这两天",
				},
			},
		},
	};

	const plugin = remarkStripFirstH1({ matchTitleOnly: true });
	plugin(tree, fileMatching);

	assert.equal(tree.children.length, 1);
	assert.equal(tree.children[0].type, "paragraph");
});

test("remarkStripFirstH1 - matchTitleOnly preserves heading if title differs", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "这是正文内部的特别一级章节" }],
			},
		],
	};

	const fileDifferent = {
		data: {
			astro: {
				frontmatter: {
					title: "完全不同的文章标题",
				},
			},
		},
	};

	const plugin = remarkStripFirstH1({ matchTitleOnly: true });
	plugin(tree, fileDifferent);

	assert.equal(tree.children.length, 1);
	assert.equal(tree.children[0].depth, 1);
});

test("remarkStripFirstH1 - handles empty or heading-less documents gracefully", () => {
	const emptyTree = { type: "root", children: [] };
	const plugin = remarkStripFirstH1();
	plugin(emptyTree);
	assert.equal(emptyTree.children.length, 0);

	const noHeadings = {
		type: "root",
		children: [
			{ type: "paragraph", children: [{ type: "text", value: "纯文本" }] },
		],
	};
	plugin(noHeadings);
	assert.equal(noHeadings.children.length, 1);
});

test("stripFirstH1 - integration hook updates astro markdown config", () => {
	const integration = stripFirstH1({ matchTitleOnly: false });
	assert.equal(integration.name, "@shirone-plugins/strip-first-h1");

	let updatedConfig = null;
	integration.hooks["astro:config:setup"]({
		updateConfig: (cfg) => {
			updatedConfig = cfg;
		},
	});

	assert.ok(updatedConfig?.markdown?.remarkPlugins);
	assert.equal(updatedConfig.markdown.remarkPlugins.length, 1);
	assert.equal(typeof updatedConfig.markdown.remarkPlugins[0][0], "function");
});
