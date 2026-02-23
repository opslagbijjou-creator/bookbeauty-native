#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/images/icon.png"
SOURCE_FAVICON="$ROOT_DIR/assets/images/favicon.png"
PUBLIC_DIR="$ROOT_DIR/public"
ICONS_DIR="$PUBLIC_DIR/icons"

assert_file_exists() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing source file: $path"
    exit 1
  fi
}

assert_png_magic() {
  local path="$1"
  local signature
  signature="$(od -An -t x1 -N 8 "$path" | tr -d ' \n')"
  # PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  if [[ "$signature" != "89504e470d0a1a0a" ]]; then
    echo "Invalid PNG file: $path"
    echo "Use a real .png export. A renamed .jpg will break web app icons."
    exit 1
  fi
}

assert_file_exists "$SOURCE_ICON"
assert_file_exists "$SOURCE_FAVICON"
assert_png_magic "$SOURCE_ICON"
assert_png_magic "$SOURCE_FAVICON"

mkdir -p "$ICONS_DIR"

TMP_ICON="$ICONS_DIR/.icon-source.png"
cp "$SOURCE_ICON" "$TMP_ICON"
trap 'rm -f "$TMP_ICON"' EXIT

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
cp "$SOURCE_FAVICON" "$ICONS_DIR/favicon.png"
cp "$SOURCE_FAVICON" "$PUBLIC_DIR/favicon.png"
cp "$ICONS_DIR/icon-192.png" "$PUBLIC_DIR/icon-192.png"
cp "$ICONS_DIR/icon-512.png" "$PUBLIC_DIR/icon-512.png"
cp "$ICONS_DIR/apple-touch-icon.png" "$PUBLIC_DIR/apple-touch-icon.png"

assert_png_magic "$ICONS_DIR/favicon.png"
assert_png_magic "$PUBLIC_DIR/favicon.png"
assert_png_magic "$PUBLIC_DIR/icon-192.png"
assert_png_magic "$PUBLIC_DIR/icon-512.png"
assert_png_magic "$PUBLIC_DIR/apple-touch-icon.png"

echo "Web icons generated in public/icons"
