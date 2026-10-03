#!/bin/bash
# Release build: arm64 and x64 .dmg files, ad-hoc signed, without the debug server.
# Packs outside iCloud (the Desktop re-adds xattrs that codesign rejects), then
# copies the .dmg files back to dist/.
set -e
cd "$(dirname "$0")/.."
OUT="$HOME/Library/Caches/Orchestrator-dist"
rm -rf "$OUT"
npx electron-vite build
ORCH_ADHOC_SIGN=1 npx electron-builder --mac dmg --arm64 --x64 -c.directories.output="$OUT"
mkdir -p dist
cp "$OUT"/*.dmg dist/
ls -lh dist/*.dmg
