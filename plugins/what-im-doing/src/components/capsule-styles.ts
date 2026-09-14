/**
 * Self-contained styles for WhatImDoingCapsule.
 * Injected directly into document.head to guarantee zero CSS loss across
 * Vite/Astro client-side dynamic mounts.
 */

export const capsuleStyles = `
/* ------------------------------------------------------------
   WhatImDoing Capsule Styles (Self-Contained & Production-Ready)
   ------------------------------------------------------------ */

.wid-capsule-wrapper {
	position: relative;
	width: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
	margin-bottom: 0.75rem;
	z-index: 30;
	pointer-events: auto;
}

/* 经典药丸胶囊主体 (Pill Capsule Shape) */
.wid-capsule {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	min-height: 34px;
	padding: 0.25rem 0.85rem;
	border-radius: 9999px !important;
	background: var(--surface-container-high, color-mix(in oklab, var(--primary, #6750a4) 10%, var(--card-bg, #ffffff)));
	color: var(--on-surface, #1c1b1f);
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.12));
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
	font-size: 0.75rem;
	font-weight: 500;
	cursor: pointer;
	text-decoration: none;
	user-select: none;
	max-width: min(100%, 260px);
	box-sizing: border-box;
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
}

.wid-capsule:hover {
	background: color-mix(in oklab, var(--primary, #6750a4) 18%, var(--card-bg, #ffffff));
	border-color: var(--primary, #6750a4);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	transform: translateY(-1.5px);
}

.wid-capsule:active {
	transform: scale(0.97);
}

.wid-capsule--offline {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.04));
	color: var(--on-surface-variant, #49454f);
	border-color: var(--outline-variant, rgba(0, 0, 0, 0.1));
}

.wid-capsule--loading {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.04));
	color: var(--on-surface-variant, #49454f);
	opacity: 0.88;
}

.wid-capsule--error {
	background: var(--surface-container-low, rgba(0, 0, 0, 0.04));
	color: var(--on-surface-variant, #49454f);
	border-color: var(--outline-variant, rgba(0, 0, 0, 0.1));
}

/* 状态圆点 (Status Dot) */
.wid-capsule__dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #9ca3af;
	flex-shrink: 0;
	transition: background-color 0.25s ease;
}

.wid-capsule__dot--pulse {
	background: var(--primary, #6750a4) !important;
	box-shadow: 0 0 6px var(--primary, #6750a4);
	animation: wid-pulse 1.2s infinite ease-in-out;
}

.wid-capsule__dot--active {
	background: #10b981 !important;
	box-shadow: 0 0 6px #10b981;
	animation: wid-pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
}

.wid-capsule__dot--idle {
	background: #f59e0b !important;
}

.wid-capsule__dot--offline {
	background: #9ca3af !important;
}

@keyframes wid-pulse {
	0%, 100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.65;
		transform: scale(1.2);
	}
}

/* 胶囊文本区域 (单行截断，高质感，防止下伸笔画被截断) */
.wid-capsule__text {
	display: inline-flex;
	align-items: baseline;
	gap: 0.25rem;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	flex: 1 1 auto;
	min-width: 0;
	line-height: 1.6;
	padding-top: 2px;
	padding-bottom: 5px;
}

.wid-capsule__prefix {
	opacity: 0.72;
	font-weight: 400;
	flex-shrink: 0;
	line-height: inherit;
}

.wid-capsule__app {
	font-weight: 600;
	color: var(--primary, #6750a4);
	line-height: inherit;
}

.wid-capsule--offline .wid-capsule__app {
	color: inherit;
	font-weight: 500;
}

.wid-capsule__sep {
	opacity: 0.45;
	flex-shrink: 0;
}

.wid-capsule__title {
	opacity: 0.85;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 400;
}

.wid-capsule__at {
	opacity: 0.55;
	font-weight: 400;
	margin: 0 1px;
	flex-shrink: 0;
}

.wid-capsule__device {
	opacity: 0.85;
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-capsule__media-icon {
	flex-shrink: 0;
	font-size: 0.75rem;
}

/* 微型箭头指示器 */
.wid-capsule__chevron {
	flex-shrink: 0;
	color: var(--on-surface-variant, #49454f);
	opacity: 0.7;
	transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.wid-capsule__chevron--open {
	transform: rotate(180deg);
}

/* ------------------------------------------------------------
   Portal 遮罩与弹窗容器
   ------------------------------------------------------------ */

.wid-portal-layer {
	position: fixed !important;
	inset: 0 !important;
	z-index: 10000 !important;
	pointer-events: none !important;
}

.wid-scrim {
	position: fixed !important;
	inset: 0 !important;
	background: rgba(0, 0, 0, 0.38) !important;
	backdrop-filter: none !important;
	-webkit-backdrop-filter: none !important;
	pointer-events: auto !important;
	touch-action: none;
	animation: wid-fade-in 0.2s cubic-bezier(0, 0, 0.2, 1);
}

@keyframes wid-fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}

/* ------------------------------------------------------------
   桌面端：胶囊上方上浮展开 (Lift-up & Expand)
   ------------------------------------------------------------ */
@media (min-width: 768px) {
	.wid-panel {
		position: fixed !important;
		bottom: clamp(16px, var(--anchor-bottom, 200px), calc(100vh - 440px)) !important;
		left: var(--anchor-left, 50%) !important;
		transform: translate(-50%, -16px) !important;
		width: min(92vw, 420px) !important;
		max-height: min(78vh, calc(var(--anchor-bottom, 200px) + 20px)) !important;
		background: var(--card-bg, #ffffff) !important;
		border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.14)) !important;
		border-radius: 18px !important;
		box-shadow: 0 16px 44px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.06) !important;
		z-index: 10001 !important;
		pointer-events: auto !important;
		display: flex !important;
		flex-direction: column !important;
		overflow: hidden !important;
		transform-origin: bottom center;
		animation: wid-desktop-lift 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
	}

	@keyframes wid-desktop-lift {
		from {
			opacity: 0;
			transform: translate(-50%, 0) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -16px) scale(1);
		}
	}

	.wid-panel__drag-handle {
		display: none !important;
	}
}

/* ------------------------------------------------------------
   移动端：原生 Material 3 底部抽屉 (Modal Bottom Sheet)
   ------------------------------------------------------------ */
@media (max-width: 767.98px) {
	.wid-panel {
		position: fixed !important;
		bottom: 0 !important;
		left: 0 !important;
		right: 0 !important;
		top: auto !important;
		transform: translateY(0) !important;
		width: 100% !important;
		max-height: min(82vh, 82dvh) !important;
		background: var(--card-bg, #ffffff) !important;
		border-radius: 24px 24px 0 0 !important;
		border: none !important;
		border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.12)) !important;
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.22) !important;
		z-index: 10001 !important;
		pointer-events: auto !important;
		display: flex !important;
		flex-direction: column !important;
		overflow: hidden !important;
		touch-action: manipulation;
		animation: wid-mobile-slide-up 0.24s cubic-bezier(0.1, 0.9, 0.2, 1) !important;
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
		display: block !important;
		width: 36px;
		height: 4px;
		border-radius: 9999px;
		background: var(--outline-variant, rgba(0, 0, 0, 0.25));
		margin: 10px auto 4px;
		flex-shrink: 0;
	}
}

/* ------------------------------------------------------------
   面板内部结构与组件样式
   ------------------------------------------------------------ */

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
	min-width: 0;
}

.wid-panel__title span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-panel__actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.35rem;
	flex-shrink: 0;
}

/* 刷新动态微胶囊 (点击向左平滑展开，收起时为标准圆形按钮) */
.wid-panel__refresh-pill {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0;
	height: 28px;
	min-width: 28px;
	max-width: 28px;
	border-radius: 9999px;
	background: none;
	border: 1px solid transparent;
	color: var(--on-surface-variant, #49454f);
	cursor: pointer;
	padding: 0 7px;
	white-space: nowrap;
	overflow: hidden;
	transition: max-width 0.32s cubic-bezier(0.2, 0, 0, 1),
	            background-color 0.2s ease,
	            border-color 0.2s ease,
	            color 0.2s ease,
	            padding 0.25s ease,
	            gap 0.25s ease;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
	box-sizing: border-box;
}

.wid-panel__refresh-pill:hover {
	background: var(--surface-container-high, rgba(0, 0, 0, 0.06));
	color: var(--on-surface, #1c1b1f);
}

.wid-panel__refresh-pill:disabled {
	cursor: default;
}

.wid-panel__refresh-pill--expanded {
	max-width: 140px;
	gap: 0.35rem;
	padding: 0 10px 0 8px;
	background: var(--secondary-container, rgba(103, 80, 164, 0.1));
	border-color: var(--outline-variant, rgba(103, 80, 164, 0.25));
	color: var(--primary, #6750a4);
}

.wid-panel__refresh-pill--cooldown {
	max-width: 175px;
	gap: 0.35rem;
	padding: 0 10px 0 8px;
	background: rgba(245, 158, 11, 0.12);
	border-color: rgba(245, 158, 11, 0.3);
	color: #b45309;
}

.wid-panel__refresh-pill--done {
	max-width: 95px;
	gap: 0.35rem;
	padding: 0 10px 0 8px;
	background: rgba(16, 185, 129, 0.12);
	border-color: rgba(16, 185, 129, 0.3);
	color: #059669;
}

.wid-panel__refresh-label {
	font-size: 0.72rem;
	font-weight: 500;
	line-height: 1;
	opacity: 0;
	transform: translateX(4px);
	transition: opacity 0.2s ease 0.05s, transform 0.2s ease 0.05s;
	pointer-events: none;
	white-space: nowrap;
}

.wid-panel__refresh-pill--expanded .wid-panel__refresh-label {
	opacity: 1;
	transform: translateX(0);
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
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* 内容滚动容器 (独立惯性触摸滚动) */
.wid-panel__body {
	flex: 1 1 auto;
	overflow-y: auto !important;
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
	touch-action: pan-y;
	padding: 0.875rem 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

@media (max-width: 767.98px) {
	.wid-panel__body {
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 24px));
	}
}

/* 当前焦点设备概览卡片 */
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
	color: var(--on-surface-variant, #49454f);
	flex-wrap: wrap;
	gap: 0.25rem;
}

.wid-current-card__active-hint {
	color: #10b981;
	font-weight: 500;
}

.wid-current-card__os-info {
	opacity: 0.75;
}

/* 舰队分组与设备卡片 */
.wid-fleet {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.wid-group {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.wid-group__header {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface-variant, #49454f);
	padding: 0 0.25rem;
}

.wid-group__count {
	font-size: 0.6875rem;
	background: var(--surface-container-high, rgba(0, 0, 0, 0.06));
	padding: 0 0.35rem;
	border-radius: 9999px;
}

.wid-group__grid {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.wid-device-card {
	background: var(--surface-container-lowest, rgba(0, 0, 0, 0.02));
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.06));
	border-radius: 10px;
	padding: 0.625rem 0.75rem;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.wid-device-card--active {
	border-color: color-mix(in oklab, #10b981 35%, transparent);
	background: color-mix(in oklab, #10b981 5%, var(--card-bg, #ffffff));
}

.wid-device-card--offline {
	opacity: 0.75;
}

.wid-device-card__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.wid-device-card__name-wrapper {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--on-surface, #1c1b1f);
}

.wid-device-card__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #9ca3af;
}

.wid-device-card__dot--active {
	background: #10b981;
}

.wid-device-card__dot--idle {
	background: #f59e0b;
}

.wid-device-card__badge {
	font-size: 0.6875rem;
	padding: 0.0625rem 0.35rem;
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.05);
	color: var(--on-surface-variant, #49454f);
}

.wid-device-card__badge--active {
	background: rgba(16, 185, 129, 0.15);
	color: #059669;
	font-weight: 600;
}

.wid-device-card__badge--idle {
	background: rgba(245, 158, 11, 0.15);
	color: #d97706;
}

.wid-device-card__body {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	font-size: 0.75rem;
}

.wid-device-card__app {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	color: var(--on-surface, #1c1b1f);
}

.wid-device-card__app-title {
	font-weight: 600;
}

.wid-device-card__win-title {
	opacity: 0.8;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-device-card__time {
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	opacity: 0.8;
}

.wid-device-card__abs-time {
	margin-left: 0.25rem;
	opacity: 0.7;
}

/* 历史时间轴 */
.wid-history {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.wid-history__title {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--on-surface-variant, #49454f);
	padding: 0 0.25rem;
}

.wid-timeline {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	border-left: 2px solid var(--outline-variant, rgba(0, 0, 0, 0.08));
	margin-left: 0.5rem;
	padding-left: 0.75rem;
}

.wid-timeline__item {
	position: relative;
}

.wid-timeline__dot {
	position: absolute;
	left: -0.9375rem;
	top: 0.3125rem;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--primary, #6750a4);
}

.wid-timeline__content {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	font-size: 0.75rem;
}

.wid-timeline__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.wid-timeline__app {
	font-weight: 600;
	color: var(--on-surface, #1c1b1f);
}

.wid-timeline__time {
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	opacity: 0.75;
}

.wid-timeline__title {
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	font-style: italic;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wid-timeline__device {
	font-size: 0.625rem;
	color: var(--on-surface-variant, #49454f);
	opacity: 0.6;
}

/* 空状态与底栏 */
.wid-panel__empty {
	text-align: center;
	padding: 1.5rem 1rem;
	font-size: 0.8125rem;
	color: var(--on-surface-variant, #49454f);
	background: rgba(0, 0, 0, 0.02);
	border-radius: 8px;
}

.wid-panel__empty--error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	color: var(--error, #ba1a1a);
	background: color-mix(in oklab, var(--error-container, #ffdad6) 30%, transparent);
	border: 1px solid var(--error, rgba(186, 26, 26, 0.2));
}

.wid-panel__retry-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.35rem 0.85rem;
	border-radius: 6px;
	border: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.12));
	background: var(--surface-container-high, #f3edf7);
	color: var(--on-surface, #1c1b1f);
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease;
}

.wid-panel__retry-btn:hover {
	background: var(--primary, #6750a4);
	color: var(--on-primary, #ffffff);
}

.wid-panel__footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.5rem 1rem;
	border-top: 1px solid var(--outline-variant, rgba(0, 0, 0, 0.06));
	font-size: 0.6875rem;
	color: var(--on-surface-variant, #49454f);
	flex-shrink: 0;
	background: var(--surface-container-lowest, rgba(0, 0, 0, 0.01));
}

.wid-panel__proto-badge {
	font-weight: 500;
	opacity: 0.75;
}

.wid-panel__status-hint {
	font-weight: 500;
}
`;

export function injectCapsuleStyles(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById("wid-capsule-styles")) return;

	const styleEl = document.createElement("style");
	styleEl.id = "wid-capsule-styles";
	styleEl.textContent = capsuleStyles;
	document.head.appendChild(styleEl);
}
