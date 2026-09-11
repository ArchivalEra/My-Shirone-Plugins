# What-Im-Doing: Cloudflare Serverless Fleet 部署与集成工程规格书

> **规格版本**：v2.0.0 (Production Serverless Edition)  
> **生效时间**：2026-09-11  
> **目标读者**：网站运维管理员（Site Administrator）、前端集成开发者、设备探针部署人员  
> **文档定位**：全链路工程交付白皮书，涵盖代码定位、SQL 模式、API 契约、Cloudflare 边缘部署与安全拓扑。

---

## 1. 系统架构与拓扑图

```
┌──────────────────────────────────────────────────────────────────┐
│ 🖥️ 客户端设备矩阵 (Linux KDE 6 / Wayland / ThinkPad / 网关 等)   │
│ • collector/what-im-doing.sh (极简 Shell 探针, ~0.1s 耗时)       │
│ • 状态差分过滤 (无变更跳过请求) + 60s 心跳兜底                   │
│ • 出站流量: 通过 local cloudflared tunnel 或直连 HTTPS 发起 POST │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ HTTPS POST /api/activity/report
                                  │ (携带 Bearer sk_dev_... 凭证)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ ⚡ Cloudflare Worker: What-Im-Doing Hub                          │
│ • 代码: plugins/what-im-doing/worker/worker.js                   │
│ • 核心模块: fleet-store.js (深层领域逻辑与 D1 交互)              │
│ • 管理视图: GET /admin (单卡片设备纳管界面)                      │
│ • 安全网关: Cloudflare Zero Trust Access 拦截保护 /admin 路由    │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ 毫秒级 SQL 交互
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ 🗄️ Cloudflare D1 数据库 (what-im-doing-fleet)                    │
│ • 每日免费配额: 100,000 次写入 / 5,000,000 次读取                │
│ • 单表 devices: 原子 Upsert，永久保留离线设备 last_seen 毫秒戳   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ 🌐 博客前端集成 (EdgeOne CDN / Shirone 博客)                     │
│ • 访客请求: GET /api/activity (公开访问，CORS 开放)              │
│ • 动态计算: 超过 120s 无心跳自动标记 offline=true，时间戳不丢失   │
│ • 纯净数据: 输出未加工的裸数组，排序与展示完全解耦交由前端处理   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 仓库代码资产与文件位置索引

所有服务端与探针代码均已就绪，物理路径如下：

| 文件相对路径 | 功能定位与核心职责 |
| :--- | :--- |
| **`plugins/what-im-doing/worker/worker.js`** | **Worker 入口路由**（HTTP 适配器）：处理 CORS Preflight、路由分发、错误转译与响应封装。 |
| **`plugins/what-im-doing/worker/fleet-store.js`** | **深层领域存储模块（FleetStore）**：内聚所有 D1 SQL 操作、Token 校验、120s 离线超时计算与设备优先级仲裁。 |
| **`plugins/what-im-doing/worker/admin-ui.js`** | **设备录入管理视图模板**：单文件自洽 HTML，提供设备添加、Token 生成与客户端配置一键导出。 |
| **`plugins/what-im-doing/worker/schema.sql`** | **D1 数据库定义文件**：包含 `devices` 表及 `last_seen` 索引，支持一键初始化。 |
| **`plugins/what-im-doing/worker/wrangler.toml`** | **Wrangler 部署配置文件**：声明 Worker 名称、D1 绑定变量名（`DB`）与兼容日期。 |
| **`plugins/what-im-doing/collector/what-im-doing.sh`** | **Linux 客户端采集脚本**：0.1s 极速探针，支持 KDE 6 D-Bus 窗口探测、本地状态差分与 60s 心跳兜底。 |
| **`plugins/what-im-doing/collector/collector.config.example.json`** | **客户端配置文件模版**：标准配置示例（供放置在 `~/.config/what-im-doing.json`）。 |
| **`plugins/what-im-doing/tests/acceptance-v2.test.mjs`** | **自动化验收测试套件**：覆盖鉴权 401/403、多设备隔离、120s 离线与时间戳保留全部指标。 |

---

## 3. Cloudflare D1 数据库模式规范 (`schema.sql`)

### 3.1 表结构定义
```sql
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,                 -- 设备唯一标识 (slug，如 debian-desktop)
  name TEXT NOT NULL,                  -- 设备可读名称 (如 Debian 13 开发工作站)
  type TEXT NOT NULL DEFAULT 'desktop',-- 设备类型: desktop | laptop | server | mobile | other
  status INTEGER NOT NULL DEFAULT 4,   -- 状态码: 1: ACTIVE, 2: IDLE, 3: AWAY, 4: OFFLINE
  app_name TEXT NOT NULL DEFAULT '',   -- 当前/最后活跃前台应用名 (如 Antigravity)
  window_title TEXT NOT NULL DEFAULT '',-- 当前/最后活跃窗口标题
  idle_seconds INTEGER NOT NULL DEFAULT 0, -- 无交互秒数
  token TEXT NOT NULL,                 -- 单设备专属高熵凭证 (如 sk_dev_ae7f9c21a4)
  last_seen INTEGER NOT NULL,          -- 最后可信心跳毫秒时间戳 (Epoch ms)
  updated_at INTEGER NOT NULL          -- 记录更新时间戳
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
```

### 3.2 存储设计优势
1. **配额安全**：D1 每日 100,000 次写配额，数十台设备每分钟上报（配合 60s 差分节流）每日写请求仅 ~2,000 次，**完全运行在 0 成本免费额度内**。
2. **绝对原子隔离**：每个设备根据主键 `id` 独立更新，杜绝 KV 弱一致性下的并发写覆盖问题。
3. **冷启 0 丢失**：设备即使关机数月，`last_seen` 毫秒时间戳原样沉淀在 D1 中，冷启动不丢失。

---

## 4. 接口协议与通信契约

### 4.1 设备遥测上报：`POST /api/activity/report`
设备端探针向服务端推送最新状态。

* **请求头**：
  * `Content-Type: application/json`
  * `Authorization: Bearer <device_token>`（必填）
  * *(可选)* `CF-Access-Client-Id` 与 `CF-Access-Client-Secret`（走 Cloudflare Access 机器通道时附带）
* **请求体（JSON）**：
  ```json
  {
    "id": "debian-desktop",
    "name": "Debian 13 开发工作站",
    "type": "desktop",
    "status": 1,
    "appName": "Antigravity",
    "windowTitle": "Shirone 主题配置梳理任务",
    "idleSeconds": 0,
    "osInfo": "Debian GNU/Linux forky/sid / Wayland (KDE 6)",
    "timestamp": 1789113655000
  }
  ```
* **响应码与格式**：
  * `200 OK`: `{"ok": true, "id": "debian-desktop", "lastSeen": 1789113655000}`
  * `401 Unauthorized`: 未提供 Bearer 或设备未注册 (`{"error": "Device 'xxx' is not registered"}`)
  * `403 Forbidden`: Token 与设备注册凭证不匹配 (`{"error": "Unauthorized: device token mismatch"}`)

---

### 4.2 公开聚合读取：`GET /api/activity`
博客页面或外部小挂件读取全设备矩阵与当前状态。

* **参数**：`?brief=1`（可选，开启后仅返回 `current` 摘要以节省流量）
* **跨域**：支持所有域（`Access-Control-Allow-Origin: *`）
* **缓存策略**：`Cache-Control: public, max-age=5, s-maxage=5`
* **响应体（JSON 示例）**：
  ```json
  {
    "current": {
      "id": "debian-desktop",
      "name": "Debian 13 开发工作站",
      "type": "desktop",
      "status": 1,
      "appName": "Antigravity",
      "windowTitle": "Shirone 主题配置梳理任务",
      "idleSeconds": 0,
      "lastSeen": 1789113655000,
      "offline": false
    },
    "devices": [
      {
        "id": "debian-desktop",
        "name": "Debian 13 开发工作站",
        "type": "desktop",
        "status": 1,
        "appName": "Antigravity",
        "windowTitle": "Shirone 主题配置梳理任务",
        "idleSeconds": 0,
        "lastSeen": 1789113655000,
        "offline": false
      },
      {
        "id": "thinkpad-x1",
        "name": "ThinkPad 便携本",
        "type": "laptop",
        "status": 4,
        "appName": "Zen Browser",
        "windowTitle": "GitHub - Pull Requests",
        "idleSeconds": 600,
        "lastSeen": 1789060886532,
        "offline": true
      }
    ],
    "groups": {
      "desktop": 1,
      "laptop": 0,
      "server": 1
    },
    "serverTime": 1789113660000
  }
  ```

---

### 4.3 管理与录入接口（建议置于 Cloudflare Access 之后）

* `GET /admin`：返回嵌入式管理页面 HTML。
* `GET /admin/devices`：查询全量设备注册信息（包含 Token）。
* `POST /admin/devices`：
  * 请求：`{"id": "thinkpad-x1", "name": "ThinkPad 便携本", "type": "laptop"}`
  * 响应：`{"ok": true, "device": {"id": "thinkpad-x1", "name": "ThinkPad 便携本", "type": "laptop", "token": "sk_dev_9f4e2b..."}}`
* `DELETE /admin/devices/:id`：从 D1 吊销并删除设备。
* `GET /health`：存活检查探针，输出 `{"ok": true, "timestamp": 1789113660000}`。

---

## 5. 网站管理员（Site Admin）部署操作步骤

管理员可在任意拥有 `wrangler` CLI 的终端（包括当前已认证环境）执行部署：

### 第一步：创建 D1 生产数据库
```bash
cd plugins/what-im-doing/worker
npx wrangler d1 create what-im-doing-fleet
```
*记录命令输出的 `database_id`（形如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）。*

### 第二步：将 `database_id` 填入 `wrangler.toml`
编辑 `plugins/what-im-doing/worker/wrangler.toml`：
```toml
name = "what-im-doing-hub"
main = "worker.js"
compatibility_date = "2024-09-01"

