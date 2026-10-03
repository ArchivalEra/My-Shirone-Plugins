/**
 * @shirone-plugins/steam-recent — 构建期快照平面的「最近在玩」区块。
 *
 * 数据流：CI（内容仓 workflow）执行 `cli/steam-sync.mjs --recent --out …`
 * 生成版本化快照 → 主题在 astro 构建期读入 → `section/SteamRecentSection.svelte`
 * 纯 SSR 直出。零运行时请求、零客户端 JS、凭据只存在于 CI 环境。
 */
export { resolveSteamRecentOptions } from "./config.js";
export type {
	RecentGameItem,
	RecentGameSnapshot,
	SteamRecentOptions,
} from "./types.js";
