#!/usr/bin/env bash
# ==============================================================================
# what-im-doing: Zero-Config Direct Registration via Cloudflare Wrangler
# Bypasses ADMIN_KEY and Cloudflare Access Tunnel Auth by writing directly
# into the Cloudflare D1 database using local Wrangler credentials.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "${SCRIPT_DIR}/../worker" 2>/dev/null && pwd || echo "")"
CONFIG_FILE="${HOME}/.config/what-im-doing.json"
REPORT_ENDPOINT="https://api.mango-mesa.ccwu.cc/activity/report"

# Auto-detect default chassis/device type
detect_device_type() {
    if [[ -r /sys/class/dmi/id/chassis_type ]]; then
        local chassis
        chassis=$(cat /sys/class/dmi/id/chassis_type 2>/dev/null || echo "")
        case "$chassis" in
            8|9|10|11|14|30|31|32) echo "laptop"; return 0 ;;
            17|23|28) echo "server"; return 0 ;;
            3|4|6|7) echo "desktop"; return 0 ;;
        esac
    fi
    if compgen -G "/sys/class/power_supply/BAT*" > /dev/null 2>&1; then
        echo "laptop"
        return 0
    fi
    echo "desktop"
}

detect_device_name() {
    local host="$(hostname)"
    if [[ -r /sys/class/dmi/id/product_name ]]; then
        local prod="$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "")"
        if [[ -n "$prod" && "$prod" != "System Product Name" && "$prod" != "To be filled by O.E.M." && "$prod" != "Default string" ]]; then
            echo "$prod"
            return 0
        fi
    fi
    echo "${host} (Linux)"
}

DEVICE_ID="$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
DEVICE_NAME="$(detect_device_name)"
DEVICE_TYPE="$(detect_device_type)"
DATABASE_NAME="what-im-doing-fleet"
PROXY_URL="${HTTPS_PROXY:-${https_proxy:-http://127.0.0.1:2080}}"
DRY_RUN=false

show_help() {
    cat <<EOF
what-im-doing: Direct Wrangler D1 Registration Tool

Usage:
  bash register-device-wrangler.sh [OPTIONS]

Options:
  --id <ID>          Device identifier (default: ${DEVICE_ID})
  --name <NAME>      Human-readable name (default: "${DEVICE_NAME}")
  --type <TYPE>      Device type: desktop | laptop | server | mobile (default: ${DEVICE_TYPE})
  --endpoint <URL>   Telemetry report URL (default: ${REPORT_ENDPOINT})
  --config <PATH>    Config output path (default: ${CONFIG_FILE})
  --proxy <URL>      HTTP/HTTPS proxy for wrangler (default: ${PROXY_URL})
  --dry-run          Simulate without writing to D1 or saving config
  --help, -h         Show this help message

Example:
  bash register-device-wrangler.sh --id debiansid --name "debiansid主机" --type server
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --id) DEVICE_ID="$2"; shift 2 ;;
        --name) DEVICE_NAME="$2"; shift 2 ;;
        --type) DEVICE_TYPE="$2"; shift 2 ;;
        --endpoint) REPORT_ENDPOINT="$2"; shift 2 ;;
        --config) CONFIG_FILE="$2"; shift 2 ;;
        --proxy) PROXY_URL="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "Unknown option: $1" >&2; show_help; exit 1 ;;
    esac
done

# Generate high-entropy device token (sk_dev_ + 24 hex)
TOKEN="sk_dev_$(node -e 'console.log(require("crypto").randomBytes(12).toString("hex"))')"
NOW_MS="$(date +%s%3N 2>/dev/null || node -e 'console.log(Date.now())')"

echo "======================================================"
echo " Direct Wrangler D1 Fleet Registration"
echo " (Zero ADMIN_KEY & Zero Cloudflare Access Token Required)"
echo "======================================================"
echo " Device ID    : ${DEVICE_ID}"
echo " Device Name  : ${DEVICE_NAME}"
echo " Device Type  : ${DEVICE_TYPE}"
echo " Generated Tok: ${TOKEN:0:10}****************"
echo " Report URL   : ${REPORT_ENDPOINT}"
echo " D1 Database  : ${DATABASE_NAME}"
echo " Target Config: ${CONFIG_FILE}"
echo "======================================================"

SQL="INSERT INTO devices (id, name, type, status, app_name, window_title, idle_seconds, token, last_seen, updated_at) VALUES ('${DEVICE_ID}', '${DEVICE_NAME}', '${DEVICE_TYPE}', 4, '', '', 0, '${TOKEN}', ${NOW_MS}, ${NOW_MS}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, token=excluded.token, updated_at=excluded.updated_at;"

if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would execute remote SQL on ${DATABASE_NAME}:"
    echo "  ${SQL}"
    exit 0
fi

echo "==> Enrolling device directly into remote Cloudflare D1..."
if [[ -n "$WORKER_DIR" && -d "$WORKER_DIR" ]]; then
    CWD_FLAG=(--cwd "$WORKER_DIR")
else
    CWD_FLAG=()
fi

https_proxy="$PROXY_URL" http_proxy="$PROXY_URL" npx wrangler d1 execute "${DATABASE_NAME}" "${CWD_FLAG[@]}" --command="${SQL}" --remote

mkdir -p "$(dirname "$CONFIG_FILE")"
cat > "$CONFIG_FILE" <<EOF
{
  "endpoint": "${REPORT_ENDPOINT}",
  "deviceId": "${DEVICE_ID}",
  "deviceName": "${DEVICE_NAME}",
  "deviceType": "${DEVICE_TYPE}",
  "token": "${TOKEN}",
  "cfAccessClientId": "",
  "cfAccessClientSecret": ""
}
EOF
chmod 0600 "$CONFIG_FILE"

echo ""
echo "✔ Device successfully registered in D1 database!"
echo "✔ Configuration written to ${CONFIG_FILE} (0600 permissions)."
echo ""
echo "To test reporting immediately:"
echo "  bash ${SCRIPT_DIR}/what-im-doing.sh --once"
