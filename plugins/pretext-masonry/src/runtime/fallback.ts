import type { CardGeometryTokens } from "../types.js";

/**
 * Batched single-pass DOM fallback layout.
 * Used when Pretext / Canvas is unavailable or for unrecognized arbitrary elements.
 * Separates ALL reads from ALL writes to prevent interleaved layout thrashing.
 */
export function packMasonryDomFallback(
	container: HTMLElement,
	colCount: number,
	tokens: CardGeometryTokens,
): void {
	const cards = Array.from(container.children) as HTMLElement[];
	// Reset inline positioning first so offsetHeight reflects the unconstrained natural height
	for (const card of cards) {
		card.style.gridColumnStart = "";
		card.style.gridColumnEnd = "";
		card.style.gridRowEnd = "";
	}

	// BATCH READS: Query all heights and spans in one pass without writing styles
	const measurements = cards.map((card) => {
		const height = card.offsetHeight;
		const gridColumnEnd = getComputedStyle(card).gridColumnEnd;
		const spanMatch = gridColumnEnd.match(/span\s+(\d+)/);
		const dataSpan = Number.parseInt(card.dataset.masonrySpan ?? "", 10);
		const span = Math.min(
			Math.max(
				Number.isFinite(dataSpan)
					? dataSpan
					: spanMatch
						? Number.parseInt(spanMatch[1], 10)
						: 1,
				1,
			),
			colCount,
		);
		return { card, height, span };
	});

	// PURE CALCULATION: Greedy shortest-column placement
	const columnHeights = new Array<number>(colCount).fill(0);
	const plans: Array<{ card: HTMLElement; colStart: string; colEnd: string; rowEnd: string }> = [];

	for (const { card, height, span } of measurements) {
		let shortest = 0;
		let shortestHeight = Number.POSITIVE_INFINITY;
		for (let col = 0; col <= colCount - span; col++) {
			const candidateHeight = Math.max(...columnHeights.slice(col, col + span));
			if (candidateHeight < shortestHeight) {
				shortest = col;
				shortestHeight = candidateHeight;
			}
		}
		plans.push({
			card,
			colStart: String(shortest + 1),
			colEnd: `span ${span}`,
			rowEnd: `span ${Math.ceil((height + tokens.rowGap) / tokens.rowUnit)}`,
		});
		for (let col = shortest; col < shortest + span; col++) {
			columnHeights[col] = shortestHeight + height + tokens.rowGap;
		}
	}

	// BATCH WRITES: Write styles to all cards in a single uninterrupted pass
	for (const plan of plans) {
		plan.card.style.gridColumnStart = plan.colStart;
		plan.card.style.gridColumnEnd = plan.colEnd;
		plan.card.style.gridRowEnd = plan.rowEnd;
	}
}
