// @ts-ignore
import fs from "node:fs";
// @ts-ignore
import path from "node:path";

declare const process: any;
declare const Intl: any;
import type {
	DynamicSvgOptions,
	DynamicSvgPretextConfig,
	PretextLayoutResult,
	PretextMeasurerOptions,
} from "./types.js";

export * from "./types.js";

/**
 * Check if the image source specifies dynamic SVG rendering.
 */
export function isDynamicTarget(src: string, options: DynamicSvgOptions): boolean {
	if (typeof src !== "string") return false;
	if (src.includes("#dynamic") || src.includes("?dynamic")) {
		return true;
	}
	if (options.allSvg && src.toLowerCase().endsWith(".svg")) {
		return true;
	}
	return false;
}

/**
 * Remove #dynamic and ?dynamic fragments to get the underlying file path.
 */
export function cleanDynamicSrc(src: string): string {
	return src.replace(/#dynamic(?:\?[^#]*)?$/, "").replace(/\?dynamic(?:&[^#]*)?$/, "");
}

/**
 * Resolve the SVG file on the local filesystem.
 */
export function resolveSvgPath(
	cleanSrc: string,
	filePath: string | undefined,
	options: DynamicSvgOptions,
): string | null {
	const cwd = process.cwd();
	const publicDir = options.publicDir || path.resolve(cwd, "public");
	const contentDir = options.contentDir || process.env.CONTENT_DIR || path.resolve(cwd, "content");

	// 0. If cleanSrc already points to an existing file directly
	if (fs.existsSync(cleanSrc) && fs.statSync(cleanSrc).isFile()) {
		return path.resolve(cleanSrc);
	}

	// 1. If absolute URL-like (/assets/...)
	if (cleanSrc.startsWith("/")) {
		const rel = cleanSrc.replace(/^\/+/, "");
		const candidates = [
			path.join(publicDir, rel),
			path.join(cwd, rel),
			path.join(cwd, "src", rel),
			path.join(contentDir, rel),
		];
		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) return candidate;
		}
		return null;
	}

	// 2. If relative URL (./assets/... or assets/...)
	if (filePath) {
		const fromFile = path.resolve(path.dirname(filePath), cleanSrc);
		if (fs.existsSync(fromFile)) return fromFile;
	}

	const relativeCandidates = [
		path.join(contentDir, cleanSrc),
		path.join(publicDir, cleanSrc),
		path.join(cwd, cleanSrc),
	];
	for (const candidate of relativeCandidates) {
		if (fs.existsSync(candidate)) return candidate;
	}

	return null;
}

/**
 * Lightweight XML/SVG parser producing compliant HAST element trees with zero external dependencies.
 */
