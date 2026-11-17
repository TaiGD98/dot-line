# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://taigd98.github.io/dot-line/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- No changes since v0.1.0.

[Play latest](https://taigd98.github.io/dot-line/demo/)

## v0.1.0

- **Core loop:** tap a dot and it runs along its line to its partner; reaching it pops the pair (bigger dots, bigger splash) and the line stays in the Completed colour.
- **Blocking and hearts:** bumping into another pair's dot sends the dot back and costs a heart; 3 hearts, none left = level lost. Several dots can run at once.
- **HUD:** pause, hearts, hint (zooms to 1.5x and nudges a dot that can go, marked AD), progress bar, "Hard" label on difficulty 4+.
- **Camera:** pinch to zoom up to 3x and drag to pan; the HUD does not zoom.
- **Win / lose screens:** "Well Done!" with confetti and CONTINUE, "Out of Hearts!" with RETRY.
- **10 intro levels:** Ripples, Flag and Kite teach tapping, bumping and pinch zoom; then House, Fish, Sailboat, Umbrella, Rocket, Tree and Castle.
- **Level editor** at `/editor/`: draw and bend pairs with snapping, generate levels from a PNG or SVG drawing (always solvable, pick 1 of 3 layouts), level checks and solver, versions, collections, play test.
- **Game Design Document:** overview, core loop, rules, palette and roadmap. Level difficulty targets are still to be decided.

[Play v0.1.0](https://taigd98.github.io/dot-line/v0.1.0/demo/) · [Docs v0.1.0](https://taigd98.github.io/dot-line/v0.1.0/docs/)

## Document history

| Date | Change |
|---|---|
| 2026-11-16 | GDD created |
| 2026-11-16 | Imported GDD v0.2 (overview, core loop, rules, roadmap) |
| 2026-11-16 | Dây ở lại với màu Completed; thêm bảng màu (3.7) |
| 2026-11-17 | Released v0.1.0 |
