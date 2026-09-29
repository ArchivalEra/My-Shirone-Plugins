#!/usr/bin/env bash
# ==============================================================================
# what-im-doing: Machine Registration & Fleet Enrollment Tool (Linux Shell)
# Registers a new machine at the What-Im-Doing Hub, retrieves a device token,
# and generates/updates ~/.config/what-im-doing.json.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${HOME}/.config/what-im-doing.json"

# Auto-detect default chassis/device type
detect_device_type() {
    # 1. Check DMI chassis type
    if [[ -r /sys/class/dmi/id/chassis_type ]]; then
        local chassis
        chassis=$(cat /sys/class/dmi/id/chassis_type 2>/dev/null || echo "")
        case "$chassis" in
            8|9|10|11|14|30|31|32)
                echo "laptop"
                return 0
                ;;
            17|23|28)
                echo "server"
                return 0
                ;;
            3|4|6|7)
                echo "desktop"
                return 0
                ;;
        esac
    fi

    # 2. Check for battery power supply
    if compgen -G "/sys/class/power_supply/BAT*" > /dev/null 2>&1; then
        echo "laptop"
        return 0
    fi

    # 3. Check for headless server / container
    if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" && ! -d /run/user/$(id -u)/wayland-0 ]]; then
        if command -v systemd-detect-virt >/dev/null 2>&1 && systemd-detect-virt -q; then
            echo "server"
            return 0
        fi
    fi

    echo "desktop"
}

# Auto-detect friendly device name
detect_device_name() {
    local host
    host="$(hostname)"
    if [[ -r /sys/class/dmi/id/product_name ]]; then
        local prod
        prod="$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "")"
        if [[ -n "$prod" && "$prod" != "System Product Name" && "$prod" != "To be filled by O.E.M." && "$prod" != "Default string" ]]; then
            echo "$prod"
            return 0
        fi
    fi
    echo "${host} (Linux)"
}

# Defaults
HUB_URL=""
ADMIN_KEY=""
DEVICE_ID="$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
DEVICE_NAME="$(detect_device_name)"
DEVICE_TYPE="$(detect_device_type)"
CF_CLIENT_ID=""
CF_CLIENT_SECRET=""
AUTO_INSTALL=false
DRY_RUN=false

show_help() {
    cat <<EOF
what-im-doing: Machine Registration & Fleet Enrollment Tool

Usage:
  bash register-device.sh --hub <URL> --admin-key <KEY> [OPTIONS]

Required Options:
  --hub <URL>          Hub base URL or endpoint (e.g. https://api.mango-mesa.ccwu.cc)
  --admin-key <KEY>    Administrator secret key for Hub API access

Config Options:
  --id <ID>            Device identifier slug (default: ${DEVICE_ID})
  --name <NAME>        Human-readable device name (default: "${DEVICE_NAME}")
  --type <TYPE>        Device type: desktop | laptop | server | mobile | other (default: ${DEVICE_TYPE})
  --config <PATH>      Target config file path (default: ${CONFIG_FILE})
  --cf-id <ID>         Cloudflare Access Service Token Client ID (optional)
  --cf-secret <SECRET> Cloudflare Access Service Token Client Secret (optional)
  --install            Automatically install & start systemd user service after registration
  --dry-run            Simulate registration request without saving configuration
  --help, -h           Show this help message

Examples:
  # Register this machine and save config to ~/.config/what-im-doing.json
  bash register-device.sh --hub https://api.mango-mesa.ccwu.cc --admin-key "secret-admin-key"

  # Register and immediately install/activate the background service
  bash register-device.sh \\
    --hub https://api.mango-mesa.ccwu.cc \\
    --admin-key "secret-admin-key" \\
    --name "ThinkPad X1 Carbon" \\
    --type laptop \\
    --install
EOF
}

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --hub|--endpoint) HUB_URL="$2"; shift 2 ;;
        --admin-key) ADMIN_KEY="$2"; shift 2 ;;
        --id) DEVICE_ID="$2"; shift 2 ;;
        --name) DEVICE_NAME="$2"; shift 2 ;;
        --type) DEVICE_TYPE="$2"; shift 2 ;;
        --config) CONFIG_FILE="$2"; shift 2 ;;
        --cf-id) CF_CLIENT_ID="$2"; shift 2 ;;
        --cf-secret) CF_CLIENT_SECRET="$2"; shift 2 ;;
        --install) AUTO_INSTALL=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "Unknown option: $1" >&2; show_help; exit 1 ;;
    esac
done

if [[ -z "$HUB_URL" ]]; then
    echo "Error: --hub <URL> is required." >&2
    exit 1
fi

if [[ -z "$ADMIN_KEY" ]]; then
    echo "Error: --admin-key <KEY> is required." >&2
    exit 1
fi

