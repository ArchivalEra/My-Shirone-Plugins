/**
 * Activity status enumeration matching proto3 enum
 */
export enum ActivityStatus {
	ACTIVITY_STATUS_UNKNOWN = 0,
	ACTIVE = 1,
	IDLE = 2,
	AWAY = 3,
	OFFLINE = 4,
}

/**
 * Single activity event payload
 */
export interface DeviceActivity {
	timestamp: number; // Unix epoch ms
	deviceId: string; // e.g. "arch-pc"
	deviceName: string; // e.g. "Arch Linux (KDE 6.7)"
	appName: string; // e.g. "Antigravity"
	windowTitle: string; // e.g. "isui.ren-Blog - Antigravity"
	status: ActivityStatus;
	osInfo: string; // e.g. "Linux / Wayland (Plasma 6.7)"
	idleSeconds: number;
	metadata?: Record<string, string>;
}

/**
 * Batch upload request sent by collector
 */
export interface ActivityBatchUploadRequest {
	token: string;
	events: DeviceActivity[];
}

/**
 * History query response consumed by the frontend capsule
 */
export interface ActivityHistoryResponse {
	current: DeviceActivity | null;
	devices: DeviceActivity[];
	history: DeviceActivity[];
	serverTime: number;
}

/**
 * Options for configuring the WhatImDoing Astro Integration
 */
export interface WhatImDoingOptions {
	/**
	 * Backend API endpoint URL (e.g. "/api/activity" or "https://activity.isui.ren/api/activity")
	 * Default: "/api/activity"
	 */
	endpoint?: string;

	/**
	 * Maximum number of history events to display in the drawer/popover
	 * Default: 5
	 */
	maxHistoryDisplay?: number;

	/**
	 * Client polling interval in milliseconds
	 * Default: 30000 (30 seconds). Set to 0 to disable periodic polling.
	 */
	refreshInterval?: number;

	/**
	 * DOM target selector to anchor the capsule above or inside
	 * Default: 'a[aria-label="Go to About Page"]'
	 */
	targetSelector?: string;

	/**
	 * Insertion position relative to targetSelector
	 * Default: "beforebegin" (directly above the avatar container)
	 */
	position?: "beforebegin" | "afterbegin" | "beforeend" | "afterend";

	/**
	 * Secret token for authorized local mock endpoint updates
	 */
	authToken?: string;

	/**
	 * Enable built-in local dev mock endpoint under /api/activity
	 * Default: true in dev mode
	 */
	enableLocalEndpoint?: boolean;
}
