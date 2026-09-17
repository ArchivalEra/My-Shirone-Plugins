/**
 * @shirone-plugins/mangomesa-hub
 * Cross-station hub integration for MangoMesa, Compass, Projects, and Bahnhof.
 */

export interface StationLink {
	key: string;
	title: string;
	href: string;
	desc: string;
	icon: string;
	badge?: string;
}

export const MANGOMESA_STATION_LINKS: StationLink[] = [
	{
		key: "mangomesa",
		title: "Mango Mesa",
		href: "/MangoMesa/",
		desc: "博客主站台与生活动态",
		icon: "material-symbols:home-outline-rounded",
	},
	{
		key: "compass",
		title: "站点罗盘",
		href: "/MangoMesa/compass/",
		desc: "站点全貌与常用工具罗盘",
		icon: "material-symbols:explore-outline-rounded",
	},
	{
		key: "projects",
		title: "开源项目",
		href: "/MangoMesa/projects/",
		desc: "开源软件与服务矩阵展台",
		icon: "material-symbols:terminal-rounded",
	},
	{
		key: "bahnhof",
		title: "Bahnhof 调度站",
		href: "/Bahnhof/",
		desc: "全站中央调度与车次大屏中枢",
		icon: "material-symbols:train-outline-rounded",
		badge: "Station",
	},
	{
		key: "repo-mirrors",
		title: "国内仓库镜像",
		href: "/repo/My-Shirone-Plugins/",
		desc: "EdgeOne 国内极速直连仓库展示",
		icon: "material-symbols:speed-rounded",
		badge: "Mirror",
	},
];

export interface MangoMesaHubOptions {
	/** Enable the plugin */
	enabled?: boolean;
	/** Whether to show Bahnhof station pill */
	showStationPill?: boolean;
}

/**
 * Returns station destination link by key.
 */
export function getStationLink(key: string): StationLink | undefined {
	return MANGOMESA_STATION_LINKS.find((item) => item.key === key);
}

/**
 * Astro Integration for Shirone theme.
 */
export function shironeMangomesaHub(options: MangoMesaHubOptions = {}) {
	const enabled = options.enabled ?? true;

	return {
		name: "@shirone-plugins/mangomesa-hub",
		hooks: {
			"astro:config:setup": ({ updateConfig }: any) => {
				if (!enabled) return;
				updateConfig({
					vite: {
						define: {
							__MANGOMESA_STATION_LINKS__: JSON.stringify(MANGOMESA_STATION_LINKS),
						},
					},
				});
			},
		},
	};
}

export default shironeMangomesaHub;