# Sanitize HUB_URL
CLEAN_HUB="${HUB_URL%/}"
CLEAN_HUB="${CLEAN_HUB%/api/activity/report}"
CLEAN_HUB="${CLEAN_HUB%/activity/report}"
CLEAN_HUB="${CLEAN_HUB%/api/activity}"
CLEAN_HUB="${CLEAN_HUB%/activity}"
CLEAN_HUB="${CLEAN_HUB%/admin/devices}"
CLEAN_HUB="${CLEAN_HUB%/admin}"

REGISTRATION_ENDPOINT="${CLEAN_HUB}/admin/devices"
REPORT_ENDPOINT="${CLEAN_HUB}/activity/report"

echo "======================================================"
echo " What-Im-Doing Machine Registration"
echo "======================================================"
echo "Hub URL:      ${CLEAN_HUB}"
echo "Register URL: ${REGISTRATION_ENDPOINT}"
echo "Report URL:   ${REPORT_ENDPOINT}"
echo "Device ID:    ${DEVICE_ID}"
echo "Device Name:  ${DEVICE_NAME}"
echo "Device Type:  ${DEVICE_TYPE}"
echo "Target Conf:  ${CONFIG_FILE}"
echo "======================================================"

REQ_BODY=$(cat <<EOF
{"id":"${DEVICE_ID}","name":"${DEVICE_NAME}","type":"${DEVICE_TYPE}"}
EOF
)

if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would send POST to ${REGISTRATION_ENDPOINT}:"
    echo "  Headers: Authorization: Bearer <ADMIN_KEY>, x-admin-key: <ADMIN_KEY>"
    echo "  Body:    ${REQ_BODY}"
    exit 0
fi

# Build curl headers
CURL_HEADERS=(
    -H "Content-Type: application/json"
    -H "Authorization: Bearer ${ADMIN_KEY}"
    -H "x-admin-key: ${ADMIN_KEY}"
)

if [[ -n "$CF_CLIENT_ID" && -n "$CF_CLIENT_SECRET" ]]; then
    CURL_HEADERS+=(
        -H "CF-Access-Client-Id: ${CF_CLIENT_ID}"
        -H "CF-Access-Client-Secret: ${CF_CLIENT_SECRET}"
    )
fi

echo "==> Registering device with Hub..."
TMP_RESP=$(mktemp)
trap 'rm -f "$TMP_RESP"' EXIT

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$TMP_RESP" \
    -X POST "${REGISTRATION_ENDPOINT}" \
    "${CURL_HEADERS[@]}" \
    -d "$REQ_BODY" || echo "000")

RESP_BODY=$(cat "$TMP_RESP" 2>/dev/null || echo "")

if [[ ! "$HTTP_CODE" =~ ^2 ]]; then
    echo "Error: Registration failed with HTTP ${HTTP_CODE}." >&2
    echo "Response: ${RESP_BODY}" >&2
    exit 1
fi

# Extract token from response
TOKEN=""
if command -v jq >/dev/null 2>&1; then
    TOKEN=$(jq -r '.device.token // .token // empty' <<< "$RESP_BODY" 2>/dev/null || true)
fi

if [[ -z "$TOKEN" ]]; then
    TOKEN=$(grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' <<< "$RESP_BODY" | head -n 1 | sed -E 's/"token"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' || true)
fi

if [[ -z "$TOKEN" ]]; then
    echo "Error: Failed to parse device token from Hub response." >&2
    echo "Response: ${RESP_BODY}" >&2
    exit 1
fi

echo "✓ Registration successful!"
echo "  Assigned Token: ${TOKEN:0:10}****************"

# Prepare JSON config directory and file
mkdir -p "$(dirname "$CONFIG_FILE")"

cat > "$CONFIG_FILE" <<EOF
{
  "endpoint": "${REPORT_ENDPOINT}",
  "deviceId": "${DEVICE_ID}",
  "deviceName": "${DEVICE_NAME}",
  "deviceType": "${DEVICE_TYPE}",
  "token": "${TOKEN}",
  "cfAccessClientId": "${CF_CLIENT_ID}",
  "cfAccessClientSecret": "${CF_CLIENT_SECRET}"
}
EOF

chmod 0600 "$CONFIG_FILE"
echo "✓ Configuration saved to: ${CONFIG_FILE} (permissions: 0600)"

# Auto-install if requested
if [[ "$AUTO_INSTALL" == true ]]; then
    if [[ -x "${SCRIPT_DIR}/install.sh" ]]; then
        echo ""
        echo "==> Automatically invoking install.sh..."
        bash "${SCRIPT_DIR}/install.sh"
    else
        echo "Warning: install.sh not found at ${SCRIPT_DIR}/install.sh; skipping auto-install." >&2
    fi
else
    echo ""
    echo "Next steps:"
    echo "  1. Test probe:      bash ${SCRIPT_DIR}/what-im-doing.sh --dry-run"
    echo "  2. Test telemetry:  bash ${SCRIPT_DIR}/what-im-doing.sh --once"
    echo "  3. Install service: bash ${SCRIPT_DIR}/install.sh"
fi
