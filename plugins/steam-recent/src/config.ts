/**
 * 选项解析：调用方传入部分覆盖，函数补齐安全默认值。
 * 校验收敛在纯函数里，组件只消费解析结果（零额外负担原则的 L1）。
 */
import type { SteamRecentOptions } from "./types.js";

const DEFAULTS: SteamRecentOptions = {
	enable: true,
	maxItems: 4,
	title: "最近在玩",
	playtimeLabel: "近两周游玩",
	emptyLabel: "最近两周没有游玩记录",
};

export function resolveSteamRecentOptions(
	options: Partial<SteamRecentOptions> = {},
): SteamRecentOptions {
	const maxItems = Number.isFinite(options.maxItems)
		? Math.min(Math.max(Math.trunc(options.maxItems as number), 1), 8)
		: DEFAULTS.maxItems;
	return {
		enable: options.enable ?? DEFAULTS.enable,
		maxItems,
		title: options.title?.trim() || DEFAULTS.title,
		playtimeLabel: options.playtimeLabel?.trim() || DEFAULTS.playtimeLabel,
		emptyLabel: options.emptyLabel?.trim() || DEFAULTS.emptyLabel,
	};
}
