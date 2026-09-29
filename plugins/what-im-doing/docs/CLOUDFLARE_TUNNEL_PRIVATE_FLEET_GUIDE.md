# What-Im-Doing 设备舰队：Cloudflare Tunnel 零触注册与私有高速上报实战指南

> **适用场景**：多设备（Debian/Arch/Fedora Linux 桌面与笔记本、服务器、云主机）活动状态采集，通过 Cloudflare Tunnel 原生凭证实现免密注册、GFW 隔离绕过与 Serverless 边缘汇聚。  
> **生产服务**：`https://api.mango-mesa.ccwu.cc` (Cloudflare Worker + D1 Fleet Store)  
> **公网展示**：`https://isui.ren/api/activity` (EdgeOne 国内加速只读只反代)  
> **当前验证基线**：2026-09-29 本机（`shit-microsoft` / `笔记本`）实测跑通。

---

## 1. 架构原理与安全红线

### 1.1 为什么必须封禁 EdgeOne 端点的上报请求？
* **安全红线**：国内 CDN（腾讯云 EdgeOne / 阿里云 ESA）是公开的博客静态站点加速层。如果允许任何客户端向 `isui.ren/api/activity/report` 投递上报，公网扫描器或恶意访客就能随意滥刷遥测接口、污染设备舰队数据或耗尽后端 D1 配额。
* **分权架构**：
  * **公网只读（EdgeOne）**：仅开放 `GET /api/activity`，供全球读者以超低延迟查看当前博客主人的状态，后端由 EdgeOne 缓存保护（`max-age=5, s-maxage=10`）。
  * **私网/专用写入（Worker + Tunnel）**：上报接口 `POST /activity/report` 仅在 Cloudflare 专用 API 端点 `api.mango-mesa.ccwu.cc` 接收。Worker 内部硬编码拦截规则：**凡带有 EdgeOne 标识（如 `Host: isui.ren`、`eo-*`、`x-edgeone-*`）的上报请求，一律直接返回 `403 Forbidden` 绝不入库**。

```
[设备探针 (Linux KDE/GNOME/Server)]
       │
       │ (1) 本地 Tunnel / 代理出站 (绕过 GFW Anycast TCP Reset)
       ▼
[Cloudflare Edge Worker (api.mango-mesa.ccwu.cc)]
       │
       ├─ (2) 校验 Cloudflare Tunnel Token 归属 (Account ID 匹配)
       ├─ (3) 未知设备原地免密纳管入库 (Auto-Enrollment)
       └─ (4) 写入 Cloudflare D1 (what-im-doing-fleet)
               │
               ▼
[EdgeOne 国内 CDN (isui.ren/api/activity)]  ◄─── 读者只读拉取 (GET 5s 缓存)
   ▲
   └─── 严禁写入！(POST 上报直接 403 熔断)
```

### 1.2 为什么直连 Cloudflare Anycast 会被重置？
在国内直接 `curl https://api.mango-mesa.ccwu.cc/health` 会触发 GFW 的 SNI 检测阻断（`curl: (35) Recv failure: 连接被对方重置`）。因此，设备上报**绝不能直接走国内未经穿透的裸公网 Anycast**，必须复用机器上既有的 Cloudflare Tunnel 通道或出站代理。

---

## 2. Cloudflare Tunnel Token 零触自动纳管机制

在拥有 Cloudflare Tunnel 的主机（如 `debiansid主机`、`笔记本`、云服务器）上，`cloudflared` 服务运行时均存有原生的隧道凭据：`/etc/cloudflared/token`。

### 2.1 Token 的解构与安全性
该 Token 为一段 Base64 编码的 JSON：
```json
{
  "a": "9bd2e738536b0a16b01635ab14ea9503",  // 你的 Cloudflare Account ID
  "t": "8de26a3a-30e6-4e7a-b1e2-c2f9b28da454",  // 隧道的唯一 UUID
  "s": "MW1z...5VbSJ9"                          // 该隧道的连接私钥
}
```
* **零配置鉴权**：Worker 在收到带有 `Authorization: Bearer <TunnelToken>` 的请求时，会直接解码校验 `a === env.ACCOUNT_ID`。
* **即时自动纳管 (Zero-Touch Auto-Enrollment)**：如果该设备是第一次上报，Worker 会根据上报载荷中的 `id`、`name`、`type` 原地在 D1 数据库中创建设备并赋予访问权限，**运维人员无需登录仪表盘手动录入设备，也无需配置任何多余的 ADMIN_KEY 玩具密钥**。

---

## 3. 本地 Linux 客户端配置与一键跑通

### 3.1 客户端准备工作
只要主机上已经安装并运行了 `cloudflared`，或者安装了本地出站代理（如本地 Mihomo / Daedalus，默认端口 `2080`），即可零门槛接入。

