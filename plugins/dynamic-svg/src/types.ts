export interface PretextMeasurerOptions {
	font?: string;
	maxWidth: number;
	lineHeight?: number;
}

export interface PretextLayoutResult {
	lines: string[];
	height: number;
	lineCount: number;
}

export interface DynamicSvgPretextConfig {
	/** Whether to enable Pretext arithmetic layout for SVG text nodes marked with data-pretext */
	enabled?: boolean;
	/** Optional custom measurer function, e.g. utilizing @chenglou/pretext */
	measurer?: (text: string, options: PretextMeasurerOptions) => PretextLayoutResult;
}

export interface DynamicSvgOptions {
	/**
	 * By default only images ending with `#dynamic` or matching query `?dynamic` are inlined.
	 * If set to true, automatically inlines all local SVGs.
	 * Default: false
	 */
	allSvg?: boolean;

	/**
	 * Base public directory for resolving absolute paths like `/assets/...`.
	 * Default: resolve(process.cwd(), "public")
	 */
	publicDir?: string;

	/**
	 * Base content directory for resolving relative assets when file.path is not fully qualified.
	 */
	contentDir?: string;

	/**
	 * Class name to add to the inlined SVG element.
	 * Default: "dynamic-svg"
	 */
	className?: string;

	/**
	 * Optional Pretext linkage configuration for zero-reflow text measurement inside SVGs.
	 */
	pretext?: DynamicSvgPretextConfig;
}
