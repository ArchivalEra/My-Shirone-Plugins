<script lang="ts">
/**
 * WhatImDoingCapsule — 实时设备状态胶囊与舰队详情面板
 * 遵循 Material 3 Expressive 规范，纯插拔零侵入，零后台开销。
 */
import { onMount } from "svelte";
import { decodeHistoryResponse } from "../protocol/protobuf.js";
import {
	type ActivityHistoryResponse,
	ActivityStatus,
	type DeviceActivity,
} from "../protocol/types.js";
import { injectCapsuleStyles } from "./capsule-styles.js";
import {
	formatActivitySentence,
	formatDateTime,
	formatOfflineTime,
	formatRelativeTime,
} from "./RelativeTime.js";

injectCapsuleStyles();

let {
	endpoint = "/api/activity",
	maxHistoryDisplay = 5,
	refreshInterval = 0,
	class: className = "",
}: {
	endpoint?: string;
	maxHistoryDisplay?: number;
	refreshInterval?: number;
	class?: string;
} = $props();

let data = $state<ActivityHistoryResponse | null>(null);
let loading = $state(false);
let isRefreshing = $state(false);
let fetchError = $state<string | null>(null);
let expanded = $state(false);
let selectedDeviceId = $state<string>("all");
let currentTime = $state(Date.now());
let capsuleEl: HTMLElement | null = $state(null);
let isMobile = $state(false);

// 锚点定位：桌面端上移展开坐标
let anchorLeft = $state(0);
let anchorBottom = $state(0);

const currentActivity = $derived(data?.current ?? null);
const devices = $derived(data?.devices ?? []);
const allHistory = $derived(data?.history ?? []);

const isInitialLoading = $derived(!data && loading);
const isInitialError = $derived(!data && !loading && Boolean(fetchError));

const isOffline = $derived.by(() => {
	if (!data || !currentActivity) return false;
	if (currentActivity.offline) return true;
	if (currentActivity.status === ActivityStatus.OFFLINE) return true;
	const ts = currentActivity.lastSeen ?? currentActivity.timestamp;
	if (ts && currentTime - ts > 120_000) return true;
	return false;
});

const offlineTimeText = $derived.by(() => {
	if (!isOffline) return "";
	const ts = currentActivity?.lastSeen ?? currentActivity?.timestamp ?? 0;
	return formatOfflineTime(ts, currentTime, "zh");
});

const formatted = $derived(
	formatActivitySentence(currentActivity, currentTime, "zh"),
);

