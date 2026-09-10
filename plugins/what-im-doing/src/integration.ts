import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { WhatImDoingOptions } from "./protocol/types.js";

/**
 * Astro Integration for what-im-doing
 * Displays real-time device status and application monitoring above the author avatar.
 */
export function whatImDoing(options: WhatImDoingOptions = {}): AstroIntegration {
	return {
		name: "@shirone-plugins/what-im-doing",
		hooks: {
			"astro:config:setup": ({ injectScript, injectRoute, updateConfig }) => {
				let clientScriptPath = fileURLToPath(
					new URL("./runtime/client-mount.ts", import.meta.url),
				);
				if (!existsSync(clientScriptPath)) {
					clientScriptPath = fileURLToPath(
						new URL("./runtime/client-mount.js", import.meta.url),
					);
				}

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
				const isRelativeEndpoint = !options.endpoint || options.endpoint.startsWith("/");
				if (options.enableLocalEndpoint === true || (options.enableLocalEndpoint !== false && isRelativeEndpoint)) {
					let routePath = fileURLToPath(
						new URL("./server/route.ts", import.meta.url),
					);
					if (!existsSync(routePath)) {
						routePath = fileURLToPath(
							new URL("./server/route.js", import.meta.url),
						);
					}

					injectRoute({
						pattern: isRelativeEndpoint ? (options.endpoint || "/api/activity") : "/api/activity",
						entrypoint: routePath,
					});
				}
			},
		},
	};
}

export default whatImDoing;
