# [Task] 为 FleetStore 补全向下兼容别名并统一 Biome Tabs 缩进

- **Parent Map**: [../map.md](../map.md)
- **Type**: `wayfinder:task` (AFK)
- **Status**: Closed
- **Resolution**: `fleet-store.js` 已完成 `deviceId`、`deviceName`、`timestamp` 双写输出，通过 Biome Tabs 缩进与 Lint 校验，并通过 `acceptance-v2.test.mjs` 兼容性用例断言。

## Question

如何确保新编写的 Cloudflare Worker + D1 后端输出既满足 v2.0 的新规范（`id` / `name` / `lastSeen`），又能 100% 零破坏兼容现有博客前端组件（`deviceId` / `deviceName` / `timestamp`），并消除 Biome 的制表符格式化告警？

## Acceptance Criteria

1. `fleet-store.js` 在 `processedDevices` 映射中双写输出：
   - `id` 与 `deviceId`
   - `name` 与 `deviceName`
   - `lastSeen` 与 `timestamp`
2. `worker/` 目录下的所有 JS 文件通过 Biome 格式化检查（`biome check` 0 错误）；
3. 现有的单元测试套件（`acceptance-v2.test.mjs` 和 `worker-d1.test.mjs`）保持 100% 通过。
