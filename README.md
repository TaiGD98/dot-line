# Dot Line

A one-tap puzzle where you send each dot along its line to its partner without bumping into other dots

A Phaser 4 + TypeScript prototype. Play it at https://taigd98.github.io/dot-line/demo/ · docs and Game Design Document at https://taigd98.github.io/dot-line/docs/.

## Run

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
```

## Releases

The live site is built locally and pushed to the `gh-pages` branch. There is no CI deploy.

```bash
npm run release:latest                  # after pushing main: update https://taigd98.github.io/dot-line/
npm version minor && npm run release    # publish a frozen copy at /dot-line/vX.Y.0/
```

The landing page lists every version. See `docs/guide/deployment.md` for details.
