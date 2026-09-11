# what-im-doing: 基于 Cloudflare 体系的多设备状态与活动收集系统需求与架构规格书

> **文档版本**：v2.0.0 (Serverless Fleet Edition)  
> **生成时间**：2026-09-11  
> **面向对象**：后续接手研发与实现的 AI Agent / 开发人员  
> **文档定位**：全链路工程落地规格书（包含系统架构、接口契约、Worker 源码规范、采集器规范与前端交互要求）

---

## 1. 项目背景与设计哲学

### 1.1 背景与演进
`what-im-doing` 原先仅作为单台个人工作站的活动展示小挂件。随着作者管理的基础设施拓展，需要支持**几十台异构设备**（包括多台 Arch/Debian 桌面台式机、ThinkPad 笔记本、融合网关/软路由、云主机等）的集中在线状态、活动窗口与设备分类矩阵展示。

### 1.2 核心设计哲学
1. **彻底摒弃重型架构**：
   - 坚决**不自建/维护复杂的 VPS 后台**，坚决**不引入 Home Assistant** 等巨石框架（避免 1GB+ 内存膨胀与运维负担）；
2. **充分利用 Cloudflare 边缘生态**：
   - 所有需要上报的设备均已安装（或可安装）`cloudflared`，无公网 IP 和复杂端口映射要求；
   - 集中端收敛为**单个 Cloudflare Worker**，完全运行在 Cloudflare 免费配额内（每天 100,000 次免费请求，实际用量 <10,000 次/天，0 成本）；
3. **极轻量、高能效、强隔离**：
   - 设备上报数据体积极小（单次 <150 字节），支持 Protobuf 二进制或极简 JSON；
   - 引入 **Yohaku 风格的设备 Token 鉴权**，每台设备拥有独立 ID 与 Secret，禁止越权串改；
4. **离线感知与时间戳优雅保留**：
   - 设备断电、休眠或合盖超过 120 秒未上报，系统自动判定为 `OFFLINE`；
   - **严禁丢弃最后时间戳**：任何设备离线时，系统必须长久保留其 `last_seen` 毫秒时间戳，博客前端统一展示为：`⚪ 离线 · 最后活跃时间: 2026-09-11 03:45 (X小时前)`。

---

## 2. 系统整体拓扑图

```mermaid
flowchart TD
    subgraph Clients["全设备矩阵 (数十台异构终端，全装 cloudflared)"]
        D1["🖥️ Debian Desktop<br/>id: debian-desktop<br/>type: desktop"]
        D2["💻 ThinkPad Laptop<br/>id: thinkpad-x1<br/>type: laptop"]
        D3["🖧 融合网关 / 路由器<br/>id: gateway-s905<br/>type: server"]
    end

    subgraph CF["Cloudflare 边缘 (统一域名: activity.isui.ren)"]
        Tunnel["Cloudflare Tunnel 入口"]
        Worker["⚡ Cloudflare Worker (约 80~120 行)<br/>- 路由分发 (/report 与 /activity)<br/>- 设备 Token 白名单鉴权<br/>- 边缘 Cache / 内存态管理<br/>- 120s 自动离线超时判定"]
    end

    subgraph Frontend["博客前端 (Shirone Theme)"]
        Blog["🌐 访客打开 /MangoMesa<br/>WhatImDoingCapsule.svelte"]
    end

    D1 -->|HTTPS POST 80字节 PB/JSON| Tunnel
    D2 -->|HTTPS POST 80字节 PB/JSON| Tunnel
    D3 -->|HTTPS POST 80字节 PB/JSON| Tunnel
    Tunnel --> Worker

    Blog -->|GET /api/activity (公共访问)| Worker
    Worker -->|聚合设备矩阵与最后活跃时间| Blog
```

---

## 3. 数据模型与契约规范

### 3.1 设备类型枚举 (`DeviceType`)
```typescript
export type DeviceType = "desktop" | "laptop" | "server" | "mobile" | "other";
```

