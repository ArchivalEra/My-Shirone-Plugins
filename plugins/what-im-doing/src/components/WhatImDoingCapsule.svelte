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
	// Distance from viewport bottom to capsule top, with 12px margin
	desktopBottom = Math.max(16, Math.round(window.innerHeight - rect.top + 12));
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

	const handleScrollOrResize = () => {
		if (expanded) {
			updatePosition();
		}
	};

	window.addEventListener("resize", handleScrollOrResize);
	window.addEventListener("scroll", handleScrollOrResize, { passive: true });
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("keydown", handleKeydown);

	return () => {
		stopPolling();
		if (clockTimer) clearInterval(clockTimer);
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		window.removeEventListener("resize", handleScrollOrResize);
		window.removeEventListener("scroll", handleScrollOrResize);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		window.removeEventListener("keydown", handleKeydown);
	};
});
</script>

<div bind:this={capsuleEl} class={`wid-capsule-wrapper ${className}`}>
	<!-- 顶部状态胶囊 -->
	<button
		type="button"
		class={`wid-capsule wid-capsule--${formatted.statusType}`}
		onclick={toggleExpand}
		aria-expanded={expanded}
		aria-label="查看我的实时设备与使用历史"
		title={currentActivity?.windowTitle || formatted.sentence}
	>
		<!-- 呼吸状态圆点 -->
		<span class="wid-capsule__dot-ring">
			<span class="wid-capsule__dot"></span>
		</span>

		<!-- 状态主文案 -->
		<span class="wid-capsule__text">
			{formatted.sentence}
		</span>

		<!-- 展开图标 -->
		<svg
			class="wid-capsule__chevron"
			class:wid-capsule__chevron--open={expanded}
			viewBox="0 0 24 24"
			width="14"
			height="14"
			aria-hidden="true"
		>
			<path
				fill="currentColor"
				d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
			/>
		</svg>
	</button>
</div>

<!-- 展开态：通过 Svelte action:portal 挂载至 document.body，彻底打破 Card 的 overflow: hidden 物理限制 -->
{#if expanded}
	<div use:portal class="wid-portal-layer">
		<!-- 暗色半透明磨砂遮罩（点击收起） -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="wid-scrim"
			onclick={() => (expanded = false)}
			role="presentation"
		></div>

		<!-- 桌面端向上独立悬浮卡片 / 手机端原生 M3 底部抽屉 (Bottom Sheet) -->
		<div
			class="wid-popover"
			class:wid-popover--mobile={isMobile}
			role="dialog"
			aria-modal="true"
			aria-label="设备与活动状态详情"
			style={!isMobile
				? `--wid-bottom: ${desktopBottom}px; --wid-left: ${desktopLeft}px;`
				: ""}
		>
			<!-- 桌面端向下呼应锚点指示箭头 -->
			{#if !isMobile}
				<div class="wid-popover__anchor-arrow" aria-hidden="true"></div>
			{/if}

			<!-- 手机端 M3 Drag Handle 拖拽把手条 -->
			{#if isMobile}
				<div class="wid-popover__drag-handle" aria-hidden="true"></div>
			{/if}

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
	display: flex;
	justify-content: center;
	margin-bottom: -10px;
	z-index: 30;
	pointer-events: auto;
}

.wid-capsule {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	max-width: min(88%, 210px);
	padding: 0.25rem 0.625rem;
	border-radius: 9999px;
	background: color-mix(in oklab, var(--card-bg, #ffffff) 88%, transparent);
	backdrop-filter: blur(14px);
	-webkit-backdrop-filter: blur(14px);
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.12));
	box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
	font-size: 0.725rem;
	line-height: 1.25;
	color: var(--on-surface, #1c1b1f);
	cursor: pointer;
	text-decoration: none;
	transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
	user-select: none;
}

.wid-capsule:hover {
	border-color: var(--primary, #6750a4);
	box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
	transform: translateY(-2px) scale(1.02);
}

.wid-capsule__dot-ring {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 10px;
	height: 10px;
	flex-shrink: 0;
}

.wid-capsule__dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #9ca3af;
	transition: background-color 0.3s ease;
}

/* 活跃状态：翠绿呼吸脉冲 */
.wid-capsule--active .wid-capsule__dot {
	background: #10b981;
	box-shadow: 0 0 6px #10b981;
	animation: wid-pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
}

/* 闲置状态：琥珀黄 */
.wid-capsule--idle .wid-capsule__dot {
	background: #f59e0b;
}

/* 离开/离线：冷灰 */
.wid-capsule--away .wid-capsule__dot,
.wid-capsule--offline .wid-capsule__dot {
	background: #9ca3af;
}

@keyframes wid-pulse {
	0%, 100% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.25);
		opacity: 0.75;
	}
}

.wid-capsule__text {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 500;
}

.wid-capsule__chevron {
	flex-shrink: 0;
	color: var(--on-surface-variant, #49454f);
	transition: transform 0.2s ease;
}

.wid-capsule__chevron--open {
	transform: rotate(180deg);
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
	background: rgba(0, 0, 0, 0.45);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
	pointer-events: auto;
	animation: wid-fade-in 0.2s cubic-bezier(0, 0, 0.2, 1);
}

@keyframes wid-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

/* 桌面端独立悬浮卡片：严格向上展开 */
.wid-popover {
	position: fixed;
	pointer-events: auto;
	bottom: var(--wid-bottom, 120px);
	left: var(--wid-left, 50%);
	transform: translateX(-50%);
	width: min(92vw, 360px);
	max-height: calc(100vh - 120px);
	overflow-y: auto;
	background: var(--card-bg, #ffffff);
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.15));
	border-radius: 20px;
	padding: 1.125rem;
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.08);
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
	z-index: 10000;
	animation: wid-pop-up 0.24s cubic-bezier(0.05, 0.7, 0.1, 1);
}

@keyframes wid-pop-up {
	from {
		opacity: 0;
		transform: translate(-50%, 12px) scale(0.96);
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

.wid-popover__drag-handle {
	display: none;
}

/* 手机端原生 Material 3 Modal Bottom Sheet */
@media (max-width: 767px) {
	.wid-popover,
	.wid-popover--mobile {
		bottom: 0 !important;
		left: 0 !important;
		right: 0 !important;
		transform: none !important;
		width: 100vw !important;
		max-width: 100vw !important;
		max-height: 84vh !important;
		border-radius: 28px 28px 0 0 !important;
		border-left: none !important;
		border-right: none !important;
		border-bottom: none !important;
		border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.15)) !important;
		padding: 0.75rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom, 0px)) !important;
		box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.25) !important;
		animation: wid-slide-up 0.28s cubic-bezier(0.05, 0.7, 0.1, 1) !important;
	}

	.wid-popover__anchor-arrow {
		display: none !important;
	}

	.wid-popover__drag-handle {
		display: block !important;
		width: 36px;
		height: 4px;
		border-radius: 9999px;
		background: var(--outline-variant, rgba(0, 0, 0, 0.3));
		margin: 2px auto 14px;
	}
}

@keyframes wid-slide-up {
	from {
		transform: translateY(100%);
	}
	to {
		transform: translateY(0);
	}
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
