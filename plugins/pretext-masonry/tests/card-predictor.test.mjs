import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { MockHTMLElement } from "./test-env.js";
import {
	extractCleanText,
	predictCardMetrics,
} from "../dist/runtime/card-predictor.js";
import { DEFAULT_GEOMETRY_TOKENS } from "../dist/runtime/index.js";

test("extractCleanText - extracts clean title text ignoring icons and hidden nodes", () => {
	const titleEl = new MockHTMLElement("a");
	titleEl.classList.add("m3-blog-postcard__title");

	const accentBar = new MockHTMLElement("span");
	accentBar.classList.add("m3-accent-bar");
	accentBar.appendTextNode("||");
	titleEl.appendChild(accentBar);

	// The direct text node containing the article title
	titleEl.appendTextNode("Hello Pretext Waterfall");

	const arrowSvg = new MockHTMLElement("svg");
	arrowSvg.classList.add("m3-blog-postcard__arrow");
	titleEl.appendChild(arrowSvg);

	const extracted = extractCleanText(titleEl);
	assert.equal(extracted, "Hello Pretext Waterfall");
});

test("predictCardMetrics - computes deterministic card metrics with cover", () => {
	const card = new MockHTMLElement("article");
	card.classList.add("m3-blog-postcard", "m3-blog-postcard--cover");

	const titleEl = new MockHTMLElement("a");
	titleEl.classList.add("m3-blog-postcard__title");
	titleEl.appendTextNode("Short Title");
	card.appendChild(titleEl);

	const descEl = new MockHTMLElement("p");
	descEl.classList.add("m3-blog-postcard__desc");
	descEl.appendTextNode("Short summary."); // 14 chars, fits in 1 line
	card.appendChild(descEl);

	const metaEl = new MockHTMLElement("div");
	metaEl.classList.add("m3-blog-postcard__meta");
	card.appendChild(metaEl);

	const colWidth = 320;
	const tokens = DEFAULT_GEOMETRY_TOKENS;

	const metrics = predictCardMetrics(card, colWidth, tokens);

	// Cover width = 320 - 32 = 288px
	// Cover height = round(288 * 9 / 16) = 162px
	// Cover block = 162 + 16 (margin) = 178px
	// Body padding = 40px
	// Title: 1 line = 28.6px
	// Desc: 1 line = 12 + 22.4 = 34.4px
	// Meta: 40px
	// Expected total = 178 + 40 + 28.6 + 34.4 + 40 = 321px
	assert.ok(metrics.totalHeight > 300 && metrics.totalHeight < 360);
	assert.equal(metrics.titleLines, 1);
	assert.equal(metrics.descLines, 1);

	// Span = Math.ceil((totalHeight + 16) / 8)
	const expectedSpan = Math.ceil((metrics.totalHeight + 16) / 8);
	assert.equal(metrics.rowSpan, expectedSpan);
});

test("predictCardMetrics - clamps description to max 2 lines", () => {
	const card = new MockHTMLElement("article");
	card.classList.add("m3-blog-postcard");

	const titleEl = new MockHTMLElement("a");
	titleEl.classList.add("m3-blog-postcard__title");
	titleEl.appendTextNode("Testing Multiline Description Clamping");
	card.appendChild(titleEl);

	// Very long description that would wrap to 5+ lines
	const descEl = new MockHTMLElement("p");
	descEl.classList.add("m3-blog-postcard__desc");
	descEl.appendTextNode(
		"This is an extremely long post description that goes on and on and explains many intricate details about layout engines, DOM reflows, typography systems, web standards, browser rendering pipelines, and font measurement techniques.",
	);
	card.appendChild(descEl);

	const colWidth = 260;
	const tokens = DEFAULT_GEOMETRY_TOKENS;

	const metrics = predictCardMetrics(card, colWidth, tokens);

	// Must be clamped to tokens.descMaxLines (2)
	assert.equal(metrics.descLines, 2);
});

test("predictCardMetrics - honors explicit data-masonry-height override", () => {
	const card = new MockHTMLElement("article");
	card.setAttribute("data-masonry-height", "400");

	const tokens = DEFAULT_GEOMETRY_TOKENS;
	const metrics = predictCardMetrics(card, 320, tokens);

	assert.equal(metrics.totalHeight, 400);
	// (400 + 16) / 8 = 52
	assert.equal(metrics.rowSpan, 52);
});
