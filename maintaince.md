# My-Shirone-Plugins 维护手册与运维备忘 (maintaince.md)

> **仓库属性**：Shirone 博客主题生态模块化插件与扩展组件库  
> **宿主主题**：[ArchivalEra/Shirone-personalized](https://github.com/ArchivalEra/Shirone-personalized) (Upstream: [LyraVoid/Shirone](https://github.com/LyraVoid/Shirone))  
> **内容仓库**：[ArchivalEra/isui.ren-Blog](https://github.com/ArchivalEra/isui.ren-Blog)  
> **最后修订基线**：2026-09-16  

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