export function parseSvgToHast(svgStr: string): any {
	const clean = svgStr
		.replace(/<\?xml[\s\S]*?\?>/i, "")
		.replace(/<!DOCTYPE[\s\S]*?>/i, "")
		.trim();

	const tagRegex =
		/<(\/)?([a-zA-Z0-9\-_:]+)((?:\s+[a-zA-Z0-9\-_:@]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)/g;
	const attrRegex =
		/([a-zA-Z0-9\-_:@]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

	const root: any = { type: "root", children: [] };
	const stack: any[] = [root];

	let match: RegExpExecArray | null;
	while ((match = tagRegex.exec(clean)) !== null) {
		const [fullMatch, isClosing, tagName, attrStr, isSelfClosing, textContent] =
			match;

		if (textContent !== undefined) {
			const text = textContent;
			if (text.trim() || stack.length > 1) {
				const current = stack[stack.length - 1];
				current.children.push({ type: "text", value: text });
			}
			continue;
		}

		if (fullMatch.startsWith("<!--")) {
			continue;
		}

		if (isClosing) {
			if (
				stack.length > 1 &&
				stack[stack.length - 1].tagName.toLowerCase() ===
					tagName.toLowerCase()
			) {
				stack.pop();
			}
			continue;
		}

		const properties: Record<string, any> = {};
		if (attrStr) {
			let attrMatch: RegExpExecArray | null;
			while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
				const key = attrMatch[1];
				const value =
					attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? true;
				if (key === "class") {
					properties.className =
						typeof value === "string"
							? value.split(/\s+/).filter(Boolean)
							: [];
				} else {
					properties[key] = value;
				}
			}
		}

		const element: any = {
			type: "element",
			tagName: tagName.toLowerCase() === "svg" ? "svg" : tagName,
			properties,
			children: [],
		};

		const current = stack[stack.length - 1];
		current.children.push(element);

		const isSelf =
			isSelfClosing === "/" ||
			([
				"stop",
				"path",
				"circle",
				"rect",
				"line",
				"polyline",
				"polygon",
				"ellipse",
				"use",
				"image",
			].includes(tagName.toLowerCase()) &&
				isSelfClosing === "/");

		if (!isSelf && isSelfClosing !== "/") {
			stack.push(element);
		}
	}

	return root;
}

/**
 * Traverses all HAST elements without external dependencies.
 */
function walkElement(
	node: any,
	visitor: (node: any, index: number, parent: any) => void,
	parent?: any,
	index = 0,
): void {
	if (!node || typeof node !== "object") return;
	if (node.type === "element" && parent) {
		visitor(node, index, parent);
	}
	if (Array.isArray(node.children)) {
		for (let i = 0; i < node.children.length; i++) {
			walkElement(node.children[i], visitor, node, i);
		}
	}
}

/**
 * Walks all element nodes in a subtree.
 */
function walkAllElements(node: any, visitor: (node: any) => void): void {
	if (!node || typeof node !== "object") return;
	if (node.type === "element") {
		visitor(node);
	}
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			walkAllElements(child, visitor);
		}
	}
}

/**
 * Optional Pretext arithmetic layout for SVG text nodes marked with data-pretext.
 * When enabled, converts plain text into arithmetic <tspan> elements without DOM reflow.
 */
function applyPretextLayout(
	svgNode: any,
	pretextConfig: DynamicSvgPretextConfig | undefined,
) {
	if (!pretextConfig?.enabled || !svgNode) return;

	walkAllElements(svgNode, (node: any) => {
		if (node.tagName !== "text") return;
		const props = node.properties || {};
		const hasPretext = "dataPretext" in props || "data-pretext" in props;
		const maxWidthRaw =
			props["dataPretextMaxWidth"] || props["data-pretext-max-width"];

		if (!hasPretext && !maxWidthRaw) return;

		const maxWidth = Number.parseFloat(maxWidthRaw) || 300;
		const lineHeight =
			Number.parseFloat(
				props["dataPretextLineHeight"] || props["data-line-height"],
			) || 24;
		const font = String(
			props["dataPretextFont"] || props["font-family"] || "sans-serif",
		);

		// Extract text content
		const textContent = (node.children || [])
			.filter((c: any) => c.type === "text")
			.map((c: any) => c.value)
			.join(" ");

		if (!textContent.trim()) return;

		let layout: PretextLayoutResult;
		if (typeof pretextConfig.measurer === "function") {
			layout = pretextConfig.measurer(textContent, {
				font,
				maxWidth,
				lineHeight,
			});
		} else {
			// Arithmetic CJK/Latin tokenization fallback (Intl.Segmenter based)
			const words =
				typeof Intl !== "undefined" && (Intl as any).Segmenter
					? [
							...new (Intl as any).Segmenter(undefined, {
								granularity: "word",
							}).segment(textContent),
						].map((s: any) => s.segment)
					: textContent.split(/\s+/);

			const lines: string[] = [];
			let currentLine = "";
			const approxCharWidth = 14; // Default arithmetic estimate

			for (const word of words) {
				const testLine = currentLine ? `${currentLine}${word}` : word;
				if (
					testLine.length * approxCharWidth > maxWidth &&
					currentLine
				) {
					lines.push(currentLine);
					currentLine = word;
				} else {
					currentLine = testLine;
				}
			}
			if (currentLine) lines.push(currentLine);

			layout = {
				lines,
				height: lines.length * lineHeight,
				lineCount: lines.length,
			};
		}

		// Replace children with <tspan> elements
		const startX = props.x || 0;
		node.children = layout.lines.map((lineText, idx) => ({
			type: "element",
			tagName: "tspan",
			properties: {
				x: startX,
				dy: idx === 0 ? "0" : `${lineHeight}px`,
			},
			children: [{ type: "text", value: lineText }],
		}));
	});
}

