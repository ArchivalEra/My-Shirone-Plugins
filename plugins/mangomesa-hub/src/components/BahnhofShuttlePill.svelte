<script lang="ts">
	/**
	 * @shirone-plugins/mangomesa-hub
	 * BahnhofShuttlePill: M3 Expressive shuttle link to the Bahnhof departure board.
	 */

	interface Props {
		label?: string;
		stationUrl?: string;
		showIcon?: boolean;
		variant?: "floating" | "inline";
	}

	let {
		label = "前往 Bahnhof 调度站台",
		stationUrl = "/Bahnhof/",
		showIcon = true,
		variant = "inline",
	}: Props = $props();
</script>

<a
	href={stationUrl}
	class="bahnhof-shuttle-pill {variant}"
	title="直达 isui.ren 中央列车时刻与调度中枢"
	role="button"
>
	{#if showIcon}
		<svg
			viewBox="0 0 24 24"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="train-icon"
		>
			<rect width="16" height="16" x="4" y="3" rx="2" />
			<path d="M4 11h16" />
			<path d="M12 3v8" />
			<path d="m8 19-2 3" />
			<path d="m18 22-2-3" />
			<circle cx="8" cy="15" r="1" />
			<circle cx="16" cy="15" r="1" />
		</svg>
	{/if}
	<span class="pill-label">{label}</span>
	<span class="pill-badge">Hbf</span>
</a>

<style>
	.bahnhof-shuttle-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border-radius: var(--shape-corner-full, 9999px);
		background: var(--surface-container-high, rgba(255, 255, 255, 0.08));
		color: var(--on-surface, #e2e2e6);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		border: 1px solid var(--outline-variant, rgba(255, 255, 255, 0.12));
		transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
		user-select: none;
		backdrop-filter: blur(8px);
	}

	.bahnhof-shuttle-pill:hover {
		background: var(--surface-container-highest, rgba(255, 255, 255, 0.15));
		border-color: var(--primary, #80b3ff);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.bahnhof-shuttle-pill.floating {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 900;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
	}

	.train-icon {
		flex-shrink: 0;
		color: var(--primary, #80b3ff);
	}

	.pill-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--primary-container, rgba(128, 179, 255, 0.2));
		color: var(--primary, #80b3ff);
		letter-spacing: 0.5px;
	}
</style>
