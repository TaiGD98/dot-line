#!/usr/bin/env bash
# Assembles the GitHub Pages site: landing page at /, game at /demo/, its jelly and magic variants at /jelly/ and /magic/,
# docs at /docs/,
# level editor at /editor/ (publish-site.sh keeps the editor out of versioned snapshots).
set -euo pipefail

rm -rf _site
npm run build
npm run docs:build
npm run build:editor

mkdir -p _site
cp site/index.html _site/
cp -R dist _site/demo
# Variants: the same build and levels, switched by a flag (src/game/mode.ts).
for mode in jelly:Jelly magic:Magic; do
    dir="${mode%%:*}" name="${mode##*:}"
    cp -R dist "_site/$dir"
    sed -i.bak "s#<title>Dot Line</title>#<title>Dot Line $name</title><script>window.__DOTLINE_MODE__ = '$dir';</script>#" "_site/$dir/index.html"
    rm "_site/$dir/index.html.bak"
    grep -q "__DOTLINE_MODE__ = '$dir'" "_site/$dir/index.html" || { echo "$dir/index.html: mode flag not set" >&2; exit 1; }
done
cp -R docs/.vitepress/dist _site/docs
cp -R dist-editor _site/editor
