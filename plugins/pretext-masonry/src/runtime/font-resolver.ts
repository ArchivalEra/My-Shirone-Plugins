/**
 * Font resolution, metrics caching, and web font readiness lifecycle.
 */

export interface ResolvedTypography {
	fontString: string;
	fontSizePx: number;
	lineHeightPx: number;
}

let cachedFontFamily: string | null = null;
let cachedTitleTypography: ResolvedTypography | null = null;
let cachedDescTypography: ResolvedTypography | null = null;

const FALLBACK_FONT_FAMILY =
	'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

/**
 * Resolves the active font family string from CSS variables or document styles.
 */
export function resolveFontFamily(): string {
	if (cachedFontFamily !== null) return cachedFontFamily;
	if (typeof window === "undefined" || typeof document === "undefined") {
		return FALLBACK_FONT_FAMILY;
	}

	try {
		const rootStyle = window.getComputedStyle(document.documentElement);
		const sansVar =
			rootStyle.getPropertyValue("--font-sans").trim() ||
			rootStyle.getPropertyValue("--m3e-font-sans-family").trim();

		cachedFontFamily = sansVar ? `${sansVar}, ${FALLBACK_FONT_FAMILY}` : FALLBACK_FONT_FAMILY;
	} catch {
		cachedFontFamily = FALLBACK_FONT_FAMILY;
	}

	return cachedFontFamily;
}

/**
 * Returns the resolved typography for post card titles:
 * Weight: 700, Size: ~22px, LineHeight: ~28.6px
 */
export function getTitleTypography(fontSize = 22, lhMultiplier = 1.3): ResolvedTypography {
	if (cachedTitleTypography !== null && cachedTitleTypography.fontSizePx === fontSize) {
		return cachedTitleTypography;
	}

	const family = resolveFontFamily();
	const lineHeightPx = Math.round(fontSize * lhMultiplier * 10) / 10;
	cachedTitleTypography = {
		fontString: `700 ${fontSize}px ${family}`,
		fontSizePx: fontSize,
		lineHeightPx,
	};
	return cachedTitleTypography;
}

/**
 * Returns the resolved typography for post card descriptions:
 * Weight: 400, Size: ~14px, LineHeight: ~22.4px
 */
export function getDescTypography(fontSize = 14, lhMultiplier = 1.6): ResolvedTypography {
	if (cachedDescTypography !== null && cachedDescTypography.fontSizePx === fontSize) {
		return cachedDescTypography;
	}

	const family = resolveFontFamily();
	const lineHeightPx = Math.round(fontSize * lhMultiplier * 10) / 10;
	cachedDescTypography = {
		fontString: `400 ${fontSize}px ${family}`,
		fontSizePx: fontSize,
		lineHeightPx,
	};
	return cachedDescTypography;
}

/**
 * Executes a callback once web fonts are fully downloaded and rendered.
 * Uses the dual gate: document.fonts.ready + requestAnimationFrame.
 */
export function onFontsReady(callback: () => void): void {
	if (typeof document === "undefined" || !document.fonts) {
		return;
	}

	document.fonts.ready
		.then(() => {
			requestAnimationFrame(() => {
				clearTypographyCache();
				callback();
			});
		})
		.catch(() => {});
}

/**
 * Clears cached font strings (e.g. after theme toggle or dynamic font loading).
 */
export function clearTypographyCache(): void {
	cachedFontFamily = null;
	cachedTitleTypography = null;
	cachedDescTypography = null;
}
