<script lang="ts">
/**
 * WhatImDoingCapsule — 头像上方状态胶囊与历史抽屉
 * Material 3 Expressive 风格设计，纯插拔零侵入。
 */
import { onDestroy, onMount } from "svelte";
import { decodeHistoryResponse } from "../protocol/protobuf.js";
import type { ActivityHistoryResponse, DeviceActivity } from "../protocol/types.js";
import { formatActivitySentence, formatRelativeTime } from "./RelativeTime.js";

let {
	endpoint = "/api/activity",
	maxHistoryDisplay = 5,
	refreshInterval = 30000,
	class: className = "",
}: {
	endpoint?: string;
	maxHistoryDisplay?: number;
	refreshInterval?: number;
	class?: string;
} = $props();

let data = $state<ActivityHistoryResponse | null>(null);
let briefLoading = $state(false);
let historyLoading = $state(false);
let historyLoaded = $state(false);
let expanded = $state(false);
let selectedDeviceId = $state<string>("all");
let timerId: ReturnType<typeof setInterval> | null = null;
let currentTime = $state(Date.now());
let capsuleEl: HTMLElement | null = $state(null);
let hasEnteredViewport = $state(false);

// Clock tick every 10s to update relative time smoothly
let clockTimer: ReturnType<typeof setInterval> | null = null;
let observer: IntersectionObserver | null = null;

const currentActivity = $derived(data?.current ?? null);
const devices = $derived(data?.devices ?? []);
const allHistory = $derived(data?.history ?? []);

const filteredHistory = $derived.by(() => {
	if (selectedDeviceId === "all") {
		return allHistory.slice(0, maxHistoryDisplay);
	}
	return allHistory
		.filter((h) => h.deviceId === selectedDeviceId)
		.slice(0, maxHistoryDisplay);
});

const formatted = $derived(
	formatActivitySentence(currentActivity, currentTime, "zh"),
);

const statusLabel = $derived.by(() => {
	switch (formatted.statusType) {
		case "active":
			return "正在活跃";
		case "idle":
			return "设备空闲";
		case "away":
			return "暂时离开";
		default:
			return "离线";
	}
});

function getUrlWithParam(param: string): string {
	const sep = endpoint.includes("?") ? "&" : "?";
	return `${endpoint}${sep}${param}`;
}

async function fetchBriefStatus() {
	if (briefLoading) return;
	briefLoading = true;
	try {
		const targetUrl = getUrlWithParam("brief=1");
		const res = await fetch(targetUrl, {
			headers: {
				Accept: "application/x-protobuf, application/json",
			},
		});

		if (!res.ok) return;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/x-protobuf")) {
			const buffer = await res.arrayBuffer();
			const decoded = decodeHistoryResponse(new Uint8Array(buffer));
			// Preserve existing history if already loaded
			data = {
				current: decoded.current,
				devices: decoded.devices.length > 0 ? decoded.devices : (data?.devices ?? []),
				history: data?.history ?? [],
				serverTime: decoded.serverTime,
			};
		} else {
			const json = (await res.json()) as ActivityHistoryResponse;
			data = {
				current: json.current,
				devices: json.devices?.length > 0 ? json.devices : (data?.devices ?? []),
				history: data?.history ?? [],
				serverTime: json.serverTime,
			};
		}
		currentTime = Date.now();
	} catch (err) {
		console.debug("[what-im-doing] Brief status paused:", err);
	} finally {
		briefLoading = false;
	}
}

async function fetchFullHistory() {
	if (historyLoading) return;
	historyLoading = true;
	try {
		const targetUrl = getUrlWithParam("history=1");
		const res = await fetch(targetUrl, {
			headers: {
				Accept: "application/x-protobuf, application/json",
			},
		});

		if (!res.ok) return;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/x-protobuf")) {
			const buffer = await res.arrayBuffer();
			data = decodeHistoryResponse(new Uint8Array(buffer));
		} else {
			data = (await res.json()) as ActivityHistoryResponse;
		}
		historyLoaded = true;
		currentTime = Date.now();
	} catch (err) {
		console.debug("[what-im-doing] History fetch paused:", err);
	} finally {
		historyLoading = false;
	}
}

function startPolling() {
	if (refreshInterval > 0 && !timerId) {
		timerId = setInterval(() => {
			if (document.visibilityState === "visible" && hasEnteredViewport) {
				fetchBriefStatus();
			}
		}, refreshInterval);
	}
}

function stopPolling() {
	if (timerId) {
		clearInterval(timerId);
		timerId = null;
	}
}

