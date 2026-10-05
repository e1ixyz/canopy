#!/bin/bash
# Build Canopy.app, install it to ~/Applications (outside iCloud, so it can be
# signed), ad-hoc sign it, and put an alias on the Desktop. This personal build keeps the
# debug server (ORCH_DEBUG_PORT) for the test harness and the self-updater
# (CANOPY_SELF_UPDATE); `bun run dist` leaves both out.
#
#   install-app.sh                    build, then install
#   install-app.sh --build-only       build into dist/ (the in-app updater runs this while the app is open)
#   install-app.sh --install-only [--wait-pid PID] [--open]
#                                     install dist/'s build once PID has exited; --open launches it
set -e
cd "$(dirname "$0")/.."
BUILD=1
INSTALL=1
WAIT_PID=
OPEN=
while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) INSTALL= ;;
    --install-only) BUILD= ;;
    --wait-pid) WAIT_PID="$2"; shift ;;
    --open) OPEN=1 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -n "$BUILD" ]; then
  ORCH_DEBUG_BUILD=1 CANOPY_SELF_UPDATE=1 npx electron-vite build
  rm -rf dist
  npx electron-builder --mac --dir
fi
[ -n "$INSTALL" ] || exit 0

# Replacing the bundle under a running app breaks it, so the updater passes its own pid
if [ -n "$WAIT_PID" ]; then
  while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 0.5; done
  sleep 1
fi

DEST="$HOME/Applications/Canopy.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
ditto --norsrc --noextattr dist/mac-arm64/Canopy.app "$DEST"
./scripts/sign-adhoc.sh "$DEST" >/dev/null 2>&1
codesign -v --deep --strict "$DEST"
# The app used to be called Orchestrator: drop that install and its Desktop alias (an alias file, never a folder)
rm -rf "$HOME/Applications/Orchestrator.app"
OLD_ALIAS="$HOME/Desktop/Orchestrator.app"
if [ -f "$OLD_ALIAS" ] && [ ! -d "$OLD_ALIAS" ]; then rm "$OLD_ALIAS"; fi
# The Desktop is case-insensitive and may hold a folder of the same name,
# so the alias gets its own name and only an existing alias *file* is replaced.
ALIAS="$HOME/Desktop/Canopy.app"
if [ -f "$ALIAS" ] && [ ! -d "$ALIAS" ]; then rm "$ALIAS"; fi
if [ ! -e "$ALIAS" ]; then
  osascript -e "tell application \"Finder\" to set a to make alias file to POSIX file \"$DEST\" at POSIX file \"$HOME/Desktop\"" -e "tell application \"Finder\" to set name of a to \"Canopy.app\"" >/dev/null
fi
echo "Installed $DEST (alias on Desktop)"
if [ -n "$OPEN" ]; then open "$DEST"; fi
