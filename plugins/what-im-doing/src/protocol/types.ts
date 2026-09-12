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
 * Media playback info compatible with Mix Space / Shiro
 */
export interface MediaInfo {
	title?: string;
	artist?: string;
	album?: string;
	isPlaying?: boolean;
}

/**
 * Single activity event payload
 */
export interface DeviceActivity {
	timestamp: number; // Unix epoch ms
	deviceId: string; // e.g. "arch-pc"
	deviceName: string; // e.g. "Arch Linux (KDE 6.7)"
	appName: string; // e.g. "Antigravity"
	windowTitle: string; // e.g. "Workspace - Code Editor"
	status: ActivityStatus;
	osInfo: string; // e.g. "Linux / Wayland (Plasma 6.7)"
	idleSeconds: number;
	media?: MediaInfo;
	metadata?: Record<string, string>;

	// Fleet v2 / Mix Space compatibility aliases
	id?: string;
	name?: string;
	type?: "desktop" | "laptop" | "server" | "mobile" | "other" | string;
	offline?: boolean;
	lastSeen?: number;
	process_name?: string;
	process?: string;
	media_title?: string;
	media_artist?: string;
	device?: string;
	device_id?: string;
}

/**
 * Multi-device category summary counts
 */
export interface DeviceGroupCounts {
	desktop: number;
	laptop: number;
	server: number;
	mobile?: number;
	other?: number;
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
	history?: DeviceActivity[];
	groups?: DeviceGroupCounts;
	serverTime: number;
}

/**
 * Options for configuring the WhatImDoing Astro Integration
 */
export interface WhatImDoingOptions {
	/**
	 * Backend API endpoint URL (e.g. "/api/activity" or "https://activity.example.com/api/activity")
	 * Default: "/api/activity"
	 */
	endpoint?: string;

	/**
	 * Maximum number of history events to display in the drawer/popover
	 * Default: 5
	 */
	maxHistoryDisplay?: number;

	/**
	 * Client polling interval in milliseconds.
	 * Default: 0 (disabled by default for zero-overhead browsing). Set > 0 only if background periodic polling is desired.
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
	 * Restrict capsule loading to specific URL path prefixes
	 * Default: undefined (mounts on all routes matching targetSelector)
	 */
	routeFilter?: string[];

	/**
	 * Enable built-in local dev mock endpoint under /api/activity
	 * Default: true in dev mode
	 */
	enableLocalEndpoint?: boolean;
}
