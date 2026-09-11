/**
 * Client-side dynamic portal mounting logic for WhatImDoingCapsule.
 * Automatically locates the author's avatar in Shirone's profile card
 * and renders the capsule directly above it.
 */

import { mount, unmount } from "svelte";
import WhatImDoingCapsule from "../components/WhatImDoingCapsule.svelte";
import type { WhatImDoingOptions } from "../protocol/types.js";

declare global {
	interface Window {
		__WHAT_IM_DOING_CONFIG__?: WhatImDoingOptions;
		__WHAT_IM_DOING_MOUNTED__?: boolean;
	}
}

let activeInstance: ReturnType<typeof mount> | null = null;
let activeContainer: HTMLElement | null = null;

export function initWhatImDoing(options: WhatImDoingOptions = {}): void {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	const config = {
		endpoint: options.endpoint || "/api/activity",
		maxHistoryDisplay: options.maxHistoryDisplay ?? 5,
		refreshInterval: options.refreshInterval ?? 30000,
		targetSelector:
			options.targetSelector || 'a[aria-label="Go to About Page"]',
		position: options.position || "beforebegin",
		routeFilter: options.routeFilter,
	};

	function isPathAllowed(): boolean {
		if (!config.routeFilter || config.routeFilter.length === 0) {
			return true;
		}
		const pathname = window.location.pathname;
		return config.routeFilter.some((filter) => pathname.startsWith(filter));
	}

	function tryMount() {
		// Strict on-intent lazy gating: only mount on permitted routes (e.g. /MangoMesa)
		if (!isPathAllowed()) {
			cleanup();
			return;
		}

		// Avoid duplicate mounting
		if (document.querySelector(".wid-mounted-portal")) {
			return;
		}

		// Find avatar or profile anchor
		const targetEl = document.querySelector(config.targetSelector);
		if (!targetEl?.parentElement) {
			return;
		}

		// Create portal container
		const container = document.createElement("div");
		container.className = "wid-mounted-portal";
		container.style.width = "100%";
		container.style.display = "flex";
		container.style.justifyContent = "center";

		targetEl.insertAdjacentElement(
			config.position as InsertPosition,
			container,
		);

		try {
			activeInstance = mount(WhatImDoingCapsule, {
				target: container,
				props: {
					endpoint: config.endpoint,
					maxHistoryDisplay: config.maxHistoryDisplay,
					refreshInterval: config.refreshInterval,
				},
			});
			activeContainer = container;
		} catch (err) {
			console.error("[what-im-doing] Failed to mount Svelte capsule:", err);
		}
	}

	function cleanup() {
		if (activeInstance) {
			try {
				unmount(activeInstance);
			} catch {}
			activeInstance = null;
		}
		if (activeContainer) {
			activeContainer.remove();
			activeContainer = null;
		}
	}

	// Mount on initial load
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", tryMount);
	} else {
		tryMount();
	}

	// Re-mount on Swup SPA navigation
	const swup = (
		window as unknown as {
			swup?: { hooks?: { on: (event: string, cb: () => void) => void } };
		}
	).swup;
	if (swup?.hooks) {
		swup.hooks.on("page:view", () => {
			cleanup();
			setTimeout(tryMount, 50);
		});
	} else {
		document.addEventListener("swup:contentReplaced", () => {
			cleanup();
			setTimeout(tryMount, 50);
		});
	}
}

function autoInit() {
	if (
		typeof window !== "undefined" &&
		window.__WHAT_IM_DOING_CONFIG__ &&
		!window.__WHAT_IM_DOING_MOUNTED__
	) {
		window.__WHAT_IM_DOING_MOUNTED__ = true;
		initWhatImDoing(window.__WHAT_IM_DOING_CONFIG__);
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("what-im-doing:init", () => autoInit());
	if (window.__WHAT_IM_DOING_CONFIG__) {
		autoInit();
	} else {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => autoInit());
		} else {
			setTimeout(autoInit, 0);
		}
	}
}
