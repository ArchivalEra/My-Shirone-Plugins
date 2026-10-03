# @shirone-plugins/steam-recent

Steam「最近在玩」区块——**构建期快照平面**（remote-data-system 第一平面）的实现：
CI 定时把近两周游玩记录拉成版本化 JSON 快照，主题在 astro 构建期读入、
**纯 SSR 直出**。访客零运行时请求、零客户端 JS、站点不持有任何 Steam 凭据。

## 数据流

```
内容仓 CI（cron 4 次/日）
  └─ node steam-recent/src/cli/steam-sync.mjs --recent --out data/games.recent.json
       └─ GetRecentlyPlayedGames → 字段白名单 → 版本化快照（keepLastValid）
内容仓快照提交 → 触发主题部署 → content:sync 物化 → astro 构建期 SSR 直出
```

- **凭据**：`STEAM_API_KEY` + `STEAM_ID64`，只存在于内容仓 Actions Secrets。
- **keepLastValid**：拉取失败或未配置凭据时保留旧快照并以 0 退出，部署永不
  因此中断；快照为空时页面显示空态。

## 页面接线（主题侧约 4 行）

```astro
---
import { resolveSteamRecentOptions } from "@shirone-plugins/steam-recent";
import SteamRecentSection from "@shirone-plugins/steam-recent/section/SteamRecentSection.svelte";
import recentSnapshot from "@/data/games.recent.json";
import type { RecentGameItem } from "@shirone-plugins/steam-recent";

const recentOptions = resolveSteamRecentOptions({ enable: true });
const recentGames = (recentSnapshot as { games: RecentGameItem[] }).games ?? [];
---

<SteamRecentSection options={recentOptions} games={recentGames} />
```

## CLI

```bash
node src/cli/steam-sync.mjs --recent --out data/games.recent.json
node src/cli/steam-sync.mjs --apps 570,413150 --out data/games.steam.json
```

- `--recent`：近两周游玩快照（需要凭据环境变量；keepLastValid）。
- `--apps`：商店元数据（appdetails 免钥，中文本地化）+ 可选个人库 playtime；
  产出 GameItem 兼容字段包，供游戏清单条目以 `...steam["<appid>"]` 展开
  （steam 元数据在前、人工字段在后，人工永远赢）。

## 设计决策

- **构建期快照而非运行时代理**：访客零触发上游调用；heart 等边缘层无需
  承担第三方代理职责；凭据只进 CI 环境。
- **文案内联于插件**：与 what-im-doing 胶囊同惯例，不占用主题 i18n 表面，
  上游 i18n 更新零冲突。
- **background-image 双层封面**：URL 失败时渐变底层自然露出，无破图元素，
  无需任何 JS 回退（纯 SSR 没有 hydration 可用）。
