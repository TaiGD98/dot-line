# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://taigd98.github.io/dot-line/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- **Striped dots:** after a bump, the bumping pair gets white stripes; striped dots bump for free (no heart). Other dots bumping into a striped dot still cost a heart and get striped.
- **Ball feel:** moving dots stretch along their path and leave a fading trail; bumps make both dots wobble elastically.
- **Cleared lines disappear** with their dots; the whole picture comes back only when the level is won.
- No more screen shake on a bump (the dots' elastic wobble is the feedback).
- **Glossy dots with soft drop shadows** (light from the top-left).
- Dot speed tuned to 750 px/s (bumped dots return at 1020 px/s).
- **Dev speed cheat** (⚙ speed, bottom left): change the dot speed live; Confirm writes it into the code on the local dev server.

[Play latest](https://taigd98.github.io/dot-line/demo/)

## v0.2.0

- **100 levels:** played in blocks of 5 from level 2 (relax, normal, hard, normal, normal). Levels 4, 9 and 14 are a little harder than their block; from level 19 hard levels are really hard. Each level is a familiar picture (rainbow, ladder, wheel, bookshelf, spider web...), drawn as SVG in `art/levels/`.
- **Tutorials:** level 1 tap, level 2 bumping costs a heart, level 8 pinch to zoom. Hard levels show the "Hard" label.
- **Big dots** only as an accent or a blocker, at most one pair per level.
- **Fix:** dots that only touch at the edge no longer count as a bump (hitbox = 85% of the two radii), e.g. the top of the sailboat's left sail.
- **Level editor:** opens the game's own levels when you choose the project folder; generating with many pairs keeps the whole drawing (stuck pairs are joined instead of removed); a difficulty dial puts dots on crossing lines.
- **Game Design Document:** difficulty score (pairs, blocking depth, trap share, colours) and the level system, also in `design/level-system.xlsx`.
- The 10 earlier intro levels now come after level 100.

[Play v0.2.0](https://taigd98.github.io/dot-line/v0.2.0/demo/) · [Docs v0.2.0](https://taigd98.github.io/dot-line/v0.2.0/docs/)

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
| 2026-11-17 | Released v0.2.0 |
