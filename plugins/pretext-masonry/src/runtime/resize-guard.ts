/**
 * CSS feedback-loop guard.
 *
 * Pretext's layout calculation is a pure function of (text, font, width):
 * container width is its primary geometry input. Setting `grid-row-end: span N`,
 * however, alters the container's height. A naive ResizeObserver fires for ANY
 * size change — including the self-induced height change caused by the card
 * height assignment itself.
 *
 * This guard drops resize notifications where the measurable container width
 * has not changed by at least `WIDTH_EPSILON_PX`. Genuine window/sidebar resizes
 * fall through and re-compute instantaneously.
 */

/** Width deltas smaller than this (px) are treated as no change. */
export const WIDTH_EPSILON_PX = 1;

/**
 * Returns true if a resize notification should be skipped because the container's
 * width has not changed significantly since the last layout pass.
 *
 * @param prevWidth The container clientWidth during the previous layout pass, or undefined if unmeasured.
 * @param currWidth The container clientWidth during the current event.
 * @param epsilon Delta threshold in px. Default: 1.
 */
export function shouldSkipResize(
	prevWidth: number | undefined,
	currWidth: number,
	epsilon: number = WIDTH_EPSILON_PX,
): boolean {
	if (prevWidth === undefined) return false;
	return Math.abs(currWidth - prevWidth) < epsilon;
}
