import { ActivityStatus, type DeviceActivity } from "../protocol/types.js";

/**
 * Formats a timestamp into a human-friendly relative time string in Chinese or English.
 */
export function formatRelativeTime(
	timestamp: number,
	now: number = Date.now(),
	lang: "zh" | "en" = "zh",
): string {
	const diffMs = Math.max(0, now - timestamp);
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (lang === "zh") {
		if (diffSec < 45) return "刚刚";
		if (diffMin < 60) return `${diffMin}分钟前`;
		if (diffHour < 24) return `${diffHour}小时前`;
		if (diffDay === 1) return "昨天";
		if (diffDay < 30) return `${diffDay}天前`;
		return new Date(timestamp).toLocaleDateString("zh-CN", {
			month: "short",
			day: "numeric",
		});
	}

	if (diffSec < 45) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay === 1) return "yesterday";
	if (diffDay < 30) return `${diffDay}d ago`;
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/**
 * Builds the capsule status text matching user's requested specification:
 * e.g. "10分钟前在 xxx设备 使用 Antigravity" or "正在 xxx设备 使用 Antigravity"
 */
export function formatActivitySentence(
	act: DeviceActivity | null,
	now: number = Date.now(),
	lang: "zh" | "en" = "zh",
): {
	statusType: "active" | "idle" | "away" | "offline";
	sentence: string;
	appName: string;
	deviceName: string;
	relativeTime: string;
} {
	if (!act || !act.appName) {
		return {
			statusType: "offline",
			sentence: lang === "zh" ? "当前无活跃设备" : "No active device",
			appName: "",
			deviceName: "",
			relativeTime: "",
		};
	}

	const diffMs = Math.max(0, now - act.timestamp);
	const diffSec = Math.floor(diffMs / 1000);
	const relativeTime = formatRelativeTime(act.timestamp, now, lang);

	// Status determination
	let statusType: "active" | "idle" | "away" | "offline" = "active";
	if (act.status === ActivityStatus.OFFLINE || diffSec > 86400 * 3) {
		statusType = "offline";
	} else if (act.status === ActivityStatus.AWAY || diffSec > 1800) {
		statusType = "away";
	} else if (act.status === ActivityStatus.IDLE || diffSec > 180) {
		statusType = "idle";
	}

	const isCurrentlyActive = statusType === "active" && diffSec < 120;
	const dev = act.deviceName || act.deviceId || (lang === "zh" ? "Linux设备" : "Device");

	let sentence = "";
	if (act.media?.title && isCurrentlyActive) {
		const mediaText = act.media.artist
			? `${act.media.title} - ${act.media.artist}`
			: act.media.title;
		if (lang === "zh") {
			sentence = `正在 ${dev} 收听 ${mediaText}`;
		} else {
			sentence = `Listening to ${mediaText} on ${dev}`;
		}
	} else if (lang === "zh") {
		if (isCurrentlyActive) {
			sentence = `正在 ${dev} 使用 ${act.appName}`;
		} else {
			sentence = `${relativeTime}在 ${dev} 使用 ${act.appName}`;
		}
	} else {
		if (isCurrentlyActive) {
			sentence = `Using ${act.appName} on ${dev}`;
		} else {
			sentence = `${relativeTime} used ${act.appName} on ${dev}`;
		}
	}

	return {
		statusType,
		sentence,
		appName: act.appName,
		deviceName: dev,
		relativeTime,
	};
}
