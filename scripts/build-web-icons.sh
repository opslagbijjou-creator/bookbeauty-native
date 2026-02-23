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

resize_icon() {
  local size="$1"
  local input="$2"
  local output="$3"

  if command -v sips >/dev/null 2>&1; then
    sips -z "$size" "$size" "$input" --out "$output" >/dev/null
    return
  fi

  if command -v magick >/dev/null 2>&1; then
    magick "$input" -resize "${size}x${size}^" -gravity center -extent "${size}x${size}" "$output" >/dev/null 2>&1
    return
  fi

  if command -v convert >/dev/null 2>&1; then
    convert "$input" -resize "${size}x${size}^" -gravity center -extent "${size}x${size}" "$output" >/dev/null 2>&1
    return
  fi

  # Last-resort fallback for CI images without image tools.
  cp "$input" "$output"
}

resize_icon 192 "$TMP_ICON" "$ICONS_DIR/icon-192.png"
resize_icon 512 "$TMP_ICON" "$ICONS_DIR/icon-512.png"
resize_icon 180 "$TMP_ICON" "$ICONS_DIR/apple-touch-icon.png"
cp "$ROOT_DIR/assets/images/favicon.png" "$PUBLIC_DIR/favicon.png"
cp "$ICONS_DIR/icon-192.png" "$PUBLIC_DIR/icon-192.png"
cp "$ICONS_DIR/icon-512.png" "$PUBLIC_DIR/icon-512.png"
cp "$ICONS_DIR/apple-touch-icon.png" "$PUBLIC_DIR/apple-touch-icon.png"

rm -f "$TMP_ICON"
echo "Web icons generated in public/icons"