function handleVisibilityChange() {
	if (document.visibilityState === "visible" && hasEnteredViewport) {
		fetchBriefStatus();
		startPolling();
	} else if (document.visibilityState === "hidden") {
		stopPolling();
	}
}

function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		},
	};
}

let desktopLeft = $state(0);
let desktopBottom = $state(0);
let isMobile = $state(false);

function updatePosition() {
	if (typeof window === "undefined") return;
	isMobile = window.innerWidth < 768;
	if (!capsuleEl) return;
	const rect = capsuleEl.getBoundingClientRect();
	desktopLeft = Math.round(rect.left + rect.width / 2);
	// Clamp horizontal center so 360px card remains within viewport
	desktopLeft = Math.max(185, Math.min(window.innerWidth - 185, desktopLeft));

	// Distance from viewport bottom to capsule top, with 8px margin
	// This anchors the card directly above the capsule to cover the banner
	const spaceAbove = rect.top;
	if (spaceAbove >= 180) {
		desktopBottom = Math.round(window.innerHeight - rect.top + 8);
	} else {
		desktopBottom = Math.max(16, Math.round(window.innerHeight - 340));
	}
}

async function toggleExpand() {
	expanded = !expanded;
	if (expanded) {
		updatePosition();
		// Strictly on-intent: Only request full history upon user interaction
		if (!historyLoaded && !historyLoading) {
			await fetchFullHistory();
		}
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape" && expanded) {
		expanded = false;
	}
}

	$effect(() => {
		if (typeof document === "undefined") return;
		if (expanded) {
			const originalOverflow = document.body.style.overflow;
			const originalPaddingRight = document.body.style.paddingRight;
			const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
			if (scrollbarWidth > 0) {
				document.body.style.paddingRight = `${scrollbarWidth}px`;
			}
			document.body.style.overflow = "hidden";

			return () => {
				document.body.style.overflow = originalOverflow;
				document.body.style.paddingRight = originalPaddingRight;
			};
		}
	});

	onMount(() => {
	// Rule 2.4: Zero eager network fetch on mount.
	// We wait for the capsule to actually enter the user's viewport.
	if (typeof IntersectionObserver !== "undefined" && capsuleEl) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						hasEnteredViewport = true;
						fetchBriefStatus();
						startPolling();
					} else {
						stopPolling();
					}
				}
			},
			{ rootMargin: "50px" },
		);
		observer.observe(capsuleEl);
	} else {
		// Fallback if IntersectionObserver is unavailable
		hasEnteredViewport = true;
		fetchBriefStatus();
		startPolling();
	}

	clockTimer = setInterval(() => {
		currentTime = Date.now();
	}, 10000);

	const handleResize = () => {
		if (expanded) {
			updatePosition();
		}
	};

	window.addEventListener("resize", handleResize);
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("keydown", handleKeydown);

	return () => {
		stopPolling();
		if (clockTimer) clearInterval(clockTimer);
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		window.removeEventListener("resize", handleResize);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		window.removeEventListener("keydown", handleKeydown);
	};
});
</script>

