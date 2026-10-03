#!/usr/bin/env node
/**
 * Steam 数据同步 CLI（@shirone-plugins/steam-recent）。
 *
 * 两种模式：
 *   --recent              拉取近两周游玩（GetRecentlyPlayedGames），生成快照 JSON
 *                         ——构建期快照平面：内容仓 CI 定时执行，产物提交为
 *                         版本化快照，主题构建期读入 SSR 直出。
 *   --apps 570,413150     拉取指定 appid 的商店元数据（appdetails，免钥），
 *                         生成 GameItem 兼容字段包，供清单条目手工接线。
 *
 * 输出：
 *   --out <path>          输出文件路径；缺省为 cwd 下的 games.recent.json /
 *                         games.steam.json。
 *
 * 凭据（仅 --recent 需要；只走环境变量，绝不入仓）：
 *   STEAM_API_KEY / STEAM_ID64
 *
 * keepLastValid（对齐 anime 快照先例）：--recent 拉取失败或未配置凭据时，
 * 保留现有输出文件、警告、以退出码 0 结束——部署流水线绝不因 Steam 抖动
 * 而中断，页面降级为旧快照或空态。
 *
 * 限频：appdetails 约 200 次/5 分钟/IP，逐条串行并带间隔。
 * 若 api.steampowered.com 直连被网络阻断，可前置 NODE_USE_ENV_PROXY=1。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STORE_API = "https://store.steampowered.com/api/appdetails";
const RECENT_API =
	"https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/";
const OWNED_API =
	"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const REQUEST_GAP_MS = 400;
const MAX_TAGS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
	const args = { apps: [], recent: false, out: "" };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--apps" && argv[i + 1]) {
			args.apps.push(
				...argv[i + 1]
					.split(",")
					.map((s) => s.trim())
					.filter((s) => /^\d+$/.test(s)),
			);
			i++;
		} else if (argv[i] === "--recent") {
			args.recent = true;
		} else if (argv[i] === "--out" && argv[i + 1]) {
			args.out = argv[i + 1];
			i++;
		}
	}
	return args;
}

async function writeSnapshot(path, payload) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(payload, null, "\t")}\n`, "utf8");
	console.log(`[steam] 写出 → ${path}`);
}

/** --recent：近两周游玩 → 版本化快照（keepLastValid）。 */
async function runRecent(outPath) {
	const { STEAM_API_KEY, STEAM_ID64 } = process.env;
	if (!STEAM_API_KEY || !STEAM_ID64) {
		console.log(
			"[steam] --recent：未设置 STEAM_API_KEY / STEAM_ID64，保留现有快照不动。",
		);
		return;
	}
	process.stdout.write("[steam] 拉取近两周游玩记录 … ");
	try {
		const res = await fetch(
			`${RECENT_API}?key=${encodeURIComponent(STEAM_API_KEY)}&steamid=${encodeURIComponent(STEAM_ID64)}`,
			{
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const payload = await res.json();
		const raw = Array.isArray(payload?.response?.games)
			? payload.response.games
			: [];
		const games = raw
			.slice()
			.sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0))
			.map((game) => ({
				appid: game.appid,
				name: game.name,
				hours2weeks: Math.round(((game.playtime_2weeks || 0) / 60) * 10) / 10,
				hoursTotal: Math.round(((game.playtime_forever || 0) / 60) * 10) / 10,
				cover: `https://shared.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
			}));
		await writeSnapshot(outPath, {
			generatedAt: new Date().toISOString(),
			games,
		});
		console.log(`[steam] ok（${games.length} 条）`);
	} catch (err) {
		console.warn(
			`[steam] [warn] 近两周游玩拉取失败（${err.message}）；保留现有快照（keepLastValid）。`,
		);
	}
}

/** appdetails → GameItem 兼容字段包（不含任何人工字段）。 */
function mapAppDetails(data) {
	if (data.type !== "game" && data.type !== "dlc") {
		console.warn(`  [warn] 类型为 "${data.type}"，仍照常输出`);
	}
	const meta = {};
	if (data.name) meta.name = data.name;
	if (data.developers?.length) meta.developer = data.developers[0];
	if (data.header_image) meta.cover = data.header_image;
	if (data.release_date && !data.release_date.coming_soon) {
		const m = /\d{4}/.exec(data.release_date.date ?? "");
		if (m) meta.year = m[0];
	} else if (data.release_date?.coming_soon) {
		console.warn("  [warn] 未发售（coming soon），year 留空");
	}
	if (data.genres?.length) {
		meta.tags = data.genres.slice(0, MAX_TAGS).map((g) => g.description);
	}
	meta.link = `https://store.steampowered.com/app/${data.steam_appid}/`;
	return meta;
}

/** --apps：商店元数据 → GameItem 兼容字段包。 */
async function runApps(appIds, outPath) {
	const { STEAM_API_KEY, STEAM_ID64 } = process.env;
	let playtimeByAppId = null;
	if (STEAM_API_KEY && STEAM_ID64) {
		try {
			const res = await fetch(
				`${OWNED_API}?key=${encodeURIComponent(STEAM_API_KEY)}&steamid=${encodeURIComponent(STEAM_ID64)}&include_appinfo=1&include_played_free_games=1`,
				{
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(15_000),
				},
			);
			if (res.ok) {
				const owned = await res.json();
				const games = owned?.response?.games ?? [];
				playtimeByAppId = new Map(
					games.map((g) => [
						g.appid,
						{ minutes: g.playtime_forever ?? 0, last: g.rtime_last_played ?? 0 },
					]),
				);
				console.log(`[steam] 个人库读取成功：${games.length} 条拥有记录`);
			}
		} catch (err) {
			console.warn(`[steam] [warn] GetOwnedGames 失败（${err.message}）；hours 留空。`);
		}
	}

	const games = {};
	for (const appId of appIds) {
		process.stdout.write(`[steam] appid ${appId} … `);
		try {
			const payload = await fetch(
				`${STORE_API}?appids=${appId}&cc=cn&l=schinese`,
				{
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(15_000),
				},
			).then((r) => r.json());
			const entry = payload?.[String(appId)];
			if (!entry?.success || !entry.data) {
				console.log("失败（商店无此条目或区域不可见）");
				continue;
			}
			const meta = mapAppDetails(entry.data);
			if (!meta) {
				console.log("失败（字段为空）");
				continue;
			}
			if (playtimeByAppId?.has(appId)) {
				const { minutes, last } = playtimeByAppId.get(appId);
				if (minutes > 0) meta.hours = Math.round((minutes / 60) * 10) / 10;
				if (last > 0) {
					const days = Math.floor((Date.now() / 1000 - last) / 86400);
					console.log(
						`ok（${meta.name}；最近游玩 ${days === 0 ? "今天" : `${days} 天前`}）`,
					);
				} else {
					console.log(`ok（${meta.name}）`);
				}
			} else {
				console.log(`ok（${meta.name}）`);
			}
			games[String(appId)] = meta;
		} catch (err) {
			console.log(`失败（${err.message}）`);
		}
		await sleep(REQUEST_GAP_MS);
	}

	if (!Object.keys(games).length) {
		console.error("[steam] 没有任何条目成功，不写输出。");
		process.exitCode = 1;
		return;
	}
	await writeSnapshot(outPath, { generatedAt: new Date().toISOString(), games });
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.recent) {
		await runRecent(resolve(args.out || "games.recent.json"));
		return;
	}

	if (!args.apps.length) {
		console.log(
			"[steam] 用法：--recent（近两周游玩快照）或 --apps <appid,…>（商店元数据）；--out <path> 指定输出。",
		);
		return;
	}
	await runApps(args.apps, resolve(args.out || "games.steam.json"));
}

main();
