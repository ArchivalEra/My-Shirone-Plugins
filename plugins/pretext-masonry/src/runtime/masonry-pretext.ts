/**
 * Zero-reflow Pretext Masonry runtime.
 * Pure arithmetic waterfall layout powered by @chenglou/pretext.
 * Drop-in replacement for Shirone's src/utils/masonry.ts.
 */

import { DEFAULT_GEOMETRY_TOKENS, type CardGeometryTokens } from "../types.js";
import { predictCardMetrics } from "./card-predictor.js";
import { packMasonryDomFallback } from "./fallback.js";
import { onFontsReady } from "./font-resolver.js";
import { shouldSkipResize } from "./resize-guard.js";

const tokens: CardGeometryTokens = DEFAULT_GEOMETRY_TOKENS;

// Tracks the last clientWidth measured on each container to guard against self-induced resize loops
const lastContainerWidth = new WeakMap<HTMLElement, number>();

/**
 * Checks if the browser supports OffscreenCanvas or DOM Canvas for Pretext.
 */
function isPretextSupported(): boolean {
	return (
		(typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined") &&
		typeof Intl !== "undefined" &&
		"Segmenter" in Intl
	);
}

/**
 * Packs cards into a shortest-column masonry waterfall layout.
 * Pure arithmetic with ZERO forced DOM reflows.
 *
 * @param container The grid container HTMLElement
 */
export function packMasonry(container: HTMLElement): void {
	const cards = Array.from(container.children) as HTMLElement[];
	if (cards.length === 0) return;

	// Reset inline positioning when requested
	const computedStyle = getComputedStyle(container);
	const columnTracks = computedStyle.gridTemplateColumns.split(" ").filter(Boolean);
	const colCount = columnTracks.length;

	if (colCount <= 1) {
		for (const card of cards) {
			card.style.gridColumnStart = "";
			card.style.gridColumnEnd = "";
			card.style.gridRowEnd = "";
		}
		return;
	}

	// Resolve the actual column width (px)
	const resolvedColWidth = Number.parseFloat(columnTracks[0] ?? "");
	const colWidth =
		Number.isFinite(resolvedColWidth) && resolvedColWidth > 0
			? resolvedColWidth
			: (container.clientWidth - (colCount - 1) * tokens.colGap) / colCount;

	// Record container clientWidth for the resize guard
	lastContainerWidth.set(container, container.clientWidth);

	// Check if this container contains any Shirone M3 post cards
	const hasPostCards = cards.some((card) => card.classList.contains("m3-blog-postcard"));

	// If no post cards are present (e.g. DeviceSection, ProjectSection, custom grids),
	// or Pretext engine is unavailable, use universal batched DOM fallback measurement.
	if (!hasPostCards || !isPretextSupported()) {
		packMasonryDomFallback(container, colCount, tokens);
		return;
	}

	try {
		// For any non-postcard elements without explicit data-masonry-height,
		// temporarily clear their gridRowEnd in pass 1 so their natural offsetHeight can be read accurately
		for (const card of cards) {
			if (
				!card.classList.contains("m3-blog-postcard") &&
				!Number.isFinite(Number.parseFloat(card.dataset.masonryHeight ?? ""))
			) {
				card.style.gridRowEnd = "";
			}
		}

		// 1. PURE ARITHMETIC: Compute card heights & spans via Pretext
		const measurements = cards.map((card) => {
			const metrics = predictCardMetrics(card, colWidth, tokens);
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
			return { card, height: metrics.totalHeight, span, rowSpan: metrics.rowSpan };
		});

		// 2. PURE CALCULATION: Greedy shortest-column placement
		const columnHeights = new Array<number>(colCount).fill(0);
		const plans: Array<{ card: HTMLElement; colStart: string; colEnd: string; rowEnd: string }> =
			[];

		for (const { card, height, span, rowSpan } of measurements) {
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
				rowEnd: `span ${rowSpan}`,
			});
			for (let col = shortest; col < shortest + span; col++) {
				columnHeights[col] = shortestHeight + height + tokens.rowGap;
			}
		}

		// 3. SINGLE RAF WRITE PASS: Apply positioning to all cards simultaneously
		for (const plan of plans) {
			plan.card.style.gridColumnStart = plan.colStart;
			plan.card.style.gridColumnEnd = plan.colEnd;
			plan.card.style.gridRowEnd = plan.rowEnd;
		}
	} catch {
		// Graceful degradation on error
		packMasonryDomFallback(container, colCount, tokens);
	}
}

/**
 * Attaches the masonry lifecycle:
 * 1. Initial packing pass.
 * 2. Webfont readiness gate (re-measures once web fonts finish loading).
 * 3. Width-stable ResizeObserver (ignores self-induced height changes).
 *
 * @param container The grid container HTMLElement
 */
export function setupMasonry(container: HTMLElement): void {
	packMasonry(container);

	// Re-run once web fonts are fully ready (eliminates fallback-font measurement artifacts)
	onFontsReady(() => {
		if (container.isConnected) {
			packMasonry(container);
		}
	});

	if (typeof ResizeObserver === "undefined") return;

	let frameId: number | null = null;
	const observer = new ResizeObserver(() => {
		// Drop self-induced height-only resize events
		if (shouldSkipResize(lastContainerWidth.get(container), container.clientWidth)) {
			return;
		}

		if (frameId !== null) cancelAnimationFrame(frameId);
		frameId = requestAnimationFrame(() => {
			frameId = null;
			if (container.isConnected) {
				packMasonry(container);
			}
		});
	});

	observer.observe(container);
}
