---
name: what-im-doing-setup
description: Configure, deploy, and verify the what-im-doing multi-device activity capsule plugin, including same-origin reverse proxy setup, backend telemetry hub, and client probes. Use when installing what-im-doing, setting up /api/activity reverse proxy, deploying D1 fleet worker, configuring blog activity capsule, or debugging telemetry connectivity.
---

# What-Im-Doing Plugin Setup & Deployment Guide

This skill guides the end-to-end configuration, deployment, and verification of the `what-im-doing` multi-device telemetry system.

```
[Client Devices / Probes]
          │
          ▼ HTTPS POST /api/activity/report (Bearer sk_dev_...)
[Cloudflare D1 Telemetry Hub]
          ▲
          │ (Forwarded query & 5s micro-cache)
[Same-Origin Reverse Proxy: /api/activity]  <── (Primary)
          ▲                                           │
          │                                           ▼ (Fallback)
[Astro Blog Frontend: WhatImDoingCapsule.svelte] ─────┘
```

---

## 1. Steps

Execute these steps in order.

### Step 1: Register Plugin in Astro Configuration

In the blog project's `astro.config.mjs`:
1. Import `whatImDoing`:
   ```javascript
   import whatImDoing from "@shirone-plugins/what-im-doing";
   ```
2. Add `whatImDoing(...)` to the `integrations` array:
   ```javascript
   whatImDoing({
     endpoint: process.env.ACTIVITY_ENDPOINT || "/api/activity, https://your-hub.workers.dev/api/activity",
     routeFilter: ["/"], // Prefix paths where capsule is rendered; empty or ["/"] for all pages
     refreshInterval: 0, // Zero idle overhead: 0 disables polling, relying on manual refresh
     maxHistoryDisplay: 5,
   }),
   ```
**Completion criterion**: Run `npx astro check` and verify it reports 0 errors.

---

### Step 2: Deploy Telemetry Hub & Cloudflare D1

The telemetry hub records probe heartbeats and computes 120s offline status.

1. Navigate to `plugins/what-im-doing/worker`.
2. Follow [references/hub-and-collector.md](references/hub-and-collector.md#1-cloudflare-d1-database--worker-deployment) to:
   - Create the Cloudflare D1 database: `npx wrangler d1 create what-im-doing-fleet`
   - Insert the returned `database_id` into `wrangler.toml`.
   - Apply `schema.sql`: `npx wrangler d1 execute what-im-doing-fleet --remote --file=schema.sql`
   - Set `ADMIN_KEY` secret and run `npx wrangler deploy`.
3. Open `https://<your-worker-subdomain>.workers.dev/admin` to register your devices and generate device access tokens (`sk_dev_...`).

**Completion criterion**: Running `curl -s https://<your-hub>.workers.dev/api/activity` returns a valid JSON object with `current` and `devices` fields.

---

### Step 3: Deploy Same-Origin Reverse Proxy

Overseas Cloudflare IPs encounter TLS SNI reset and ECH handshake drops in mainland China mobile networks (e.g. mobile Firefox/Chrome). A same-origin reverse proxy on your blog's CDN or server guarantees reliable connectivity.

1. Choose your hosting provider:
   - **Tencent Cloud EdgeOne**: Follow [references/reverse-proxy.md#1-tencent-cloud-edgeone-serverless-function](references/reverse-proxy.md#1-tencent-cloud-edgeone-serverless-function) to deploy `site-root/edge-functions/api/activity.js` and `site-root/middleware.js`.
   - **Nginx / VPS**: Follow [references/reverse-proxy.md#2-nginx-reverse-proxy-configuration](references/reverse-proxy.md#2-nginx-reverse-proxy-configuration) to configure `location /api/activity`.
   - **Caddy**: Follow [references/reverse-proxy.md#3-caddy-reverse-proxy-configuration](references/reverse-proxy.md#3-caddy-reverse-proxy-configuration).
2. Configure the proxy target to forward to `https://<your-hub>.workers.dev/api/activity` with 5s micro-caching and CORS headers (`Access-Control-Allow-Origin: *`).

**Completion criterion**: Running `curl --noproxy '*' -I http://your-blog-domain.com/api/activity` returns `HTTP/1.1 200 OK` or `HTTP/2 200` with `content-type: application/json`.

---

### Step 4: Configure Client Collector Probe

Deploy the lightweight shell collector on target client machines (Linux KDE / Wayland / desktop):

1. Copy `plugins/what-im-doing/collector/what-im-doing.sh` to `~/.local/bin/what-im-doing.sh` and make it executable (`chmod +x`).
2. Follow [references/hub-and-collector.md#3-client-collector-setup-linux-kde--wayland](references/hub-and-collector.md#3-client-collector-setup-linux-kde--wayland) to configure `~/.config/what-im-doing.json` with the device token and endpoint.
3. Install the systemd user service and timer for periodic 5-second sampling.

**Completion criterion**: Running `~/.local/bin/what-im-doing.sh` manually prints a successful HTTP 200 report acknowledgment without errors.

---

### Step 5: Verification & End-to-End Validation

1. **Verify Readout**: Visit your blog in a desktop or mobile browser. Verify the capsule renders with status light and active device summary.
2. **Verify Drawer**: Click the capsule to expand the multi-device drawer. Verify registered devices are displayed with correct app names and relative timestamps.
3. **Verify Manual Refresh & Cooldown**:
   - Click the refresh button inside drawer header: it expands leftwards showing `正在刷新...` and spinning icon, transitions to `已同步`, and collapses.
   - Click the refresh button within 5 seconds of the previous sync: it expands showing `请等待 n 秒刷新` in amber with dynamic countdown, and auto-collapses in 1.8s.

**Completion criterion**: All 3 states of the refresh pill (Refreshing, Synced, Cooldown) function smoothly without layout shifts.

---

## 2. Reference

### Plugin Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `endpoint` | `string \| string[]` | `"/api/activity"` | Comma-separated or array of telemetry URLs. Supports primary same-origin proxy with remote fallbacks. |
| `routeFilter` | `string[]` | `[]` | Route path prefixes where capsule mounts. Empty array or `["/"]` enables it on all pages. |
| `refreshInterval` | `number` | `0` | Auto-poll interval in ms. `0` maintains zero idle overhead (manual refresh on demand). |
| `maxHistoryDisplay` | `number` | `5` | Maximum number of timeline items rendered in the drawer. |
| `enableLocalEndpoint`| `boolean` | `false` | Enable local Astro SSR `/api/activity` endpoint (requires Node/Vercel SSR adapter). Keep `false` for static SSG builds. |

### Protocol Format Handling

The capsule client automatically inspects `Content-Type` on the response:
- `application/x-protobuf`: Decodes Protobuf byte stream into telemetry snapshot.
- `application/json` / `text/plain`: Parses JSON payload into `ActivityHistoryResponse`.
- HTML / Non-JSON: Silently fails over to the next candidate endpoint in `endpoint`.
