/**
 * @shirone-plugins/repo-pages
 * Functionalized GitHub Pages domestic EdgeOne reverse proxying & project showcase integration for Shirone.
 */

export interface RepoPagesConfig {
	/** Default domain name for domestic reverse proxy (e.g. "isui.ren") */
	domain?: string;
	/** Route prefix under the domain (default: "/repo") */
	routePrefix?: string;
	/** GitHub organization or username (default: "ArchivalEra") */
	owner?: string;
	/** Whether the plugin is active */
	enabled?: boolean;
}

export const DEFAULT_CONFIG: Required<RepoPagesConfig> = {
	domain: "isui.ren",
	routePrefix: "/repo",
	owner: "ArchivalEra",
	enabled: true,
};

/**
 * Returns the domestic EdgeOne reverse-proxied URL for a given repository.
 */
export function getDomesticRepoUrl(
	repoName: string,
	domain = DEFAULT_CONFIG.domain,
	routePrefix = DEFAULT_CONFIG.routePrefix,
): string {
	const cleanRepo = repoName.trim().replace(/^\/+|\/+$/g, "");
	const cleanPrefix = routePrefix.trim().replace(/^\/+|\/+$/g, "");
	return `https://${domain}/${cleanPrefix}/${cleanRepo}/`;
}

/**
 * Returns the original upstream GitHub Pages URL.
 */
export function getOriginalGitHubPagesUrl(
	repoName: string,
	owner = DEFAULT_CONFIG.owner,
): string {
	const cleanRepo = repoName.trim().replace(/^\/+|\/+$/g, "");
	return `https://${owner.toLowerCase()}.github.io/${cleanRepo}/`;
}

/**
 * Rewrites an upstream GitHub Pages HTML document to ensure all relative and
 * absolute subpath assets resolve correctly under the `/repo/<repoName>/` prefix.
 */
export function rewriteRepoHtml(
	html: string,
	repoName: string,
	routePrefix = DEFAULT_CONFIG.routePrefix,
): string {
	if (!html || typeof html !== "string") return html;

	const cleanRepo = repoName.trim().replace(/^\/+|\/+$/g, "");
	const cleanPrefix = routePrefix.trim().replace(/^\/+|\/+$/g, "");
	const baseTarget = `/${cleanPrefix}/${cleanRepo}/`;

	let result = html;

	// 1. Inject or update <base href="...">
	if (result.includes("<head>")) {
		result = result.replace(
			"<head>",
			`<head>\n    <base href="${baseTarget}">`,
		);
	} else if (result.includes("<head ")) {
		result = result.replace(
			/(<head[^>]*>)/i,
			`$1\n    <base href="${baseTarget}">`,
		);
	}

	// 2. Replace absolute references to /<repoName>/ with /<routePrefix>/<repoName>/
	const repoPattern = new RegExp(`(href|src|action)=["']/${cleanRepo}/`, "g");
	result = result.replace(repoPattern, `$1="${baseTarget}`);

	return result;
}

/**
 * Astro Integration for Shirone themes.
 * Zero bundle impact when disabled.
 */
export function shironeRepoPages(options: RepoPagesConfig = {}) {
	const config = { ...DEFAULT_CONFIG, ...options };

	return {
		name: "@shirone-plugins/repo-pages",
		hooks: {
			"astro:config:setup": ({ updateConfig }: any) => {
				if (!config.enabled) return;
				// Optional build-time hooks or vite environment defines
				updateConfig({
					vite: {
						define: {
							__REPO_PAGES_DOMAIN__: JSON.stringify(config.domain),
							__REPO_PAGES_PREFIX__: JSON.stringify(config.routePrefix),
						},
					},
				});
			},
		},
	};
}

export default shironeRepoPages;
