#!/usr/bin/env bash
#
# Thei installer.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/Gwynerva/thei/main/update/install.sh)
#
# Creates a Thei instance, builds it, and runs it as a systemd service.
# Re-running it on an existing instance is refused: use the panel to update.
#
# Environment overrides:
#   THEI_DIR         install directory            (default /opt/thei)
#   THEI_USER        service user                 (default thei)
#   THEI_SERVICE     systemd unit name            (default thei)
#   THEI_PORT        port to listen on            (default 3000)
#   THEI_HOST        address to bind              (default 127.0.0.1)
#   THEI_REPOSITORY  repository to install from
#   THEI_VERSION     version tag to install       (default: newest release)

set -euo pipefail

THEI_DIR="${THEI_DIR:-/opt/thei}"
THEI_USER="${THEI_USER:-thei}"
THEI_SERVICE="${THEI_SERVICE:-thei}"
THEI_PORT="${THEI_PORT:-3000}"
THEI_HOST="${THEI_HOST:-127.0.0.1}"
THEI_REPOSITORY="${THEI_REPOSITORY:-https://github.com/Gwynerva/thei.git}"
BUN_BIN=/usr/local/bin/bun
NODE_MAJOR="${NODE_MAJOR:-24}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m warning:\033[0m %s\n' "$1" >&2; }
die() { printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root (try: sudo -i, then re-run)."
command -v systemctl >/dev/null 2>&1 || die "This installer needs systemd."
command -v apt-get >/dev/null 2>&1 || die "This installer supports Debian and Ubuntu. See update/README.md to install by hand."

if [ -e "$THEI_DIR/package.json" ]; then
  die "$THEI_DIR already holds a Thei instance. Update it from the admin panel, not from here."
fi

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# build-essential and python3 are the fallback path for building better-sqlite3
# when no prebuilt binary matches this machine.
apt-get install -y -qq git curl unzip ca-certificates build-essential python3 >/dev/null

if [ ! -x "$BUN_BIN" ]; then
  say "Installing Bun"
  # Installed to a fixed location: systemd's PATH does not include ~/.bun/bin.
  export BUN_INSTALL=/usr/local
  curl -fsSL https://bun.sh/install | bash >/dev/null
  [ -x "$BUN_BIN" ] || die "Bun did not install to $BUN_BIN."
fi

# Two runtimes, on purpose: Bun installs and builds (it is much faster), Node
# runs the site, because better-sqlite3 is a native Node addon that does not
# load under Bun. Distribution packages are too old for Nuxt, hence NodeSource.
CURRENT_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$CURRENT_NODE_MAJOR" -lt 20 ]; then
  say "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

NODE_BIN="$(command -v node || true)"
[ -x "$NODE_BIN" ] || die "Node.js is not available."
say "Bun $("$BUN_BIN" --version), Node $(node --version)"

say "Looking up the newest release"
if [ -n "${THEI_VERSION:-}" ]; then
  VERSION="$THEI_VERSION"
else
  VERSION="$(
    GIT_TERMINAL_PROMPT=0 git ls-remote --tags "$THEI_REPOSITORY" \
      | awk '{print $2}' \
      | sed -e 's|refs/tags/||' -e 's|\^{}$||' \
      | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
      | sort -V -u \
      | tail -1
  )" || true
fi
[ -n "$VERSION" ] || die "No released version found in $THEI_REPOSITORY."
say "Installing Thei $VERSION"

if ! id -u "$THEI_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$THEI_DIR" --shell /usr/sbin/nologin "$THEI_USER"
fi

mkdir -p "$THEI_DIR"
chown -R "$THEI_USER:$THEI_USER" "$THEI_DIR"

# Turns a repository URL into something Bun can install from.
case "$THEI_REPOSITORY" in
  https://github.com/*|git@github.com:*)
    SLUG="$(printf '%s' "$THEI_REPOSITORY" | sed -e 's|.*github.com[:/]||' -e 's|\.git$||')"
    SOURCE="github:$SLUG#$VERSION"
    ;;
  git+*) SOURCE="$THEI_REPOSITORY#$VERSION" ;;
  *)     SOURCE="git+$THEI_REPOSITORY#$VERSION" ;;
esac

run_as_thei() {
  runuser -u "$THEI_USER" -- env HOME="$THEI_DIR" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

# Fetch the engine with a throwaway manifest, then let the engine itself supply
# the real one. That way a release owns its own instance configuration and this
# script never has to know about its dependencies.
say "Fetching the engine"
printf '{\n  "name": "thei-instance",\n  "private": true,\n  "dependencies": { "thei": "%s" }\n}\n' "$SOURCE" \
  > "$THEI_DIR/package.json"
chown "$THEI_USER:$THEI_USER" "$THEI_DIR/package.json"
run_as_thei "$BUN_BIN" install --cwd "$THEI_DIR"

TEMPLATES="$THEI_DIR/node_modules/thei/update/instance"
[ -d "$TEMPLATES" ] || die "The installed engine has no instance templates at $TEMPLATES."

say "Configuring the instance"
sed "s|__THEI_SOURCE__|$SOURCE|" "$TEMPLATES/package.tmpl.json" > "$THEI_DIR/package.json"
cp "$TEMPLATES/nuxt.config.tmpl.ts" "$THEI_DIR/nuxt.config.ts"
chown "$THEI_USER:$THEI_USER" "$THEI_DIR/package.json" "$THEI_DIR/nuxt.config.ts"
run_as_thei "$BUN_BIN" install --cwd "$THEI_DIR"

say "Building (this takes a few minutes)"
run_as_thei "$BUN_BIN" run --cwd "$THEI_DIR" build

say "Installing the $THEI_SERVICE service"
sed \
  -e "s|__INSTALL_DIR__|$THEI_DIR|g" \
  -e "s|__USER__|$THEI_USER|g" \
  -e "s|__BUN__|$BUN_BIN|g" \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__HOST__|$THEI_HOST|g" \
  -e "s|__PORT__|$THEI_PORT|g" \
  "$TEMPLATES/thei.service.tmpl" > "/etc/systemd/system/$THEI_SERVICE.service"

systemctl daemon-reload
systemctl enable --now "$THEI_SERVICE" >/dev/null

sleep 3
if ! systemctl is-active --quiet "$THEI_SERVICE"; then
  warn "The service did not start. Recent log:"
  journalctl -u "$THEI_SERVICE" -n 30 --no-pager >&2 || true
  die "Thei is installed at $THEI_DIR but not running."
fi

ADDRESS="http://$(hostname -I 2>/dev/null | awk '{print $1}'):$THEI_PORT"
[ "$THEI_HOST" = "127.0.0.1" ] && ADDRESS="http://127.0.0.1:$THEI_PORT"

cat <<EOF

  Thei $VERSION is installed and running.

  Open $ADDRESS to finish setup.

  Your data will live in $THEI_DIR/content — that is the only directory worth
  backing up.

EOF

if [ "$THEI_HOST" = "127.0.0.1" ]; then
  cat <<EOF
  Thei listens on 127.0.0.1 only. To serve it on a domain, put nginx in front:
  see $TEMPLATES/nginx.conf.example.

EOF
fi

cat <<EOF
  Service:  systemctl status $THEI_SERVICE
  Logs:     journalctl -u $THEI_SERVICE -f

EOF
