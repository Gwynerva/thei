#!/usr/bin/env bash
#
# Puts back the version that was running before the last update.
#
#   bash /opt/thei/node_modules/thei/update/rollback.sh
#
# An update keeps the previous build in .output.prev and the previous manifest
# in package.json.prev. This swaps both back and restarts the service.

set -euo pipefail

THEI_DIR="${THEI_DIR:-/opt/thei}"
THEI_USER="${THEI_USER:-thei}"
THEI_SERVICE="${THEI_SERVICE:-thei}"
BUN_BIN="${THEI_BUN:-/usr/local/bin/bun}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root."
[ -d "$THEI_DIR/.output.prev" ] || die "No previous build at $THEI_DIR/.output.prev."
[ -f "$THEI_DIR/package.json.prev" ] || die "No previous manifest at $THEI_DIR/package.json.prev."

say "Stopping $THEI_SERVICE"
systemctl stop "$THEI_SERVICE"
# Whatever fails from here on, the site is not left stopped.
trap 'systemctl start "$THEI_SERVICE" || true' EXIT

say "Restoring the previous version"
cp "$THEI_DIR/package.json.prev" "$THEI_DIR/package.json"
rm -rf "$THEI_DIR/.output.broken"
[ -d "$THEI_DIR/.output" ] && mv "$THEI_DIR/.output" "$THEI_DIR/.output.broken"
mv "$THEI_DIR/.output.prev" "$THEI_DIR/.output"
chown -R "$THEI_USER:$THEI_USER" "$THEI_DIR/package.json" "$THEI_DIR/.output"

say "Reinstalling dependencies"
# A native addon that has to compile itself uses the headers of the Node that
# runs the site, as install.sh arranges, rather than downloading them.
NODE_PREFIX="$(dirname "$(dirname "$(command -v node || echo /nonexistent/bin/node)")")"
if [ -f "$NODE_PREFIX/include/node/node.h" ]; then
  export npm_config_nodedir="$NODE_PREFIX"
fi
runuser -u "$THEI_USER" -- env HOME="$THEI_DIR" PATH="/usr/local/bin:/usr/bin:/bin" \
  "$BUN_BIN" install --cwd "$THEI_DIR"

say "Starting $THEI_SERVICE"
systemctl start "$THEI_SERVICE"

cat <<EOF

  Rolled back. The failed build is kept at $THEI_DIR/.output.broken.
  If it will not start, rebuild in place:
    runuser -u $THEI_USER -- env HOME=$THEI_DIR $BUN_BIN install --cwd $THEI_DIR
    runuser -u $THEI_USER -- env HOME=$THEI_DIR $BUN_BIN run --cwd $THEI_DIR build
    systemctl restart $THEI_SERVICE

  Database migrations are not reversed. If the update applied any, the older
  engine refuses the content and says so on the update page: install the older
  version from scratch and restore the backup made before the update
  (update/README.md, "When something goes wrong").

EOF
