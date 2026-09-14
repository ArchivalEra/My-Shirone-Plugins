import { ActivityStatus, type DeviceActivity } from "../protocol/types.js";

/**
 * Capitalizes the first character if it is a letter.
 */
export function capitalizeFirstLetter(str: string): string {
	if (!str) return "";
	const first = str.charAt(0);
	if (first >= "a" && first <= "z") {
		return first.toUpperCase() + str.slice(1);
	}
	return str;
}

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
 * Formats a timestamp into standard YYYY-MM-DD HH:mm representation.
 */
export function formatDateTime(timestamp: number): string {
	if (!timestamp || timestamp <= 0) return "";
	const d = new Date(timestamp);
	if (Number.isNaN(d.getTime())) return "";
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hour}:${min}`;
}

/**
 * Formats offline timestamp into the format specified in acceptance criteria:
 * e.g. "最后活跃时间: 2026-09-11 03:45 (X小时前)"
 */
export function formatOfflineTime(
	timestamp: number,
	now: number = Date.now(),
	lang: "zh" | "en" = "zh",
): string {
	if (!timestamp || timestamp <= 0) return "";
	const dateStr = formatDateTime(timestamp);
	if (!dateStr) return "";
	const relStr = formatRelativeTime(timestamp, now, lang);
	if (lang === "zh") {
		return `最后活跃时间: ${dateStr} (${relStr})`;
	}
	return `Last active: ${dateStr} (${relStr})`;
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
	if (!act?.appName) {
		return {
			statusType: "offline",
			sentence: lang === "zh" ? "当前无活跃设备" : "No active device",
			appName: "",
			deviceName: "",
			relativeTime: "",
		};
	}

	const ts = act.lastSeen ?? act.timestamp;
	const diffMs = Math.max(0, now - ts);
	const diffSec = Math.floor(diffMs / 1000);
	const relativeTime = formatRelativeTime(ts, now, lang);

	// Status determination
	let statusType: "active" | "idle" | "away" | "offline" = "active";
	if (
		act.status === ActivityStatus.OFFLINE ||
		act.offline ||
		diffSec > 86400 * 3
	) {
		statusType = "offline";
	} else if (act.status === ActivityStatus.AWAY || diffSec > 1800) {
		statusType = "away";
	} else if (act.status === ActivityStatus.IDLE || diffSec > 180) {
		statusType = "idle";
	}

	const isCurrentlyActive = statusType === "active" && diffSec < 120;
	const dev =
		act.deviceName ||
		act.name ||
		act.deviceId ||
		act.id ||
		(lang === "zh" ? "Linux设备" : "Device");

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
		} else if (statusType === "offline") {
			sentence = `最后在使用: ${act.appName}`;
		} else {
			sentence = `${relativeTime}在 ${dev} 使用 ${act.appName}`;
		}
	} else {
		if (isCurrentlyActive) {
			sentence = `Using ${act.appName} on ${dev}`;
		} else if (statusType === "offline") {
			sentence = `Last used: ${act.appName}`;
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
