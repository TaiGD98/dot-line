#!/usr/bin/env bash
# Assembles the GitHub Pages site: landing page at /, game at /demo/, its jelly variant at /jelly/,
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
# Jelly variant: the same build and levels, switched to jelly dots by a flag (src/game/mode.ts).
cp -R dist _site/jelly
sed -i.bak "s#<title>Dot Line</title>#<title>Dot Line Jelly</title><script>window.__DOTLINE_MODE__ = 'jelly';</script>#" _site/jelly/index.html
rm _site/jelly/index.html.bak
grep -q "__DOTLINE_MODE__" _site/jelly/index.html || { echo "jelly/index.html: mode flag not set" >&2; exit 1; }
cp -R docs/.vitepress/dist _site/docs
cp -R dist-editor _site/editor
