import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { MockHTMLElement } from "./test-env.js";
import { packMasonry } from "../dist/runtime/masonry-pretext.js";

function createMockCard(title, height = 300, span = 1) {
	const card = new MockHTMLElement("article");
	card.classList.add("m3-blog-postcard");
	card.setAttribute("data-title", title);
	card.setAttribute("data-masonry-height", String(height));
	if (span > 1) {
		card.setAttribute("data-masonry-span", String(span));
	}
	return card;
}

test("packMasonry - single column clears all positioning styles", () => {
	const container = new MockHTMLElement("div");
	container.dataset.testGridCols = "320px"; // 1 column

	const card1 = createMockCard("Post 1");
	card1.style.gridColumnStart = "1";
	card1.style.gridRowEnd = "span 10";
	container.appendChild(card1);

	packMasonry(container);

	assert.equal(card1.style.gridColumnStart, "");
	assert.equal(card1.style.gridColumnEnd, "");
	assert.equal(card1.style.gridRowEnd, "");
});

test("packMasonry - multi-column assigns shortest column greedy positions", () => {
	const container = new MockHTMLElement("div");
	container.dataset.testGridCols = "320px 320px"; // 2 columns

	// Card 1: height 300 -> span = ceil((300 + 16) / 8) = 40
	const card1 = createMockCard("Post 1", 300);
	// Card 2: height 200 -> span = ceil((200 + 16) / 8) = 27
	const card2 = createMockCard("Post 2", 200);
	// Card 3: height 150 -> span = ceil((150 + 16) / 8) = 21
	const card3 = createMockCard("Post 3", 150);

	container.appendChild(card1);
	container.appendChild(card2);
	container.appendChild(card3);

	packMasonry(container);

	// Card 1 placed in Col 1 (both cols 0 height at start)
	assert.equal(card1.style.gridColumnStart, "1");
	assert.equal(card1.style.gridColumnEnd, "span 1");
	assert.equal(card1.style.gridRowEnd, "span 40");

	// Card 2 placed in Col 2 (Col 2 has height 0, while Col 1 has height 300 + 16 = 316)
	assert.equal(card2.style.gridColumnStart, "2");
	assert.equal(card2.style.gridColumnEnd, "span 1");
	assert.equal(card2.style.gridRowEnd, "span 27");

	// Card 3 placed in Col 2 (Col 2 has height 216, while Col 1 has height 316)
	assert.equal(card3.style.gridColumnStart, "2");
	assert.equal(card3.style.gridColumnEnd, "span 1");
	assert.equal(card3.style.gridRowEnd, "span 21");
});

test("packMasonry - handles multi-column span cards", () => {
	const container = new MockHTMLElement("div");
	container.dataset.testGridCols = "320px 320px 320px"; // 3 columns

	// Card 1: 2-column wide card
	const card1 = createMockCard("Wide Banner", 200, 2);
	// Card 2: 1-column card
	const card2 = createMockCard("Normal Post", 150, 1);

	container.appendChild(card1);
	container.appendChild(card2);

	packMasonry(container);

	assert.equal(card1.style.gridColumnStart, "1");
	assert.equal(card1.style.gridColumnEnd, "span 2");
	assert.equal(card1.style.gridRowEnd, "span 27");

	// Next card placed in Col 3 (height 0 vs Col 1-2 height 216)
	assert.equal(card2.style.gridColumnStart, "3");
	assert.equal(card2.style.gridColumnEnd, "span 1");
});

test("packMasonry - non-postcard grid (DeviceCard / ProjectCard) uses natural DOM height with zero distortion", () => {
	const container = new MockHTMLElement("div");
	container.dataset.testGridCols = "320px 320px"; // 2 columns

	const deviceCard1 = new MockHTMLElement("article");
	deviceCard1.classList.add("device-card");
	deviceCard1.offsetHeight = 320;

	const deviceCard2 = new MockHTMLElement("article");
	deviceCard2.classList.add("device-card");
	deviceCard2.offsetHeight = 240;

	container.appendChild(deviceCard1);
	container.appendChild(deviceCard2);

	packMasonry(container);

	// deviceCard1: 320px -> span = ceil((320 + 16) / 8) = 42
	assert.equal(deviceCard1.style.gridColumnStart, "1");
	assert.equal(deviceCard1.style.gridRowEnd, "span 42");

	// deviceCard2: 240px -> span = ceil((240 + 16) / 8) = 32
	assert.equal(deviceCard2.style.gridColumnStart, "2");
	assert.equal(deviceCard2.style.gridRowEnd, "span 32");
});
