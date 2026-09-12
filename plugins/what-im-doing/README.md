# @shirone-plugins/what-im-doing

> **Real-time Linux Desktop Activity & Application Telemetry for Shirone (Astro M3 Blog)**  
> Non-intrusive drop-in Astro integration strictly adhering to `contribute.md`. Powered by Protocol Buffers v3, native KDE 6.7 / Wayland shell telemetry, an Oracle Cloud VPS event hub with zero KV costs, and an on-intent lazy-loaded Material 3 status capsule.

---

## 🏗️ Architecture & Topology

```
┌─────────────────────────────────────────────────────────────┐
│  Linux Desktop & Laptop (Wayland / KDE Plasma 6.7)          │
│  • collector/what-im-doing.sh: Pure POSIX/Bash (0 MB Node)  │
│  • Reads kdotool / org.kde.KWin / ScreenSaver D-Bus         │
│  • Outbound POST /api/activity (Protobuf / JSON over HTTPS) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Oracle Cloud VPS Activity Hub (server/vps-hub.mjs)         │
│  • Zero cloud KV write costs, zero rate limits, sub-ms sync │
│  • Multi-device arbiter: active & lowest idle wins          │
│  • In-memory ring buffer (up to 5,000 events) + state file  │
│  • Exposes GET /api/activity?brief=1 and ?history=1         │
│  • Exposes GET /api/activity/stream (SSE real-time push)    │
│  • Exposed via cloudflared tunnel (activity.your-domain.com)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Shirone Blog Frontend (WhatImDoingCapsule.svelte)          │
│  • Strict Rule 2.4 On-Intent Lazy Loading Contract:         │
│    1. Only mounts on targeted pages (e.g. /about)           │
│    2. IntersectionObserver: only fetches when in viewport   │
│    3. History drawer is strictly deferred until user click  │
│    4. Immediate pause when document is hidden / navigated   │
│  • Material 3 Expressive Capsule with Breathing Pulse Dot   │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Quick Start (Astro Blog Integration)

### Install Plugin

Link the plugin in your Shirone repository:

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
      // Primary same-origin reverse proxy with remote hub fallback
      endpoint: "/api/activity, https://your-hub.workers.dev/api/activity",
      // Maximum history items to show in the dropdown drawer
      maxHistoryDisplay: 5,
      // Client brief status refresh interval (ms). 0 = zero idle overhead (manual refresh on demand)
      refreshInterval: 0,
      // Target selector to place the capsule above (defaults to avatar)
      targetSelector: 'a[aria-label="Go to About Page"]',
      // Optional: restrict mounting strictly to specific routes (e.g. /about or ["/"] for all)
      routeFilter: ["/"],
    }),
  ],
});
```

> [!TIP]
> **🤖 Automated Setup Skill**:
> An AI agent skill is included in `skills/what-im-doing-setup` (and `.agents/skills/what-im-doing-setup`). It automates `astro.config.mjs` configuration, Cloudflare D1 hub deployment, same-origin reverse proxy setup (Tencent Cloud EdgeOne, Nginx, Caddy), and probe installation.

> [!NOTE]
> **Zero-Intrusion & Zero-Breaking Contract**:
> When unplugged or disabled in `astro.config.mjs`, the site restores 100% to vanilla Shirone without any lingering DOM elements, scripts, or build artifacts.

---

## 2. Oracle Cloud VPS Hub Setup (Zero KV Costs)

Cloud KV stores (Cloudflare KV, EdgeOne KV) have strict daily write quotas or per-write fees that make continuous 15s reporting expensive. Running a lightweight daemon on an Oracle Cloud VPS instance completely eliminates write fees and provides instant consistency.

### Step 1: Copy `vps-hub.mjs` to Oracle VPS

`server/vps-hub.mjs` has **zero external npm dependencies** (uses Node.js built-ins).

```bash
# On your local machine:
scp server/vps-hub.mjs user@your-oracle-vps:/opt/what-im-doing/
```

### Step 2: Configure Systemd Service

Copy `server/what-im-doing-hub.service` to `/etc/systemd/system/what-im-doing-hub.service`:

```bash
sudo cp server/what-im-doing-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now what-im-doing-hub
```

### Step 3: Connect via `cloudflared tunnel`

Configure your Cloudflare tunnel on the Oracle VPS (`/etc/cloudflared/config.yml`):

```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /etc/cloudflared/<YOUR-TUNNEL-UUID>.json

ingress:
  - hostname: activity.your-domain.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

Restart cloudflared:
```bash
sudo systemctl restart cloudflared
```

Your hub is now accessible globally at `https://activity.your-domain.com/api/activity` with free SSL, DDoS protection, and edge caching, without opening any inbound firewall ports on Oracle Cloud!

