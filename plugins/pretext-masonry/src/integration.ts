import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { PretextMasonryOptions } from "./types.js";

/**
 * Astro integration for zero-reflow waterfall layout via @chenglou/pretext.
 * Drop-in seamless replacement for Shirone's masonry engine.
 */
export function pretextMasonry(options: PretextMasonryOptions = {}): AstroIntegration {
	return {
		name: "@shirone-plugins/pretext-masonry",
		hooks: {
			"astro:config:setup": ({ updateConfig }) => {
				if (options.enabled === false) return;

				let runtimePath = fileURLToPath(new URL("./runtime/index.ts", import.meta.url));
				if (!existsSync(runtimePath)) {
					runtimePath = fileURLToPath(new URL("./runtime/index.js", import.meta.url));
				}

				updateConfig({
					vite: {
						resolve: {
							alias: [
								{
									find: "@utils/masonry",
									replacement: runtimePath,
								},
							],
						},
					},
				});
			},
		},
	};
}

export default pretextMasonry;