### 3.2 活动状态枚举 (`ActivityStatus`)
```typescript
export enum ActivityStatus {
  UNKNOWN = 0,
  ACTIVE = 1,   // 正在活跃（有前台交互）
  IDLE = 2,     // 锁屏或无输入
  AWAY = 3,     // 长时间挂机
  OFFLINE = 4,  // 关机 / 休眠 / 超时未上报
}
```

### 3.3 设备上报载荷 (`DeviceReportPayload`)
设备端每次向 Worker 上报的载荷规范：
```json
{
  "id": "debian-desktop",
  "name": "Debian 13 开发工作站",
  "type": "desktop",
  "status": 1,
  "appName": "Antigravity",
  "windowTitle": "Shirone 主题配置梳理任务",
  "idleSeconds": 0,
  "osInfo": "Debian GNU/Linux (KDE 6.7 / Wayland)",
  "timestamp": 1789068086532
}
```

### 3.4 博客消费聚合结构 (`AggregatedActivityResponse`)
Worker 对外暴露的 `GET /api/activity` 接口输出：
```json
{
  "current": {
    "id": "debian-desktop",
    "name": "Debian 13 开发工作站",
    "type": "desktop",
    "status": 1,
    "appName": "Antigravity",
    "windowTitle": "Shirone 主题配置梳理任务",
    "timestamp": 1789068086532
  },
  "devices": [
    {
      "id": "debian-desktop",
      "name": "Debian 13 开发工作站",
      "type": "desktop",
      "status": 1,
      "appName": "Antigravity",
      "windowTitle": "Shirone 主题配置梳理任务",
      "lastSeen": 1789068086532,
      "offline": false
    },
    {
      "id": "thinkpad-x1",
      "name": "ThinkPad 便携本",
      "type": "laptop",
      "status": 4,
      "appName": "Zen Browser",
      "windowTitle": "GitHub - Pull Requests",
      "lastSeen": 1789060886532,
      "offline": true
    }
  ],
  "groups": {
    "desktop": 1,
    "laptop": 0,
    "server": 1
  },
  "serverTime": 1789068090000
}
```
*注：`current` 优先选择当前处于 `ACTIVE` 状态且权重最高（`desktop > laptop > server`）的设备；若全部设备均离线，则 `current` 展示最后一次离线的那台设备，带上 `offline: true`。*

---

## 4. Cloudflare Worker 实现规范

### 4.1 核心路由与逻辑要求
* **Worker 入口**：支持绑定自定义域名（如 `activity.isui.ren`）。
* **接口列表**：
  1. `POST /api/activity/report`：设备上报接口。
     - 校验 HTTP Header：`Authorization: Bearer <device_token>`；
     - 校验 `device_id` 是否在注册表白名单中，Token 是否匹配；
     - 更新对应设备状态，记录 `lastSeen = Date.now()`；
     - 返回 `200 OK: {"ok": true}`。
  2. `GET /api/activity`：博客公开读取接口。
     - 支持参数：`?brief=1`（仅返回 `current` 摘要以节省流量）；
     - 支持 CORS（`Access-Control-Allow-Origin: *`）；
     - 遍历所有设备：若 `Date.now() - device.lastSeen > 120000`（120秒），则强行设定 `status = ActivityStatus.OFFLINE`，`offline = true`；
     - 计算并返回 `current` 及分组统计。
  3. `GET /health`：存活探针。

### 4.2 数据暂存与持久化要求
* 使用 Cloudflare 边缘内存态（In-Memory Map）搭配 `caches.default`（或绑定免费的 Cloudflare Workers KV `ACTIVITY_KV`）；
* 保证在设备休眠、断电或 Worker 边缘冷启动时，最后上报的设备时间戳不丢失。

---

## 5. 客户端采集脚本规范（Client Probes）

