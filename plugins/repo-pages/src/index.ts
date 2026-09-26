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
 * Prefix rewriting lives in its own dependency-free module: the edge middleware
 * imports the build of that file directly, so this export is a re-export rather
 * than a second implementation.
 */
export { rewriteForPrefix } from "./rewrite-for-prefix.js";
export type { RewriteForPrefixOptions } from "./rewrite-for-prefix.js";

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
