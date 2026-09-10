import type { ActivityHistoryResponse, DeviceActivity } from "../protocol/types.js";

/**
 * In-memory / dev server activity store with configurable history capacity
 */
export class ActivityStore {
	private devices = new Map<string, DeviceActivity>();
	private history: DeviceActivity[] = [];

	constructor(private maxStorageItems = 5000) {}

	/**
	 * Records a new activity event
	 */
	record(activity: DeviceActivity): void {
		if (!activity || !activity.deviceId) return;

		// Ensure timestamp is valid
		if (!activity.timestamp) {
			activity.timestamp = Date.now();
		}

		// Update device latest
		this.devices.set(activity.deviceId, activity);

		// Append to history (newest first)
		this.history.unshift(activity);

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
	 * Builds an ActivityHistoryResponse for frontend consumption
	 */
	getResponse(maxDisplay = 5): ActivityHistoryResponse {
		const devicesList = Array.from(this.devices.values()).sort((a, b) => {
			const aIsActive = a.status === 1 && (a.idleSeconds || 0) < 180 ? 1 : 0;
			const bIsActive = b.status === 1 && (b.idleSeconds || 0) < 180 ? 1 : 0;
			if (aIsActive !== bIsActive) return bIsActive - aIsActive;
			if ((a.idleSeconds || 0) !== (b.idleSeconds || 0)) {
				return (a.idleSeconds || 0) - (b.idleSeconds || 0);
			}
			return b.timestamp - a.timestamp;
		});

		const current = devicesList.length > 0 ? devicesList[0] : null;

		return {
			current,
			devices: devicesList,
			history: this.history.slice(0, maxDisplay),
			serverTime: Date.now(),
		};
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