---

## 3. Pure Shell Linux Collector (`collector/what-im-doing.sh`)

Zero Node.js runtime, zero memory overhead (~0 MB), pure native Linux shell for Wayland / KDE Plasma 6.7.

### Test Collector Locally (Dry-Run)

```bash
bash collector/what-im-doing.sh --dry-run
```

Sample output:
```json
[what-im-doing: dry-run] Payload:
{
  "timestamp": 1789061559570,
  "deviceId": "workstation-pc",
  "deviceName": "Workstation (KDE 6.7 Wayland)",
  "osInfo": "Arch Linux / Wayland (KDE 6.7)",
  "idleSeconds": 0
}
```

### Media Telemetry (MPRIS / playerctl)

If `playerctl` is available on your desktop, `collector/what-im-doing.sh` automatically detects running media players (Spotify, NetEase Cloud Music, VLC, Firefox, Chrome, etc.):
```json
{
  "appName": "Antigravity",
  "media": {
    "title": "海阔天空",
    "artist": "Beyond",
    "player": "spotify",
    "isPlaying": true
  }
}
```
The status capsule dynamically formats: *"正在 Arch Linux 收听 海阔天空 - Beyond"* when music is playing, or *"正在 Arch Linux 使用 Antigravity"* when working.

### Multi-Device Setup (Workstation + Laptop)

Both machines can report concurrently. The Hub's arbiter ensures the machine you are actively touching takes precedence.

Create `~/.config/what-im-doing.conf` on each machine:

**On Workstation:**
```bash
ENDPOINT="https://activity.your-domain.com/api/activity"
AUTH_TOKEN="your-secret-token"
DEVICE_ID="workstation"
DEVICE_NAME="Arch Linux (Workstation)"
INTERVAL=15
```

**On Laptop:**
```bash
ENDPOINT="https://activity.your-domain.com/api/activity"
AUTH_TOKEN="your-secret-token"
DEVICE_ID="laptop"
DEVICE_NAME="ThinkPad (Laptop)"
INTERVAL=15
```

### Enable as User Systemd Service

```bash
mkdir -p ~/.config/systemd/user ~/.local/bin
cp collector/what-im-doing.sh ~/.local/bin/
cp collector/what-im-doing.service ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now what-im-doing.service
```

---

## 4. Mix Space & Shiro Protocol Compatibility

For users migrating from or co-existing with Mix Space / Shiro ecosystems:
- **Zero Configuration Migration**: The Hub (`server/vps-hub.mjs`) and Astro endpoint (`src/server/endpoint.ts`) natively accept Mix Space `/fn/ps/update` and `/api/v2/fn/ps/update` POST requests.
- **Compatible Field Mapping**:
  - `process_name` / `process` ➔ mapped to `appName`
  - `media_title` / `media_artist` ➔ mapped to `media.title` / `media.artist`
  - `device` / `device_id` ➔ mapped to `deviceName` / `deviceId`
  - `key` / `api_key` ➔ authenticated against `AUTH_TOKEN` / `ACTIVITY_TOKEN`
- Existing Mix Space telemetry scripts (such as `processforlinux` or custom hooks) can point directly to `https://activity.your-domain.com/fn/ps/update` with no code changes needed.

---

## 5. `contribute.md` Rule 2.4: On-Intent Lazy Loading Contract

This plugin strictly enforces Rule 2.4 from `contribute.md`:
1. **Never eagerly fetch remote data on component mount (`onMount`)**:
   Visiting other blog posts or pages makes **zero** network requests.
2. **IntersectionObserver Gated**:
   When visiting targeted pages, brief status (`?brief=1`) is only queried when the avatar container actually enters the viewport.
3. **Drawer History On-Demand**:
   Detailed history (`?history=1`) is only downloaded when the visitor explicitly clicks or expands the status capsule.
4. **Visibility Awareness**:
   When the browser tab is hidden (`document.visibilityState === "hidden"`), all background intervals and polling timers immediately stop.

---

## 6. Automated Tests

```bash
pnpm test
```

Test suite (19 unit tests, 100% pass, ~600ms execution):
- Protobuf binary serialization / deserialization roundtrips
- Multi-device status arbitration & idle tie-breaking
- Humanized Chinese & English relative time text formatting with active media support
- Oracle VPS Hub ingestion (Protobuf / JSON), brief queries, bearer auth, and healthcheck
- Full Mix Space `/fn/ps/update` endpoint and legacy field compatibility
- Wayland / KDE window detection engine

