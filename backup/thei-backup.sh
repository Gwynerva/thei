#!/usr/bin/env sh
# Launcher for the Thei backup client. Run with no arguments for the menu, or
# pass flags through: ./thei-backup.sh --run --auto
exec node "$(dirname "$0")/thei-backup.mjs" "$@"
