/**
 * @shirone-plugins/strip-first-h1
 * High-performance, zero-runtime Remark plugin and Astro integration for Shirone.
 * Strips the redundant first H1 heading from markdown posts to eliminate "Double Title"
 * and keep the Table of Contents (TOC) clean.
 */

export interface StripFirstH1Options {
	/**
	 * Only strip the first H1 if its text content matches the post's frontmatter title.
	 * When false (default), strips the very first H1 in the document unconditionally,
	 * since Shirone's layout template already provides the styled title header.
	 * @default false
	 */
	matchTitleOnly?: boolean;
}

interface MdastNode {
	type?: string;
	depth?: number;
	value?: string;
	children?: MdastNode[];
}

interface MdastTree {
	children?: MdastNode[];
}

interface VFileContext {
	data?: {
		astro?: {
			frontmatter?: Record<string, unknown>;
		};
		frontmatter?: Record<string, unknown>;
	};
}

export interface AstroIntegrationLike {
	name: string;
	hooks: {
		"astro:config:setup"?: (params: {
			updateConfig: (config: Record<string, unknown>) => void;
		}) => void;
	};
}

/**
 * Extracts plain text from an mdast node recursively without external dependencies.
 */
function extractNodeText(node: unknown): string {
	if (!node || typeof node !== "object") return "";
	const n = node as { type?: string; value?: string; children?: unknown[] };
	if (n.type === "text" || n.type === "inlineCode") {
		return n.value || "";
	}
	if (Array.isArray(n.children)) {
		return n.children.map(extractNodeText).join("");
	}
	return "";
}

/**
 * Pure AST-level Remark Plugin.
 * O(1) ~ O(k) search that breaks immediately upon finding the first heading node.
 * Zero external dependencies, 0ms overhead, 0 bytes on client.
 */
export function remarkStripFirstH1(options: StripFirstH1Options = {}) {
	return (tree: MdastTree, file?: VFileContext): void => {
		if (!tree || !Array.isArray(tree.children)) return;

		for (let i = 0; i < tree.children.length; i++) {
			const node = tree.children[i];
			if (node && node.type === "heading") {
				// We encountered the first heading in the document
				if (node.depth === 1) {
					if (options.matchTitleOnly) {
						const frontmatterTitle =
							file?.data?.astro?.frontmatter?.title ??
							file?.data?.frontmatter?.title;
						const headingText = extractNodeText(node).trim();

						if (
							frontmatterTitle &&
							typeof frontmatterTitle === "string" &&
							frontmatterTitle.trim().toLowerCase() ===
								headingText.toLowerCase()
						) {
							tree.children.splice(i, 1);
						}
					} else {
						// Strip unconditionally
						tree.children.splice(i, 1);
					}
				}
				// Crucial: Stop immediately at the first heading. Never scan remaining nodes!
				break;
			}
		}
	};
}

/**
 * Astro Integration wrapper for plug-and-play usage in astro.config.mjs.
 */
export function stripFirstH1(
	options: StripFirstH1Options = {},
): AstroIntegrationLike {
	return {
		name: "@shirone-plugins/strip-first-h1",
		hooks: {
			"astro:config:setup": ({
				updateConfig,
			}: {
				updateConfig: (config: Record<string, unknown>) => void;
			}) => {
				updateConfig({
					markdown: {
						remarkPlugins: [[remarkStripFirstH1, options]],
					},
				});
			},
		},
	};
}

export default stripFirstH1;