[[d1_databases]]
binding = "DB"
database_name = "what-im-doing-fleet"
database_id = "粘贴第一步生成的真实_database_id"
```

### 第三步：在 D1 远程数据库执行表结构初始化
```bash
npx wrangler d1 execute what-im-doing-fleet --file=schema.sql --remote
```

### 第四步：部署 Worker 到 Cloudflare 边缘
```bash
npx wrangler deploy
```
*部署成功后，系统会输出 Worker 的公开域名（如 `https://what-im-doing-hub.<subdomain>.workers.dev`）。*

### 第五步：(推荐) 配置自定义域名与 Cloudflare Access
1. 在 Cloudflare Dashboard > **Workers & Pages** > 点击 `what-im-doing-hub` > **Settings** > **Domains & Routes**：
   * 绑定自选域名（如 `activity.<your-domain.com>`）。
2. 在 Cloudflare **Zero Trust** 面板 > **Access** > **Applications**：
   * 新增 Application：路径设为 `activity.<your-domain.com>/admin*`；
   * Policy 规则：仅允许管理员邮箱接收 6 位 One-Time-PIN 免密登录。
   * *(备选)* 若未启用 Zero Trust，亦可通过 `npx wrangler secret put ADMIN_KEY` 设置静态管理员密钥进行接口隔离。

---

## 6. 前端集成方案建议（供博客管理员参考）

若博客主站托管在 **EdgeOne**（如 `<your-domain.com>`）：
1. **方案 A（EdgeOne 反代回源，国内最快）**：
   在 EdgeOne 的规则引擎或边缘函数中，将 `/api/activity` 路径反向代理回源至 Cloudflare Worker 域名。国内访客打开博客，由 EdgeOne 节点以毫秒级走腾讯云出口专线抓取 Cloudflare Worker 数据，**速度极快且 100% 避免任何网络干扰**。
2. **方案 B（前端直接请求 Worker 域名）**：
   博客前端 Svelte 组件中，将 `endpoint` 直接配置为 `https://activity.<your-domain.com>/api/activity`，由浏览器直连拉取。
