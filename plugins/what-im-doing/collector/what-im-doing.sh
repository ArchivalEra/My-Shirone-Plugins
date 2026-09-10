#!/usr/bin/env bash
# ==============================================================================
# what-im-doing: Pure Linux Shell Activity Collector (KDE 6.7 / Wayland)
# Zero Node.js runtime, zero RAM overhead, 100% native Linux.
# Compatible with Mix Space / Shiro (ProcessReporter) and What-Im-Doing specs.
# ==============================================================================

set -euo pipefail

# Configuration (override via env or /etc/what-im-doing.conf / ~/.config/what-im-doing.conf)
ENDPOINT="${ENDPOINT:-https://activity.isui.ren/api/activity}"
AUTH_TOKEN="${AUTH_TOKEN:-${API_KEY:-}}"
DEVICE_ID="${DEVICE_ID:-$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')}"
DEVICE_NAME="${DEVICE_NAME:-$(hostname) (KDE 6.7 Wayland)}"
INTERVAL="${INTERVAL:-15}"

# Load user config if present
if [[ -f "${HOME}/.config/what-im-doing.conf" ]]; then
    # shellcheck disable=SC1091
    source "${HOME}/.config/what-im-doing.conf"
fi

# Detect available D-Bus CLI for KDE 6 / Qt 6
DBUS_CMD=""
if command -v qdbus6 &>/dev/null; then
    DBUS_CMD="qdbus6"
elif command -v qdbus &>/dev/null; then
    DBUS_CMD="qdbus"
fi

get_active_app_and_title() {
    local app=""
    local title=""

    # Strategy 1: kdotool on KDE Wayland
    if command -v kdotool &>/dev/null; then
        local wid
        wid=$(kdotool getactivewindow 2>/dev/null || true)
        if [[ -n "$wid" ]]; then
            title=$(kdotool getwindowname "$wid" 2>/dev/null || true)
            app=$(kdotool getwindowclassname "$wid" 2>/dev/null || true)
        fi
    fi

    # Strategy 2: qdbus6 / qdbus KWin activeClient
    if [[ -z "$app" && -n "$DBUS_CMD" ]]; then
        local kwin_client
        kwin_client=$($DBUS_CMD org.kde.KWin /KWin org.kde.KWin.activeClient 2>/dev/null || true)
        if [[ -n "$kwin_client" ]]; then
            title=$($DBUS_CMD org.kde.KWin /KWin org.kde.KWin.queryWindowInfo "$kwin_client" 2>/dev/null || true)
            app=$(echo "$title" | awk -F ' — | - ' '{print $NF}')
        fi
    fi

    # Strategy 3: Top CPU user GUI process fallback
    if [[ -z "$app" ]]; then
        app=$(ps -u "$USER" -o comm= --sort=-%cpu 2>/dev/null | grep -vE 'ps|grep|qdbus|qdbus6|sh|bash|zsh|systemd|kdotool|curl' | head -n 1 || echo "Desktop")
        title="${app} (Foreground)"
    fi

    # Format common app names cleanly
    case "$app" in
        *antigravity*|*Antigravity*) app="Antigravity" ;;
        *chrome*|*google-chrome*)    app="Google Chrome" ;;
        *firefox*)                   app="Firefox" ;;
        *code*|*Code*)               app="Visual Studio Code" ;;
        *alacritty*|*kitty*|*konsole*) app="Terminal" ;;
    esac

    echo "${app}:::${title}"
}

get_idle_seconds() {
    local idle_ms=0
    if [[ -n "$DBUS_CMD" ]]; then
        idle_ms=$($DBUS_CMD org.freedesktop.ScreenSaver /ScreenSaver org.freedesktop.ScreenSaver.GetActiveTime 2>/dev/null || echo 0)
    fi
    echo $(( idle_ms / 1000 ))
}

get_media_info() {
    local m_title=""
    local m_artist=""

    if command -v playerctl &>/dev/null; then
        local status
        status=$(playerctl status 2>/dev/null || true)
        if [[ "$status" == "Playing" ]]; then
            m_title=$(playerctl metadata title 2>/dev/null || true)
            m_artist=$(playerctl metadata artist 2>/dev/null || true)
        fi
    fi

    echo "${m_title}:::${m_artist}"
}

get_os_info() {
    local os="Linux"
    if [[ -f /etc/os-release ]]; then
        os=$(grep -E '^(PRETTY_NAME|NAME)=' /etc/os-release | head -n 1 | cut -d= -f2 | tr -d '"')
    fi
    echo "${os} / Wayland (KDE 6.7)"
}

send_activity() {
    local raw_info
    raw_info=$(get_active_app_and_title)
    local app="${raw_info%%:::*}"
    local title="${raw_info##*:::}"

    local raw_media
    raw_media=$(get_media_info)
    local media_title="${raw_media%%:::*}"
    local media_artist="${raw_media##*:::}"

    local idle
    idle=$(get_idle_seconds)
    local os_info
    os_info=$(get_os_info)
    local timestamp
    timestamp=$(date +%s%3N)

    local status=1 # ACTIVE
    if [[ "$idle" -gt 1800 ]]; then
        status=3 # AWAY
    elif [[ "$idle" -gt 180 ]]; then
        status=2 # IDLE
    fi

    # Escape JSON strings safely
    local safe_title
    safe_title=$(printf '%s' "$title" | sed 's/"/\\"/g')
    local safe_app
    safe_app=$(printf '%s' "$app" | sed 's/"/\\"/g')
    local safe_media_title
    safe_media_title=$(printf '%s' "$media_title" | sed 's/"/\\"/g')
    local safe_media_artist
    safe_media_artist=$(printf '%s' "$media_artist" | sed 's/"/\\"/g')

    # Media block
    local media_block="null"
    if [[ -n "$media_title" ]]; then
        media_block="{\"title\":\"${safe_media_title}\",\"artist\":\"${safe_media_artist}\",\"isPlaying\":true}"
    fi

    # Construct payload compatible with both What-Im-Doing and Mix Space / Shiro (ProcessReporter)
    local json_payload
    json_payload=$(cat <<EOF
{
  "timestamp": ${timestamp},
  "deviceId": "${DEVICE_ID}",
  "device_id": "${DEVICE_ID}",
  "deviceName": "${DEVICE_NAME}",
  "device": "${DEVICE_NAME}",
  "appName": "${safe_app}",
  "process_name": "${safe_app}",
  "process": "${safe_app}",
  "windowTitle": "${safe_title}",
  "window_title": "${safe_title}",
  "status": ${status},
  "osInfo": "${os_info}",
  "idleSeconds": ${idle},
  "idle_seconds": ${idle},
  "media_title": "${safe_media_title}",
  "media_artist": "${safe_media_artist}",
  "media": ${media_block}
}
EOF
)

    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        echo "[what-im-doing: dry-run] Destination: ${ENDPOINT}"
        echo "[what-im-doing: dry-run] Payload:"
        echo "${json_payload}"
        return 0
    fi

    local auth_header=()
    if [[ -n "${AUTH_TOKEN}" ]]; then
        auth_header=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi

    curl -sS -X POST "${ENDPOINT}" \
        -H "Content-Type: application/json" \
        "${auth_header[@]}" \
        -d "${json_payload}" >/dev/null || true
}

# Main loop
MODE="${1:-}"

if [[ "$MODE" == "--dry-run" ]]; then
    DRY_RUN=true send_activity
    exit 0
fi

if [[ "$MODE" == "--once" ]]; then
    send_activity
    exit 0
fi

while true; do
    send_activity
    sleep "${INTERVAL}"
done
