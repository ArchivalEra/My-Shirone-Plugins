#!/usr/bin/env bash
# ==============================================================================
# what-im-doing: Pure Linux Shell Activity Collector (KDE 6 / Wayland / X11)
# Zero Node.js runtime, sub-0.1s execution, diffing throttle & heartbeat.
# ==============================================================================

set -euo pipefail

# 1. Defaults
ENDPOINT="${ENDPOINT:-https://activity.example.com/api/activity/report}"
AUTH_TOKEN="${AUTH_TOKEN:-${API_KEY:-}}"
DEVICE_ID="${DEVICE_ID:-$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')}"
DEVICE_NAME="${DEVICE_NAME:-$(hostname) (Linux)}"
DEVICE_TYPE="${DEVICE_TYPE:-desktop}"
CF_CLIENT_ID="${CF_ACCESS_CLIENT_ID:-}"
CF_CLIENT_SECRET="${CF_ACCESS_CLIENT_SECRET:-}"
INTERVAL="${INTERVAL:-15}"
HEARTBEAT_SECS="${HEARTBEAT_SECS:-60}"
STATE_FILE="/tmp/wid_state_${USER}_${DEVICE_ID}"

# Helper to extract JSON string value via sed/grep (no jq requirement)
extract_json_val() {
    local key="$1"
    local file="$2"
    if [[ -f "$file" ]]; then
        grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" 2>/dev/null | head -n 1 | sed -E "s/\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"/\1/" || true
    fi
}

# 2. Load Configuration from JSON (highest priority) or conf file
USER_JSON_CONF="${HOME}/.config/what-im-doing.json"
ETC_JSON_CONF="/etc/what-im-doing/config.json"
USER_SH_CONF="${HOME}/.config/what-im-doing.conf"

CONF_FILE=""
if [[ -f "$USER_JSON_CONF" ]]; then
    CONF_FILE="$USER_JSON_CONF"
elif [[ -f "$ETC_JSON_CONF" ]]; then
    CONF_FILE="$ETC_JSON_CONF"
fi

if [[ -n "$CONF_FILE" ]]; then
    cfg_ep=$(extract_json_val "endpoint" "$CONF_FILE")
    cfg_token=$(extract_json_val "token" "$CONF_FILE")
    [[ -z "$cfg_token" ]] && cfg_token=$(extract_json_val "authToken" "$CONF_FILE")
    cfg_id=$(extract_json_val "deviceId" "$CONF_FILE")
    [[ -z "$cfg_id" ]] && cfg_id=$(extract_json_val "id" "$CONF_FILE")
    cfg_name=$(extract_json_val "deviceName" "$CONF_FILE")
    [[ -z "$cfg_name" ]] && cfg_name=$(extract_json_val "name" "$CONF_FILE")
    cfg_type=$(extract_json_val "deviceType" "$CONF_FILE")
    [[ -z "$cfg_type" ]] && cfg_type=$(extract_json_val "type" "$CONF_FILE")
    cfg_cid=$(extract_json_val "cfAccessClientId" "$CONF_FILE")
    cfg_csec=$(extract_json_val "cfAccessClientSecret" "$CONF_FILE")

    [[ -n "$cfg_ep" ]] && ENDPOINT="$cfg_ep"
    [[ -n "$cfg_token" ]] && AUTH_TOKEN="$cfg_token"
    [[ -n "$cfg_id" ]] && DEVICE_ID="$cfg_id"
    [[ -n "$cfg_name" ]] && DEVICE_NAME="$cfg_name"
    [[ -n "$cfg_type" ]] && DEVICE_TYPE="$cfg_type"
    [[ -n "$cfg_cid" ]] && CF_CLIENT_ID="$cfg_cid"
    [[ -n "$cfg_csec" ]] && CF_CLIENT_SECRET="$cfg_csec"
    STATE_FILE="/tmp/wid_state_${USER}_${DEVICE_ID}"
