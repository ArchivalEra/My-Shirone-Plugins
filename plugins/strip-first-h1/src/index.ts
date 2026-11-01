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

		const firstHeadingIndex = findFirstHeadingIndex(tree.children);
		if (firstHeadingIndex === -1) return;

		const node = tree.children[firstHeadingIndex];
		if (node.depth !== 1) return;

		if (options.matchTitleOnly && !headingMatchesTitle(node, file)) return;

		tree.children.splice(firstHeadingIndex, 1);
	};
}

/**
 * Index of the first heading node, or -1.
 *
 * The scan stops at the first heading of any depth: a depth-2 heading before a
 * depth-1 one means the document starts with a real section, and stripping a
 * later h1 would delete content rather than a duplicate title.
 */
function findFirstHeadingIndex(children: readonly MdastNode[]): number {
	for (let i = 0; i < children.length; i++) {
		const node = children[i];
		if (node && node.type === "heading") return i;
	}
	return -1;
}

/** Whether the document's frontmatter title equals the heading text, ignoring case. */
function headingMatchesTitle(node: MdastNode, file?: VFileContext): boolean {
	const frontmatterTitle =
		file?.data?.astro?.frontmatter?.title ?? file?.data?.frontmatter?.title;
	if (!frontmatterTitle || typeof frontmatterTitle !== "string") return false;
	const headingText = extractNodeText(node).trim();
	return frontmatterTitle.trim().toLowerCase() === headingText.toLowerCase();
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
