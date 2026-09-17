#!/usr/bin/env bash
#
# Thei backup client for Linux and macOS.
#
# Pulls content/ off a Thei instance over its backup API and keeps a rotating
# set of copies on this machine. Needs nothing but bash and curl, which every
# Linux server, NAS and Mac already has.
#
#   ./thei-backup.sh                  interactive menu
#   ./thei-backup.sh --run            back up now, as a manual copy
#   ./thei-backup.sh --run --auto     back up if a week has passed
#   ./thei-backup.sh --run --force    back up even if the site shrank sharply
#   ./thei-backup.sh --status         print the current state and exit
#   ./thei-backup.sh --config <path>  use a different settings file
#
# Downloaded from the admin panel, the site address (and a freshly generated
# token) are already filled in below.

set -u

DEFAULT_SITE_URL='__THEI_SITE_URL__'
DEFAULT_TOKEN='__THEI_BACKUP_TOKEN__'

WEEK_SECONDS=$((7 * 24 * 60 * 60))
PARALLEL_DOWNLOADS=6
AUTO_KEEP=3
# A run stops instead of rotating out an old copy when the site lost more than
# this share of its files or bytes since the last backup.
SHRINK_ALERT_PERCENT=30
UNIT_NAME='thei-backup'
LAUNCHD_LABEL='net.thei.backup'
CRON_MARK='# thei-backup'

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
CONFIG_PATH="$SCRIPT_DIR/thei-backup.conf"

# ---------------------------------------------------------------- output

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
  C_INVERSE=$'\033[7m'
else
  C_RESET='' C_BOLD='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_CYAN='' C_INVERSE=''
fi

say() { printf '%s\n' "${1:-}"; }
info() { printf '%s·%s %s\n' "$C_DIM" "$C_RESET" "$1"; }
ok() { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1" >&2; }
fail() { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$1" >&2; }

human_size() {
  awk -v bytes="${1:-0}" 'BEGIN {
    split("B KB MB GB TB", units, " ")
    unit = 1
    while (bytes >= 1024 && unit < 5) { bytes /= 1024; unit++ }
    if (unit > 1 && bytes < 10) printf "%.1f %s", bytes, units[unit]
    else printf "%d %s", bytes + 0.5, units[unit]
  }'
}

now_seconds() { date +%s; }

human_ago() {
  local then_ms="${1:-0}"
  if [ "$then_ms" = "0" ] || [ -z "$then_ms" ]; then
    printf 'never'
    return
  fi
  local days=$((($(now_seconds) - then_ms / 1000) / 86400))
  if [ "$days" -le 0 ]; then
    printf 'today'
  elif [ "$days" -eq 1 ]; then
    printf 'yesterday'
  else
    printf '%d days ago' "$days"
  fi
}

# Sortable, filename-safe and unambiguous across time zones.
stamp_from_ms() {
  local seconds=$((${1:-0} / 1000))
  date -u -d "@$seconds" +%Y%m%dT%H%M%SZ 2>/dev/null ||
    date -u -r "$seconds" +%Y%m%dT%H%M%SZ 2>/dev/null ||
    date -u +%Y%m%dT%H%M%SZ
}

local_time_from_ms() {
  local seconds=$((${1:-0} / 1000))
  date -d "@$seconds" '+%Y-%m-%d %H:%M' 2>/dev/null ||
    date -r "$seconds" '+%Y-%m-%d %H:%M' 2>/dev/null ||
    printf '%s' "$seconds"
}

file_size() { wc -c <"$1" 2>/dev/null | tr -d ' '; }

# ---------------------------------------------------------------- settings

CFG_siteUrl=''
CFG_token=''
CFG_destination=''
CFG_clientLabel=''
CFG_lastRunAt=0
CFG_lastFileCount=0
CFG_lastByteCount=0
CFG_alert=''

CONFIG_KEYS='siteUrl token destination clientLabel lastRunAt lastFileCount lastByteCount alert'

placeholder() { case "$1" in __THEI_*__) return 0 ;; *) return 1 ;; esac; }

read_config() {
  if [ -f "$CONFIG_PATH" ]; then
    local key value
    while IFS='=' read -r key value || [ -n "$key" ]; do
      case " $CONFIG_KEYS " in
      *" $key "*) printf -v "CFG_$key" '%s' "$value" ;;
      esac
    done <"$CONFIG_PATH"
  else
    placeholder "$DEFAULT_SITE_URL" || CFG_siteUrl="$DEFAULT_SITE_URL"
    placeholder "$DEFAULT_TOKEN" || CFG_token="$DEFAULT_TOKEN"
  fi
}

