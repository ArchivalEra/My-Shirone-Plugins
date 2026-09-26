/**
 * Prefix rewriting for mirrored sites.
 *
 * A site built with one base (Bahnhof builds with `/Bahnhof/`) cannot also be
 * served under a mirror prefix (`/repo/isui.ren-Bahnhof/`) from the same build:
 * its root-absolute asset URLs point at the other mount. This module makes one
 * HTML document resolve under a prefix, and it is the single implementation —
 * the edge middleware imports the build of this file directly, so there is no
 * second copy to drift.
 *
 * Scope, deliberately: a `<base>` element plus root-absolute references to the
 * repository's own subpath. `srcset`, CSS `url()`, and paths assembled inside
 * JavaScript are out of scope; the mirrored sites are first-party builds whose
 * two shapes (relative and root-absolute) are known.
 */

export interface RewriteForPrefixOptions {
	/** Repository name the upstream build targets, e.g. `isui.ren-Bahnhof`. */
	repo: string;
	/** Prefix the mirror is served under, e.g. `/repo`. */
	prefix: string;
}

/** Escape a literal so it cannot act as a pattern — this fleet's names contain dots. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Make `html` resolve under `prefix`/`repo`/.
 *
 * Non-string input is returned untouched so a caller can pass whatever the
 * upstream gave it without a guard of its own.
 */
export function rewriteForPrefix(
	html: string,
	options: RewriteForPrefixOptions,
): string {
	if (!html || typeof html !== "string") return html;

	const prefix = `/${(options?.prefix ?? "").trim().replace(/^\/+|\/+$/g, "")}`;
	const repo = (options?.repo ?? "").trim().replace(/^\/+|\/+$/g, "");
	if (!repo) return html;
	const target = `${prefix}/${repo}/`;

	let output = html;

	// One <base>, never two: with two, a browser honours the first and the second
	// is dead weight — which is the same as not rewriting at all.
	const baseTag = `<base href="${target}">`;
	if (/<base\s[^>]*>/i.test(output)) {
		output = output.replace(/<base\s[^>]*>/i, baseTag);
	} else {
		output = output.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}\n    ${baseTag}`);
	}

	// Only references into this repository's own subpath are the build's; anything
	// else root-absolute (a CDN, a sibling mount) is left alone.
	const reference = new RegExp(
		`(href|src|action)=(["'])/${escapeRegExp(repo)}/`,
		"gi",
	);
	return output.replace(
		reference,
		(_match, attribute: string, quote: string) =>
			`${attribute}=${quote}${target}`,
	);
}
