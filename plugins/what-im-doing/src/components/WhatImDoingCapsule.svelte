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
import {
	formatActivitySentence,
	formatDateTime,
	formatOfflineTime,
	formatRelativeTime,
} from "./RelativeTime.js";

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

const isOffline = $derived.by(() => {
	if (!currentActivity) return true;
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

// 单次完整快照抓取：直接获取 current + devices + groups，0 竞态
async function fetchSnapshot(manual = false) {
	if (loading) return;
	loading = true;
	if (manual) isRefreshing = true;

	try {
		const res = await fetch(endpoint, {
			headers: {
				Accept: "application/json, application/x-protobuf",
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
		currentTime = Date.now();
	} catch (err) {
		console.debug("[what-im-doing] Telemetry fetch paused:", err);
	} finally {
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
	<!-- 顶部状态胶囊：淡强调色填充标签风格，多行自适应高可读性 -->
	<button
		type="button"
		class={`wid-capsule wid-capsule--${isOffline ? "offline" : formatted.statusType}`}
		onclick={toggleExpand}
		aria-expanded={expanded}
		aria-label="查看我的实时设备与活动历史"
	>
		<!-- 头部状态行：状态指示灯 + 状态名 + 相对/离线时间 + 展开提示 -->
		<div class="wid-capsule__header-row">
			<span class="wid-capsule__status-tag">
				<span class="wid-capsule__dot"></span>
				<span class="wid-capsule__status-name">{statusLabel}</span>
			</span>
			{#if isOffline}
				{#if offlineTimeText}
					<span class="wid-capsule__sep">·</span>
					<span class="wid-capsule__time">{offlineTimeText}</span>
				{/if}
			{:else if formatted.relativeTime}
				<span class="wid-capsule__sep">·</span>
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

		<!-- 主内容行：
		     在线态：应用名 窗口名（或媒体播放）
		     离线态：最后在使用: xxx -->
		<div class="wid-capsule__detail-row">
			{#if isOffline}
				<span class="wid-capsule__offline-text">
					<span class="wid-capsule__offline-prefix">最后在使用:</span>
					<strong class="wid-capsule__app-name">{currentActivity?.appName || "无记录"}</strong>
					{#if currentActivity?.windowTitle && currentActivity.windowTitle !== currentActivity.appName}
						<span class="wid-capsule__sep">·</span>
						<span class="wid-capsule__window-title">{currentActivity.windowTitle}</span>
					{/if}
				</span>
			{:else if currentActivity?.media?.title}
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
	/* Material 3 容器色，纯色清晰，绝不用毛玻璃 */
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

.wid-capsule--offline {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.04));
	color: var(--on-surface-variant, #49454f);
	border-color: var(--outline-variant, rgba(0, 0, 0, 0.12));
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
	opacity: 0.85;
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

.wid-capsule__offline-text {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	flex-wrap: wrap;
}

.wid-capsule__offline-prefix {
	opacity: 0.75;
	font-weight: 500;
}

.wid-capsule__app-name {
	font-weight: 700;
	color: var(--primary, #6750a4);
}

.wid-capsule--offline .wid-capsule__app-name {
	color: var(--on-surface, #1c1b1f);
}

.wid-capsule__sep {
	margin: 0 0.2rem;
	opacity: 0.5;
}

.wid-capsule__window-title {
	opacity: 0.88;
}

.wid-capsule__media-icon {
	margin-right: 0.2rem;
}

.wid-capsule__fallback {
	opacity: 0.85;
}

/* Portal 独立容器与遮罩 */
.wid-portal-layer {
	position: fixed;
	inset: 0;
	z-index: 1000;
	pointer-events: none;
}

.wid-scrim {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.42);
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
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

/* 桌面端：自胶囊向上平移 24px 并展开 (Lift-up & Expand) */
@media (min-width: 768px) {
	.wid-panel {
		position: fixed;
		bottom: var(--anchor-bottom, 200px);
		left: var(--anchor-left, 50%);
		transform: translate(-50%, -24px);
		width: min(92vw, 410px);
		max-height: min(76vh, calc(var(--anchor-bottom, 200px) + 20px));
		background: var(--card-bg, #ffffff);
		border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.14));
		border-radius: 18px;
		box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.06);
		z-index: 1001;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transform-origin: bottom center;
		animation: wid-desktop-lift 0.24s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes wid-desktop-lift {
		from {
			opacity: 0;
			transform: translate(-50%, 0) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -24px) scale(1);
		}
	}

	.wid-panel__drag-handle {
		display: none;
	}
}

/* 移动端：标准 M3 底部抽屉 (Bottom Sheet) */
@media (max-width: 767.98px) {
	.wid-panel {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		top: auto;
		transform: translateY(0);
		width: 100%;
		max-height: 82vh;
		background: var(--card-bg, #ffffff);
		border-radius: 24px 24px 0 0;
		border: none;
		border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.12));
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.22);
		z-index: 1001;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: wid-mobile-slide-up 0.24s cubic-bezier(0.1, 0.9, 0.2, 1);
	}

	@keyframes wid-mobile-slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.wid-panel__drag-handle {
		display: block;
		width: 36px;
		height: 4px;
		border-radius: 9999px;
		background: var(--outline-variant, rgba(0, 0, 0, 0.2));
		margin: 10px auto 4px;
		flex-shrink: 0;
	}
}

/* 面板通用内部结构 */
.wid-panel__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.75rem 1rem 0.5rem;
	border-bottom: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
	flex-shrink: 0;
}

.wid-panel__title {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--primary, #6750a4);
}

.wid-panel__actions {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}

.wid-panel__btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: none;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	color: var(--on-surface-variant, #49454f);
	cursor: pointer;
	transition: background-color 0.15s ease, color 0.15s ease;
	padding: 0;
}

.wid-panel__btn:hover {
	background: var(--surface-container-high, rgba(0, 0, 0, 0.06));
	color: var(--on-surface, #1c1b1f);
}

.wid-panel__btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.wid-panel__refresh-icon--spin {
	animation: wid-spin 0.8s linear infinite;
}

@keyframes wid-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.wid-panel__body {
	flex: 1;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	padding: 0.875rem 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

@media (max-width: 767.98px) {
	.wid-panel__body {
		padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 20px));
	}
}

/* 当前高光卡片 */
.wid-current-card {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.03));
	border-radius: 12px;
	padding: 0.75rem;
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
}

.wid-current-card--offline {
	opacity: 0.9;
	background: rgba(0, 0, 0, 0.02);
}

.wid-current-card__head {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	margin-bottom: 0.375rem;
	flex-wrap: wrap;
}

.wid-current-card__appname {
	font-size: 0.85rem;
	color: var(--on-surface, #1c1b1f);
}

.wid-tag {
	display: inline-block;
	font-size: 0.6875rem;
	font-weight: 600;
	padding: 0.125rem 0.45rem;
	border-radius: 6px;
}

.wid-tag--primary {
	background: var(--primary-container, #eaddff);
	color: var(--on-primary-container, #21005d);
}

.wid-tag--muted {
	background: rgba(0, 0, 0, 0.08);
	color: var(--on-surface-variant, #49454f);
}

.wid-current-card__device {
	font-size: 0.75rem;
	color: var(--on-surface-variant, #49454f);
}

.wid-current-card__media {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	margin-bottom: 0.375rem;
	padding: 0.25rem 0.5rem;
	background: var(--surface-container-high, rgba(0, 0, 0, 0.04));
	border-radius: 6px;
	font-size: 0.75rem;
}

.wid-current-card__media-icon {
	flex-shrink: 0;
	font-size: 0.8125rem;
	line-height: 1;
}

.wid-current-card__media-text {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--on-surface-variant, #49454f);
	font-weight: 500;
}

.wid-current-card__window-title {
	font-size: 0.8125rem;
	color: var(--on-surface, #1c1b1f);
	font-style: italic;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	margin-bottom: 0.25rem;
}

.wid-current-card__footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 0.35rem;
	font-size: 0.6875rem;
	color: var(--outline, #79747e);
}

.wid-current-card__active-hint {
	color: #047857;
	font-weight: 500;
}

.wid-current-card__last-active {
	color: var(--outline, #79747e);
}

.wid-current-card__os-info {
	font-size: 0.6875rem;
	color: var(--outline, #79747e);
}

/* 舰队设备矩阵群组 */
.wid-fleet {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.wid-group__header {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface-variant, #49454f);
	margin-bottom: 0.35rem;
}

.wid-group__icon {
	font-size: 0.875rem;
}

.wid-group__count {
	font-size: 0.65rem;
	background: var(--surface-container-high, rgba(0, 0, 0, 0.06));
	padding: 0.05rem 0.4rem;
	border-radius: 9999px;
	color: var(--outline, #79747e);
}

.wid-group__grid {
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
}

.wid-device-card {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.03));
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
	border-radius: 10px;
	padding: 0.5rem 0.65rem;
	transition: background-color 0.15s ease, border-color 0.15s ease;
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
}

.wid-device-card--active {
	border-color: color-mix(in oklab, #10b981 35%, transparent);
	background: color-mix(in oklab, #10b981 5%, var(--card-bg, #ffffff));
}

.wid-device-card--offline {
	opacity: 0.8;
}

.wid-device-card__head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.25rem;
}

.wid-device-card__name-wrapper {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	min-width: 0;
}

.wid-device-card__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #9ca3af;
	flex-shrink: 0;
}

.wid-device-card__dot--active {
	background: #10b981;
	box-shadow: 0 0 4px #10b981;
}

.wid-device-card__dot--idle {
	background: #f59e0b;
}

.wid-device-card__dot--away {
	background: #f97316;
}

.wid-device-card__dot--offline {
	background: #9ca3af;
}

.wid-device-card__name {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface, #1c1b1f);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-device-card__badge {
	font-size: 0.625rem;
	padding: 0.1rem 0.35rem;
	border-radius: 4px;
	font-weight: 500;
	flex-shrink: 0;
}

.wid-device-card__badge--active {
	background: color-mix(in oklab, #10b981 18%, transparent);
	color: #047857;
}

.wid-device-card__badge--idle {
	background: color-mix(in oklab, #f59e0b 18%, transparent);
	color: #b45309;
}

.wid-device-card__badge--offline {
	background: rgba(0, 0, 0, 0.06);
	color: var(--outline, #79747e);
}

.wid-device-card__body {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	font-size: 0.7rem;
}

.wid-device-card__app {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-device-card__muted-label {
	color: var(--outline, #79747e);
	font-size: 0.65rem;
}

.wid-device-card__app-title {
	font-weight: 600;
	color: var(--primary, #6750a4);
}

.wid-device-card--offline .wid-device-card__app-title {
	color: var(--on-surface, #1c1b1f);
}

.wid-device-card__sep {
	opacity: 0.4;
}

.wid-device-card__win-title {
	opacity: 0.85;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-device-card__time {
	font-size: 0.65rem;
	color: var(--outline, #79747e);
}

.wid-device-card__abs-time {
	opacity: 0.8;
	margin-left: 0.25rem;
}

/* 历史时间轴 */
.wid-history__title {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface-variant, #49454f);
	margin-bottom: 0.5rem;
}

.wid-timeline {
	list-style: none;
	padding: 0;
	margin: 0;
	max-height: 160px;
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

.wid-panel__empty {
	font-size: 0.75rem;
	color: var(--outline, #79747e);
	text-align: center;
	padding: 1.5rem 0;
}

.wid-panel__footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
	padding: 0.5rem 1rem;
	font-size: 0.625rem;
	color: var(--outline, #79747e);
	flex-shrink: 0;
}

.wid-panel__proto-badge {
	background: color-mix(in oklab, var(--primary, #6750a4) 15%, transparent);
	color: var(--primary, #6750a4);
	padding: 0.125rem 0.375rem;
	border-radius: 4px;
	font-weight: 600;
}

.wid-panel__status-hint {
	opacity: 0.85;
}
</style>
