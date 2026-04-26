#!/usr/bin/env bash
# Double-clickable macOS launcher. Finder runs .command files in Terminal.
# Just delegates to start.sh in the same directory and opens the browser.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/start.sh" --open