elif [[ -f "$USER_SH_CONF" ]]; then
    # shellcheck disable=SC1090
    source "$USER_SH_CONF"
    STATE_FILE="/tmp/wid_state_${USER}_${DEVICE_ID}"
fi

# Detect available D-Bus CLI for KDE 6 / Qt 6
DBUS_CMD=""
if command -v qdbus6 &>/dev/null; then
    DBUS_CMD="qdbus6"
elif command -v qdbus &>/dev/null; then
    DBUS_CMD="qdbus"
fi

get_active_process() {
    local proc=""

    # Strategy 1: kdotool (Wayland/X11 helper if installed)
    if command -v kdotool &>/dev/null; then
        local wid
        wid=$(kdotool getactivewindow 2>/dev/null || true)
        if [[ -n "$wid" ]]; then
            proc=$(kdotool getwindowclassname "$wid" 2>/dev/null || true)
        fi
    fi

    # Strategy 2: KDE 6 KWin Scripting via D-Bus (resourceClass)
    if [[ -z "$proc" && -n "$DBUS_CMD" ]]; then
        local tmp_script="/tmp/wid_kwin_$$.js"
        echo 'if (workspace.activeWindow) { print("WID_PROC:" + (workspace.activeWindow.resourceClass || "")); } else { print("WID_PROC:desktop"); }' > "$tmp_script"
        local plugin_name="wid_active_$$"
        $DBUS_CMD org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$tmp_script" "$plugin_name" >/dev/null 2>&1 || true
        $DBUS_CMD org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null 2>&1 || true
        $DBUS_CMD org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$plugin_name" >/dev/null 2>&1 || true
        rm -f "$tmp_script"

        proc=$(journalctl --user -u plasma-kwin_wayland -n 15 --no-pager 2>/dev/null | grep -a "WID_PROC:" | tail -n 1 | sed 's/.*WID_PROC://' | tr -d '\r\n' || true)
    fi

    # Strategy 3: Foreground top process fallback
    if [[ -z "$proc" ]]; then
        proc=$(ps -u "$USER" -o comm= --sort=-%cpu 2>/dev/null | grep -vE 'ps|grep|qdbus|qdbus6|sh|bash|zsh|systemd|kdotool|curl' | head -n 1 || echo "desktop")
    fi

    # Strip any invalid characters, fallback to desktop if empty
    proc=$(echo "$proc" | tr -cd 'a-zA-Z0-9_.-')
    [[ -z "$proc" ]] && proc="desktop"

    echo "$proc"
}

get_idle_seconds() {
    local idle_ms=0
    if [[ -n "$DBUS_CMD" ]]; then
        idle_ms=$($DBUS_CMD org.freedesktop.ScreenSaver /ScreenSaver org.freedesktop.ScreenSaver.GetActiveTime 2>/dev/null || echo 0)
    fi
    echo $(( idle_ms / 1000 ))
}

get_os_info() {
    local os="Linux"
    if [[ -f /etc/os-release ]]; then
        os=$(grep -E '^(PRETTY_NAME|NAME)=' /etc/os-release | head -n 1 | cut -d= -f2 | tr -d '"')
    fi
    echo "${os} / Wayland (KDE 6)"
}

get_media_info() {
    local media_title=""
    local media_artist=""

    if command -v playerctl &>/dev/null; then
        local p_status
        p_status=$(playerctl status 2>/dev/null || true)
        if [[ "$p_status" == "Playing" ]]; then
            media_title=$(playerctl metadata title 2>/dev/null || true)
            media_artist=$(playerctl metadata artist 2>/dev/null || true)
        fi
    fi

    echo "${media_title}:::${media_artist}"
}

