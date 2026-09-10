/**
 * Configuration options for the Pretext Masonry Astro integration.
 */
export interface PretextMasonryOptions {
	/**
	 * Whether the Pretext zero-reflow layout engine is enabled.
	 * Default: true
	 */
	enabled?: boolean;

	/**
	 * Enable debug logging in the browser console.
	 * Default: false
	 */
	debug?: boolean;

	/**
	 * Fallback to batched DOM offsetHeight measurement if Pretext calculation
	 * fails or if the browser environment lacks Canvas / Intl.Segmenter support.
	 * Default: true
	 */
	fallbackToDom?: boolean;

	/**
	 * Custom CSS tokens to override default card geometry assumptions.
	 */
	tokens?: Partial<CardGeometryTokens>;
}

/**
 * Mathematical geometric tokens for card height decomposition.
 * Aligns strictly with Shirone M3 Expressive design tokens.
 */
export interface CardGeometryTokens {
	/** CSS Grid row track height unit (px). Default: 8 */
	rowUnit: number;
	/** Row spacing baked into span calculations (px). Default: 16 (--m3e-space-4) */
	rowGap: number;
	/** Column spacing (px). Default: 16 (--m3e-space-4) */
	colGap: number;
	/** Horizontal card body padding (px per side). Default: 20 (--m3e-space-5) */
	bodyPaddingX: number;
	/** Vertical card body padding (px total: top + bottom). Default: 40 (20 + 20) */
	bodyPaddingY: number;
	/** Card cover image margin-top (px). Default: 16 (--m3e-space-4) */
	coverMarginTop: number;
	/** Card cover image horizontal margin (px per side). Default: 16 (--m3e-space-4) */
	coverMarginX: number;
	/** Card cover image aspect ratio (height / width). Default: 9 / 16 (0.5625) */
	coverAspectRatio: number;
	/** Meta row total vertical contribution (margin-top 16px + badge 24px). Default: 40 */
	metaHeight: number;
	/** Tag row total vertical contribution (margin-top 16px + badge 24px). Default: 40 */
	tagsHeight: number;
	/** Description margin-top (px). Default: 12 (--m3e-space-3) */
	descMarginTop: number;
	/** Maximum line count for description text clamp. Default: 2 */
	descMaxLines: number;
	/** Title font size (px). Default: 22 (1.375rem) */
	titleFontSize: number;
	/** Title line-height multiplier. Default: 1.3 */
	titleLineHeightMultiplier: number;
	/** Description font size (px). Default: 14 (0.875rem) */
	descFontSize: number;
	/** Description line-height multiplier. Default: 1.6 */
	descLineHeightMultiplier: number;
}

export const DEFAULT_GEOMETRY_TOKENS: CardGeometryTokens = {
	rowUnit: 8,
	rowGap: 16,
	colGap: 16,
	bodyPaddingX: 20,
	bodyPaddingY: 40,
	coverMarginTop: 16,
	coverMarginX: 16,
	coverAspectRatio: 9 / 16,
	metaHeight: 40,
	tagsHeight: 40,
	descMarginTop: 12,
	descMaxLines: 2,
	titleFontSize: 22,
	titleLineHeightMultiplier: 1.3,
	descFontSize: 14,
	descLineHeightMultiplier: 1.6,
};

export interface CardLayoutResult {
	card: HTMLElement;
	colStart: string;
	colEnd: string;
	rowEnd: string;
	predictedHeight: number;
	span: number;
}
