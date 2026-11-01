import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Safely executes a shell command, returning trimmed stdout or null
 */
function run(cmd) {
	try {
		return execSync(cmd, { stdio: ["pipe", "pipe", "ignore"], encoding: "utf8", timeout: 1500 }).trim();
	} catch {
		return null;
	}
}

/**
 * Detects OS and Desktop Environment info
 */
export function getOsInfo() {
	let osName = "Linux";
	try {
		const osRelease = readFileSync("/etc/os-release", "utf8");
		const match = osRelease.match(/PRETTY_NAME="([^"]+)"/) || osRelease.match(/NAME="([^"]+)"/);
		if (match) osName = match[1];
	} catch {}

	const desktop = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || "KDE";
	const sessionType = process.env.XDG_SESSION_TYPE || "wayland";
	const kdeVersion = process.env.KDE_SESSION_VERSION || "6";

	return `${osName} / ${sessionType} (${desktop} ${kdeVersion})`;
}

/**
 * Gets user idle time in seconds
 */
export function getIdleSeconds() {
	// 1. Try FreeDesktop ScreenSaver D-Bus (supported on KDE Plasma 6 & GNOME)
	const ssIdle = run("qdbus org.freedesktop.ScreenSaver /ScreenSaver org.freedesktop.ScreenSaver.GetActiveTime");
	if (ssIdle && !Number.isNaN(Number(ssIdle))) {
		return Math.max(0, Math.floor(Number(ssIdle) / 1000));
	}

	// 2. Try xprintidle if available (X11 / XWayland fallback)
	const xIdle = run("xprintidle");
	if (xIdle && !Number.isNaN(Number(xIdle))) {
		return Math.max(0, Math.floor(Number(xIdle) / 1000));
	}

	return 0;
}

/**
 * Detects the currently active window and application under KDE 6 / Wayland / Linux
 */
export function detectActiveWindow() {
	// Each strategy is tried in order and only consulted when the previous one
	// found no application name. Written as a table of probes instead of five
	// inline blocks so the fallback order is readable in one place and each
	// probe can be reasoned about (and tested) on its own.
	const strategies = [
		{ name: "kdotool", probe: probeKdotool },
		{ name: "kwin-dbus", probe: probeKwinDbus },
		{ name: "hyprland", probe: probeHyprland },
		{ name: "xdotool", probe: probeXdotool },
		{ name: "active-process", probe: probeActiveProcess },
	];

	let found = { appName: "", windowTitle: "" };
	for (const strategy of strategies) {
		found = strategy.probe() || found;
		if (found.appName) break;
	}

	// Clean up app names (e.g. capitalize or remove common binary prefixes)
	const formattedAppName = found.appName
		.replace(/^org\.kde\./i, "")
		.replace(/^google-chrome/i, "Google Chrome")
		.replace(/^code/i, "Visual Studio Code")
		.replace(/^antigravity/i, "Antigravity")
		.replace(/^firefox/i, "Firefox");

	return {
		appName: formattedAppName,
		windowTitle: found.windowTitle || formattedAppName,
	};
}

/** Strategy A: kdotool, the specialised tool for KDE Wayland. */
function probeKdotool() {
	const window = run("kdotool getactivewindow");
	if (!window) return null;
	const name = run(`kdotool getwindowname ${window}`);
	const cls = run(`kdotool getwindowclassname ${window}`);
	// A class alone is enough to claim the window; without either we defer.
	if (!cls && !name) return null;
	return { appName: cls || "", windowTitle: name || "" };
}

/** Strategy B: KDE KWin D-Bus scripting query. */
function probeKwinDbus() {
	const active = run("qdbus org.kde.KWin /KWin org.kde.KWin.activeClient");
	if (!active) return null;
	const title = run(
		`qdbus org.kde.KWin /KWin org.kde.KWin.queryWindowInfo ${active}`,
	);
	if (!title) return null;
	// KWin titles arrive as `app - window` or `app — window`; the trailing
	// segment is the application name under both conventions.
	return {
		appName: title.split(" — ").pop()?.split(" - ").pop() || "KDE Window",
		windowTitle: title,
	};
}

/** Strategy C: Hyprland / Sway Wayland fallback. */
function probeHyprland() {
	if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return null;
	const raw = run("hyprctl activewindow -j");
	if (!raw) return null;
	try {
		const data = JSON.parse(raw);
		return {
			appName: data.class || data.initialClass || "",
			windowTitle: data.title || "",
		};
	} catch {
		// hyprctl answered but not with JSON. Nothing to read, defer.
		return null;
	}
}

/** Strategy D: xdotool for XWayland or X11 apps. */
function probeXdotool() {
	if (!process.env.DISPLAY) return null;
	const title = run("xdotool getactivewindow getwindowname");
	const cls = run("xdotool getactivewindow getwindowclassname");
	if (!cls && !title) return null;
	return { appName: cls || "", windowTitle: title || "" };
}

/** Strategy E: the most CPU-active desktop GUI process, then a static default. */
function probeActiveProcess() {
	const activeComm = run(
		"ps -u $USER -o comm= --sort=-%cpu | grep -vE 'ps|grep|qdbus|sh|bash|zsh|node|kwin|systemd' | head -n 1",
	);
	if (activeComm) {
		return {
			appName: activeComm,
			windowTitle: `${activeComm} (Active Process)`,
		};
	}
	// The final fallback always claims a window: there is nothing left to try,
	// and reporting "Desktop" is more useful to the reader than an empty capsule.
	return { appName: "KDE Plasma", windowTitle: "Desktop" };
}
