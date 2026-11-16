#!/usr/bin/env bash
# Assembles the GitHub Pages site: landing page at /, game at /demo/, docs at /docs/,
# level editor at /editor/ (publish-site.sh keeps the editor out of versioned snapshots).
set -euo pipefail

rm -rf _site
npm run build
npm run docs:build
npm run build:editor

mkdir -p _site
cp site/index.html _site/
cp -R dist _site/demo
cp -R docs/.vitepress/dist _site/docs
cp -R dist-editor _site/editor
