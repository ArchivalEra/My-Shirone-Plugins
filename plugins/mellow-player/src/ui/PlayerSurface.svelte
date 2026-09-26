<script lang="ts">
	import { onMount } from "svelte";
	import type { EngineDiagnostics, MediaEngine } from "../engine/engine.js";
	import {
		describeFailure,
		formatBytes,
		formatDuration,
		formatLatency,
	} from "../format.js";
	import type { PlayerLabels } from "../protocol/types.js";

	interface Props {
		engine: MediaEngine;
		labels: PlayerLabels;
		title: string;
		sourceUrl: string;
		/** Show the transport-accounting panel and the engine pill. */
		diagnostics: boolean;
		/** Prepare the media as soon as the surface is on screen. */
		autoLoad: boolean;
	}

	let {
		engine,
		labels,
		title,
		sourceUrl,
		diagnostics,
		autoLoad,
	}: Props = $props();

	const RATES = [0.5, 1, 1.5, 2];
	const SEEK_NOTICE_MS = 2400;

	let stage: HTMLDivElement | undefined = $state();
	let frame: HTMLDivElement | undefined = $state();
	let ready = $state(false);
	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let muted = $state(false);
	let rate = $state(1);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	let fullscreen = $state(false);
	let showDiagnostics = $state(false);
	let snapshot = $state<EngineDiagnostics | null>(null);
	let landing = $state<{ target: number; actual: number } | null>(null);
	let landingTimer: ReturnType<typeof setTimeout> | null = null;

	const engineLabel = $derived(
		engine.name === "mellow" ? labels.engineMellow : labels.engineNative,
	);

	$effect(() => {
		const offs = [
			engine.on("loaded", ({ duration: total }) => {
				duration = total;
			}),
			engine.on("time", ({ currentTime: now, duration: total }) => {
				currentTime = now;
				if (total > 0) duration = total;
			}),
			engine.on("playstate", ({ paused: next }) => {
				paused = next;
				busy = false;
			}),
			engine.on("volume", ({ volume: next, muted: nextMuted }) => {
				volume = next;
				muted = nextMuted;
			}),
			engine.on("rate", ({ rate: next }) => {
				rate = next;
			}),
			engine.on("seek", ({ targetTime, actualTime }) => {
				currentTime = actualTime;
				if (!engine.capabilities.keyframeSeek) return;
				landing = { target: targetTime, actual: actualTime };
				if (landingTimer) clearTimeout(landingTimer);
				landingTimer = setTimeout(() => {
					landing = null;
					landingTimer = null;
				}, SEEK_NOTICE_MS);
			}),
			engine.on("ended", () => {
				paused = true;
			}),
			engine.on("error", ({ message }) => {
				failure = message;
				busy = false;
			}),
		];
		return () => {
			for (const off of offs) off();
			if (landingTimer) {
				clearTimeout(landingTimer);
				landingTimer = null;
			}
		};
	});

	$effect(() => {
		if (!diagnostics || !showDiagnostics) {
			snapshot = null;
			return;
		}
		const tick = () => {
			snapshot = engine.diagnostics();
		};
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	});

	onMount(() => {
		const host = stage;
		if (!host) return;
		let cancelled = false;

		const onChange = () => {
			fullscreen = document.fullscreenElement === frame;
		};
		document.addEventListener("fullscreenchange", onChange);

		void engine
			.attach(host)
			.then(async () => {
				if (cancelled) return;
				engine.setVolume(volume);
				engine.setMuted(muted);
				if (!autoLoad) return;
				busy = true;
				try {
					await engine.load(sourceUrl);
					ready = true;
				} catch (error) {
					failure = describeFailure(error);
				} finally {
					busy = false;
				}
			})
			.catch((error) => {
				if (!cancelled) failure = describeFailure(error);
			});

		return () => {
			cancelled = true;
			document.removeEventListener("fullscreenchange", onChange);
			engine.destroy();
		};
	});

	async function togglePlay(): Promise<void> {
		if (busy) return;
		failure = null;

		if (!paused) {
			engine.pause();
			return;
		}

		if (!ready) {
			busy = true;
			try {
				await engine.load(sourceUrl);
				ready = true;
			} catch (error) {
				failure = describeFailure(error);
				busy = false;
				return;
			}
		}

		try {
			await engine.play();
		} catch (error) {
			failure = describeFailure(error);
		} finally {
			busy = false;
		}
	}

	function onSeekInput(event: Event): void {
		currentTime = Number((event.currentTarget as HTMLInputElement).value);
	}

	async function onSeekChange(event: Event): Promise<void> {
		await engine.seek(Number((event.currentTarget as HTMLInputElement).value));
	}

	function onVolumeInput(event: Event): void {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		volume = next;
		engine.setVolume(next);
		if (next > 0 && muted) {
			muted = false;
			engine.setMuted(false);
		}
	}

	function toggleMute(): void {
		muted = !muted;
		engine.setMuted(muted);
	}

	function cycleRate(): void {
		if (!engine.capabilities.selectableRate) return;
		const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
		rate = next;
		try {
			engine.setRate(next);
		} catch (error) {
			failure = describeFailure(error);
		}
	}

	async function toggleFullscreen(): Promise<void> {
		// The frame, not the stage: the controls live beside the stage, and
		// fullscreening the stage alone would take them off screen.
		const host = frame;
		if (!host) return;
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await host.requestFullscreen();
			}
		} catch (error) {
			failure = describeFailure(error);
		}
	}
