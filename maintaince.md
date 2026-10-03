# My-Shirone-Plugins 维护手册与运维备忘 (maintaince.md)

> **仓库属性**：Shirone 博客主题生态模块化插件与扩展组件库  
> **宿主主题**：[ArchivalEra/Shirone-personalized](https://github.com/ArchivalEra/Shirone-personalized) (Upstream: [LyraVoid/Shirone](https://github.com/LyraVoid/Shirone))  
> **内容仓库**：[ArchivalEra/isui.ren-Blog](https://github.com/ArchivalEra/isui.ren-Blog)  
> **最后修订基线**：2026-09-26  

---

## 1. 仓库定位与插件生态总览

本仓库是 **Shirone 博客主题生态的官方插件矩阵**。专注于以非侵入式、模块化、高性能的方式为 Shirone 主题提供高级功能扩展、AST 编译期优化以及边缘 Serverless 基础设施联动。

### 插件矩阵索引与职责划分

| 插件名称 | 核心职责 | 技术栈与关键依赖 | 状态 |
| :--- | :--- | :--- | :--- |
| **`what-im-doing`** | 异构设备活动状态遥测聚合、边缘流式分发与 M3 状态胶囊/抽屉展示 | Cloudflare Workers, Cloudflare D1, Svelte 5, Python 3 采集端 | 稳定运行 |
| **`strip-first-h1`** | 编译期 AST 扫描与冗余标题剥离，杜绝“双标题综合症”与 TOC 目录污染 | Unified / Remark / Rehype AST 处理器 | 稳定运行 |
| **`pretext-masonry`** | 纯数学算术高度预估瀑布流布局，根除浏览器强制布局抖动 (Layout Thrashing) | `@chenglou/pretext`, Svelte 5, CSS Grid | 稳定运行 |
| **`mixed-feed`** | 首页混合时间线流，实现长篇博文与轻量生活动态说说的无缝融合编排 | Astro Content Collections, Svelte 5 | 稳定运行 |
| **`dynamic-svg`** | 内置原生 SVG 解析与树遍历器，与 pretext 联动实现 M3 动态主题配色注入 | 原生 AST 遍历器（零外部冗余依赖） | 稳定运行 |
| **`repo-pages`** | GitHub Pages 仓库集群国内加速反代与项目展台集成（`isui.ren/repo/*`） | Node.js, `gh cli`, Svelte 5, EdgeOne 反代中间件 | 初始上线 |
| **`mangomesa-hub`** | MangoMesa 博客、站点罗盘、开源项目与 Bahnhof 站台跨站互联集成 | TypeScript, Svelte 5, Astro Integration | 初始上线 |
| **`repo-inventory`** | 构建期仓库清单：策展白名单的 GitHub Pages 三态、镜像树加速判定与最近推送时间 | Node.js, TypeScript（产物零依赖） | 初始上线 |
| **`mellow-player`** | `::artplayer` 嵌入的 M3E 播放表面，背后是「原生 `<video>` / Mellow-Player 有界 Range 引擎」按容器选择的引擎接缝 | TypeScript, Svelte 5, Astro Integration, WebCodecs | 初始上线 |

---

## 2. 核心架构铁律与设计红线 (Core Architectural Laws)

所有收录于本仓库的插件，必须严格恪守以下四项设计红线：

### 2.1 Zero-Breaking Backward Compatibility (零破坏向下兼容)
- **开箱即用，默认全功能可选**：所有插件在接入宿主主题时，配置项必须默认标记为可选（如 `enabled?: boolean = false`）。
- **零配置修改负担**：任何新特性的引入绝不允许强迫现有站点修改历史博文的 Frontmatter 或重构配置结构。若插件未激活，宿主主题的原生构建流程与输出物必须与未安装插件时完全一致。

### 2.2 Zero-Cost Inactivity (禁用期零开销)
- 当插件处于未启用或 `enabled: false` 状态时，必须做到：
  1. **零外部网络请求**：绝对禁止向远端 API 发起任何预热或探测请求；
  2. **零 DOM 占位容器**：严禁在页面 HTML 中渲染任何空白的 `div`、占位符或引发 CLS（累积布局位移）的无用节点；
  3. **零打包体积负担**：通过动态 Import 或打包排除，严禁将未激活插件的运行时重型逻辑打包进宿主站点的客户端首屏 bundle。

### 2.3 M3E Compliance & Atomic Hierarchy (M3 表达范式与原子分层)
- **视觉组件必须尊崇 Material 3 Expressive 标准**：
  - 严禁在插件样式中随意硬编码颜色魔数（如 `#3b82f6`、`rgba(...)`）或自定义圆角（如 `border-radius: 8px`）。
  - 必须严格使用主题设计令牌：`--shape-corner-*`、`--m3e-type-*`、`--m3e-duration-*`、`--m3e-easing-*` 以及全局 surface/on-surface 语义色系。
- **组件分层明确**：基础视觉单元放入 `atoms`，组合交互结构放入 `molecules`，复杂业务容器放入 `organisms`。

### 2.4 The On-Intent Lazy Loading Contract (按需交互惰性加载契约)
- **禁止在 `onMount` 中发起贪婪式拉取**：
  - 以 `what-im-doing`、歌单解析或评论插件为例，绝不允许组件一挂载就立刻向边缘 Worker 或第三方接口请求数据。
  - 必须严格等到**用户产生显式意图**（如点击展开胶囊、打开抽屉面板、点击播放、聚焦输入框）时才发起网络请求。
- **离线与降级容错**：当远端网络超时或接口异常时，UI 必须优雅降级为静态提示或离线标识，绝不允许出现白屏或控制台未捕获的 Unhandled Exception。

---

## 3. 日常开发与干活流程 (How to Work)

### 3.1 插件目录结构规范
每个插件均在 `plugins/<plugin-name>/` 下独立自治维护：
```text
plugins/<plugin-name>/
├── README.md             # 插件设计白皮书、配置项定义与接入范例
├── package.json          # 插件元信息与独立依赖
├── src/                  # 前端组件与核心业务逻辑 (Svelte/TS)
├── types/                # 导出的强类型定义
└── worker/               # 若包含 Serverless 边缘服务，在此维护 wrangler.toml 与 Worker 源码
```

### 3.2 与主题仓本地联调与构建验证
1. **主题仓依赖映射**：主题仓 `Shirone-personalized` 的 `scripts/plugins/build.mjs` 负责自动扫描并打包各插件。
2. **本地调试流程**：
   - 在本仓库修改插件代码；
   - 在主题仓执行 `pnpm plugins:build` 或直接软链接至对应位置；
   - 运行 `pnpm dev` 验证 SSR 与客户端水合表现，确保浏览器控制台 0 错误、0 警告。

### 3.3 `what-im-doing` 专属运维备忘
`what-im-doing` 作为横跨边缘计算与前端 UI 的核心基础设施，需遵循专用语汇规范（参见 `CONTEXT.md`）：
- **术语契约**：使用 `Fleet`（非 cluster）、`Device`（非 node/host）、`Device Token`（非 api key）、`Activity Report`（非 heartbeat）、`Last Seen`、`Edge Hub`。
- **边缘部署与配置**：
  - 生产自定义域名绑定：`api.mango-mesa.ccwu.cc`
  - 数据库：Cloudflare D1 `what-im-doing-db`（包含 `devices` 注册表与状态记录）
  - 部署命令：在 `plugins/what-im-doing/worker` 目录下执行 `npx wrangler deploy`
- **安全红线**：
  - 采集端必须使用单设备专用的 `Device Token` 认证，严禁不同设备混用 Token。
  - 管理面板 (`GET /admin`) 必须通过 Cloudflare Zero Trust Access 策略进行强身份保护。
- **遥测缓存与超时规则**：
  - 支持 `Origin-Cache` 边缘遥测缓存，降低 D1 读开销；
  - 设备最后上报时间超过 15 分钟（`15m`）时，系统自动判定为 `offline` 离线状态，前端胶囊优雅更新显示。

---

## 4. Git 预推送 Hook 与规范

### 4.1 预推送 Hook 机制 (Pre-Push Enforcement)
本仓库已在 `.githooks/pre-push` 安装了强制预推送 Hook（并通过 `git config core.hooksPath .githooks` 激活，同时兼容 `.git/hooks/pre-push`）：
- **规则**：每次向远端执行 `git push` 时，Hook 会自动比对当前推送的提交范围，**强制校验 `maintaince.md` 是否在提交中被更新**。
- **智能旁路**：分支删除（`local_oid=0`）、无新增提交推送（`local_oid=remote_oid`）以及纯标签/批注推送（`refs/tags/*`, `refs/notes/*`）自动放行。
- **拦截表现**：若新增提交未更新 `maintaince.md`，推送将立即被中断并输出错误指引；若本地工作区有未提交的 `maintaince.md` 改动，给出特定暂存指引。
- **解法**：在 `maintaince.md` 的「维护与变更记录」末尾记录本次变更明细，执行 `git add maintaince.md && git commit --amend`（或单独提交），之后重试推送。

### 4.2 推送凭据与提交规范
- **凭据环境首选**：**优先使用 `gh cli`**（`gh auth status` 确认登录身份为 `ArchivalEra`）。
- **Conventional Commits 提交格式**：
  - 必须使用规范的英文简明提交格式，严禁中文 commit message 或长篇叙事。
  - 示例：
    - `feat(what-im-doing): bind api.mango-mesa.ccwu.cc custom domain`
    - `fix(capsule): format to '正在 AppName' and fix descender clipping`
    - `refactor(dynamic-svg): remove external dependencies and use built-in SVG parser`

---

## 5. 维护与变更记录流水账 (Maintenance Log)

| 日期 | 变更类型 | 影响插件 / 文件 | 变更要点详细说明 | 维护人 |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-03 | `feat` | `steam-recent` | **新增插件 `steam-recent`**：游戏页「最近在玩」构建期快照平面实现——CLI `steam-sync`（`--recent` 近两周游玩快照 / `--apps` 商店元数据 + 个人库 playtime，`--out` 输出，keepLastValid 对齐 anime 快照先例）+ 纯 SSR section 两件套（background-image 双层封面免 JS 回退，文案内联不经主题 i18n）+ `resolveSteamRecentOptions` 选项解析（maxItems 钳 1–8）+ 3 个 node --test（打 dist）。数据流：内容仓 CI 定时拉快照（key 走内容仓 Secrets）→ 快照提交派发主题部署 → astro 构建期 SSR 直出，访客零运行时请求、heart/边缘层零 involvement | ArchivalEra |
| 2026-09-29 | `security` / `feat` | `what-im-doing` | **规范 EdgeOne 端点只放行 GET 与实机 Tunnel 零触注册实战**：① 梳理端点职责与分权架构，明确 EdgeOne 仅对 `/api/activity` 放行只读 `GET`（读写彻底物理分离，EdgeOne 直接拒收任何 POST/PUT，无需在 Worker 编写冗余的 CDN 请求头嗅探）；② Worker 侧 `/activity` 保持纯 GET 只读提供数据，`/activity/report` 严格校验 Cloudflare Tunnel Token 原生凭证；③ 本地笔记本（`shit-microsoft`）实机接入验证通过，复用 `/etc/cloudflared/token` 完成零触原地纳管并由 Systemd 守护运行；④ 编写并发布完整实战架构指南 `docs/CLOUDFLARE_TUNNEL_PRIVATE_FLEET_GUIDE.md`；⑤ 单元测试（35/35）全绿并通过生产部署。 | ArchivalEra |
| 2026-09-29 | `feat` | `what-im-doing` | **原生集成 Cloudflare Tunnel Token 鉴权与零触自动注册**：① 彻底摒弃独立的 ADMIN_KEY 与多余的鉴权玩具，直接复用主机既有的 Cloudflare Tunnel Token（`/etc/cloudflared/token`）；② Worker 原生解析并校验 Tunnel Token 账户归属（`a === env.ACCOUNT_ID`），新设备自动原地纳管录入 D1，老设备自动授权更新；③ 采集端探针 `what-im-doing.sh` 与安装器 `install.sh` 原生自适应检测 `/etc/cloudflared/token`，零入参开箱即用，并支持出站高速代理环境；④ 生产 Worker（`what-im-doing-hub`）完成部署并接管自定义域名 `api.mango-mesa.ccwu.cc`，单元测试（34/34）全绿。 | ArchivalEra |
| 2026-09-29 | `feat` | `what-im-doing` | **支持 /activity 路由别名与客户端机器注册工具链**：① Worker 网关全面兼容 `/activity` 与 `/api/activity` 接口别名（覆盖快照读取、上报 `/report` 与 `/origin-cache`），适配反代路由重写；② 新增纯 POSIX/Bash 客户端机器注册脚本 `collector/register-device.sh`，支持 DMI/电池硬件型号与设备类型自动推断并保存配置；③ 升级 `collector/install.sh` 支持 `--hub` 与 `--admin-key` 一行命令自动注册并安装启动 systemd 用户服务；④ 新增直接基于 Cloudflare Wrangler 的零密钥直登脚本 `collector/register-device-wrangler.sh`，直接向远程 D1 写入纳管记录并导出配置，成功录入 `debiansid主机`（`sk_dev_3adb8a3492c91bf61c610459`），彻底免除 `ADMIN_KEY` 与 Tunnel 鉴权繁琐配置；⑤ 补充 Node.js 跨平台注册脚本 `register-device.mjs`、文档规范与单元测试（33/33 全绿） | ArchivalEra |
| 2026-09-28 | `feat` | `mellow-player` | **跟进上游 ADR-0002 更新（容器支持不再排他）**：上游 13 个新提交给了解复用路由引擎 `UniversalDemuxer`——新增 ISO BMFF（`.mp4`/`.m4v`/`.mov`）与 MPEG-TS（`.ts`）支持，只有 `.flv` 仍被拒。于是引擎选择策略随之改写：`matroskaExtension` → `engineContainer`（返回容器族），`auto` 现在把这三族都交给引擎，原因词汇由 `non-matroska-source` 换成按族标注的 `matroska-source`/`mp4-source`/`mpegts-source` 与 `native-container`；容器表**照抄上游枚举**而不自行放宽——猜宽了会把源交给一个解复用了它的引擎，那是报错而不是回退。契约测试对着新产物重跑 70/70（原 68）。**实测新 MP4 通路**：本地现造 H.264+AAC 的 mp4，浏览器里引擎判定 `mellow`/`mp4-source`、按下播放前 0 次引擎请求、canvas 640×360 出帧、就绪 19 ms、线上三次区间全有界（`bytes=0-0`/`0-65535`/`2575-45392`）、开放式 0 次。**顺带查出一个 dev 专属缺陷**（生产无影响，已写入 README 限制节）：Vite 给任何动态 `import()` 包一层 `__vite__injectQuery(...,'import')`，而它又拒绝「源码 import 的 /public 文件」，所以 dev 里引擎模块必然 500；绝对 URL 或干脆不配引擎即可绕开。另：引擎产物因双架构 WASM + 三套解复用器从约 68 KB 涨到约 114 KB gzip（仍是按需加载，代价只落在按下播放之后） | ArchivalEra |
| 2026-09-27 | `feat` | `mellow-player` | **引擎选择加入可达性判据**：新增 `src/engine/probe.ts`——单字节有界 Range 探测（`bytes=0-0`），只认 `206`（`200` 意味着源站忽略了 Range 并开始整片交付，恰是引擎自己会熔断拒收的形状），失败与超时都只算「不可读」而不抛错；`createOriginProbe` 按 origin 缓存，一页里多个同源嵌入只问一次；`chooseEngine` 新增 `mellowReadable` 入参与 `mellow-unreadable` 原因，强制 Mellow 也会被可达性否决。运行时只在「答案会改变结果」时探测（非 Matroska 的源、未配引擎的站点一律不问），且探测在任何 DOM 替换**之前**完成，被问的这段时间里服务端渲染的原生播放器仍然可用。动因是一次真实试运行：云盘反代源站能播但跨源 `fetch` 读不到，纯容器判据会把读者送到一个坏掉的播放器上。测试 68/68 | ArchivalEra |
| 2026-09-26 | `feat` | `mellow-player` | **新插件 @shirone-plugins/mellow-player 初始实现**：给主题 `::artplayer` 嵌入换上 M3E 播放表面——只用设计 token，22 条用户可见文案全部由宿主经 `labels` 注入，插件自身零硬编码文案（缺键即拒绝安装并列出缺哪些，代价是少了增强而非坏掉的页面）。引擎做成一道接缝（`MediaEngine` + 能力表），两个适配器：`NativeMediaEngine`（媒体元素，默认）与 `MellowMediaEngine`（懒加载远端 ESM 契约，`engineUrl` 是唯一耦合面，模块只在读者按下播放时解析）；`chooseEngine` 按容器选（Matroska → Mellow，其余 → 原生），强制 Mellow 而引擎不可用则回退并把原因写进 `data-mp-engine-reason`；能力表让表面隐藏不支持的控件（`HeadlessPlayer` 暂无变速接口，故 Mellow 声明 `selectableRate: false` 且误调用 `setRate()` 抛 `EngineCapabilityError`）。运行时渐进增强 SSR 的 `figure[data-artplayer]`：`preload=auto` 走视口接近预载，`swup:content:replace` 重扫，按 `isConnected` 回收表面（Swup 换页后不残留解码器/音频上下文）。测试 58/58（含 `mellow-contract.test.mjs` 对着真实引擎产物核对接口契约）；实测点击前引擎请求 0、点击后 1，axe 0 违规 | ArchivalEra |
| 2026-09-26 | `feat` | `repo-inventory` | **收录改为全自动**：由「读项目页白名单」改为「列账号下全部公开仓，减去排除表」（`selectDiscovered`：fork 计入、排除按名字逐条、私有一律排除）；清单新增 `description` / `language` / `url`，让没有手写简介的仓库也能直接成卡；CLI 参数由 `--whitelist` 换成 `--exclude-file`；测试 18/18 | ArchivalEra |
| 2026-09-26 | `refactor` | `repo-pages` | **前缀重写合并为唯一实现**：新增 `src/rewrite-for-prefix.ts`（→ 零依赖单文件 `dist/rewrite-for-prefix.js`），删除零 call site 的旧 `rewriteRepoHtml`；heart 的中间件改为动态 import 主题部署 vendor 过去的该产物。修掉三个缺陷——仓名未转义、已有 `<base>` 时叠加第二个、`<head>` 匹配过窄；测试 9/9 | ArchivalEra |
| 2026-09-26 | `docs` | `repo-inventory` | **记录产物落点规则**：清单必须落在自己的子目录（`src/data/repo-inventory/snapshot.json`），因为 `content:sync` 的裁剪只豁免内容仓不拥有的顶层段、而顶层文件的顶段是空串，会被误裁 | ArchivalEra |
| 2026-09-26 | `fix` | `repo-inventory` | **清单改为直接产出 Biome 形状的 JSON**：不再依赖 `JSON.stringify`（它永远展开数组），改为自带排版器——tab 缩进、对象始终展开、纯标量数组按 80 列折叠，与消费方 Biome 的规则一致；因此主题侧无需为该生成物开豁免（豁免违反 CONTRIBUTING 的强制格式化条款） | ArchivalEra |
| 2026-09-26 | `fix` | `repo-inventory` | **清单序列化改为 tab 缩进**：产物直接生成进主题 `src/data/`，与该生态的 Biome（`indentStyle: tab`）一致，避免每次构建被 reformat；短数组仍由 formatter 折叠，故主题 `biome.json` 将该生成物并入生成文件豁免表（与 `src/user/user-config.ts` 同类） | ArchivalEra |
| 2026-09-26 | `feat` | `repo-inventory` | **新插件 @shirone-plugins/repo-inventory 初始实现**：构建期读取策展白名单（`data/projects.ts` 的 `repository` 字段）的 Pages 三态（ready/absent/pending）、由镜像树目录名判定的 accelerated 与最近推送；产出烘焙 JSON 供项目页 join，并提供 CLI 直出同一份 JSON；模块零依赖零网络（事实经注入 probe 进入），`list()` 即测试面；CLI 顺带报告镜像树中无白名单条目的孤儿目录 | ArchivalEra |
| 2026-09-17 | `feat` | `mangomesa-hub` | **新插件 @shirone-plugins/mangomesa-hub 初始实现**：提供跨站互联元数据体系（MANGOMESA_STATION_LINKS），打通 MangoMesa 博客主站、/compass/ 罗盘、/projects/ 项目展台与 /Bahnhof/ 中央调度站台；提供 M3E 穿梭胶囊组件 | ArchivalEra |
| 2026-09-17 | `feat` | `repo-pages` | **新插件 @shirone-plugins/repo-pages 初始实现**：提供基于 `gh cli` 的自动化仓库 Pages 状态扫描与开通工具 (`shirone-repo-pages`)；实现 EdgeOne 边缘 HTML 流式重写与国内强缓存反代；配套 M3E 内嵌查看器与 Shirone 项目展台联动 | ArchivalEra |
| 2026-09-16 | `docs` / `feat` | 全局 / `maintaince.md`, `.githooks/` | **初始化运维基线与预推送 Hook**：创建插件维护手册，确立零破坏向下兼容、禁用期零开销、M3E 表达范式与按需惰性加载四大铁律；配置 pre-push hook（支持 core.hooksPath、空推放行与标签旁路），确保推送必记变更日志 | ArchivalEra |
| 2026-09-15 | `feat` | `what-im-doing` | **自定义域名绑定与看门狗解析优化**：绑定生产域名 `api.mango-mesa.ccwu.cc`，增强看门狗上报 payload 健壮性，优化设备异常上报容错 | ArchivalEra |
| 2026-09-15 | `feat` | `what-im-doing` | **Origin-Cache 遥测与 15 分钟离线策略**：增加 Origin-Cache 边缘加速，实现 15 分钟心跳超时判定，避免持续轮询对 D1 造成的并发压力 | ArchivalEra |
| 2026-09-14 | `refactor` | `dynamic-svg` | **剔除外部冗余依赖**：重构并采用完全自主实现的轻量级 SVG 解析器与树遍历器，大幅精简插件打包体积，杜绝第三方 AST 库带来的兼容隐患 | ArchivalEra |
| 2026-09-14 | `feat` | `dynamic-svg` | **动态 SVG 插件初始实现**：引入与 pretext 联动的 SVG M3 动态主题染色能力 | ArchivalEra |
| 2026-09-13 | `fix` | `what-im-doing` | **状态胶囊排版微调**：移除应用名容器内部 overflow-hidden，扩展底部内边距，解决英文下伸字母 (descenders) 裁剪问题 | ArchivalEra |
| 2026-09-13 | `fix` | `what-im-doing` | **胶囊文案规范化**：格式化文案为「正在 AppName」，首字母大写，优化深浅主题对比度 | ArchivalEra |
| 2026-09-12 | `refactor` | `what-im-doing` | **采集端瘦身与去重**：精简 collector 上报逻辑，聚焦 process@device 模式，收敛组件多重渲染冗余 | ArchivalEra |
| 2026-09-11 | `feat` | `what-im-doing` | **动态防刷刷新药丸**：在状态抽屉中增加带有冷却反作弊机制的动态扩展刷新药丸按钮 | ArchivalEra |
| 2026-09-28 | `feat` | `mellow-player` | **取票能力（signed reads, ADR-0027 客户端半边）**：源站内容签名翻闸后，未签名读取被源站拒绝，裸 CDN 地址只在边缘热缓存时能播。新增 `ticket: { endpoint, hosts }` 配置与 `engine/ticket.ts`：命中 host 的嵌入在挂载前向端点 POST 现签一张票（先于可达性探测——签名源上对裸地址探测会把冷对象误读为「不可读」，签名 URL 随后顶替裸地址喂探测与引擎）；`TicketedEngine` 包装器把表面的 `load(原始地址)` 映射到当前票，票到期前 5 分钟定时重签、播放中报错重签续播一次（回到最后位置）、端点失联每分钟退避重试；同一 `session` 由端点 Cookie 钉住，客户端只发凭据不自造身份。签名 URL 不出运行时（表面/诊断仍显示原始地址），票指向异 host 即拒收，取票失败静默退回裸地址与无取票能力完全一致。端点本身由运营方运维（密钥只在其侧，包装其 `deploy/oracle/presign.py`），契约写进 README「取票」节，主题侧待端点上线后一行接线。测试 70→92：取票路由匹配、现签成功/异 host 拒收/失败形态、过期重签、错误恢复、定时器换票与退避、穿透与销毁 | ArchivalEra |
