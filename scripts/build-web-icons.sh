#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/images/icon.png"
PUBLIC_DIR="$ROOT_DIR/public"
ICONS_DIR="$PUBLIC_DIR/icons"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Missing source icon: $SOURCE_ICON"
  exit 1
fi

mkdir -p "$ICONS_DIR"

TMP_ICON="$ICONS_DIR/icon-source.png"
cp "$SOURCE_ICON" "$TMP_ICON"

sips -z 192 192 "$TMP_ICON" --out "$ICONS_DIR/icon-192.png" >/dev/null
sips -z 512 512 "$TMP_ICON" --out "$ICONS_DIR/icon-512.png" >/dev/null
sips -z 180 180 "$TMP_ICON" --out "$ICONS_DIR/apple-touch-icon.png" >/dev/null
cp "$ROOT_DIR/assets/images/favicon.png" "$PUBLIC_DIR/favicon.png"
cp "$ICONS_DIR/icon-192.png" "$PUBLIC_DIR/icon-192.png"
cp "$ICONS_DIR/icon-512.png" "$PUBLIC_DIR/icon-512.png"
cp "$ICONS_DIR/apple-touch-icon.png" "$PUBLIC_DIR/apple-touch-icon.png"

rm -f "$TMP_ICON"
echo "Web icons generated in public/icons"
