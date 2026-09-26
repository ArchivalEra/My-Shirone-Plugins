/**
 * Astro integration.
 *
 * The integration injects one inline script and nothing else. The script holds
 * the resolved configuration and watches for the first embed; the runtime
 * module behind it, the surface, and the Mellow engine are all resolved
 * lazily, so a site with no `::artplayer` embed never loads any of them.
 */

import { resolvePlayerConfig } from "./config.js";
import type {
	PlayerConfigResolution,
	PlayerOptionsInput,
	ResolvedPlayerConfig,
} from "./protocol/types.js";

export interface AstroIntegrationLike {
	name: string;
	hooks: {
		"astro:config:setup"?: (params: {
			injectScript: (stage: string, content: string) => void;
		}) => void;
	};
}

/**
 * Serializes configuration into an inline script. `<` is escaped because a
 * label containing `</script>` would otherwise close the injected tag.
 */
export function serializePlayerConfig(config: ResolvedPlayerConfig): string {
	return JSON.stringify(config).replace(/</g, "\\u003c");
}

/** The inline script: configuration, then a lazy wait for the first embed. */
export function buildRuntimeScript(
	config: ResolvedPlayerConfig,
	runtimePath: string,
): string {
	const json = serializePlayerConfig(config);
	const specifier = JSON.stringify(runtimePath);
	return `window.__MELLOW_PLAYER_CONFIG__ = ${json};
(function () {
	var SELECTOR = "figure[data-artplayer]";
	var started = false;
	function activate() {
		if (started) return;
		started = true;
		import(${specifier}).then(function (runtime) {
			runtime.watchArtPlayer(window.__MELLOW_PLAYER_CONFIG__);
		})["catch"](function (error) {
			console.error("[mellow-player] runtime failed to load:", error);
		});
	}
	if (document.querySelector(SELECTOR) !== null) {
		activate();
		return;
	}
	document.addEventListener("swup:content:replace", function () {
		setTimeout(function () {
			if (document.querySelector(SELECTOR) !== null) activate();
		}, 0);
	});
})();`;
}

function reportRefusal(resolution: PlayerConfigResolution): void {
	if (resolution.reason === "disabled") return;
	console.warn(
		`[mellow-player] disabled: ${resolution.missingLabels.length} label(s) missing — ` +
			resolution.missingLabels.join(", "),
	);
}

/**
 * Docks the Shirone playback surface onto the theme's `::artplayer` embeds.
 * A configuration that cannot render accessible controls injects nothing, so a
 * mistake costs the enhancement rather than the page.
 */
export function mellowPlayer(
	options: PlayerOptionsInput = {},
): AstroIntegrationLike {
	return {
		name: "@shirone-plugins/mellow-player",
		hooks: {
			"astro:config:setup": ({ injectScript }) => {
				const resolution = resolvePlayerConfig(options);
				if (!resolution.enabled || !resolution.config) {
					reportRefusal(resolution);
					return;
				}

				const runtimePath = new URL(
					"./runtime/enhance.js",
					import.meta.url,
				).pathname;
				injectScript(
					"page",
					buildRuntimeScript(resolution.config, runtimePath),
				);
			},
		},
	};
}

export default mellowPlayer;
