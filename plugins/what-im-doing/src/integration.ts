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
					`window.__WHAT_IM_DOING_CONFIG__ = ${JSON.stringify(options)}; import("${clientScriptPath}");`,
				);

				// Optional local dev API route injection
				if (options.enableLocalEndpoint !== false) {
					let routePath = fileURLToPath(
						new URL("./server/route.ts", import.meta.url),
					);
					if (!existsSync(routePath)) {
						routePath = fileURLToPath(
							new URL("./server/route.js", import.meta.url),
						);
					}

					injectRoute({
						pattern: options.endpoint || "/api/activity",
						entrypoint: routePath,
					});
				}
			},
		},
	};
}

export default whatImDoing;
