/**
 * Steam「最近在玩」类型契约。
 *
 * 数据平面：构建期快照（remote-data-system 第一平面）——CI 脚本
 * `cli/steam-sync.mjs --recent` 拉取近两周游玩并落盘为版本化 JSON，
 * 主题在 astro 构建期读入、SSR 直出。没有运行时请求，没有客户端 JS。
 */

/** 单条「最近在玩」数据（快照白名单字段）。 */
export interface RecentGameItem {
	/** Steam appid（用于拼商店链接）。 */
	appid: number;
	/** 游戏名。 */
	name: string;
	/** 横屏封面（Steam CDN header， Akamai 边缘）。 */
	cover: string;
	/** 近两周游玩时长（小时，一位小数）。 */
	hours2weeks?: number;
	/** 累计游玩时长（小时，一位小数）。 */
	hoursTotal?: number;
}

/** 快照文件（data/games.recent.json）的顶层形状。 */
export interface RecentGameSnapshot {
	/** 快照生成时间（ISO 8601）。 */
	generatedAt: string;
	/** 近两周游玩，按 2 周时长降序。 */
	games: RecentGameItem[];
}

/** 区块选项。 */
export interface SteamRecentOptions {
	/** 区块开关；调用方（页面钩子）决定是否渲染。 */
	enable: boolean;
	/** 最多展示条数。 */
	maxItems: number;
	/** 区块标题。 */
	title: string;
	/** 时长前缀标签（后接「X 小时」）。 */
	playtimeLabel: string;
	/** 空态文案（无快照数据或快照为空）。 */
	emptyLabel: string;
}