<div bind:this={capsuleEl} class={`wid-capsule-wrapper ${className}`}>
	<!-- 顶部状态胶囊：淡强调色填充标签风格，多行自适应高可读性 -->
	<button
		type="button"
		class={`wid-capsule wid-capsule--${formatted.statusType}`}
		onclick={toggleExpand}
		aria-expanded={expanded}
		aria-label="查看我的实时设备与活动历史"
	>
		<!-- 头部状态行：状态指示灯 + 状态名 + 相对时间 + 展开提示 -->
		<div class="wid-capsule__header-row">
			<span class="wid-capsule__status-tag">
				<span class="wid-capsule__dot"></span>
				<span class="wid-capsule__status-name">{statusLabel}</span>
			</span>
			{#if formatted.relativeTime}
				<span class="wid-capsule__time">{formatted.relativeTime}</span>
			{/if}
			<span class="wid-capsule__toggle-hint">
				<span>{expanded ? "收起" : "展开"}</span>
				<svg
					class="wid-capsule__chevron"
					class:wid-capsule__chevron--open={expanded}
					viewBox="0 0 24 24"
					width="12"
					height="12"
					aria-hidden="true"
				>
					<path
						fill="currentColor"
						d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"
					/>
				</svg>
			</span>
		</div>

		<!-- 主内容行：应用名称（加粗） + 窗口标题/媒体信息（多行自适应，清晰透明） -->
		<div class="wid-capsule__detail-row">
			{#if currentActivity?.media?.title}
				<span class="wid-capsule__media-icon">🎵</span>
				<strong class="wid-capsule__app-name">{currentActivity.media.title}</strong>
				{#if currentActivity.media.artist}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__window-title">{currentActivity.media.artist}</span>
				{/if}
			{:else if currentActivity?.appName}
				<strong class="wid-capsule__app-name">{currentActivity.appName}</strong>
				{#if currentActivity.windowTitle && currentActivity.windowTitle !== currentActivity.appName}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__window-title">{currentActivity.windowTitle}</span>
				{/if}
			{:else}
				<span class="wid-capsule__fallback">{formatted.sentence}</span>
			{/if}
		</div>
	</button>
</div>

<!-- 展开态：挂载至 document.body 向上遮挡 Banner，彻底打破 Card 的 overflow: hidden 物理限制 -->
{#if expanded}
	<div use:portal class="wid-portal-layer">
		<!-- 暗色半透明纯色遮罩（点击收起，绝不使用毛玻璃） -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="wid-scrim"
			onclick={() => (expanded = false)}
			role="presentation"
		></div>

		<!-- 向上展开遮挡 Banner 的悬浮详情卡片（纯色背景，零模糊，流畅顺滑） -->
		<div
			class="wid-popover"
			role="dialog"
			aria-modal="true"
			aria-label="设备与活动状态详情"
			style={`--wid-bottom: ${desktopBottom}px; --wid-left: ${desktopLeft}px;`}
		>
			<!-- 向下呼应锚点指示箭头 -->
			<div class="wid-popover__anchor-arrow" aria-hidden="true"></div>

			<div class="wid-popover__header">
				<div class="wid-popover__title">
					<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
						<path
							fill="currentColor"
							d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"
						/>
					</svg>
					<span>设备与活动状态</span>
				</div>
				<button
					type="button"
					class="wid-popover__close"
					onclick={() => (expanded = false)}
					aria-label="关闭详情"
				>
					✕
				</button>
			</div>

			<!-- 当前活跃窗口细节 -->
			{#if currentActivity}
				<div class="wid-popover__current">
					<div class="wid-popover__current-app">
						<span class="wid-tag wid-tag--primary">{currentActivity.appName}</span>
						<span class="wid-popover__current-device">{currentActivity.deviceName}</span>
					</div>
					{#if currentActivity.media?.title}
						<div class="wid-popover__media">
							<span class="wid-popover__media-icon">🎵</span>
							<span class="wid-popover__media-text">
								{currentActivity.media.title}{#if currentActivity.media.artist} — {currentActivity.media.artist}{/if}
							</span>
						</div>
					{/if}
					{#if currentActivity.windowTitle}
						<div class="wid-popover__window-title" title={currentActivity.windowTitle}>
							"{currentActivity.windowTitle}"
						</div>
					{/if}
					{#if currentActivity.osInfo}
						<div class="wid-popover__os-info">
							{currentActivity.osInfo}
						</div>
					{/if}
				</div>
			{/if}

			<!-- 多设备切换 Tab (如果存在多台设备) -->
			{#if devices.length > 1}
				<div class="wid-popover__devices" role="tablist">
					<button
						type="button"
						class="wid-device-chip"
						class:wid-device-chip--active={selectedDeviceId === "all"}
						onclick={() => (selectedDeviceId = "all")}
					>
						全部设备 ({devices.length})
					</button>
					{#each devices as dev}
						<button
							type="button"
							class="wid-device-chip"
							class:wid-device-chip--active={selectedDeviceId === dev.deviceId}
							onclick={() => (selectedDeviceId = dev.deviceId)}
						>
							{dev.deviceName || dev.deviceId}
						</button>
					{/each}
				</div>
			{/if}

			<!-- 历史时间轴 -->
			<div class="wid-popover__history">
				<div class="wid-popover__history-title">最近记录</div>
				{#if historyLoading}
					<div class="wid-popover__empty">正在拉取历史记录...</div>
				{:else if filteredHistory.length === 0}
					<div class="wid-popover__empty">暂无历史记录</div>
				{:else}
					<ul class="wid-timeline">
						{#each filteredHistory as item}
							<li class="wid-timeline__item">
								<div class="wid-timeline__dot"></div>
								<div class="wid-timeline__content">
									<div class="wid-timeline__row">
										<span class="wid-timeline__app">{item.appName}</span>
										<span class="wid-timeline__time">{formatRelativeTime(item.timestamp, currentTime, "zh")}</span>
									</div>
									{#if item.windowTitle && item.windowTitle !== item.appName}
										<div class="wid-timeline__title" title={item.windowTitle}>
											{item.windowTitle}
										</div>
									{/if}
									<div class="wid-timeline__device">
										{item.deviceName}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="wid-popover__footer">
				<span class="wid-popover__proto-badge">Protobuf v3 Ingested</span>
				<span class="wid-popover__pulse-rate">每 {Math.round(refreshInterval / 1000)}s 同步</span>
			</div>
		</div>
	</div>
{/if}

<style>
.wid-capsule-wrapper {
	position: relative;
	width: 100%;
	margin-bottom: 0.75rem;
	z-index: 30;
	pointer-events: auto;
}

/* 胶囊主体：淡强调色填充标签设计，纯色无毛玻璃，文字多行高可读 */
.wid-capsule {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	width: 100%;
	padding: 0.5rem 0.75rem;
	border-radius: 12px;
	/* 淡强调色：Material 3 容器色，纯色清晰，绝不用毛玻璃 */
	background: var(--primary-container, color-mix(in oklab, var(--primary, #6750a4) 14%, var(--card-bg, #ffffff)));
	color: var(--on-primary-container, color-mix(in oklab, var(--primary, #6750a4) 85%, #000000));
	border: 1px solid color-mix(in oklab, var(--primary, #6750a4) 24%, transparent);
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
	text-align: left;
	cursor: pointer;
	text-decoration: none;
	transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
	user-select: none;
}

.wid-capsule:hover {
	background: color-mix(in oklab, var(--primary, #6750a4) 20%, var(--card-bg, #ffffff));
	border-color: var(--primary, #6750a4);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	transform: translateY(-1px);
}

.wid-capsule__header-row {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.725rem;
	line-height: 1;
}

.wid-capsule__status-tag {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	font-weight: 600;
}

.wid-capsule__dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #9ca3af;
	flex-shrink: 0;
}

.wid-capsule--active .wid-capsule__dot {
	background: #10b981;
	box-shadow: 0 0 5px #10b981;
}

.wid-capsule--idle .wid-capsule__dot {
	background: #f59e0b;
}

.wid-capsule--away .wid-capsule__dot,
.wid-capsule--offline .wid-capsule__dot {
	background: #9ca3af;
}

.wid-capsule__status-name {
	font-size: 0.725rem;
}

.wid-capsule__time {
	font-size: 0.675rem;
	opacity: 0.8;
}

.wid-capsule__toggle-hint {
	margin-left: auto;
	display: inline-flex;
	align-items: center;
	gap: 0.15rem;
	font-size: 0.675rem;
	opacity: 0.75;
}

.wid-capsule__chevron {
	transition: transform 0.2s ease;
}

.wid-capsule__chevron--open {
	transform: rotate(180deg);
}

.wid-capsule__detail-row {
	font-size: 0.775rem;
	line-height: 1.35;
	word-break: break-word;
	color: var(--on-surface, #1c1b1f);
}

.wid-capsule__app-name {
	font-weight: 700;
	color: var(--primary, #6750a4);
}

.wid-capsule__sep {
	margin: 0 0.2rem;
	opacity: 0.5;
}

.wid-capsule__window-title {
	opacity: 0.88;
}

.wid-capsule__media-tag {
	margin-right: 0.2rem;
}

.wid-capsule__fallback {
	opacity: 0.85;
}

/* Portal 独立容器与遮罩 */
.wid-portal-layer {
	position: fixed;
	inset: 0;
	z-index: 9999;
	pointer-events: none;
}

.wid-scrim {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.32);
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
	pointer-events: auto;
	touch-action: none;
	overscroll-behavior: contain;
	contain: strict;
	animation: wid-fade-in 0.18s cubic-bezier(0, 0, 0.2, 1);
}

@keyframes wid-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

/* 向上展开遮挡 Banner 的悬浮卡片：纯色背景，零模糊 */
.wid-popover {
	position: fixed;
	pointer-events: auto;
	bottom: var(--wid-bottom, 120px);
	left: var(--wid-left, 50%);
	transform: translateX(-50%);
	width: min(94vw, 360px);
	max-height: calc(100vh - var(--wid-bottom, 120px) - 20px);
	overflow-y: auto;
	overscroll-behavior: contain;
	-webkit-overflow-scrolling: touch;
	contain: layout paint;
	will-change: transform;
	background: var(--card-bg, #ffffff);
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.15));
	border-radius: 16px;
	padding: 1rem;
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.06);
	z-index: 10000;
	animation: wid-pop-up 0.2s cubic-bezier(0.05, 0.7, 0.1, 1);
}

@keyframes wid-pop-up {
	from {
		opacity: 0;
		transform: translate(-50%, 8px) scale(0.97);
	}
	to {
		opacity: 1;
		transform: translate(-50%, 0) scale(1);
	}
}

.wid-popover__anchor-arrow {
	display: block;
	position: absolute;
	bottom: -6px;
	left: 50%;
	transform: translateX(-50%) rotate(45deg);
	width: 12px;
	height: 12px;
	background: var(--card-bg, #ffffff);
	border-right: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.15));
	border-bottom: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.15));
	z-index: 1;
}

.wid-popover__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.75rem;
}

.wid-popover__title {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--primary, #6750a4);
}

.wid-popover__close {
	background: none;
	border: none;
	font-size: 0.875rem;
	color: var(--on-surface-variant, #49454f);
	cursor: pointer;
	padding: 0.25rem 0.5rem;
	border-radius: 6px;
}

.wid-popover__close:hover {
	background: var(--surface-container-high, rgba(0, 0, 0, 0.05));
}

.wid-popover__current {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.03));
	border-radius: 10px;
	padding: 0.75rem;
	margin-bottom: 0.75rem;
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
}

.wid-popover__current-app {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 0.375rem;
}

.wid-tag {
	display: inline-block;
	font-size: 0.75rem;
	font-weight: 600;
	padding: 0.125rem 0.5rem;
	border-radius: 6px;
	background: var(--primary-container, #eaddff);
	color: var(--on-primary-container, #21005d);
}

.wid-popover__current-device {
	font-size: 0.75rem;
	color: var(--on-surface-variant, #49454f);
}

.wid-popover__media {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	margin-bottom: 0.375rem;
	padding: 0.25rem 0.5rem;
	background: var(--surface-container-high, rgba(0, 0, 0, 0.04));
	border-radius: 6px;
	font-size: 0.75rem;
}

.wid-popover__media-icon {
	flex-shrink: 0;
	font-size: 0.8125rem;
	line-height: 1;
}

.wid-popover__media-text {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--on-surface-variant, #49454f);
	font-weight: 500;
}

.wid-popover__window-title {
	font-size: 0.8125rem;
	color: var(--on-surface, #1c1b1f);
	font-style: italic;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-bottom: 0.25rem;
}

.wid-popover__os-info {
	font-size: 0.6875rem;
	color: var(--outline, #79747e);
}

.wid-popover__devices {
	display: flex;
	gap: 0.375rem;
	overflow-x: auto;
	padding-bottom: 0.5rem;
	margin-bottom: 0.75rem;
}

.wid-device-chip {
	background: var(--surface-container-high, rgba(0, 0, 0, 0.05));
	border: 1px solid transparent;
	border-radius: 9999px;
	padding: 0.25rem 0.625rem;
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	cursor: pointer;
	white-space: nowrap;
}

.wid-device-chip--active {
	background: var(--primary, #6750a4);
	color: var(--on-primary, #ffffff);
	font-weight: 500;
}

.wid-popover__history-title {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface-variant, #49454f);
	margin-bottom: 0.5rem;
}

.wid-timeline {
	list-style: none;
	padding: 0;
	margin: 0;
	max-height: 180px;
	overflow-y: auto;
}

.wid-timeline__item {
	display: flex;
	gap: 0.625rem;
	padding-bottom: 0.625rem;
	position: relative;
}

.wid-timeline__item:not(:last-child)::before {
	content: "";
	position: absolute;
	left: 3px;
	top: 10px;
	bottom: 0;
	width: 1px;
	background: var(--outline-variant, rgba(0, 0, 0, 0.1));
}

.wid-timeline__dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--primary, #6750a4);
	margin-top: 4px;
	flex-shrink: 0;
}

.wid-timeline__content {
	flex: 1;
	min-width: 0;
}

.wid-timeline__row {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 0.5rem;
}

.wid-timeline__app {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface, #1c1b1f);
}

.wid-timeline__time {
	font-size: 0.6875rem;
	color: var(--outline, #79747e);
}

.wid-timeline__title {
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-timeline__device {
	font-size: 0.625rem;
	color: var(--outline, #79747e);
}

.wid-popover__empty {
	font-size: 0.75rem;
	color: var(--outline, #79747e);
	text-align: center;
	padding: 1rem 0;
}

.wid-popover__footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
	padding-top: 0.5rem;
	margin-top: 0.5rem;
	font-size: 0.625rem;
	color: var(--outline, #79747e);
}

.wid-popover__proto-badge {
	background: color-mix(in oklab, var(--primary, #6750a4) 15%, transparent);
	color: var(--primary, #6750a4);
	padding: 0.125rem 0.375rem;
	border-radius: 4px;
	font-weight: 600;
}
</style>