确保当前用户具有免密读取 `/etc/cloudflared/token` 的权限（或直接让 root/sudo 运行一次）：
```bash
# 测试当前用户是否可读 token
sudo -n cat /etc/cloudflared/token >/dev/null && echo "OK: Token 可读"
```

### 3.2 配置文件编写 (`~/.config/what-im-doing.json`)
在用户目录下创建配置文件：
```json
{
  "endpoint": "https://api.mango-mesa.ccwu.cc/activity/report",
  "deviceId": "shit-microsoft",
  "deviceName": "笔记本",
  "deviceType": "laptop",
  "proxy": "http://127.0.0.1:2080"
}
```
> **提示**：
> 1. `token` 项**故意留空**：采集探针 `what-im-doing.sh` 会自动检测并安全读取 `/etc/cloudflared/token`。
> 2. `proxy` 项：由于国内直连 Anycast 会被 GFW 重置，指定 `http://127.0.0.1:2080`（或你的本地 Tunnel SOCKS/HTTP 代理端口）即可走高速通路瞬间直达 Worker。

### 3.3 探针即时单次上报测试
执行以下命令验证通道连通性与鉴权响应：
```bash
/home/archivalera/.local/bin/what-im-doing.sh --verbose --once
```
**成功输出示例**：
```
[what-im-doing] Report sent successfully (HTTP 200) at 10:20:23
```

此时立即访问 `https://isui.ren/api/activity`，即可看到本机已经被纳管并显示为当前活跃设备：
```json
{
  "current": {
    "id": "shit-microsoft",
    "name": "笔记本",
    "type": "laptop",
    "status": 1,
    "appName": "Antigravity",
    "offline": false
  }
}
```

---

## 4. Systemd 用户服务自启动守护

为了让采集探针在开机登入桌面后自动后台静默运行，配置 Systemd 用户服务：

### 4.1 服务单元配置 (`~/.config/systemd/user/what-im-doing.service`)
```ini
[Unit]
Description=What-Im-Doing Linux Activity Collector (KDE 6.7 / Wayland)
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=%h/.local/bin/what-im-doing.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

### 4.2 启动与激活服务
```bash
systemctl --user daemon-reload
systemctl --user enable --now what-im-doing.service
```

### 4.3 检查服务状态与日志
```bash
systemctl --user status what-im-doing.service
journalctl --user -u what-im-doing.service -f
```

---

## 5. Worker 请求开销与配额评估

### 5.1 推模式（差异比对）vs 拉模式（定时轮询）
| 维度 | 方案 A：探针推模式 (当前实现) | 方案 B：Cron 轮询拉模式 |
| :--- | :--- | :--- |
| **工作原理** | 客户端本地比对活动窗口与空闲状态，**仅状态变化时上报**（附带 60s 心跳兜底） | Worker 设置定时任务，每隔几秒轮询所有主机的私有端口 |
| **Worker 请求数** | **极低**（单机约 500 ~ 1,500 次/天） | **极高**（单机每 10s 轮询一次需 8,640 次/天，5 台设备 43,200 次/天） |
| **实时性** | **亚秒级**（切换活动窗口立即触发） | 存在轮询周期间隔延迟（10s ~ 30s） |
| **免费配额占用** | **< 3%**（CF 免费额度 100,000 次/天，5 台设备日常仅消耗 ~3,000 次） | **> 45%**（极易因为网络阻塞与重试逼近每日 10 万次上限） |
| **安全性** | 设备主动向边缘安全通道推流，主机无需对外开放监听端口 | 需要主机为每个设备暴露私网端口或维护复杂 VPC 映射 |

**结论**：方案 A（当前推模式）不仅开销极微小，而且彻底免除了在私网维护开放端口的负担。

---

## 6. 常见排错备忘 (Troubleshooting)

1. **上报返回 403 `Telemetry reporting via public CDN / EdgeOne is strictly forbidden`**：
   - 原因：探针的 `endpoint` 配成了 `https://isui.ren/...`。
   - 解法：将 `endpoint` 修正为直达端点 `https://api.mango-mesa.ccwu.cc/activity/report`。
2. **上报超时或报 `curl: (35) 连接被对方重置`**：
   - 原因：国内环境直连 Cloudflare Anycast 被阻断。
   - 解法：在 `~/.config/what-im-doing.json` 中配置 `"proxy": "http://127.0.0.1:2080"`，或者通过环境变量 `https_proxy=http://127.0.0.1:2080` 启动。
3. **上报返回 403 `Device is not registered` 或 `Cloudflare Tunnel account mismatch`**：
   - 原因：所携带的 Tunnel Token 不属于账号 `9bd2e738536b0a16b01635ab14ea9503`。
   - 解法：检查 `/etc/cloudflared/token`，确保是该 Cloudflare 组织下的正规隧道。