send_activity() {
    local proc
    proc=$(get_active_process)

    local idle
    idle=$(get_idle_seconds)

    local status=1 # ACTIVE
    if [[ "$idle" -gt 1800 ]]; then
        status=3 # AWAY
    elif [[ "$idle" -gt 180 ]]; then
        status=2 # IDLE
    fi

    local media_info
    media_info=$(get_media_info)
    local media_title="${media_info%%:::*}"
    local media_artist="${media_info##*:::}"

    local now_sec
    now_sec=$(date +%s)
    local now_ms
    now_ms=$(( now_sec * 1000 ))

    # 3. State Diffing & Heartbeat Suppression (keyed by process + status + media)
    local current_state_key="${proc}:::${status}:::${media_title}"
    local last_state_key=""
    local last_sent_sec=0

    if [[ -f "$STATE_FILE" ]]; then
        # Format: timestamp_sec:::state_key
        local saved_line
        saved_line=$(cat "$STATE_FILE" 2>/dev/null || true)
        last_sent_sec="${saved_line%%:::*}"
        last_state_key="${saved_line#*:::}"
    fi

    local elapsed=$(( now_sec - last_sent_sec ))

    # If state is identical AND within heartbeat window -> SKIP
    if [[ "$current_state_key" == "$last_state_key" && "$elapsed" -lt "$HEARTBEAT_SECS" ]]; then
        if [[ "${VERBOSE:-false}" == "true" ]]; then
            echo "[what-im-doing] State unchanged (${elapsed}s elapsed < ${HEARTBEAT_SECS}s). Throttled."
        fi
        return 0
    fi

    # Escape JSON strings safely
    local safe_proc
    safe_proc=$(printf '%s' "$proc" | sed 's/\\/\\\\/g; s/"/\\"/g')
    local safe_name
    safe_name=$(printf '%s' "$DEVICE_NAME" | sed 's/\\/\\\\/g; s/"/\\"/g')
    local safe_media_title
    safe_media_title=$(printf '%s' "$media_title" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/ /g')
    local safe_media_artist
    safe_media_artist=$(printf '%s' "$media_artist" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/ /g')
    local os_info
    os_info=$(get_os_info)

    local json_payload
    json_payload=$(cat <<JSON_EOF
{
  "id": "${DEVICE_ID}",
  "name": "${safe_name}",
  "type": "${DEVICE_TYPE}",
  "status": ${status},
  "appName": "${safe_proc}",
  "windowTitle": "",
  "idleSeconds": ${idle},
  "osInfo": "${os_info}",
  "mediaTitle": "${safe_media_title}",
  "mediaArtist": "${safe_media_artist}",
  "timestamp": ${now_ms}
}
JSON_EOF
)

    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        echo "[what-im-doing: dry-run] Destination: ${ENDPOINT}"
        echo "[what-im-doing: dry-run] Payload:"
        echo "${json_payload}"
        return 0
    fi

    local headers=(-H "Content-Type: application/json")
    if [[ -n "${AUTH_TOKEN}" ]]; then
        headers+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi
    if [[ -n "${CF_CLIENT_ID}" && -n "${CF_CLIENT_SECRET}" ]]; then
        headers+=(-H "CF-Access-Client-Id: ${CF_CLIENT_ID}")
        headers+=(-H "CF-Access-Client-Secret: ${CF_CLIENT_SECRET}")
    fi

    # Send outbound report (timeout 3s)
    local http_code
    http_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 -X POST "${ENDPOINT}" \
        "${headers[@]}" \
        -d "${json_payload}" 2>/dev/null || echo "000")

    if [[ "$http_code" =~ ^2 ]]; then
        # Save state upon successful transmission
        echo "${now_sec}:::${current_state_key}" > "$STATE_FILE"
        if [[ "${VERBOSE:-false}" == "true" ]]; then
            echo "[what-im-doing] Report sent successfully (HTTP ${http_code}) at $(date +%T)"
        fi
    else
        echo "[what-im-doing] Warning: Report failed with HTTP code ${http_code}" >&2
    fi
}

MODE="${1:-}"

if [[ "$MODE" == "--dry-run" ]]; then
    DRY_RUN=true send_activity
    exit 0
fi

if [[ "$MODE" == "--once" ]]; then
    send_activity
    exit 0
fi

if [[ "$MODE" == "--verbose" ]]; then
    VERBOSE=true send_activity
    exit 0
fi

while true; do
    send_activity
    sleep "${INTERVAL}"
done
