# @shirone-plugins/mellow-player

> 给 Shirone 的 `::artplayer` 嵌入换上一套 M3E 播放表面，并把 [Mellow-Player](https://github.com/ArchivalEra/Mellow-Player) 的有界 Range / WebCodecs 引擎挂在同一个接缝后面。

---

## 它解决什么

Shirone 的 `::artplayer` 语法原本只输出一个带 `controls` 的原生 `<video>`：可访问、无依赖、也毫无风格可言。本插件把那个播放器换成 Shirone 自己的表面——M3E 控制栏、设计 token 配色、键盘可达的进度与音量滑杆——并且在**读者按下播放之前不下载任何引擎代码**。

引擎是一道接缝（`MediaEngine`），背后有两个实现：

| 引擎 | 适用容器 | 拿手的事 |
| :--- | :--- | :--- |
| `native` | 浏览器支持的一切（含 MP4） | 默认选择。零额外请求，`preload` 语义照旧 |
| `mellow` | 仅 Matroska（`.mkv` / `.webm`） | 严格有界的 `bytes=A-B` 调度、Cues 二分寻址、WebCodecs 硬解、线路审计 |

默认策略 `engine: "auto"`：只有源是 Matroska 时才交给 Mellow。MP4 交给 Mellow 只会换来一句容器排他性错误，所以强制指定 Mellow 而引擎又不可用时会**回退到原生**并在诊断面板里写明原因（`data-mp-engine-reason`）。

---

## 三层加载纪律

一次访问里，代码分三层抵达，每一层都有明确的触发点：

1. **内联引导脚本**（每个页面，约 600 字节）：只做一件事——页面里存在 `figure[data-artplayer]` 时，才去 `import()` 运行时模块。没有嵌入的页面到此为止。
2. **运行时 + 表面 + 适配器**（首次出现嵌入时）：接管 SSR 生成的 `<figure>`，把原生元素标记 `hidden`，挂载 Svelte 表面。此时仍未碰引擎。
3. **引擎模块**（读者首次按下播放时）：`WebAssembly` 内核与解复用器共约 68 KB gzip，来自配置的 `engineUrl`。没按播放就永远不会请求。

`preload="auto"` 的嵌入会在接近视口时（`IntersectionObserver`, `rootMargin: 240px`）提前完成第 2 层与引擎的 `load()`，与主题既有的视频 facade 行为一致。

---

## 安装与接线

```bash
# 主题仓
pnpm add -D link:../My-Shirone-Plugins/plugins/mellow-player
```

```javascript
// astro.config.mjs
import mellowPlayer from "@shirone-plugins/mellow-player";
import { playerLabels } from "./src/i18n/player-labels.ts";

export default defineConfig({
	integrations: [
		mellowPlayer({
			engineUrl: "/vendor/mellow-player.js", // null = 只用原生引擎
			diagnostics: true,
			labels: playerLabels,
		}),
	],
});
```

`labels` **必填**，因为插件自身不持有任何用户可见文案。缺键时它不会渲染一片空的无障碍名称，而是打印缺了哪些键并**完全不注入脚本**——配置失误的代价是少了增强，而不是坏掉的页面。

---

## 引擎模块契约

`engineUrl` 必须指向一个 ES 模块，其命名空间导出 `HeadlessPlayer`：

```javascript
// /vendor/mellow-player.js
export { HeadlessPlayer } from "...";
```

从 Mellow-Player 源码构建这一产物（**不会**往对方仓库写任何文件）：

```bash
MELLOW_PLAYER_DIR=/path/to/Mellow-Player node scripts/plugins/vendor-engine.mjs
# → public/vendor/mellow-player.js（已 gitignore，产物由对方仓库演进决定）
```

CI 里没有对方 checkout，所以这一步是空操作；主题的 `astro.config.mjs` 只在产物确实存在时才对外声明 URL，`MELLOW_ENGINE_URL` 可以指向镜像或 CDN。上游改了 `HeadlessPlayer` 的接口，`tests/mellow-contract.test.mjs` 会直接失败——设 `MELLOW_ENGINE_BUNDLE` 指向产物即可运行该契约测试。

---

## 配置项

| 键 | 默认值 | 语义 |
| :--- | :--- | :--- |
| `enabled` | `true` | `false` 时零注入 |
| `engine` | `"auto"` | `auto` \| `native` \| `mellow` |
| `engineUrl` | `null` | 引擎模块地址；只接受站点根绝对路径或绝对 URL（相对写法会在每条路由上解析成不同模块，故拒绝） |
| `engineTimeoutMs` | `15000` | 引擎模块加载上限 |
| `diagnostics` | `false` | 显示引擎徽标与有界请求审计面板 |
| `labels` | — | 必填，见 `PlayerLabels` |
| `routeFilter` | `[]` | 只在这些前缀下增强；空数组表示全站 |

---

## 零额外负担

关闭（`enabled: false`，或漏了标签键）时：零内联脚本、零 DOM、零主包体积、零外部请求，`::artplayer` 完全退回原生 `<video>`。

开启时，主题侧只多一个约 600 字节的内联引导；引擎与表面都按需分块。SSR 输出始终是可用的原生播放器，所以无 JS、增强失败、或引擎模块挂了，页面都还是能看的。

---

## 上游现状（`selectableRate: false`）

`HeadlessPlayer` 目前没有对外暴露变速接口（`PlaybackPacer` 内部有），所以 Mellow 引擎声明 `selectableRate: false`，表面据此隐藏倍速按钮而不是展示一个按不动的控件；误调 `setRate()` 会抛出 `EngineCapabilityError`。上游补上之后，把能力表改成 `true` 即可。

---

## 自动化测试

```bash
pnpm test                                  # 58 项：配置、选择策略、格式化、两个适配器、运行时、集成
MELLOW_ENGINE_BUNDLE=/path/to/mellow-player.js pnpm test   # 额外验证真实引擎产物契约
```

---

## 许可证

MIT License
