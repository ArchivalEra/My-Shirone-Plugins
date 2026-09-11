# Map: @shirone-plugins/what-im-doing v2.0 (Serverless Fleet Edition)

## Destination

将 `@shirone-plugins/what-im-doing` 完整交付为 `My-Shirone-Plugins` 中独立、高内聚、零上游侵入的现代化舰队级状态收集插件：涵盖 Cloudflare Worker+D1 极简边缘后端、一键 Shell 安装探针、遵守视口懒加载契约的前端多设备分类抽屉 UI，完全无需也不合并进 Shirone 核心包。

## Notes

- **定位与归属**：独立第三方工作区插件（`My-Shirone-Plugins`），严格遵守 `contribute.md` 的代码质量、Biome 缩进与零破坏规范，但**明确不向上游主题核心发起 PR**（契合上游极简低触发哲学）。
- **视口懒加载契约（On-Intent / Viewport Contract）**：前端请求严禁在 `onMount` 中饥渴触发，必须通过 `IntersectionObserver` 仅在头像区域进入视口时才发起单次拉取。
- **参考规范**：
  - 架构白皮书：[SERVERLESS_FLEET_DEPLOYMENT_SPEC.md](file:///mnt/hdd/zcode-on-the-move/My-Shirone-Plugins/plugins/what-im-doing/docs/SERVERLESS_FLEET_DEPLOYMENT_SPEC.md)
  - 质量守则：`contribute/SKILL.md` (Upstream Contribution Protocol)

## Decisions so far

- [001-backward-compat-and-biome.md](tickets/001-backward-compat-and-biome.md): FleetStore 补全 `deviceId`/`deviceName`/`timestamp` 双写别名，统一所有 JS 文件为 Biome Tabs 缩进。
- [002-frontend-multi-device-drawer.md](tickets/002-frontend-multi-device-drawer.md): `WhatImDoingCapsule.svelte` 严格落地视口懒加载与展开按需拉取契约，支持在/离线时间戳与台式/笔记本/服务器分类矩阵。
- [003-one-line-installer-script.md](tickets/003-one-line-installer-script.md): 交付极简通用 `collector/install.sh` 脚本，支持 CLI 参数快速注册、生成凭证与配置 systemd 用户守护进程。
- [004-d1-production-deployment.md](tickets/004-d1-production-deployment.md): 确立生产 D1 模式绑定、脱敏部署清单以及 Cloudflare Access + `ADMIN_KEY` 双模免密与密钥隔离防护。

## Open Tickets (Frontier)

*当前前沿（Frontier）票据全部闭环，v2.0 里程碑就绪。*

## Not yet specified

- **跨平台探针扩展**：Windows (PowerShell / HASS.Agent 协议桥接) 与 macOS (Launchd) 探针规范。
- **EdgeOne CDN 代理优化**：如果博客部署在腾讯云 EdgeOne，是否配置边缘回源代理彻底消除国内对 Cloudflare Worker 的网络波动。
- **历史时间轴数据剪裁**：D1 中多设备历史记录自动归档与淘汰策略（如保留最近 7 天）。

## Out of scope

- **向 Shirone 上游主题核心发起 PR**：上游核心严格追求极简与低触发（如播放器仅在点击时加载），外置活动探针属于个人/定制化需求，硬塞入核心主题会破坏其轻量宗旨，故永久保持为独立社区插件。
- **部署 Home Assistant 巨石体系**：鉴于门锁等硬件无法原生接入且内存开销巨大（>500MB），彻底排除 HA 方案，坚持 <15MB 的 Serverless 云原生路线。
