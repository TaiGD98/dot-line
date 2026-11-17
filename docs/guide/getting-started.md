# Getting Started

## Requirements

- Node.js 20.19 or newer
- npm

## Install

```bash
git clone https://github.com/TaiGD98/dot-line.git
cd dot-line
npm install
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the game dev server at http://localhost:8080 |
| `npm run build` | Type-check and build the game into `dist/` |
| `npm run preview` | Serve the built game locally |
| `npm run docs:dev` | Start the docs dev server |
| `npm run docs:build` | Build the docs into `docs/.vitepress/dist/` |
| `npm run editor` | Start the dev server and open the level editor at http://localhost:8080/editor/ |
| `npm run build:editor` | Build the level editor into `dist-editor/` |
| `npm run levels:intro` | Rebuild the 10 intro levels in `levels/` and the "Intro" collection from the drawings in `tools/intro-levels.ts` (overwrites those levels) |
| `npm run build:site` | Build the full Pages site (landing + demo + docs + editor) into `_site/` |

## Testing on a phone

Run `npx vite --host`, then open the printed network URL on a phone on the same Wi‑Fi.

## Project layout

| Path | What lives there |
|---|---|
| `src/core/` | Shared by game and editor: level format, palette, path maths, blocking model / solver, image tracing, generator |
| `src/scenes/` | Phaser scenes: `Game` (board) and `Hud` (hearts, hint, progress, win / lose) |
| `src/game/source.ts` | Where the game gets levels: `levels/*.json` in collection order, or the editor (`?editor=1`) |
| `levels/`, `collections.json`, `collections/` | The game's levels, in the level editor's folder layout. The game plays the first collection in order, then any other level. Open the project folder in the editor to edit them |
| `src/editor/`, `editor/index.html` | Level editor (see [Level editor](./editor)) |