/**
 * Unified Rehype plugin to inline SVGs marked with #dynamic with Material 3 tokens.
 */
export function rehypeDynamicSvg(options: DynamicSvgOptions = {}) {
	const parseFn = options.fromHtml || parseSvgToHast;

	return (tree: any, file: any) => {
		const filePath = file?.history?.[0] || file?.path;

		walkElement(tree, (node: any, index: number, parent: any) => {
			if (node.tagName !== "img" || !parent || typeof index !== "number") {
				return;
			}

			const src = String(node.properties?.src || "");
			if (!isDynamicTarget(src, options)) {
				return;
			}

			const cleanSrc = cleanDynamicSrc(src);
			const resolvedPath = resolveSvgPath(cleanSrc, filePath, options);

			if (!resolvedPath) {
				// File not found on disk, gracefully leave unmodified
				return;
			}

			try {
				const rawSvg = fs.readFileSync(resolvedPath, "utf-8");
				const parsed = parseFn(rawSvg, { fragment: true });
				const svgElement = parsed.children.find(
					(child: any) =>
						child.type === "element" && child.tagName === "svg",
				);

				if (!svgElement) return;

				// Ensure SVG properties for accessibility & M3 dynamic theming
				const svgProps = (svgElement as any).properties || {};
				const originalProps = node.properties || {};

				// Preserve or set accessible description
				const altText = originalProps.alt;
				if (
					altText &&
					!svgProps["aria-label"] &&
					!svgProps["ariaLabel"]
				) {
					svgProps["aria-label"] = String(altText);
				}
				svgProps.role = "img";

				// Mark to skip downstream generic image enhancement
				svgProps["data-no-enhance"] = "true";
				svgProps["data-dynamic-svg"] = "true";

				// Merge CSS classes
				const baseClass = options.className || "dynamic-svg";
				const existingClasses = Array.isArray(svgProps.className)
					? svgProps.className
					: typeof svgProps.className === "string"
						? svgProps.className.split(/\s+/)
						: [];
				const origClasses = Array.isArray(originalProps.className)
					? originalProps.className
					: typeof originalProps.className === "string"
						? originalProps.className.split(/\s+/)
						: [];

				svgProps.className = Array.from(
					new Set([...existingClasses, ...origClasses, baseClass]),
				);

				// Apply Pretext layout if configured
				if (options.pretext?.enabled) {
					applyPretextLayout(svgElement, options.pretext);
				}

				// Replace the <img> element with the inlined <svg>
				parent.children[index] = svgElement;
			} catch (err) {
				console.warn(
					`[@shirone-plugins/dynamic-svg] Failed to inline SVG from ${resolvedPath}:`,
					err,
				);
			}
		});
	};
}

/**
 * Astro integration wrapper for @shirone-plugins/dynamic-svg.
 */
export function dynamicSvg(options: DynamicSvgOptions = {}) {
	return {
		name: "@shirone-plugins/dynamic-svg",
		hooks: {
			"astro:config:setup": ({ updateConfig }: any) => {
				updateConfig({
					markdown: {
						rehypePlugins: [[rehypeDynamicSvg, options]],
					},
				});
			},
		},
	};
}

export default rehypeDynamicSvg;
