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
#   THEI_REPOSITORY  repository to install from   (a URL, or a local path)
#   THEI_VERSION     version tag to install       (default: newest release)
#   NODE_MAJOR       Node.js major version        (default 24)
#   THEI_SWAP        set to 0 to never add a swap file

set -euo pipefail

THEI_DIR="${THEI_DIR:-/opt/thei}"
THEI_USER="${THEI_USER:-thei}"
THEI_SERVICE="${THEI_SERVICE:-thei}"
THEI_PORT="${THEI_PORT:-3000}"
THEI_HOST="${THEI_HOST:-127.0.0.1}"
THEI_REPOSITORY="${THEI_REPOSITORY:-https://github.com/Gwynerva/thei.git}"
BUN_BIN=/usr/local/bin/bun
NODE_MAJOR="${NODE_MAJOR:-24}"
UNIT="/etc/systemd/system/$THEI_SERVICE.service"
# A build takes about 2 GB on its own, and an update builds while the site
# keeps running beside it.
NEEDED_MEMORY_MB=3500

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m warning:\033[0m %s\n' "$1" >&2; }
die() { printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root (try: sudo -i, then re-run)."
command -v apt-get >/dev/null 2>&1 || die "This installer supports Debian and Ubuntu. See update/README.md to install by hand."
# systemctl alone is not enough: a container can ship it without systemd
# running, and that would only show at the very end, after the build.
[ -d /run/systemd/system ] || die "This installer needs systemd running as the init system."

if [ -e "$THEI_DIR/package.json" ]; then
  die "$THEI_DIR already holds a Thei instance. Update it from the admin panel, not from here."
fi
if [ -e "$UNIT" ]; then
  die "$UNIT already exists. Choose another THEI_SERVICE, or remove the old service first."
fi

# A plain path is a local repository.
case "$THEI_REPOSITORY" in
  /*) THEI_REPOSITORY="file://$THEI_REPOSITORY" ;;
esac

CREATED_DIR=0
[ -e "$THEI_DIR" ] || CREATED_DIR=1

on_error() {
  printf '\n\033[1;31merror:\033[0m The installation stopped before it finished.\n' >&2
  if [ "$CREATED_DIR" -eq 1 ]; then
    printf '  Nothing is running yet. To start over: rm -rf %s, then run this again.\n\n' "$THEI_DIR" >&2
  else
    printf '  Nothing is running yet. To start over, remove %s/package.json and run this again.\n\n' "$THEI_DIR" >&2
  fi
}
trap on_error ERR

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# build-essential and python3 are the fallback path for a native addon that has
# to compile itself: better-sqlite3 of a release before 0.0.3, which downloads
# its binary from GitHub, when there is none for this machine or GitHub cannot
# be reached. From 0.0.3 on it carries its binaries and compiles nothing.
apt-get install -y -qq git curl unzip ca-certificates build-essential python3 >/dev/null

# ------------------------------------------------------------------- memory
memory_mb() { awk -v key="$1" '$1 == key":" { print int($2 / 1024) }' /proc/meminfo; }
TOTAL_MB=$(( $(memory_mb MemTotal) + $(memory_mb SwapTotal) ))
if [ "$TOTAL_MB" -lt "$NEEDED_MEMORY_MB" ]; then
  MISSING_GB=$(( (NEEDED_MEMORY_MB - TOTAL_MB + 1023) / 1024 ))
  if [ "${THEI_SWAP:-1}" = "0" ]; then
    warn "This machine has ${TOTAL_MB} MB of memory and swap; a build needs about ${NEEDED_MEMORY_MB} MB and may be killed."
  elif [ -e /swapfile-thei ]; then
    warn "/swapfile-thei already exists but memory is still short; leaving it as it is."
  else
    say "Adding a ${MISSING_GB} GB swap file (/swapfile-thei): builds need about ${NEEDED_MEMORY_MB} MB"
    if fallocate -l "${MISSING_GB}G" /swapfile-thei 2>/dev/null \
      && chmod 600 /swapfile-thei \
      && mkswap /swapfile-thei >/dev/null \
      && swapon /swapfile-thei 2>/dev/null; then
      echo '/swapfile-thei none swap sw 0 0' >> /etc/fstab
    else
      rm -f /swapfile-thei
      warn "Could not add swap here. Builds may be killed for lack of memory."
    fi
  fi
fi

# ----------------------------------------------------------------- runtimes
if [ ! -x "$BUN_BIN" ]; then
  say "Installing Bun"
  # Installed to a fixed location every user can run: systemd's PATH does not
  # include ~/.bun/bin, and the service user must reach it.
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash >/dev/null
  [ -x "$BUN_BIN" ] || die "Bun did not install to $BUN_BIN."
fi

# Two runtimes, on purpose: Bun installs and builds (it is much faster), Node
# runs the site, because better-sqlite3 is a native Node addon that does not
# load under Bun. Distribution packages are too old for Nuxt, hence NodeSource.
node_usable() {
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19) ? 0 : 1)' 2>/dev/null
}
if ! node_usable; then
  say "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

NODE_BIN="$(command -v node || true)"
[ -x "$NODE_BIN" ] || die "Node.js is not available."

# When a native addon has to compile itself, node-gyp uses the headers of the
# Node that will run the site rather than downloading them. The update engine
# does the same (update/environment.ts).
NODE_PREFIX="$(dirname "$(dirname "$NODE_BIN")")"
if [ -f "$NODE_PREFIX/include/node/node.h" ]; then
  export npm_config_nodedir="$NODE_PREFIX"
fi

# --------------------------------------------------------------- the engine
if [ -n "${THEI_VERSION:-}" ]; then
  VERSION="v${THEI_VERSION#v}"
else
  say "Looking up the newest release"
  VERSION="$(
    GIT_TERMINAL_PROMPT=0 git ls-remote --tags "${THEI_REPOSITORY#git+}" \
      | awk '{print $2}' \
      | sed -e 's|refs/tags/||' -e 's|\^{}$||' \
      | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
      | sed -e 's|^v||' \
      | sort -t. -k1,1n -k2,2n -k3,3n -u \
      | tail -1
  )" || true
  [ -n "$VERSION" ] || die "No released version found in $THEI_REPOSITORY."
  VERSION="v$VERSION"
fi
say "Installing Thei $VERSION"

if ! id -u "$THEI_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$THEI_DIR" --shell /usr/sbin/nologin "$THEI_USER"
fi

mkdir -p "$THEI_DIR"
chown "$THEI_USER:$THEI_USER" "$THEI_DIR"
if [ "$CREATED_DIR" -eq 1 ]; then
  # The content directory holds the password hash; nobody else needs to look
  # in. A directory that already existed keeps the permissions it had.
  chmod 750 "$THEI_DIR"
fi

run_as_thei() {
  runuser -u "$THEI_USER" -- env HOME="$THEI_DIR" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
}

# Both runtimes must work for the service user, not only for root: a Node
# found under /root would fail when the service starts.
run_as_thei "$BUN_BIN" --version >/dev/null || die "$BUN_BIN does not run as $THEI_USER."
run_as_thei "$NODE_BIN" --version >/dev/null || die "$NODE_BIN does not run as $THEI_USER."
say "Bun $("$BUN_BIN" --version), Node $("$NODE_BIN" --version)"

# Turns a repository URL into something Bun can install from.
case "$THEI_REPOSITORY" in
  https://github.com/*|git@github.com:*)
    SLUG="$(printf '%s' "$THEI_REPOSITORY" | sed -e 's|.*github.com[:/]||' -e 's|\.git$||')"
    SOURCE="github:$SLUG#$VERSION"
    ;;
  git+*) SOURCE="$THEI_REPOSITORY#$VERSION" ;;
  *)     SOURCE="git+$THEI_REPOSITORY#$VERSION" ;;
esac

# Fetch the engine with a throwaway manifest, then let the engine itself supply
# the real one. That way a release owns its own instance configuration and this
# script never has to know about its dependencies. The fetch only needs the
# files: install scripts run once, under the real manifest.
say "Fetching the engine"
printf '{\n  "name": "thei-instance",\n  "private": true,\n  "dependencies": { "thei": "%s" }\n}\n' "$SOURCE" \
  > "$THEI_DIR/package.json"
chown "$THEI_USER:$THEI_USER" "$THEI_DIR/package.json"
run_as_thei "$BUN_BIN" install --cwd "$THEI_DIR" --ignore-scripts

TEMPLATES="$THEI_DIR/node_modules/thei/update/instance"
[ -d "$TEMPLATES" ] || die "The installed engine has no instance templates at $TEMPLATES."

say "Configuring the instance"
sed "s|__THEI_SOURCE__|$SOURCE|" "$TEMPLATES/package.tmpl.json" > "$THEI_DIR/package.json"
cp "$TEMPLATES/nuxt.config.tmpl.ts" "$THEI_DIR/nuxt.config.ts"
chown "$THEI_USER:$THEI_USER" "$THEI_DIR/package.json" "$THEI_DIR/nuxt.config.ts"
run_as_thei "$BUN_BIN" install --cwd "$THEI_DIR"

# The SQLite driver carries its own binaries and nothing compiles in their
# place, so a server they do not run on hears it now rather than from a site
# that will not start after the build. Releases before 0.0.3 have no check.
DRIVER_CHECK="$THEI_DIR/node_modules/thei/update/sqlite-driver.mjs"
if [ -f "$DRIVER_CHECK" ] && ! run_as_thei "$NODE_BIN" "$DRIVER_CHECK"; then
  die "The SQLite driver does not run on this server. Thei needs Linux with glibc 2.34 or newer (Debian 12, Ubuntu 22.04 or later) on x64 or arm64."
fi

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
  -e "s|__REPOSITORY__|$THEI_REPOSITORY|g" \
  "$TEMPLATES/thei.service.tmpl" > "$UNIT"

systemctl daemon-reload
systemctl enable --now "$THEI_SERVICE" >/dev/null

# Running is not enough: the service must answer.
STARTED=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null -m 2 "http://127.0.0.1:$THEI_PORT/"; then
    STARTED=1
    break
  fi
  sleep 1
done
if [ "$STARTED" -eq 0 ]; then
  warn "The service does not answer. Recent log:"
  journalctl -u "$THEI_SERVICE" -n 30 --no-pager >&2 || true
  die "Thei is installed at $THEI_DIR but not answering on port $THEI_PORT."
fi
trap - ERR

ADDRESS="http://127.0.0.1:$THEI_PORT"
if [ "$THEI_HOST" != "127.0.0.1" ]; then
  ADDRESS="http://$(hostname -I 2>/dev/null | awk '{print $1}' || true):$THEI_PORT"
fi

cat <<EOF

  Thei $VERSION is installed and running.

  Open $ADDRESS to finish setup.

  Until the setup is finished, whoever opens the site first can claim it.
  Finish it before the site is reachable from the internet.

  Your data will live in $THEI_DIR/content — that is the only directory worth
  backing up.

EOF

if [ "$THEI_HOST" = "127.0.0.1" ]; then
  cat <<EOF
  Thei listens on 127.0.0.1 only. From your own computer, reach it through an
  SSH tunnel to finish the setup:

    ssh -L $THEI_PORT:127.0.0.1:$THEI_PORT root@<this server>

  then open http://127.0.0.1:$THEI_PORT. To serve it on a domain, put nginx in
  front: see $TEMPLATES/nginx.conf.example.

EOF
fi

cat <<EOF
  Service:  systemctl status $THEI_SERVICE
  Logs:     journalctl -u $THEI_SERVICE -f

EOF
