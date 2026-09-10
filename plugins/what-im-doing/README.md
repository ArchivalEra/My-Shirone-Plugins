# @shirone-plugins/what-im-doing

> **Real-time Linux Device Activity & Application Monitoring for Shirone (Astro M3 Blog)**  
> Non-intrusive drop-in Astro integration powered by Protocol Buffers v3, KDE 6.7 / Wayland telemetry daemon, EdgeOne KV backend, and Material 3 status capsule.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │   Linux Host (Wayland / KDE Plasma 6.7 / KWin)         │
 │   • detect-window.mjs: Queries KWin activeClient & dbus│
 │   • collector.mjs: Encodes payload into Protobuf v3    │
 └───────────────────────────┬────────────────────────────┘
                             │  POST /api/activity (Protobuf binary)
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │   Backend Ingestion (EdgeOne Pages / Cloudflare / Astro)│
 │   • Ingests Protobuf v3 binary streams                 │
 │   • Stores up to 3,000+ items in KV for inspection     │
 │   • Serves GET /api/activity (Protobuf / JSON)         │
 └───────────────────────────┬────────────────────────────┘
                             │  GET /api/activity
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │   Frontend Blog UI (Shirone M3 Expressive)             │
 │   • Status Capsule above Author Avatar                 │
 │   • "10分钟前在 Arch Linux (KDE 6.7) 使用 Antigravity"  │
 │   • Live Breathing Pulse Dot (Green / Amber / Gray)    │
 │   • Expandable Multi-device History Drawer & Popover   │
 └────────────────────────────────────────────────────────┘
```

---

## 1. Quick Start (Astro Integration)

### Install Plugin

Link the plugin in your blog repository (`Shirone`):

```bash
pnpm add -D link:../My-Shirone-Plugins/plugins/what-im-doing
```

### Enable in `astro.config.mjs`

```javascript
import { defineConfig } from "astro/config";
import whatImDoing from "@shirone-plugins/what-im-doing";

export default defineConfig({
  integrations: [
    whatImDoing({
      // Optional: Remote EdgeOne function or local dev mock endpoint
      endpoint: "/api/activity",
      // Maximum history items to show in the dropdown drawer
      maxHistoryDisplay: 5,
      // Client status refresh interval (ms). Default: 30000 (30s)
      refreshInterval: 30000,
      // Target selector to place the capsule above (defaults to avatar)
      targetSelector: 'a[aria-label="Go to About Page"]',
      // Optional Bearer token for authorized uploads
      authToken: process.env.ACTIVITY_TOKEN,
    }),
  ],
});
```

> [!NOTE]
> **Zero-Intrusion Guarantee**: When the integration is removed from `astro.config.mjs`, the site restores 100% to vanilla Shirone without any lingering DOM elements, scripts, or build side effects.

---

## 2. Linux Collector Daemon (KDE 6.7 / Wayland)

The collector daemon runs on your Linux machines and automatically detects:
- Active Application Name (e.g. `Antigravity`, `Visual Studio Code`, `Firefox`)
- Active Window Title
- User Idle Duration (via FreeDesktop ScreenSaver D-Bus)
- Desktop Environment & OS details

### Test Collector Locally (Dry-Run)

```bash
node collector/collector.mjs --dry-run
```

Output:
```json
{
  "timestamp": 1789059995747,
  "deviceId": "arch-desktop",
  "deviceName": "Arch Linux (KDE 6.7)",
  "appName": "Antigravity",
  "windowTitle": "isui.ren-Blog - Antigravity",
  "status": 1,
  "osInfo": "Arch Linux / wayland (KDE 6)",
  "idleSeconds": 0
}
Protobuf binary payload size: 185 bytes
```

### Configure Collector

Copy `collector/collector.config.example.json` to `collector/collector.config.json`:

```json
{
  "endpoint": "https://isui.ren/api/activity",
  "token": "your-secret-token-here",
  "deviceId": "arch-desktop",
  "deviceName": "Arch Linux (KDE 6.7)",
  "intervalSeconds": 15
}
```

### Run as Systemd User Service

1. Copy service file to user systemd directory:
   ```bash
   mkdir -p ~/.config/systemd/user
   cp collector/what-im-doing.service ~/.config/systemd/user/
   ```
2. Enable and start:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now what-im-doing
   ```
3. Check status:
   ```bash
   systemctl --user status what-im-doing
   ```

---

## 3. Protocol Buffers Specification (`activity.proto`)

```protobuf
syntax = "proto3";

package what_im_doing;

enum ActivityStatus {
  ACTIVITY_STATUS_UNKNOWN = 0;
  ACTIVE = 1;      // User actively interacting (< 3 mins)
  IDLE = 2;        // User idle (3 ~ 30 mins)
  AWAY = 3;        // No input for extended duration (> 30 mins)
  OFFLINE = 4;     // Device powered down
}

message DeviceActivity {
  int64 timestamp = 1;            // Unix epoch ms
  string device_id = 2;           // Unique identifier
  string device_name = 3;         // Display name
  string app_name = 4;            // Application name
  string window_title = 5;        // Window title text
  ActivityStatus status = 6;      // Status enum
  string os_info = 7;             // OS & session details
  int64 idle_seconds = 8;         // Seconds of inactivity
  map<string, string> metadata = 9;
}

message ActivityBatchUploadRequest {
  string token = 1;
  repeated DeviceActivity events = 2;
}

message ActivityHistoryResponse {
  DeviceActivity current = 1;
  repeated DeviceActivity devices = 2;
  repeated DeviceActivity history = 3;
  int64 server_time = 4;
}
```

---

## 4. EdgeOne Functions Deployment

Deploy `src/server/edgeone-function.ts` directly into Tencent Cloud EdgeOne Pages Functions or Cloudflare Workers:
- Bind a KV namespace named `ACTIVITY_KV`.
- Configure Environment Variable `AUTH_TOKEN` (optional, for write protection).
- Automatically keeps up to 3,000 historical events for personal telemetry inspection.

---

## 5. Automated Tests

```bash
pnpm test
```

Unit test coverage includes:
- Protobuf binary serialization / deserialization roundtrip
- Multi-device status aggregation & time-drift compensation
- Humanized Chinese & English relative time text formatting
- Edge/Astro API route handlers (POST/GET/OPTIONS) with binary & JSON support
- Wayland / KDE window detection engine
