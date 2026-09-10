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
	let appName = "";
	let windowTitle = "";

	// Strategy A: kdotool (specialized tool for KDE Wayland)
	const kdotoolWindow = run("kdotool getactivewindow");
	if (kdotoolWindow) {
		const name = run(`kdotool getwindowname ${kdotoolWindow}`);
		const cls = run(`kdotool getwindowclassname ${kdotoolWindow}`);
		if (cls) appName = cls;
		if (name) windowTitle = name;
	}

	// Strategy B: KDE KWin D-Bus scripting query
	if (!appName) {
		const kwinActive = run("qdbus org.kde.KWin /KWin org.kde.KWin.activeClient");
		if (kwinActive) {
			const title = run(`qdbus org.kde.KWin /KWin org.kde.KWin.queryWindowInfo ${kwinActive}`);
			if (title) {
				windowTitle = title;
				appName = title.split(" — ").pop()?.split(" - ").pop() || "KDE Window";
			}
		}
	}

	// Strategy C: Hyprland / Sway Wayland fallback
	if (!appName && process.env.HYPRLAND_INSTANCE_SIGNATURE) {
		const hypr = run("hyprctl activewindow -j");
		if (hypr) {
			try {
				const data = JSON.parse(hypr);
				appName = data.class || data.initialClass || "";
				windowTitle = data.title || "";
			} catch {}
		}
	}

	// Strategy D: xdotool / xprop for XWayland or X11 apps
	if (!appName && process.env.DISPLAY) {
		const xTitle = run("xdotool getactivewindow getwindowname");
		const xClass = run("xdotool getactivewindow getwindowclassname");
		if (xClass) appName = xClass;
		if (xTitle) windowTitle = xTitle;
	}

	// Strategy E: Fallback to most active desktop GUI process
	if (!appName) {
		// Sample most recent GUI process from /proc or ps
		const activeComm = run("ps -u $USER -o comm= --sort=-%cpu | grep -vE 'ps|grep|qdbus|sh|bash|zsh|node|kwin|systemd' | head -n 1");
		if (activeComm) {
			appName = activeComm;
			windowTitle = `${activeComm} (Active Process)`;
		} else {
			appName = "KDE Plasma";
			windowTitle = "Desktop";
		}
	}

	// Clean up app names (e.g. capitalize or remove common binary prefixes)
	const formattedAppName = appName
		.replace(/^org\.kde\./i, "")
		.replace(/^google-chrome/i, "Google Chrome")
		.replace(/^code/i, "Visual Studio Code")
		.replace(/^antigravity/i, "Antigravity")
		.replace(/^firefox/i, "Firefox");

	return {
		appName: formattedAppName,
		windowTitle: windowTitle || formattedAppName,
	};
}
