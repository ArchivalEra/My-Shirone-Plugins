# Telemetry Hub and Client Collector Reference

## 1. Cloudflare D1 Database & Worker Deployment

The telemetry hub (`plugins/what-im-doing/worker`) stores device states in Cloudflare D1 with automatic 120s offline detection.

### Step 1.1: Create the D1 Database
```bash
npx wrangler d1 create what-im-doing-fleet
```
Record the returned `database_id`.

### Step 1.2: Update `wrangler.toml`
Open `plugins/what-im-doing/worker/wrangler.toml` and configure your database ID:
```toml
name = "what-im-doing-hub"
main = "worker.js"
compatibility_date = "2024-09-01"
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "what-im-doing-fleet"
database_id = "<your-d1-database-id-from-step-1.1>"
```

### Step 1.3: Initialize the Schema
```bash
npx wrangler d1 execute what-im-doing-fleet --remote --file=schema.sql
```

### Step 1.4: Set Admin Key and Deploy
```bash
# Set an admin key for /admin authentication
npx wrangler secret put ADMIN_KEY

# Deploy to Cloudflare Workers
npx wrangler deploy
```

The worker outputs your public hub URL: `https://what-im-doing-hub.<your-account>.workers.dev`.

---

## 2. Register Devices via `/admin`

1. Open `https://what-im-doing-hub.<your-account>.workers.dev/admin` in your browser.
2. Enter your `ADMIN_KEY` when prompted.
3. Click "Add Device" to create a device record:
   - `id`: unique machine slug (e.g. `workstation-arch`, `macbook-air`)
   - `name`: display name (e.g. `Arch Workstation`)
   - `type`: `desktop` | `laptop` | `server` | `mobile` | `other`
4. Copy the generated Device Secret Token (`sk_dev_...`).

---

## 3. Client Collector Setup (Linux KDE / Wayland)

The probe script (`plugins/what-im-doing/collector/what-im-doing.sh`) detects the active window via KDE 6 / KWin D-Bus, filters unchanged states, and reports only on change or 60s heartbeat.

### Step 3.1: Configure Collector
Create `~/.config/what-im-doing.json`:
```json
{
  "endpoint": "https://your-hub.workers.dev/api/activity/report",
  "deviceId": "workstation-arch",
  "token": "sk_dev_your_token_here",
  "deviceName": "Arch Workstation",
  "deviceType": "desktop"
}
```

### Step 3.2: Create Systemd User Service & Timer

**File: `~/.config/systemd/user/what-im-doing.service`**
```ini
[Unit]
Description=What-Im-Doing Telemetry Probe
After=graphical-session.target

[Service]
Type=oneshot
ExecStart=%h/.local/bin/what-im-doing.sh
StandardOutput=journal
StandardError=journal
```

**File: `~/.config/systemd/user/what-im-doing.timer`**
```ini
[Unit]
Description=Run What-Im-Doing Telemetry Probe every 5 seconds

[Timer]
OnBootSec=10s
OnUnitActiveSec=5s
AccuracySec=1s

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
systemctl --user daemon-reload
systemctl --user enable --now what-im-doing.timer
```