### 5.1 Linux (Debian/Arch/Wayland/KDE 6)
* **路径**：`collector/what-im-doing.sh`
* **执行时间要求**：必须在 **0.1秒以内** 完成；
* **KDE 6 原生检测**：采用之前验证成功的 KWin Scripting D-Bus 接口：
  ```bash
  tmp_script="/tmp/wid_kwin_$$.js"
  echo 'print("WID_WIN:" + (workspace.activeWindow ? (workspace.activeWindow.resourceClass + ":::" + workspace.activeWindow.caption) : "none:::Desktop"));' > "$tmp_script"
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$tmp_script" "$plugin_name"
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$plugin_name"
  ```
* **设备自描述配置 (`/etc/what-im-doing/config.json` 或 `~/.config/what-im-doing.json`)**：
  ```json
  {
    "endpoint": "https://activity.isui.ren/api/activity/report",
    "deviceId": "debian-desktop",
    "deviceName": "Debian 13 开发工作站",
    "deviceType": "desktop",
    "token": "sk_dev_ae7f9c21a4"
  }
  ```
* **上报指令**：纯 Shell 或极简 Python/Node，依靠 `curl` 单条发起 `POST`。
* **无侵入运行**：配置为 `systemd --user` 的 `.service` + `.timer`（每 15~30 秒触发一次），或者窗口焦点切换事件触发。

---

## 6. 博客前端组件规范 (`WhatImDoingCapsule.svelte`)

### 6.1 视觉与交互规范（继承已确立的设计系统）
1. **纯色 M3 容器色填充（坚决零毛玻璃）**：
   - 彻底禁用 `backdrop-filter: blur(...)`，消除移动端和低配显卡的滚动卡顿；
   - 采用 Material 3 容器色（高对比度，清晰易读）：
     `background: var(--primary-container); color: var(--on-primary-container);`
2. **双行自适应标签架构**：
   - **未展开胶囊形态**：
     - **第一行**：状态灯 + 状态文案 + 相对时间 + 展开箭头：
       - 主机在线：`🟢 [正在活跃] · 刚刚`
       - 主机离线：`⚪ [离线] · 最后活跃时间: 2026-09-11 03:45 (2小时前)`
     - **第二行**：粗体应用名 + 窗口名（在线时展示当前，离线时展示“最后在使用: Antigravity”）。
3. **向上展开覆盖 Banner 机制**：
   - 使用 Svelte `use:portal` 挂载至 `document.body`；
   - 展开弹层必须向上舒展覆盖在顶栏 Banner 区域，**严禁向下遮挡博主头像与自我介绍**；
   - 弹层激活时开启模态滚动锁定（`overflow: hidden` 并补偿滚动条宽度）。
4. **多设备分类抽屉展示（新增多设备矩阵视图）**：
   - 弹层内部按照设备类型进行分组展示：
     - 🖥️ **台式工作站（Desktop）**：Debian 13 开发工作站（🟢 在线）
     - 💻 **便携笔记本（Laptop）**：ThinkPad X1（⚪ 离线 · 2小时前）
     - 🖧 **服务器/网络设备（Server）**：融合网关 S905L3（🟢 在线）

---

## 7. 验收测试标准（Checklist）

实现该系统的 Agent 或开发者必须按以下标准逐项验收：

- [ ] **鉴权严格性**：使用错误 Token 或未知 `device_id` 请求 `/api/activity/report` 必须返回 HTTP 401/403，拒绝入库。
- [ ] **多设备隔离性**：设备 A 的上报绝不能覆盖或清除设备 B 的状态与历史。
- [ ] **120s 自动离线测试**：停止某一设备的客户端上报，120 秒后请求 `/api/activity`，该设备状态必须自动转为 `offline: true`，且 `lastSeen` 必须为停止前最后一次上报的时间戳。
- [ ] **全网新访客冷启动感知**：在完全关机状态下，清空浏览器缓存重新打开博客页面，依然能正确看到“最后活跃时间: xxxxxx”，无白屏无 502。
- [ ] **性能与禁令约束**：
  - 客户端检测与单次上报耗时 < 0.1s；
  - Worker 端无长驻轮询，纯按需事件驱动；
  - **严格禁止运行任何 Playwright 测试**。
