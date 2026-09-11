# [Prototype] 重构 WhatImDoingCapsule.svelte 实现多设备抽屉、视口懒加载与离线时间戳展示

- **Parent Map**: [../map.md](../map.md)
- **Type**: `wayfinder:prototype` (HITL)
- **Status**: Closed
- **Resolution**: `WhatImDoingCapsule.svelte` 与 `RelativeTime.ts` 已重构完毕。前端视口懒加载（IntersectionObserver）单次拉取契约成立；未展开胶囊形态完美适配在线态与全离线态时间戳展示；向上展开抽屉采用 `use:portal` 覆盖 Banner 并锁定滚动，无毛玻璃纯 M3 容器色，矩阵按台式工作站、便携笔记本、服务器集群分类展示各设备状态；通过全套 27 项自动化测试与 Biome 检查。

## Question

如何重构前端组件 `WhatImDoingCapsule.svelte`，在严格遵循“视口懒加载（IntersectionObserver）”原则保护边缘流量的前提下，实现未展开态的“单设备智能仲裁 + 离线时间戳显示”以及展开态的“多设备分类卡片矩阵（Desktop / Laptop / Server）”？

## Acceptance Criteria

1. **严格懒加载**：组件挂载时若未进入可视区域，绝不调用 `fetch`；只有进入视口或被用户交互时才发起单次拉取；
2. **未展开胶囊形态**：
   - 在线态：`🟢 [正在活跃] · 刚刚` + `应用名 窗口名`
   - 全离线态：`⚪ [离线] · 最后活跃时间: 2026-09-11 03:45 (X小时前)` + `最后在使用: xxx`
3. **展开抽屉多设备矩阵**：
   - 向上覆盖 Banner，使用 `use:portal`，锁定页面滚动，无毛玻璃；
   - 内部按 `🖥️ 台式工作站 (Desktop)`、`💻 便携笔记本 (Laptop)`、`🖧 服务器集群 (Server)` 分组展示设备状态；
4. 单元测试与 Svelte 语法检查无报错。
