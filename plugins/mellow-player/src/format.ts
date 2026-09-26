/**
 * Value presentation and coercion shared by the adapters and the surface.
 * Pure: no DOM, no clock, no locale.
 */

/**
 * Clamps `value` into `[min, max]`. `NaN` maps to `min` — silence for a
 * volume, the start for a position — while the infinities map to the bound
 * they point at, which matters because a live media element reports
 * `duration === Infinity` and must not drag a seek back to zero.
 */
export function clamp(value: number, min: number, max: number): number {
	if (Number.isNaN(value)) return min;
	if (value === Number.POSITIVE_INFINITY) return max;
	if (value === Number.NEGATIVE_INFINITY) return min;
	return Math.min(max, Math.max(min, value));
}

/** `0:07`, `4:31`, `1:02:03`. Non-finite or negative input reads as `0:00`. */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const remainder = total % 60;
	const paddedSeconds = String(remainder).padStart(2, "0");
	if (hours === 0) return `${minutes}:${paddedSeconds}`;
	return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Decimal units, because the value being shown is network accounting. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
		value /= 1000;
		unit += 1;
	}
	const digits = value < 10 && unit > 0 ? 1 : 0;
	return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** `412 ms`, `1.35 s`. Used by the diagnostics panel only. */
export function formatLatency(milliseconds: number): string {
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return "0 ms";
	if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

/**
 * A diagnostic string for a caught value. This text is never rendered as
 * copy — the surface shows its own localized error label and prints this
 * verbatim beneath it, because an engine's own message is the useful part.
 */
export function describeFailure(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	if (typeof error === "string") return error.trim() || "unknown";
	if (error === null || error === undefined) return "unknown";
	try {
		return JSON.stringify(error) ?? "unknown";
	} catch {
		return "unknown";
	}
}