</script>

<div class="mp">
	<!-- The frame is the positioning context: the controls are siblings of the
	     stage, so anchoring them to the stage would not work, and fullscreening
	     it alone would leave them behind. -->
	<div class="mp__frame" bind:this={frame}>
		<div
			class="mp__stage"
			bind:this={stage}
			role="group"
			aria-label={title}
			onclick={togglePlay}
		></div>

		{#if engine.name === "mellow"}
			<div class="mp__pill mp__pill--engine">{engineLabel}</div>
		{/if}

		{#if landing}
			<div class="mp__pill mp__pill--seek">
				{formatDuration(landing.target)}&nbsp;→&nbsp;{formatDuration(
					landing.actual,
				)}
			</div>
		{/if}

		{#if paused}
			<button
				class="mp__overlay"
				type="button"
				aria-label={labels.play}
				title={labels.play}
				onclick={togglePlay}
				disabled={busy}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M8 5v14l11-7z" />
				</svg>
			</button>
		{/if}

		{#if busy || failure}
			<p class="mp__status" class:mp__status--failed={failure !== null}>
				{#if failure}
					<strong>{labels.error}</strong>
					<code>{failure}</code>
				{:else}
					{labels.loading}
				{/if}
			</p>
		{/if}

		<div class="mp__bar">
			<div class="mp__scrub">
				<span class="mp__time">{formatDuration(currentTime)}</span>
				<input
					class="mp__range mp__range--seek"
					type="range"
					min="0"
					max={duration > 0 ? duration : 0}
					step="0.1"
					value={currentTime}
					disabled={duration <= 0}
					aria-label={labels.seek}
					title={labels.seek}
					oninput={onSeekInput}
					onchange={onSeekChange}
				/>
				<span class="mp__time">{formatDuration(duration)}</span>
			</div>

			<div class="mp__controls">
				<button
					class="mp__button mp__button--primary"
					type="button"
					aria-label={paused ? labels.play : labels.pause}
					title={paused ? labels.play : labels.pause}
					onclick={togglePlay}
					disabled={busy}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						{#if paused}
							<path d="M8 5v14l11-7z" />
						{:else}
							<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
						{/if}
					</svg>
				</button>

				<button
					class="mp__button"
					type="button"
					aria-label={muted ? labels.unmute : labels.mute}
					title={muted ? labels.unmute : labels.mute}
					onclick={toggleMute}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						{#if muted || volume === 0}
							<path
								d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
							/>
						{:else}
							<path
								d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
							/>
						{/if}
					</svg>
				</button>

				<input
					class="mp__range mp__range--volume"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={muted ? 0 : volume}
					aria-label={labels.volume}
					title={labels.volume}
					oninput={onVolumeInput}
				/>

				{#if engine.capabilities.selectableRate}
					<button
						class="mp__button mp__button--text"
						type="button"
						aria-label={labels.rate}
						title={labels.rate}
						onclick={cycleRate}
					>
						{rate}×
					</button>
				{/if}

				{#if diagnostics}
					<button
						class="mp__button"
						class:mp__button--on={showDiagnostics}
						type="button"
						aria-label={labels.diagnostics}
						title={labels.diagnostics}
						aria-pressed={showDiagnostics}
						onclick={() => (showDiagnostics = !showDiagnostics)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
						</svg>
					</button>
				{/if}

				<button
					class="mp__button"
					type="button"
					aria-label={fullscreen ? labels.exitFullscreen : labels.fullscreen}
					title={fullscreen ? labels.exitFullscreen : labels.fullscreen}
					onclick={toggleFullscreen}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						{#if fullscreen}
							<path
								d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
							/>
						{:else}
							<path
								d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
							/>
						{/if}
					</svg>
				</button>
			</div>
		</div>
	</div>

	{#if diagnostics && showDiagnostics}
		<div class="mp__diagnostics">
			<dl class="mp__metrics">
				<div>
					<dt>{labels.engine}</dt>
					<dd>{engineLabel}</dd>
				</div>
				{#if snapshot}
					<div>
						<dt>{labels.requests}</dt>
						<dd>{snapshot.requests}</dd>
					</div>
					<div>
						<dt>{labels.transferred}</dt>
						<dd>{formatBytes(snapshot.bytes)}</dd>
					</div>
					<div>
						<dt>{labels.hardware}</dt>
						<dd>
							{snapshot.hardwareDecode
								? labels.hardwareEnabled
								: labels.hardwareDisabled}
						</dd>
					</div>
					<div>
						<dt>{labels.startup}</dt>
						<dd>{formatLatency(snapshot.startupMs)}</dd>
					</div>
					<div>
						<dt>{labels.seekLatency}</dt>
						<dd>{formatLatency(snapshot.seekMs)}</dd>
					</div>
				{/if}
			</dl>

			{#if snapshot && engine.capabilities.boundedRanges}
				<ol class="mp__ranges">
					{#each snapshot.ranges.slice(-40) as range (range)}
						<li>{range}</li>
					{/each}
				</ol>
			{/if}
		</div>
	{/if}
</div>

<style>
	.mp {
		display: flex;
		flex-direction: column;
		gap: var(--m3e-space-2);
	}

	/* Positioning context for the stage's overlays and the control bar, and the
	   element that goes fullscreen so the controls come with it. */
	.mp__frame {
		position: relative;
	}

	.mp__stage {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: var(--surface-container-high);
		border-radius: var(--shape-corner-l);
	}

	.mp__frame:fullscreen {
		display: grid;
		place-items: center;
		background: var(--surface-container-high);
	}

	.mp__frame:fullscreen .mp__stage {
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
		border-radius: 0;
	}

	/* The engine owns this element; it is created after mount, so the rule
	   cannot be scoped to the component's own markup. */
	.mp__stage :global(.mp-stage__media) {
		display: block;
		max-width: 100%;
		max-height: 100%;
		border-radius: inherit;
	}

	.mp__stage :global(video.mp-stage__media) {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.mp__overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 68px;
		height: 68px;
		transform: translate(-50%, -50%);
		border: none;
		border-radius: var(--shape-corner-full);
		background: var(--primary);
		box-shadow: var(--m3e-elevation-2);
		color: var(--on-primary);
		cursor: pointer;
		transition:
			background var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized);
	}

	.mp__overlay:hover:not(:disabled) {
		background: color-mix(in oklab, var(--on-primary) 8%, var(--primary));
		transform: translate(-50%, -50%) scale(1.04);
	}

	.mp__overlay:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.mp__overlay svg {
		width: 32px;
		height: 32px;
		fill: currentColor;
	}

	.mp__pill {
		position: absolute;
		z-index: 2;
		padding: 2px var(--m3e-space-3);
		border-radius: var(--shape-corner-full);
		background: color-mix(in oklab, var(--surface-container-highest) 82%, transparent);
		color: var(--on-surface-variant);
		font: var(--m3e-type-label-medium);
		pointer-events: none;
	}

	.mp__pill--engine {
		top: var(--m3e-space-2);
		left: var(--m3e-space-2);
	}

	.mp__pill--seek {
		top: var(--m3e-space-2);
		right: var(--m3e-space-2);
		color: var(--primary);
	}

	.mp__status {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: var(--m3e-space-1);
		max-width: calc(100% - var(--m3e-space-6));
		margin: 0;
		padding: var(--m3e-space-2) var(--m3e-space-3);
		transform: translate(-50%, -50%);
		border-radius: var(--shape-corner-m);
		background: var(--surface-container);
		color: var(--on-surface);
		font: var(--m3e-type-label-large);
		text-align: center;
	}

	.mp__status--failed {
		color: var(--error, var(--on-surface));
	}

	.mp__status code {
		overflow-wrap: anywhere;
		color: var(--on-surface-variant);
		font: var(--m3e-type-body-small);
	}

	.mp__bar {
		position: absolute;
		right: var(--m3e-space-2);
		bottom: var(--m3e-space-2);
		left: var(--m3e-space-2);
		z-index: 3;
		display: flex;
		flex-direction: column;
		gap: var(--m3e-space-1);
		padding: var(--m3e-space-2) var(--m3e-space-3);
		border-radius: var(--shape-corner-m);
		background: color-mix(in oklab, var(--surface-container) 88%, transparent);
		backdrop-filter: blur(12px);
	}

	.mp__scrub {
		display: flex;
		align-items: center;
		gap: var(--m3e-space-2);
	}

	.mp__time {
		flex: none;
		color: var(--on-surface-variant);
		font: var(--m3e-type-label-medium);
		font-variant-numeric: tabular-nums;
	}

	.mp__controls {
		display: flex;
		align-items: center;
		gap: var(--m3e-space-1);
	}

	.mp__button {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		padding: 0;
		border: none;
		border-radius: var(--shape-corner-full);
		background: transparent;
		color: var(--on-surface);
		cursor: pointer;
		transition: background var(--m3e-duration-short) var(--m3e-easing-standard);
	}

	.mp__button:hover:not(:disabled) {
		background: color-mix(in oklab, var(--on-surface) 8%, transparent);
	}

	.mp__button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.mp__button svg {
		width: 22px;
		height: 22px;
		fill: currentColor;
	}

	.mp__button--primary {
		background: var(--primary);
		color: var(--on-primary);
	}

	.mp__button--primary:hover:not(:disabled) {
		background: color-mix(in oklab, var(--on-primary) 8%, var(--primary));
	}

	.mp__button--text {
		width: auto;
		min-width: 44px;
		padding: 0 var(--m3e-space-2);
		font: var(--m3e-type-label-large);
		font-variant-numeric: tabular-nums;
	}

	.mp__button--on {
		background: var(--secondary-container);
		color: var(--on-secondary-container, var(--on-surface));
	}

	.mp__range {
		appearance: none;
		-webkit-appearance: none;
		height: 20px;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}

	.mp__range--seek {
		flex: 1 1 auto;
		min-width: 0;
	}

	.mp__range--volume {
		flex: 0 1 84px;
		width: 84px;
	}

	.mp__range::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: var(--shape-corner-full);
		background: color-mix(in oklab, var(--on-surface) 24%, transparent);
	}

	.mp__range::-webkit-slider-thumb {
		appearance: none;
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		margin-top: -5px;
		border: none;
		border-radius: var(--shape-corner-full);
		background: var(--primary);
	}

	.mp__range::-moz-range-track {
		height: 4px;
		border-radius: var(--shape-corner-full);
		background: color-mix(in oklab, var(--on-surface) 24%, transparent);
	}

	.mp__range::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: none;
		border-radius: var(--shape-corner-full);
		background: var(--primary);
	}

	.mp__range:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.mp__range:focus-visible,
	.mp__button:focus-visible,
	.mp__overlay:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	.mp__diagnostics {
		display: flex;
		flex-direction: column;
		gap: var(--m3e-space-2);
		padding: var(--m3e-space-3);
		border-radius: var(--shape-corner-m);
		background: var(--surface-container);
		color: var(--on-surface-variant);
	}

	.mp__metrics {
		display: flex;
		flex-wrap: wrap;
		gap: var(--m3e-space-2) var(--m3e-space-4);
		margin: 0;
	}

	.mp__metrics div {
		display: flex;
		flex-direction: column;
	}

	.mp__metrics dt {
		color: var(--on-surface-variant);
		font: var(--m3e-type-label-small);
	}

	.mp__metrics dd {
		margin: 0;
		color: var(--on-surface);
		font: var(--m3e-type-label-large);
		font-variant-numeric: tabular-nums;
	}

	.mp__ranges {
		max-height: 8rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		color: var(--on-surface-variant);
		font: var(--m3e-type-body-small);
		font-variant-numeric: tabular-nums;
		list-style: none;
	}
</style>
