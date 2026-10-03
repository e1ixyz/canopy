#!/bin/bash
# Build Orchestrator.app, install it to ~/Applications (outside iCloud, so it can be
# signed), ad-hoc sign it, and put an alias on the Desktop. This personal build keeps the
# debug server (ORCH_DEBUG_PORT) for the test harness; `bun run dist` leaves it out.
set -e
cd "$(dirname "$0")/.."
ORCH_DEBUG_BUILD=1 npx electron-vite build
rm -rf dist
npx electron-builder --mac --dir
DEST="$HOME/Applications/Orchestrator.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto --norsrc --noextattr dist/mac-arm64/Orchestrator.app "$DEST"
./scripts/sign-adhoc.sh "$DEST" >/dev/null 2>&1
codesign -v --deep --strict "$DEST"
# The Desktop is case-insensitive and the project folder may be ~/Desktop/orchestrator,
# so the alias gets its own name and only an existing alias *file* is replaced.
ALIAS="$HOME/Desktop/Orchestrator.app"
if [ -f "$ALIAS" ] && [ ! -d "$ALIAS" ]; then rm "$ALIAS"; fi
if [ ! -e "$ALIAS" ]; then
  osascript -e "tell application \"Finder\" to set a to make alias file to POSIX file \"$DEST\" at POSIX file \"$HOME/Desktop\"" -e "tell application \"Finder\" to set name of a to \"Orchestrator.app\"" >/dev/null
fi
echo "Installed $DEST (alias on Desktop)"
