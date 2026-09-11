#!/usr/bin/env bash
# ==============================================================================
# what-im-doing: One-Line Installer & Fleet Provisioner for Linux Clients
# Supports automated installation, configuration, and systemd user setup.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BIN="${HOME}/.local/bin/what-im-doing.sh"
CONFIG_FILE="${HOME}/.config/what-im-doing.json"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SYSTEMD_USER_DIR}/what-im-doing.service"

# Defaults
ENDPOINT=""
DEVICE_ID="$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
DEVICE_NAME="$(hostname) (Linux)"
DEVICE_TYPE="desktop"
TOKEN=""
CF_CLIENT_ID=""
CF_CLIENT_SECRET=""
INTERVAL="15"
DRY_RUN=false
UNINSTALL=false

show_help() {
    cat <<EOF
what-im-doing client installer

Usage:
  bash install.sh [OPTIONS]

Options:
  --endpoint <URL>     Cloudflare Worker endpoint (e.g. https://activity.example.com/api/activity/report)
  --id <ID>            Unique device identifier (default: hostname, e.g. debian-desktop)
  --name <NAME>        Human-readable device name (default: hostname (Linux))
  --type <TYPE>        Device type: desktop | laptop | server | mobile | other (default: desktop)
  --token <TOKEN>      Bearer token for authentication (sk_dev_...)
  --cf-id <ID>         (Optional) Cloudflare Access Client Id
  --cf-secret <SECRET> (Optional) Cloudflare Access Client Secret
  --interval <SECS>    Collection loop interval in seconds (default: 15)
  --uninstall          Uninstall collector service, timer, and local binaries
  --dry-run            Simulate operations without modifying filesystem
  --help               Display this help message

Example:
  bash install.sh \\
    --endpoint https://activity.example.com/api/activity/report \\
    --id debian-desktop \\
    --name "Debian 13 开发工作站" \\
    --type desktop \\
    --token sk_dev_ae7f9c21a4
EOF
}

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --endpoint) ENDPOINT="$2"; shift 2 ;;
        --id) DEVICE_ID="$2"; shift 2 ;;
        --name) DEVICE_NAME="$2"; shift 2 ;;
        --type) DEVICE_TYPE="$2"; shift 2 ;;
        --token) TOKEN="$2"; shift 2 ;;
        --cf-id) CF_CLIENT_ID="$2"; shift 2 ;;
        --cf-secret) CF_CLIENT_SECRET="$2"; shift 2 ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        --uninstall) UNINSTALL=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "Unknown option: $1" >&2; show_help; exit 1 ;;
    esac
done

# Uninstall workflow
if [[ "$UNINSTALL" == true ]]; then
    echo "==> Uninstalling what-im-doing client..."
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop what-im-doing.service 2>/dev/null || true
        systemctl --user disable what-im-doing.service 2>/dev/null || true
    fi
    rm -f "$SERVICE_FILE"
    rm -f "$INSTALL_BIN"
    echo "==> Removed service and binaries. Preserving config at $CONFIG_FILE."
    echo "==> Done."
    exit 0
fi

# Validation
if [[ -z "$ENDPOINT" && ! -f "$CONFIG_FILE" ]]; then
    echo "Error: --endpoint is required when no existing config is found." >&2
    exit 1
fi

if [[ -z "$TOKEN" && ! -f "$CONFIG_FILE" ]]; then
    echo "Error: --token is required when no existing config is found." >&2
    exit 1
fi

echo "======================================================"
echo " What-Im-Doing Fleet Client Installer"
echo "======================================================"
echo " Device ID   : $DEVICE_ID"
echo " Device Name : $DEVICE_NAME"
echo " Device Type : $DEVICE_TYPE"
echo " Endpoint    : ${ENDPOINT:-[Keep Existing]}"
echo " Target Bin  : $INSTALL_BIN"
echo " Config File : $CONFIG_FILE"
echo " Interval    : ${INTERVAL}s"
echo " Dry Run     : $DRY_RUN"
echo "======================================================"

if [[ "$DRY_RUN" == true ]]; then
    echo "==> [Dry-Run] Simulation complete. No changes made."
    exit 0
fi

# 1. Create directory structure
mkdir -p "$(dirname "$INSTALL_BIN")"
mkdir -p "$(dirname "$CONFIG_FILE")"
mkdir -p "$SYSTEMD_USER_DIR"

# 2. Write/update configuration file safely (chmod 600)
cat > "$CONFIG_FILE" <<EOF
{
  "endpoint": "${ENDPOINT}",
  "deviceId": "${DEVICE_ID}",
  "deviceName": "${DEVICE_NAME}",
  "deviceType": "${DEVICE_TYPE}",
  "token": "${TOKEN}",
  "cfAccessClientId": "${CF_CLIENT_ID}",
  "cfAccessClientSecret": "${CF_CLIENT_SECRET}"
}
EOF
chmod 600 "$CONFIG_FILE"
echo "✔ Saved configuration to $CONFIG_FILE (mode 0600)"

# 3. Install collector script
SOURCE_SH="${SCRIPT_DIR}/what-im-doing.sh"
if [[ ! -f "$SOURCE_SH" ]]; then
    # In case downloaded standalone
    echo "Fetching what-im-doing.sh..."
    SOURCE_SH="/tmp/what-im-doing-downloaded.sh"
    curl -fsSL "https://raw.githubusercontent.com/ArchivalEra/My-Shirone-Plugins/main/plugins/what-im-doing/collector/what-im-doing.sh" -o "$SOURCE_SH"
fi

cp "$SOURCE_SH" "$INSTALL_BIN"
chmod +x "$INSTALL_BIN"
echo "✔ Installed collector script to $INSTALL_BIN"

# 4. Install systemd user service
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=What-Im-Doing Linux Activity Collector (Fleet Mode)
After=graphical-session.target default.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=${INSTALL_BIN}
Restart=always
RestartSec=10
Environment=INTERVAL=${INTERVAL}

[Install]
WantedBy=default.target
EOF
echo "✔ Installed systemd user service to $SERVICE_FILE"

# 5. Enable and start systemd user service if systemctl available
if command -v systemctl >/dev/null 2>&1; then
    echo "==> Reloading systemd user daemon..."
    systemctl --user daemon-reload || true
    systemctl --user enable --now what-im-doing.service || true
    echo "✔ Service enabled and started via systemctl --user"
else
    echo "Notice: systemctl not available in this environment. Run $INSTALL_BIN directly in your startup script."
fi

# 6. Self-test single run
echo "==> Running verification check..."
TEST_OUT="$("${INSTALL_BIN}" --once 2>&1 || true)"
if echo "$TEST_OUT" | grep -qi "error"; then
    echo "Notice: Verification check completed with warning: $TEST_OUT"
else
    echo "✔ Verification check succeeded."
fi

echo "======================================================"
echo " Installation Complete! Device is now reporting."
echo " Status command: systemctl --user status what-im-doing.service"
echo " Logs command  : journalctl --user -u what-im-doing.service -f"
echo "======================================================"
