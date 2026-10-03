#!/bin/bash
# Ad-hoc sign an unsigned Electron .app from the inside out (no Apple identity needed).
set -e
APP="$1"
xattr -cr "$APP"
find "$APP/Contents" -type f \( -name "*.dylib" -o -name "*.node" -o -name "spawn-helper" -o -path "*.framework/Versions/A/Helpers/*" \) -exec codesign --force -s - {} \;
for fw in "$APP"/Contents/Frameworks/*.framework; do codesign --force -s - "$fw"; done
for h in "$APP"/Contents/Frameworks/*.app; do codesign --force -s - "$h"; done
codesign --force -s - "$APP"
codesign -v --deep --strict "$APP"