const statusLabel = $derived.by(() => {
	if (isOffline) return "离线";
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

const groupMeta: Record<string, { label: string; icon: string }> = {
	desktop: { label: "台式工作站", icon: "🖥️" },
	laptop: { label: "便携笔记本", icon: "💻" },
	server: { label: "服务器集群", icon: "🖧" },
	mobile: { label: "移动设备", icon: "📱" },
	other: { label: "其它设备", icon: "📟" },
};

const groupedDevices = $derived.by(() => {
	const all =
		devices.length > 0 ? devices : currentActivity ? [currentActivity] : [];

	const map: Record<string, DeviceActivity[]> = {
		desktop: [],
		laptop: [],
		server: [],
		other: [],
	};

	for (const dev of all) {
		const rawType = (dev.type || "desktop").toLowerCase();
		if (rawType === "desktop") map.desktop.push(dev);
		else if (rawType === "laptop") map.laptop.push(dev);
		else if (rawType === "server") map.server.push(dev);
		else map.other.push(dev);
	}

	const order: Array<"desktop" | "laptop" | "server" | "other"> = [
		"desktop",
		"laptop",
		"server",
		"other",
	];

	return order
		.filter((k) => map[k].length > 0)
		.map((k) => ({
			key: k,
			label: groupMeta[k]?.label ?? k,
			icon: groupMeta[k]?.icon ?? "💻",
			devices: map[k],
		}));
});

const onlineDeviceCount = $derived(
	devices.filter(
		(d) =>
			!d.offline &&
			d.status !== ActivityStatus.OFFLINE &&
			currentTime - (d.lastSeen ?? d.timestamp) <= 120_000,
	).length,
);

const filteredHistory = $derived.by(() => {
	if (selectedDeviceId === "all") {
		return allHistory.slice(0, maxHistoryDisplay);
	}
	return allHistory
		.filter((h) => (h.deviceId || h.id) === selectedDeviceId)
		.slice(0, maxHistoryDisplay);
});

let activeAbortController: AbortController | null = null;

// 单次完整快照抓取：直接获取 current + devices + groups，0 竞态
async function fetchSnapshot(manual = false) {
	if (loading && !manual) return;
	if (manual && activeAbortController) {
		activeAbortController.abort();
	}
	loading = true;
	if (manual) isRefreshing = true;

	const controller = new AbortController();
	activeAbortController = controller;
	const timeoutId = setTimeout(() => controller.abort(), 9000);

	try {
		fetchError = null;
		// 采用标准 CORS Simple Request 避免移动端（如 Firefox GeckoView）预检拦截
		const res = await fetch(endpoint, {
			signal: controller.signal,
		});

		if (!res.ok) {
			fetchError = `状态服务响应异常 (${res.status})`;
			return;
		}

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/x-protobuf")) {
			const buffer = await res.arrayBuffer();
			data = decodeHistoryResponse(new Uint8Array(buffer));
		} else {
			data = (await res.json()) as ActivityHistoryResponse;
		}
		currentTime = Date.now();
		fetchError = null;
	} catch (err: unknown) {
		if ((err as Error)?.name === "AbortError") {
			fetchError = "连接状态服务器超时，请点击重试";
		} else {
			fetchError = "无法连接至状态服务器";
		}
		console.debug("[what-im-doing] Telemetry fetch paused:", err);
	} finally {
		clearTimeout(timeoutId);
		if (activeAbortController === controller) {
			activeAbortController = null;
		}
		loading = false;
		isRefreshing = false;
	}
}

// 仅在显式配置 refreshInterval > 0 时才启动轮询，默认 0 保持零开销
let timerId: ReturnType<typeof setInterval> | null = null;
function startPollingIfConfigured() {
	if (refreshInterval > 0 && !timerId) {
		timerId = setInterval(() => {
			if (document.visibilityState === "visible") {
				fetchSnapshot();
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

function updateAnchorPosition() {
	if (typeof window === "undefined") return;
	isMobile = window.innerWidth < 768;
	if (!capsuleEl) return;
	const rect = capsuleEl.getBoundingClientRect();
	anchorLeft = Math.round(rect.left + rect.width / 2);
	// 水平居中限制，保证 400px 卡片位于视口内
	anchorLeft = Math.max(210, Math.min(window.innerWidth - 210, anchorLeft));
	// 视口底边到胶囊顶部的距离
	anchorBottom = Math.round(window.innerHeight - rect.top);
}

function toggleExpand() {
	expanded = !expanded;
	if (expanded) {
		currentTime = Date.now();
		updateAnchorPosition();
		if (!data && !loading) {
			fetchSnapshot();
		}
	}
}

function handleManualRefresh(e: MouseEvent) {
	e.stopPropagation();
	fetchSnapshot(true);
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

$effect(() => {
	if (typeof document === "undefined") return;
	if (expanded) {
		const originalOverflow = document.body.style.overflow;
		const originalPaddingRight = document.body.style.paddingRight;
		const scrollbarWidth =
			window.innerWidth - document.documentElement.clientWidth;
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
	let observer: IntersectionObserver | null = null;
	if (typeof IntersectionObserver !== "undefined" && capsuleEl) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						fetchSnapshot();
						startPollingIfConfigured();
						observer?.disconnect();
						observer = null;
						break;
					}
				}
			},
			{ rootMargin: "60px" },
		);
		observer.observe(capsuleEl);
	} else {
		fetchSnapshot();
		startPollingIfConfigured();
	}

	const handleResize = () => {
		if (expanded) updateAnchorPosition();
	};

	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape" && expanded) expanded = false;
	};

	window.addEventListener("resize", handleResize);
	window.addEventListener("keydown", handleKeydown);

	return () => {
		stopPolling();
		if (observer) observer.disconnect();
		window.removeEventListener("resize", handleResize);
		window.removeEventListener("keydown", handleKeydown);
	};
});
</script>

<div bind:this={capsuleEl} class={`wid-capsule-wrapper ${className}`}>
	<!-- 经典药丸胶囊：单行高质感，药丸圆角，水平居中于头像上方 -->
	<button
		type="button"
		class={`wid-capsule wid-capsule--${isInitialLoading ? "loading" : isInitialError ? "error" : isOffline ? "offline" : formatted.statusType}`}
		onclick={toggleExpand}
		aria-expanded={expanded}
		aria-label="查看我的实时设备与活动历史"
	>
		<!-- 呼吸状态指示灯 -->
		<span
			class="wid-capsule__dot"
			class:wid-capsule__dot--pulse={isInitialLoading}
			class:wid-capsule__dot--active={!isOffline && !isInitialLoading && !isInitialError && formatted.statusType === 'active'}
			class:wid-capsule__dot--idle={!isOffline && !isInitialLoading && !isInitialError && formatted.statusType === 'idle'}
			class:wid-capsule__dot--offline={isOffline || isInitialError}
		></span>

		<!-- 单行活动摘要 (水平药丸排版) -->
		<span class="wid-capsule__text">
			{#if isInitialLoading}
				<span class="wid-capsule__prefix">同步中:</span>
				<strong class="wid-capsule__app">正在连接状态...</strong>
			{:else if isInitialError}
				<span class="wid-capsule__prefix">状态:</span>
				<strong class="wid-capsule__app">点击查看详情</strong>
			{:else if isOffline}
				<span class="wid-capsule__prefix">最后使用:</span>
				<strong class="wid-capsule__app">{currentActivity?.appName || "离线"}</strong>
				{#if offlineTimeText}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__title">{offlineTimeText}</span>
				{/if}
			{:else if currentActivity?.media?.title}
				<span class="wid-capsule__media-icon">🎵</span>
				<strong class="wid-capsule__app">{currentActivity.media.title}</strong>
				{#if currentActivity.media.artist}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__title">{currentActivity.media.artist}</span>
				{/if}
			{:else if currentActivity?.appName}
				<strong class="wid-capsule__app">{currentActivity.appName}</strong>
				{#if currentActivity.windowTitle && currentActivity.windowTitle !== currentActivity.appName}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__title">{currentActivity.windowTitle}</span>
				{/if}
			{:else}
				<span>{statusLabel}</span>
			{/if}
		</span>

		<!-- 微型展开箭头 -->
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
	</button>
</div>

<!-- 展开态：桌面端自胶囊向上平移展开，移动端自适应为 M3 标准底部抽屉 -->
{#if expanded}
	<div use:portal class="wid-portal-layer">
		<!-- 暗色半透明遮罩（纯色无毛玻璃，保证帧率） -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="wid-scrim"
			onclick={() => (expanded = false)}
			role="presentation"
		></div>

		<!-- 浮动详情面板 -->
		<div
			class="wid-panel"
			role="dialog"
			aria-modal="true"
			aria-label="设备舰队与实时活动"
			style={`--anchor-bottom: ${anchorBottom}px; --anchor-left: ${anchorLeft}px;`}
		>
			<!-- 移动端顶部拖拽抓手 -->
			<div class="wid-panel__drag-handle" aria-hidden="true"></div>

			<!-- 弹窗顶栏 -->
			<div class="wid-panel__header">
				<div class="wid-panel__title">
					<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
						<path
							fill="currentColor"
							d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"
						/>
					</svg>
					<span>设备舰队与实时活动</span>
				</div>

				<div class="wid-panel__actions">
					<!-- 手动刷新按钮（按需零开销） -->
					<button
						type="button"
						class="wid-panel__btn wid-panel__btn--refresh"
						onclick={handleManualRefresh}
						disabled={isRefreshing}
						aria-label="手动刷新状态"
						title="手动刷新"
					>
						<svg
							class="wid-panel__refresh-icon"
							class:wid-panel__refresh-icon--spin={isRefreshing}
							viewBox="0 0 24 24"
							width="15"
							height="15"
							aria-hidden="true"
						>
							<path
								fill="currentColor"
								d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
							/>
						</svg>
					</button>

					<!-- 关闭按钮 -->
					<button
						type="button"
						class="wid-panel__btn wid-panel__btn--close"
						onclick={() => (expanded = false)}
						aria-label="关闭详情"
						title="关闭"
					>
						✕
					</button>
				</div>
			</div>

			<!-- 内容滚动容器 -->
			<div class="wid-panel__body">
				<!-- 当前焦点设备概览卡片 -->
				{#if currentActivity}
					<div class="wid-current-card" class:wid-current-card--offline={isOffline}>
						<div class="wid-current-card__head">
							<span class="wid-tag" class:wid-tag--primary={!isOffline} class:wid-tag--muted={isOffline}>
								{isOffline ? "最后使用" : "当前活跃"}
							</span>
							<strong class="wid-current-card__appname">{currentActivity.appName || "未知应用"}</strong>
							<span class="wid-current-card__device">@{currentActivity.deviceName || currentActivity.name || currentActivity.deviceId}</span>
						</div>

						{#if currentActivity.media?.title && !isOffline}
							<div class="wid-current-card__media">
								<span class="wid-current-card__media-icon">🎵</span>
								<span class="wid-current-card__media-text">
									{currentActivity.media.title}{#if currentActivity.media.artist} — {currentActivity.media.artist}{/if}
								</span>
							</div>
						{/if}

						{#if currentActivity.windowTitle && currentActivity.windowTitle !== currentActivity.appName}
							<div class="wid-current-card__window-title" title={currentActivity.windowTitle}>
								"{currentActivity.windowTitle}"
							</div>
						{/if}

						<div class="wid-current-card__footer">
							{#if isOffline}
								<span class="wid-current-card__last-active">
									{offlineTimeText || `最后活跃: ${formatRelativeTime(currentActivity.lastSeen ?? currentActivity.timestamp, currentTime, "zh")}`}
								</span>
							{:else}
								<span class="wid-current-card__active-hint">
									🟢 活跃于 {currentActivity.deviceName || currentActivity.name || currentActivity.deviceId}
								</span>
							{/if}
							{#if currentActivity.osInfo}
								<span class="wid-current-card__os-info">{currentActivity.osInfo}</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- 多设备分类卡片矩阵 -->
				<div class="wid-fleet">
					{#if loading && !data}
						<div class="wid-panel__empty">正在获取设备状态...</div>
					{:else if fetchError && !data}
						<div class="wid-panel__empty wid-panel__empty--error">
							<span>{fetchError}</span>
							<button
								type="button"
								class="wid-panel__retry-btn"
								onclick={() => fetchSnapshot(true)}
							>
								点击重试
							</button>
						</div>
					{:else if groupedDevices.length === 0}
						<div class="wid-panel__empty">当前暂无已登记设备</div>
					{:else}
						{#each groupedDevices as group}
							<div class="wid-group">
								<div class="wid-group__header">
									<span class="wid-group__icon">{group.icon}</span>
									<span class="wid-group__label">{group.label}</span>
									<span class="wid-group__count">{group.devices.length}</span>
								</div>

								<div class="wid-group__grid">
									{#each group.devices as dev}
										{@const devOffline = dev.offline || dev.status === ActivityStatus.OFFLINE || (currentTime - (dev.lastSeen ?? dev.timestamp) > 120000)}
										<div class="wid-device-card" class:wid-device-card--offline={devOffline} class:wid-device-card--active={!devOffline && dev.status === ActivityStatus.ACTIVE}>
											<div class="wid-device-card__head">
												<div class="wid-device-card__name-wrapper">
													<span
														class="wid-device-card__dot"
														class:wid-device-card__dot--active={!devOffline && dev.status === ActivityStatus.ACTIVE}
														class:wid-device-card__dot--idle={!devOffline && dev.status === ActivityStatus.IDLE}
														class:wid-device-card__dot--away={!devOffline && dev.status === ActivityStatus.AWAY}
														class:wid-device-card__dot--offline={devOffline}
													></span>
													<span class="wid-device-card__name">{dev.name || dev.deviceName || dev.id || dev.deviceId}</span>
												</div>
												<span
													class="wid-device-card__badge"
													class:wid-device-card__badge--active={!devOffline && dev.status === ActivityStatus.ACTIVE}
													class:wid-device-card__badge--idle={!devOffline && dev.status === ActivityStatus.IDLE}
													class:wid-device-card__badge--offline={devOffline}
												>
													{#if devOffline}
														离线
													{:else if dev.status === ActivityStatus.ACTIVE}
														正在活跃
													{:else if dev.status === ActivityStatus.IDLE}
														空闲
													{:else if dev.status === ActivityStatus.AWAY}
														离开
													{:else}
														在线
													{/if}
												</span>
											</div>

											<div class="wid-device-card__body">
												{#if devOffline}
													<div class="wid-device-card__app">
														<span class="wid-device-card__muted-label">最后使用:</span>
														<span class="wid-device-card__app-title">{dev.appName || "无记录"}</span>
														{#if dev.windowTitle && dev.windowTitle !== dev.appName}
															<span class="wid-device-card__sep">·</span>
															<span class="wid-device-card__win-title" title={dev.windowTitle}>{dev.windowTitle}</span>
														{/if}
													</div>
													<div class="wid-device-card__time">
														最后活跃: {formatRelativeTime(dev.lastSeen ?? dev.timestamp, currentTime, "zh")}
														{#if dev.lastSeen || dev.timestamp}
															<span class="wid-device-card__abs-time">({formatDateTime(dev.lastSeen ?? dev.timestamp)})</span>
														{/if}
													</div>
												{:else}
													<div class="wid-device-card__app">
														<span class="wid-device-card__app-title">{dev.appName || "活动中"}</span>
														{#if dev.windowTitle && dev.windowTitle !== dev.appName}
															<span class="wid-device-card__sep">·</span>
															<span class="wid-device-card__win-title" title={dev.windowTitle}>{dev.windowTitle}</span>
														{/if}
													</div>
													<div class="wid-device-card__time">
														{#if dev.status === ActivityStatus.IDLE && dev.idleSeconds && dev.idleSeconds > 60}
															已空闲 {Math.floor(dev.idleSeconds / 60)} 分钟
														{:else}
															活跃于 {formatRelativeTime(dev.lastSeen ?? dev.timestamp, currentTime, "zh")}
														{/if}
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<!-- 历史记录时间轴（若存在历史） -->
				{#if allHistory.length > 0}
					<div class="wid-history">
						<div class="wid-history__title">最近活动历史</div>
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
											{item.deviceName || item.name}
										</div>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<!-- 面板底栏 -->
			<div class="wid-panel__footer">
				<span class="wid-panel__proto-badge">Cloudflare D1 Fleet Hub</span>
				<span class="wid-panel__status-hint">
					{#if onlineDeviceCount > 0}
						🟢 {onlineDeviceCount} 台在线 · 按需刷新
					{:else}
						⚪ 全设备离线 · 按需刷新
					{/if}
				</span>
			</div>
		</div>
	</div>
{/if}

