#!/usr/bin/env bash
# Magic variant art: the pictures in art/magic/ (full size, as made) -> game-sized copies in
# src/assets/magic/ (what the game bundles; src/scenes/Door.ts). Run after adding or changing a picture:
#   npm run art:magic
# Opaque pictures and the light pictures (black background, drawn additively) become JPEGs; orb.png
# stays PNG (its green background is removed in the game).
set -euo pipefail
SRC=art/magic
OUT=src/assets/magic
mkdir -p "$OUT"
# name  width height  format  [crop width: keep the centre columns first]
jobs=(
    "door 780 1688 jpeg"
    "door-light 780 1688 jpeg"
    "backdrop 780 1688 jpeg"
    "light-ray 0 1688 jpeg 400"
    "light-burst 640 640 jpeg"
    "sparkle 128 128 jpeg"
    "orb 256 256 png"
)
for job in "${jobs[@]}"; do
    read -r name w h fmt crop <<<"$job"
    in="$SRC/$name.png"
    [[ -f "$in" ]] || { echo "skip $name (no $in)"; continue; }
    ext=$([[ $fmt == jpeg ]] && echo jpg || echo png)
    out="$OUT/$name.$ext"
    tmp="$(mktemp -t magic).png"
    cp "$in" "$tmp"
    if [[ -n "${crop:-}" ]]; then
        hgt=$(sips -g pixelHeight "$tmp" | awk '/pixelHeight/{print $2}')
        sips -c "$hgt" "$crop" "$tmp" >/dev/null
    fi
    if [[ "$w" == 0 ]]; then sips --resampleHeight "$h" "$tmp" >/dev/null; else sips -z "$h" "$w" "$tmp" >/dev/null; fi
    rm -f "$OUT/$name.jpg" "$OUT/$name.png"
    sips -s format "$fmt" -s formatOptions 85 "$tmp" --out "$out" >/dev/null
    rm -f "$tmp"
    echo "$out $(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixel/{printf "%s ", $2}')$(du -k "$out" | cut -f1) KB"
done
