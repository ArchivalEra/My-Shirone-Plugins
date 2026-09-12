import type { WhatImDoingOptions } from "./protocol/types.js";

export interface AstroIntegrationLike {
	name: string;
	hooks: {
		"astro:config:setup"?: (params: {
			injectScript: (stage: string, content: string) => void;
			injectRoute: (route: { pattern: string; entrypoint: string }) => void;
		}) => void;
	};
}

/**
 * Astro Integration for what-im-doing
 * Displays real-time device status and application monitoring above the author avatar.
 */
export function whatImDoing(
	options: WhatImDoingOptions = {},
): AstroIntegrationLike {
	return {
		name: "@shirone-plugins/what-im-doing",
		hooks: {
			"astro:config:setup": ({ injectScript, injectRoute }) => {
				const clientScriptPath = new URL(
					"./runtime/client-mount.js",
					import.meta.url,
				).pathname;

				// Inject client mounting runtime
				injectScript(
					"page",
					`import "${clientScriptPath}";
if (typeof window !== "undefined") {
	window.__WHAT_IM_DOING_CONFIG__ = ${JSON.stringify(options)};
	window.dispatchEvent(new CustomEvent("what-im-doing:init"));
}`,
				);

				// Optional local dev API route injection
				const primaryEndpoint = Array.isArray(options.endpoint)
					? options.endpoint[0]
					: (options.endpoint || "").split(",")[0]?.trim();
				const isRelativeEndpoint =
					!primaryEndpoint || primaryEndpoint.startsWith("/");
				if (
					options.enableLocalEndpoint === true ||
					(options.enableLocalEndpoint !== false && isRelativeEndpoint)
				) {
					const routePath = new URL("./server/route.js", import.meta.url)
						.pathname;

					injectRoute({
						pattern: isRelativeEndpoint
							? primaryEndpoint || "/api/activity"
							: "/api/activity",
						entrypoint: routePath,
					});
				}
			},
		},
	};
}

export default whatImDoing;
