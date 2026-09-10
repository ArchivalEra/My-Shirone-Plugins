import assert from "node:assert/strict";
import test from "node:test";
import { shouldSkipResize, WIDTH_EPSILON_PX } from "../dist/runtime/resize-guard.js";

test("shouldSkipResize - correctly guards against self-induced height-only resizes", () => {
	// 1. Initial measurement (prevWidth is undefined): must not skip
	assert.equal(shouldSkipResize(undefined, 800), false);

	// 2. Width unchanged (identical clientWidth): must skip
	assert.equal(shouldSkipResize(800, 800), true);

	// 3. Subpixel or microscopic width delta (< 1px): must skip
	assert.equal(shouldSkipResize(800, 800.4), true);
	assert.equal(shouldSkipResize(800, 799.6), true);

	// 4. Exact epsilon boundary test
	assert.equal(shouldSkipResize(800, 800 + WIDTH_EPSILON_PX - 0.001), true);
	assert.equal(shouldSkipResize(800, 800 + WIDTH_EPSILON_PX), false);

	// 5. Genuine horizontal resize (>= 1px delta): must not skip
	assert.equal(shouldSkipResize(800, 802), false);
	assert.equal(shouldSkipResize(800, 795), false);
	assert.equal(shouldSkipResize(800, 1200), false);

	// 6. Custom epsilon threshold support
	assert.equal(shouldSkipResize(800, 804, 5), true);
	assert.equal(shouldSkipResize(800, 806, 5), false);
});
