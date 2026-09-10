import { layout, prepare, type PreparedText } from "@chenglou/pretext";
import type { CardGeometryTokens } from "../types.js";
import { getDescTypography, getTitleTypography } from "./font-resolver.js";

// Cache PreparedText instances by text+font key to ensure prepare() runs once per unique text
const preparedCache = new Map<string, PreparedText>();

export function getOrCreatePrepared(text: string, font: string): PreparedText {
	const key = `${font}:::${text}`;
	let prepared = preparedCache.get(key);
	if (!prepared) {
		prepared = prepare(text, font, { wordBreak: "normal" });
		preparedCache.set(key, prepared);
	}
	return prepared;
}

export function clearPretextCache(): void {
	preparedCache.clear();
}

/**
 * Extracts pure text from an element's direct and nested text nodes,
 * ignoring SVG icons, badges, and hidden metadata.
 */
export function extractCleanText(element: Element | null): string {
	if (!element) return "";

	// If element has an explicit clean text attribute, prioritize it
	const attrText = element.getAttribute("data-title") ?? element.getAttribute("data-text");
	if (attrText) return attrText.trim();

	// Read direct text nodes first to avoid picking up SVG/badge texts
	const directText = Array.from(element.childNodes)
		.filter((n) => n.nodeType === 3 /* Node.TEXT_NODE */)
		.map((n) => n.textContent ?? "")
		.join("")
		.trim();

	if (directText.length > 0) return directText;

	// Fallback to textContent without SVGs
	const clone = element.cloneNode(true) as Element;
	clone.querySelectorAll("svg, [aria-hidden='true']").forEach((el) => el.remove());
	return clone.textContent?.trim() ?? "";
}

export interface PredictedCardMetrics {
	totalHeight: number;
	rowSpan: number;
	titleLines: number;
	descLines: number;
}

/**
 * Predicts the exact height and grid-row-span of a card using Pretext arithmetic.
 * Zero DOM reads that cause reflow (no offsetHeight, no getBoundingClientRect).
 *
 * @param card The card HTMLElement
 * @param colWidth The resolved column width in px
 * @param tokens Geometry tokens
 */
export function predictCardMetrics(
	card: HTMLElement,
	colWidth: number,
	tokens: CardGeometryTokens,
): PredictedCardMetrics {
	// 1. Check for manual pre-baked height override
	const explicitHeight = Number.parseFloat(card.dataset.masonryHeight ?? "");
	if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
		const rowSpan = Math.ceil((explicitHeight + tokens.rowGap) / tokens.rowUnit);
		return {
			totalHeight: explicitHeight,
			rowSpan,
			titleLines: 1,
			descLines: 0,
		};
	}

	const isPostCard = card.classList.contains("m3-blog-postcard");
	if (!isPostCard && typeof card.offsetHeight === "number" && card.offsetHeight > 0) {
		const h = card.offsetHeight;
		return {
			totalHeight: h,
			rowSpan: Math.ceil((h + tokens.rowGap) / tokens.rowUnit),
			titleLines: 1,
			descLines: 0,
		};
	}

	const hasCover =
		card.classList.contains("m3-blog-postcard--cover") ||
		card.querySelector(".m3-blog-postcard__cover") !== null;

	const titleEl = card.querySelector(".m3-blog-postcard__title, h2, h3, .card__title");
	const titleText = extractCleanText(titleEl) || card.dataset.title || "Untitled";

	const descEl = card.querySelector(".m3-blog-postcard__desc, p, .card__desc");
	const descText = descEl?.textContent?.trim() || card.dataset.desc || "";

	const hasMeta = card.querySelector(".m3-blog-postcard__meta, .card__meta") !== null;
	const hasTags = card.querySelector(".m3-blog-postcard__tags, .card__tags") !== null;

	// 2. Resolve typography settings
	const titleTypography = getTitleTypography(
		tokens.titleFontSize,
		tokens.titleLineHeightMultiplier,
	);
	const descTypography = getDescTypography(tokens.descFontSize, tokens.descLineHeightMultiplier);

	// 3. Compute available text width based on padding and enter button
	let textWidth = colWidth - 2 * tokens.bodyPaddingX;
	if (isPostCard && !hasCover) {
		// Non-cover cards leave 4.75rem (76px) on the right for the enter button
		textWidth = colWidth - tokens.bodyPaddingX - 76;
	}
	textWidth = Math.max(60, textWidth);

	// 4. Calculate title height via Pretext arithmetic
	const preparedTitle = getOrCreatePrepared(titleText, titleTypography.fontString);
	const titleLayout = layout(preparedTitle, textWidth, titleTypography.lineHeightPx);
	const titleLines = Math.max(1, titleLayout.lineCount);
	const titleHeight = titleLines * titleTypography.lineHeightPx;

	// 5. Calculate description height via Pretext arithmetic (capped at descMaxLines)
	let descHeight = 0;
	let descLines = 0;
	if (descText.length > 0) {
		const preparedDesc = getOrCreatePrepared(descText, descTypography.fontString);
		const descLayout = layout(preparedDesc, textWidth, descTypography.lineHeightPx);
		descLines = Math.min(tokens.descMaxLines, Math.max(0, descLayout.lineCount));
		if (descLines > 0) {
			descHeight = tokens.descMarginTop + descLines * descTypography.lineHeightPx;
		}
	}

	// 6. Calculate fixed chrome heights
	let coverBlockHeight = 0;
	if (hasCover) {
		const coverWidth = Math.max(40, colWidth - 2 * tokens.coverMarginX);
		const coverHeight = Math.round(coverWidth * tokens.coverAspectRatio);
		coverBlockHeight = coverHeight + tokens.coverMarginTop;
	}

	const bodyPadding = tokens.bodyPaddingY;
	const metaHeight = hasMeta ? tokens.metaHeight : 0;
	const tagsHeight = hasTags ? tokens.tagsHeight : 0;

	// 7. Sum total predicted height & calculate grid row-span
	const totalHeight =
		coverBlockHeight + bodyPadding + titleHeight + descHeight + metaHeight + tagsHeight;
	const rowSpan = Math.ceil((totalHeight + tokens.rowGap) / tokens.rowUnit);

	return {
		totalHeight,
		rowSpan,
		titleLines,
		descLines,
	};
}
