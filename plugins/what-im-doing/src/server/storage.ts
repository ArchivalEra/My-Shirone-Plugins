import type { ActivityHistoryResponse, DeviceActivity } from "../protocol/types.js";

/**
 * In-memory / dev server activity store with configurable history capacity
 */
export class ActivityStore {
	private devices = new Map<string, DeviceActivity>();
	private history: DeviceActivity[] = [];

	constructor(private maxStorageItems = 5000) {}

	/**
	 * Records a new activity event (supports Mix Space and Shiro format)
	 */
	record(activity: Partial<DeviceActivity>): void {
		if (!activity) return;

		const deviceId =
			activity.deviceId || activity.device_id || activity.device || "default";
		const deviceName = activity.deviceName || activity.device || deviceId;
		const appName =
			activity.appName || activity.process_name || activity.process || "Desktop";
		const windowTitle = activity.windowTitle || "";
		let timestamp = activity.timestamp || Date.now();
		if (timestamp < 10_000_000_000) {
			timestamp *= 1000;
		}
		const status = activity.status ?? 1;
		const osInfo = activity.osInfo || "Linux";
		const idleSeconds = activity.idleSeconds ?? 0;

		const media =
			activity.media ||
			(activity.media_title
				? {
						title: activity.media_title,
						artist: activity.media_artist || "",
						isPlaying: true,
					}
				: undefined);

		const normalized: DeviceActivity = {
			timestamp,
			deviceId,
			deviceName,
			appName,
			windowTitle,
			status,
			osInfo,
			idleSeconds,
			media,
			metadata: activity.metadata,
			process_name: appName,
			process: appName,
			media_title: media?.title,
			media_artist: media?.artist,
			device: deviceName,
			device_id: deviceId,
		};

		// Update device latest
		this.devices.set(deviceId, normalized);

		// Append to history (newest first)
		this.history.unshift(normalized);

		// Trim history if exceeds capacity
		if (this.history.length > this.maxStorageItems) {
			this.history = this.history.slice(0, this.maxStorageItems);
		}
	}

	/**
	 * Ingests a batch of events
	 */
	recordBatch(events: DeviceActivity[]): void {
		for (const ev of events) {
			this.record(ev);
		}
	}

	/**
	 * Builds an ultra-compact ActivityHistoryResponse containing only the latest active device.
	 * Designed for initial on-intent capsules to minimize payload size (<100 bytes).
	 */
	getBriefResponse(): ActivityHistoryResponse {
		const devicesList = this.getSortedDevices();
		const current = devicesList.length > 0 ? devicesList[0] : null;

		return {
			current,
			devices: current ? [current] : [],
			history: [],
			serverTime: Date.now(),
		};
	}

	/**
	 * Builds an ActivityHistoryResponse with full device roster and recent history.
	 */
	getResponse(maxDisplay = 5): ActivityHistoryResponse {
		const devicesList = this.getSortedDevices();
		const current = devicesList.length > 0 ? devicesList[0] : null;

		return {
			current,
			devices: devicesList,
			history: this.history.slice(0, maxDisplay),
			serverTime: Date.now(),
		};
	}

	private getSortedDevices(): DeviceActivity[] {
		return Array.from(this.devices.values()).sort((a, b) => {
			const aIsActive = a.status === 1 && (a.idleSeconds || 0) < 180 ? 1 : 0;
			const bIsActive = b.status === 1 && (b.idleSeconds || 0) < 180 ? 1 : 0;
			if (aIsActive !== bIsActive) return bIsActive - aIsActive;
			if ((a.idleSeconds || 0) !== (b.idleSeconds || 0)) {
				return (a.idleSeconds || 0) - (b.idleSeconds || 0);
			}
			return b.timestamp - a.timestamp;
		});
	}

	/**
	 * Retrieves raw history for self-inspection
	 */
	getAllHistory(): DeviceActivity[] {
		return [...this.history];
	}

	/**
	 * Clears store
	 */
	clear(): void {
		this.devices.clear();
		this.history = [];
	}
}

// Global default singleton store
export const defaultStore = new ActivityStore(5000);