write_config() {
  mkdir -p "$(dirname "$CONFIG_PATH")"
  local temp="$CONFIG_PATH.$$.tmp" key value
  (
    umask 077
    for key in $CONFIG_KEYS; do
      eval "value=\${CFG_$key}"
      printf '%s=%s\n' "$key" "$value"
    done >"$temp"
  ) && mv -f "$temp" "$CONFIG_PATH"
  rm -f "$temp"
}

config_complete() {
  [ -n "$CFG_siteUrl" ] && [ -n "$CFG_token" ] && [ -n "$CFG_destination" ]
}

site_base() { printf '%s' "${CFG_siteUrl%/}"; }

destination_path() {
  case "$CFG_destination" in
  "~"*) printf '%s%s' "$HOME" "${CFG_destination#\~}" ;;
  /*) printf '%s' "$CFG_destination" ;;
  *) printf '%s/%s' "$SCRIPT_DIR" "$CFG_destination" ;;
  esac
}

# ---------------------------------------------------------------------- api

WORK_DIR=''
HEADER_FILE=''

cleanup() {
  printf '%s' "$C_RESET"
  [ -t 1 ] && printf '\033[?25h'
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

prepare_work_dir() {
  [ -n "$WORK_DIR" ] && return
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/thei-backup.XXXXXX")"
  HEADER_FILE="$WORK_DIR/headers"
  # The token goes through a file, so it never shows up in `ps`.
  (umask 077 && printf 'x-thei-backup-token: %s\n' "$CFG_token" >"$HEADER_FILE")
}

API_STATUS=''

# api METHOD PATH OUTPUT [curl args...] — sets API_STATUS, fails on non-2xx.
api() {
  local method="$1" path="$2" output="$3"
  shift 3
  prepare_work_dir
  API_STATUS="$(curl -sS -X "$method" -H @"$HEADER_FILE" -o "$output" \
    -w '%{http_code}' "$@" "$(site_base)$path")" || {
    API_STATUS='000'
    return 1
  }
  case "$API_STATUS" in 2??) return 0 ;; *) return 1 ;; esac
}

api_error() {
  local body="$1"
  local detail=''
  [ -f "$body" ] && detail="$(head -c 200 "$body" | tr '\n' ' ')"
  printf '%s failed: HTTP %s %s' "$2" "$API_STATUS" "$detail"
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r'
}

# ------------------------------------------------------------------- backup

SESSION_ID=''
SESSION_FILES=0
SESSION_BYTES=0

open_session() {
  local kind="$1" body="$WORK_DIR/session"
  local payload="{\"kind\":\"$kind\""
  [ -n "$CFG_clientLabel" ] &&
    payload="$payload,\"clientLabel\":\"$(json_escape "$CFG_clientLabel")\""
  payload="$payload}"
  api POST '/api/backup/session?format=text' "$body" \
    -H 'content-type: application/json' --data "$payload" || {
    fail "$(api_error "$body" 'Opening a session')"
    return 1
  }
  local field value skipped=''
  while IFS="$(printf '\t')" read -r field value; do
    case "$field" in
    sessionId) SESSION_ID="$value" ;;
    totalFiles) SESSION_FILES="$value" ;;
    totalBytes) SESSION_BYTES="$value" ;;
    skipped) skipped="$skipped${skipped:+, }$value" ;;
    esac
  done <"$body"
  [ -n "$SESSION_ID" ] || {
    fail 'The site answered without a session.'
    return 1
  }
  [ -n "$skipped" ] && warn "Not part of a backup, left in place: $skipped"
  info "$SESSION_FILES file(s), $(human_size "$SESSION_BYTES")"
}

abandon_session() {
  [ -n "$SESSION_ID" ] || return 0
  api DELETE "/api/backup/session/$SESSION_ID" /dev/null || true
}

# Percent lost from $1 to $2, or 0 when nothing was lost.
shrink_percent() {
  local before="$1" after="$2"
  if [ "$before" -le 0 ] || [ "$after" -ge "$before" ]; then
    printf '0'
  else
    printf '%d' $(((before - after) * 100 / before))
  fi
}

SHRINK_REPORT=''

site_shrank() {
  [ "${CFG_lastFileCount:-0}" -gt 0 ] || return 1
  local files bytes
  files="$(shrink_percent "$CFG_lastFileCount" "$SESSION_FILES")"
  bytes="$(shrink_percent "$CFG_lastByteCount" "$SESSION_BYTES")"
  if [ "$files" -gt "$SHRINK_ALERT_PERCENT" ] || [ "$bytes" -gt "$SHRINK_ALERT_PERCENT" ]; then
    SHRINK_REPORT="files $CFG_lastFileCount → $SESSION_FILES (-$files%), size $(human_size "$CFG_lastByteCount") → $(human_size "$SESSION_BYTES") (-$bytes%)"
    return 0
  fi
  return 1
}

notify_alert() {
  local message="$1" destination
  destination="$(destination_path)"
  mkdir -p "$destination" 2>/dev/null
  {
    say "Thei backup stopped on $(date)."
    say
    say "$message"
    say
    say 'No copy was made and no old copy was removed. If the site really'
    say 'lost this much on purpose, run the backup client and choose'
    say '"Back up anyway" to accept the new size.'
  } >"$destination/ALERT.txt" 2>/dev/null

  command -v logger >/dev/null 2>&1 && logger -t thei-backup "$message"
  if [ "$(uname)" = 'Darwin' ]; then
    osascript -e "display notification \"$(json_escape "$message")\" with title \"Thei backup stopped\"" >/dev/null 2>&1
  else
    command -v notify-send >/dev/null 2>&1 &&
      notify-send -u critical 'Thei backup stopped' "$message" >/dev/null 2>&1
    command -v wall >/dev/null 2>&1 &&
      printf 'Thei backup stopped: %s\n' "$message" | wall >/dev/null 2>&1
  fi
}

clear_alert() {
  CFG_alert=''
  rm -f "$(destination_path)/ALERT.txt" 2>/dev/null
}

# Newest first: every earlier copy and unfinished staging can supply files.
reuse_sources() {
  local destination="$1"
  (cd "$destination" 2>/dev/null && ls -1d auto-* manual-* .tmp-* 2>/dev/null) |
    sort -r | while IFS= read -r name; do
    [ -d "$destination/$name" ] && printf '%s\n' "$destination/$name"
  done
}

clone_file() {
  # Copy-on-write where the filesystem can, a plain copy where it cannot.
  cp --reflink=auto "$1" "$2" 2>/dev/null || cp -c "$1" "$2" 2>/dev/null ||
    cp "$1" "$2"
}

# Worker run by xargs: fetch one file into the staging directory.
download_one() {
  local size="$1" path="$2"
  local target="$STAGING/$path"
  local part="$target.part"
  mkdir -p "$(dirname "$target")"
  if [ -f "$part" ]; then
    local have
    have="$(file_size "$part")"
    [ "${have:-0}" -gt "$size" ] && rm -f "$part"
  fi
  local status
  if [ -f "$part" ] && [ "$(file_size "$part")" = "$size" ]; then
    status=200
  else
    status="$(curl -sS -H @"$HEADER_FILE" -C - -o "$part" -w '%{http_code}' \
      -G --data-urlencode "path=$path" \
      "$SITE_BASE/api/backup/session/$SESSION_ID/file" 2>/dev/null)" ||
      status="${status:-000}"
  fi
  case "$status" in
  200 | 206 | 416)
    if [ "$(file_size "$part")" = "$size" ]; then
      mv -f "$part" "$target"
      printf 'ok %s\n' "$size" >>"$RESULTS"
    else
      printf 'fail %s %s\n' "$status" "$path" >>"$RESULTS"
    fi
    ;;
  404)
    # Reclaimed by the site's own cleanup after the snapshot: garbage the
    # snapshot does not depend on.
    rm -f "$part"
    printf 'gone\n' >>"$RESULTS"
    ;;
  *)
    rm -f "$part"
    printf 'fail %s %s\n' "$status" "$path" >>"$RESULTS"
    ;;
  esac
}

progress_line() {
  local done="$1" total="$2" bytes="$3" reused="$4"
  local percent=100
  [ "$total" -gt 0 ] && percent=$((done * 100 / total))
  printf '\r  %s%3d%%%s  %d/%d  %s  %sreused %d%s   ' \
    "$C_CYAN" "$percent" "$C_RESET" "$done" "$total" "$(human_size "$bytes")" \
    "$C_DIM" "$reused" "$C_RESET"
}

perform_backup() {
  local kind="$1" force="$2"
  prepare_work_dir
  local destination
  destination="$(destination_path)"
  mkdir -p "$destination" || {
    fail "Cannot create $destination"
    return 1
  }

  info "Opening a session on $CFG_siteUrl"
  SESSION_ID=''
  open_session "$kind" || return 1

  if [ "$force" != 'yes' ] && site_shrank; then
    abandon_session
    CFG_alert="$(date -u +%Y-%m-%dT%H:%MZ) $SHRINK_REPORT"
    write_config
    say
    printf '%s%s  THE SITE SHRANK SINCE THE LAST BACKUP  %s\n' "$C_BOLD" "$C_INVERSE$C_RED" "$C_RESET"
    say "  $SHRINK_REPORT"
    say '  Nothing was copied and no old copy was rotated out.'
    say '  Check the site. If this is expected, choose "Back up anyway".'
    notify_alert "The site shrank since the last backup: $SHRINK_REPORT"
    return 2
  fi

  STAGING="$destination/.tmp-$SESSION_ID"
  RESULTS="$WORK_DIR/results"
  SITE_BASE="$(site_base)"
  mkdir -p "$STAGING"
  : >"$RESULTS"
  export STAGING RESULTS SITE_BASE SESSION_ID HEADER_FILE
  export -f download_one file_size

  local sources queue="$WORK_DIR/queue" reused=0 reused_bytes=0
  sources="$(reuse_sources "$destination" | grep -v "/.tmp-$SESSION_ID\$")"
  : >"$queue"

  local cursor='' page="$WORK_DIR/manifest" kind_field size path
  while :; do
    local query='format=text'
    [ -n "$cursor" ] && query="$query&cursor=$cursor"
    api GET "/api/backup/session/$SESSION_ID/manifest?$query" "$page" || {
      fail "$(api_error "$page" 'Reading the file list')"
      abandon_session
      return 1
    }
    cursor=''
    while IFS="$(printf '\t')" read -r kind_field size path; do
      case "$kind_field" in
      next) cursor="$size" ;;
      file)
        local target="$STAGING/$path" source='' candidate
        if [ -f "$target" ] && [ "$(file_size "$target")" = "$size" ]; then
          reused=$((reused + 1))
          reused_bytes=$((reused_bytes + size))
          continue
        fi
        # Only assets/ is addressed by the hash of its bytes, so only there a
        # matching name and size is guaranteed to be the same file.
        case "$path" in
        assets/*)
          while IFS= read -r candidate; do
            [ -n "$candidate" ] || continue
            if [ -f "$candidate/$path" ] && [ "$(file_size "$candidate/$path")" = "$size" ]; then
              source="$candidate/$path"
              break
            fi
          done <<EOF
$sources
EOF
          ;;
        esac
        if [ -n "$source" ]; then
          mkdir -p "$(dirname "$target")"
          clone_file "$source" "$target"
          reused=$((reused + 1))
          reused_bytes=$((reused_bytes + size))
        else
          printf '%s\t%s\n' "$size" "$path" >>"$queue"
        fi
        ;;
      esac
    done <"$page"
    [ -n "$cursor" ] || break
  done

  local total=$SESSION_FILES
  [ -t 1 ] && printf '\033[?25l'
  # Paths from the site never contain whitespace, so plain xargs splitting is
  # safe with both GNU and BSD xargs.
  tr '\t' '\n' <"$queue" | xargs -n 2 -P "$PARALLEL_DOWNLOADS" \
    bash -c 'download_one "$1" "$2"' _ 2>/dev/null &
  local worker=$!
  while kill -0 "$worker" 2>/dev/null; do
    if [ -t 1 ]; then
      local count bytes
      count=$(($(grep -c '' "$RESULTS") + reused))
      bytes=$(($(awk '$1 == "ok" { sum += $2 } END { print sum + 0 }' "$RESULTS") + reused_bytes))
      progress_line "$count" "$total" "$bytes" "$reused"
    fi
    sleep 0.5 2>/dev/null || sleep 1
  done
  wait "$worker"
  local copied gone failed bytes
  copied=$(grep -c '^ok ' "$RESULTS")
  gone=$(grep -c '^gone' "$RESULTS")
  failed=$(grep -c '^fail ' "$RESULTS")
  bytes=$(($(awk '$1 == "ok" { sum += $2 } END { print sum + 0 }' "$RESULTS") + reused_bytes))
  if [ -t 1 ]; then
    progress_line "$((copied + gone + failed + reused))" "$total" "$bytes" "$reused"
    printf '\033[?25h\n'
  fi

  if [ "$failed" -gt 0 ]; then
    fail "$failed file(s) could not be downloaded, for example:"
    grep '^fail ' "$RESULTS" | head -3 | sed 's/^fail /  HTTP /' >&2
    say "${C_DIM}  Everything already fetched stays in $STAGING and is reused next time.$C_RESET"
    abandon_session
    return 1
  fi

  local completed="$WORK_DIR/completed" completed_at=''
  api POST "/api/backup/session/$SESSION_ID/complete?format=text" "$completed" \
    -H 'content-type: application/json' \
    --data "{\"fileCount\":$((copied + reused)),\"byteCount\":$bytes}" || {
    fail "$(api_error "$completed" 'Completing the session')"
    abandon_session
    return 1
  }
  local field value
  while IFS="$(printf '\t')" read -r field value; do
    [ "$field" = 'completedAt' ] && completed_at="$value"
  done <"$completed"
  [ -n "$completed_at" ] || completed_at="$(($(now_seconds) * 1000))"

  # Renamed into place only once everything is there: until this line the copy
  # is a .tmp- directory nothing mistakes for a backup.
  local final="$destination/$kind-$(stamp_from_ms "$completed_at")"
  mv "$STAGING" "$final" || {
    fail "Cannot move the finished copy to $final"
    return 1
  }
  local removed
  removed="$(rotate "$destination")"

  CFG_lastRunAt="$completed_at"
  CFG_lastFileCount="$SESSION_FILES"
  CFG_lastByteCount="$SESSION_BYTES"
  clear_alert
  write_config

  local label='Manual'
  [ "$kind" = 'auto' ] && label='Scheduled'
  ok "$label backup complete: $copied downloaded, $reused reused$([ "$gone" -gt 0 ] && printf ', %d vanished' "$gone")"
  say "  $final"
  [ -n "$removed" ] && say "${C_DIM}  rotated out: $removed$C_RESET"
  return 0
}

# Keep the newest scheduled copies, and every manual one. Runs after the new
# copy is in place, so there is never a moment without a complete backup.
rotate() {
  local destination="$1" names doomed='' name
  names="$(cd "$destination" && ls -1d auto-* 2>/dev/null | sort -r)"
  local index=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    index=$((index + 1))
    if [ "$index" -gt "$AUTO_KEEP" ]; then
      rm -rf "${destination:?}/$name"
      doomed="$doomed${doomed:+, }$name"
    fi
  done <<EOF
$names
EOF
  printf '%s' "$doomed"
}

# The OS task fires daily; this decides whether a run is actually due. That is
# what lets a machine that was off catch up, and a manual backup restart the
# week without touching the scheduler.
backup_due() {
  [ "${CFG_lastRunAt:-0}" -gt 0 ] || return 0
  [ $(($(now_seconds) - CFG_lastRunAt / 1000)) -ge "$WEEK_SECONDS" ]
}

# --------------------------------------------------------------- scheduling

schedule_command() {
  printf "/usr/bin/env bash '%s' --run --auto --config '%s'" "$SCRIPT_PATH" "$CONFIG_PATH"
}

systemd_system_dir() { printf '/etc/systemd/system'; }
systemd_user_dir() { printf '%s/.config/systemd/user' "$HOME"; }

write_systemd_units() {
  local directory="$1" hour="$2" wanted="$3"
  mkdir -p "$directory" || return 1
  printf '[Unit]\nDescription=Thei content backup\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nType=oneshot\nExecStart=%s\n' \
    "$(schedule_command)" >"$directory/$UNIT_NAME.service" || return 1
  # Persistent=true runs a timer missed while the machine was off as soon as it
  # is back, which is what makes the schedule survive reboots.
  printf '[Unit]\nDescription=Thei content backup\n\n[Timer]\nOnCalendar=*-*-* %02d:00:00\nOnBootSec=5min\nPersistent=true\n\n[Install]\nWantedBy=%s\n' \
    "$hour" "$wanted" >"$directory/$UNIT_NAME.timer"
}

install_schedule() {
  local hour="$1"
  if [ "$(uname)" = 'Darwin' ]; then
    local plist="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
    mkdir -p "$(dirname "$plist")"
    cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LAUNCHD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
    <string>--run</string>
    <string>--auto</string>
    <string>--config</string>
    <string>$CONFIG_PATH</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$hour</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
    launchctl unload "$plist" >/dev/null 2>&1
    launchctl load "$plist" || return 1
    SCHEDULE_DESCRIPTION="launchd agent $LAUNCHD_LABEL (daily at $hour:00 and at every login)"
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = '0' ]; then
    write_systemd_units "$(systemd_system_dir)" "$hour" timers.target &&
      systemctl daemon-reload &&
      systemctl enable --now "$UNIT_NAME.timer" >/dev/null 2>&1 && {
      SCHEDULE_DESCRIPTION="systemd timer $UNIT_NAME.timer (daily at $hour:00, catches up after a reboot)"
      return 0
    }
  fi

  if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
    if write_systemd_units "$(systemd_user_dir)" "$hour" timers.target &&
      systemctl --user daemon-reload &&
      systemctl --user enable --now "$UNIT_NAME.timer" >/dev/null 2>&1; then
      SCHEDULE_DESCRIPTION="systemd user timer $UNIT_NAME.timer (daily at $hour:00, catches up after a reboot)"
      # A user's timers only run while that user is logged in, unless lingering
      # is on — without it a rebooted server would never back up.
      if ! loginctl enable-linger "$(id -un)" >/dev/null 2>&1; then
        warn "Could not enable lingering. Run once as root: loginctl enable-linger $(id -un)"
        warn 'Until then the timer only runs while you are logged in.'
      fi
      return 0
    fi
  fi

  command -v crontab >/dev/null 2>&1 || {
    fail 'No systemd, launchd or cron found to schedule with.'
    return 1
  }
  local lines
  lines="$( (crontab -l 2>/dev/null || true) | grep -v "$CRON_MARK")"
  {
    [ -n "$lines" ] && printf '%s\n' "$lines"
    printf '0 %d * * * %s %s\n' "$hour" "$(schedule_command)" "$CRON_MARK"
    # cron cannot catch up a missed run on its own; checking at boot can.
    printf '@reboot sleep 300 && %s %s\n' "$(schedule_command)" "$CRON_MARK"
  } | crontab - || return 1
  SCHEDULE_DESCRIPTION="crontab entries (daily at $hour:00 and after every reboot)"
}

remove_schedule() {
  if [ "$(uname)" = 'Darwin' ]; then
    local plist="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"
    launchctl unload "$plist" >/dev/null 2>&1
    rm -f "$plist"
    return 0
  fi
  if [ -f "$(systemd_system_dir)/$UNIT_NAME.timer" ]; then
    systemctl disable --now "$UNIT_NAME.timer" >/dev/null 2>&1
    rm -f "$(systemd_system_dir)/$UNIT_NAME.timer" "$(systemd_system_dir)/$UNIT_NAME.service"
    systemctl daemon-reload >/dev/null 2>&1
  fi
  if [ -f "$(systemd_user_dir)/$UNIT_NAME.timer" ]; then
    systemctl --user disable --now "$UNIT_NAME.timer" >/dev/null 2>&1
    rm -f "$(systemd_user_dir)/$UNIT_NAME.timer" "$(systemd_user_dir)/$UNIT_NAME.service"
    systemctl --user daemon-reload >/dev/null 2>&1
  fi
  if command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -q "$CRON_MARK"; then
    crontab -l 2>/dev/null | grep -v "$CRON_MARK" | crontab -
  fi
  return 0
}

schedule_installed() {
  if [ "$(uname)" = 'Darwin' ]; then
    [ -f "$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist" ]
    return
  fi
  [ -f "$(systemd_system_dir)/$UNIT_NAME.timer" ] && return 0
  [ -f "$(systemd_user_dir)/$UNIT_NAME.timer" ] && return 0
  command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -q "$CRON_MARK"
}

# ------------------------------------------------------------------- status

print_status() {
  say
  say "${C_BOLD}  State$C_RESET"
  say "  Site         ${CFG_siteUrl:-${C_DIM}not set$C_RESET}"
  say "  Destination  ${CFG_destination:-${C_DIM}not set$C_RESET}"
  if [ -n "$CFG_token" ]; then
    say "  Token        ${C_GREEN}set$C_RESET"
  else
    say "  Token        ${C_DIM}not set$C_RESET"
  fi
  say "  Last backup  $(human_ago "$CFG_lastRunAt")"
  if backup_due; then
    say "  Next due     ${C_YELLOW}now$C_RESET"
  else
    say "  Next due     $(local_time_from_ms $((CFG_lastRunAt + WEEK_SECONDS * 1000)))"
  fi
  if schedule_installed; then
    say "  Schedule     ${C_GREEN}installed$C_RESET"
  else
    say "  Schedule     ${C_DIM}not installed$C_RESET"
  fi
  [ -n "$CFG_alert" ] && say "  Alert        ${C_RED}$CFG_alert$C_RESET"

  [ -n "$CFG_destination" ] || return 0
  local destination names name
  destination="$(destination_path)"
  names="$(cd "$destination" 2>/dev/null && ls -1d auto-* manual-* 2>/dev/null | sort -r)"
  say
  if [ -z "$names" ]; then
    say "${C_DIM}  No copies yet.$C_RESET"
    return 0
  fi
  say "${C_BOLD}  Copies$C_RESET"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    local kilobytes
    kilobytes="$(du -sk "$destination/$name" 2>/dev/null | cut -f1)"
    printf '  %-30s %10s\n' "$name" "$(human_size $((${kilobytes:-0} * 1024)))"
  done <<EOF
$names
EOF
  say "${C_DIM}  Manual copies are never rotated out.$C_RESET"
}

print_restore() {
  local example='/path/to/backup/auto-<timestamp>'
  [ -n "$CFG_destination" ] && example="$(destination_path)/auto-<timestamp>"
  say
  say "${C_BOLD}  Restoring a copy$C_RESET"
  say '  On the server, as root:'
  say
  say "${C_CYAN}    systemctl stop thei$C_RESET"
  say "${C_CYAN}    mv /opt/thei/content /opt/thei/content.broken$C_RESET"
  say "${C_CYAN}    cp -a $example /opt/thei/content$C_RESET"
  say "${C_CYAN}    chown -R thei:thei /opt/thei/content$C_RESET"
  say "${C_CYAN}    systemctl start thei$C_RESET"
  say
  say '  1. The service runs as the thei user; a copy unpacked as root needs the chown.'
  say '  2. Restore onto the same engine version or a newer one.'
  say '  3. generated-media/ and external-link-favicons/ are missing on purpose:'
  say '     they are caches the site rebuilds on first use.'
}

# --------------------------------------------------------------------- menu

MENU_CHOICE=0

# choose TITLE ITEM... — arrow keys and Enter, or the item's number.
choose() {
  local title="$1"
  shift
  local count=$# selected=0 key rest index
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    say "  $title"
    index=1
    for item in "$@"; do
      say "  $index  $item"
      index=$((index + 1))
    done
    printf '  > '
    read -r key || key=''
    case "$key" in '' | *[!0-9]*) MENU_CHOICE=$count ;; *) MENU_CHOICE=$key ;; esac
    [ "$MENU_CHOICE" -ge 1 ] && [ "$MENU_CHOICE" -le "$count" ] || MENU_CHOICE=$count
    return
  fi

  printf '\033[?25l'
  say "  $C_BOLD$title$C_RESET  ${C_DIM}↑↓ Enter$C_RESET"
  local first=1
  while :; do
    [ "$first" = 1 ] || printf '\033[%dA' "$count"
    first=0
    index=0
    for item in "$@"; do
      if [ "$index" = "$selected" ]; then
        printf '\r\033[K  %s› %d  %s%s\n' "$C_CYAN$C_BOLD" $((index + 1)) "$item" "$C_RESET"
      else
        printf '\r\033[K    %s%d%s  %s\n' "$C_DIM" $((index + 1)) "$C_RESET" "$item"
      fi
      index=$((index + 1))
    done
    IFS= read -rsn1 key || key='q'
    if [ "$key" = $'\033' ]; then
      read -rsn2 -t 1 rest 2>/dev/null || rest=''
      case "$rest" in
      '[A' | 'OA') selected=$(((selected + count - 1) % count)) ;;
      '[B' | 'OB') selected=$(((selected + 1) % count)) ;;
      '') selected=$((count - 1)) && break ;;
      esac
    elif [ -z "$key" ]; then
      break
    elif [ "$key" = 'q' ]; then
      selected=$((count - 1))
      break
    else
      case "$key" in
      [1-9])
        if [ "$key" -le "$count" ]; then
          selected=$((key - 1))
          break
        fi
        ;;
      k) selected=$(((selected + count - 1) % count)) ;;
      j) selected=$(((selected + 1) % count)) ;;
      esac
    fi
  done
  printf '\033[?25h'
  MENU_CHOICE=$((selected + 1))
}

ask() {
  local label="$1" current="$2" answer
  if [ -n "$current" ]; then
    printf '  %s %s[%s]%s: ' "$label" "$C_DIM" "$current" "$C_RESET"
  else
    printf '  %s: ' "$label"
  fi
  read -r answer || answer=''
  ASK_RESULT="${answer:-$current}"
}

configure() {
  say
  ask 'Site address (https://example.com)' "$CFG_siteUrl"
  CFG_siteUrl="${ASK_RESULT%/}"
  local shown=''
  [ -n "$CFG_token" ] && shown='keep current'
  ask 'Backup token' "$shown"
  [ "$ASK_RESULT" = 'keep current' ] || CFG_token="$ASK_RESULT"
  ask 'Destination folder' "$CFG_destination"
  CFG_destination="$ASK_RESULT"
  ask 'Name for this machine (optional)' "$CFG_clientLabel"
  CFG_clientLabel="$ASK_RESULT"
  write_config
  HEADER_FILE=''
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  WORK_DIR=''
  ok "Saved to $CONFIG_PATH"
}

banner() {
  say
  say "  $C_BOLD${C_CYAN}Thei backup$C_RESET  ${C_DIM}${CFG_siteUrl:-no site configured}$C_RESET"
  if [ -n "$CFG_alert" ]; then
    say
    printf '  %s THE LAST BACKUP WAS STOPPED %s\n' "$C_INVERSE$C_RED$C_BOLD" "$C_RESET"
    say "  $C_RED$CFG_alert$C_RESET"
  fi
  say
}

menu() {
  while :; do
    banner
    local items=('Back up now (manual copy, kept forever)')
    # Stopping again next week is the point of the alert, so the only way past
    # it is a backup that accepts the new size.
    [ -n "$CFG_alert" ] && items+=('Back up anyway (accept the smaller site)')
    items+=('Settings (site, token, destination)' 'Weekly schedule: install or remove' 'State and copies' 'How to restore' 'Quit')
    choose 'What next?' "${items[@]}"
    local action="${items[$((MENU_CHOICE - 1))]}"
    say
    case "$action" in
    'Back up now'* | 'Back up anyway'*)
      if ! config_complete; then
        fail 'Set the site, token and destination first (Settings).'
        continue
      fi
      local force='no'
      case "$action" in 'Back up anyway'*) force='yes' ;; esac
      perform_backup manual "$force"
      ;;
    'Settings'*) configure ;;
    'Weekly schedule'*)
      if schedule_installed; then
        choose 'A schedule is installed. Remove it?' 'Keep it' 'Remove it'
        if [ "$MENU_CHOICE" = 2 ]; then
          remove_schedule && ok 'Schedule removed.'
        fi
        continue
      fi
      if ! config_complete; then
        fail 'Set the site, token and destination first (Settings).'
        continue
      fi
      say "${C_DIM}  The task runs daily and backs up only when a week has passed,$C_RESET"
      say "${C_DIM}  so a machine that was off still catches up and a manual backup$C_RESET"
      say "${C_DIM}  restarts the week on its own.$C_RESET"
      ask 'Hour of day, 0-23' '3'
      local hour="$ASK_RESULT"
      case "$hour" in '' | *[!0-9]*) hour=3 ;; esac
      [ "$hour" -le 23 ] || hour=3
      SCHEDULE_DESCRIPTION=''
      if install_schedule "$hour"; then
        ok "Installed: $SCHEDULE_DESCRIPTION"
      else
        fail 'Could not install the schedule.'
      fi
      ;;
    'State'*) print_status ;;
    'How to restore') print_restore ;;
    *) return 0 ;;
    esac
  done
}

# --------------------------------------------------------------------- main

main() {
  local run='no' auto='no' force='no' status='no'
  while [ $# -gt 0 ]; do
    case "$1" in
    --run) run='yes' ;;
    --auto) auto='yes' ;;
    --force) force='yes' ;;
    --status) status='yes' ;;
    --config)
      shift
      CONFIG_PATH="${1:-$CONFIG_PATH}"
      ;;
    -h | --help)
      sed -n '2,17p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//'
      return 0
      ;;
    esac
    shift
  done

  command -v curl >/dev/null 2>&1 || {
    fail 'curl is required.'
    return 1
  }
  read_config
  # A freshly downloaded script carries its site and token: keep them.
  [ -f "$CONFIG_PATH" ] || { [ -n "$CFG_siteUrl" ] && write_config; }

  if [ "$status" = 'yes' ]; then
    print_status
    return 0
  fi

  if [ "$run" = 'yes' ]; then
    if ! config_complete; then
      fail "Nothing configured in $CONFIG_PATH. Run without --run to set it up."
      return 1
    fi
    if [ "$auto" = 'yes' ] && ! backup_due; then
      say "${C_DIM}Not due yet; last backup $(human_ago "$CFG_lastRunAt").$C_RESET"
      return 0
    fi
    local kind='manual'
    [ "$auto" = 'yes' ] && kind='auto'
    perform_backup "$kind" "$force"
    local code=$?
    if [ "$code" = 2 ] && [ -t 0 ] && [ -t 1 ]; then
      say
      printf '  Press Enter to close. '
      read -r _
    fi
    return "$code"
  fi

  menu
}

main "$@"
