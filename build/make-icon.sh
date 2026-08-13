#!/bin/bash
#
# Generate all app icon assets (macOS .icns + iconset, Windows .ico, Linux .png)
# from a single source logo, composited onto a dark glossy rounded-square
# background via compose-icon.py.
#
# Usage:
#   ./make-icon.sh path/to/source-logo.png
#
# Requirements: macOS (sips, iconutil), python3 + Pillow, npx (png-to-ico).
#
set -e

SRC=$1
if [ -z "$SRC" ]; then
  echo "usage: $0 <source-logo.png>" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
MASTER="$(mktemp -t icon-master).png"
ICONSET="$HERE/icon.iconset"

# 1) Composite the logo onto the dark glossy background at high resolution.
python3 "$HERE/compose-icon.py" "$SRC" "$MASTER" 1024

# 2) Linux icon / repo master (512x512).
sips -z 512 512 "$MASTER" --out "$HERE/icon.png" >/dev/null

# 3) macOS iconset (all required sizes) -> .icns
mkdir -p "$ICONSET"
sips -z 16 16     "$MASTER" --out "$ICONSET/icon_16x16.png"      >/dev/null
sips -z 32 32     "$MASTER" --out "$ICONSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32     "$MASTER" --out "$ICONSET/icon_32x32.png"      >/dev/null
sips -z 64 64     "$MASTER" --out "$ICONSET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128   "$MASTER" --out "$ICONSET/icon_128x128.png"    >/dev/null
sips -z 256 256   "$MASTER" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$MASTER" --out "$ICONSET/icon_256x256.png"    >/dev/null
sips -z 512 512   "$MASTER" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$MASTER" --out "$ICONSET/icon_512x512.png"    >/dev/null
sips -z 1024 1024 "$MASTER" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$HERE/icon.icns"

# 4) Windows .ico (full size range, incl. 256x256 required by electron-builder).
TMPDIR_ICO="$(mktemp -d)"
for s in 16 24 32 48 64 128 256; do
  sips -z $s $s "$MASTER" --out "$TMPDIR_ICO/ico_$s.png" >/dev/null 2>&1
done
npx --yes png-to-ico \
  "$TMPDIR_ICO/ico_16.png" "$TMPDIR_ICO/ico_24.png" "$TMPDIR_ICO/ico_32.png" \
  "$TMPDIR_ICO/ico_48.png" "$TMPDIR_ICO/ico_64.png" "$TMPDIR_ICO/ico_128.png" \
  "$TMPDIR_ICO/ico_256.png" > "$HERE/icon.ico"
rm -rf "$TMPDIR_ICO" "$MASTER"

echo "Done: icon.png, icon.icns, icon.ico, icon.iconset/"
