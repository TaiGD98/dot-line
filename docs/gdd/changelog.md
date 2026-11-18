# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://taigd98.github.io/dot-line/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- **New level order:** chapter 5's levels 25–28 now come right after the two tutorials (LEVEL 3–6); the pinch-to-zoom tutorial moved with them to LEVEL 3. Pumpkin (now LEVEL 7) was reworked by hand (17 lines).

[Play latest](https://taigd98.github.io/dot-line/demo/)

## v0.3.0

**Levels and tutorials**
- **Play order:** level 1–2 of chapter 1 (tutorials: tap, bumping), then the 28 levels of chapter 5, drawn from public-domain line art (30 levels). Set in `src/game/playlist.ts`.
- **Tutorials:** level 2 forgives the first bump ("Free this time! Next bump costs a heart"); level 3 (Pumpkin) teaches pinch to zoom.
- **Pumpkin (level 3)** reworked by hand: one line fewer, still solvable.

**Boosters**
- A bottom panel (in the board colour, over the board) holds the boosters: **Hint** (moved from the top right) and the new **Cut**: arm the scissors, then tap a line or dot to remove that pair.

**Look and feel**
- **New colours:** dots and lines use the 28 colours of the Voxel materials, with their shading ramps for the dots' rim and gloss; no white or grey. Each level is coloured with one colour scheme (complementary, split-complementary or triadic), as many of its colours as possible, near lines never in the same colour.
- **New board colours** for the light and dark themes (Settings → THEME, remembered in the browser); lines that would sink into the board get a thin edge in their own tone.
- **Glossy dots** with soft drop shadows, **striped dots** after a bump (their next bumps are free), dots that stretch along their path with a fading trail, and an elastic wobble on bumps instead of a screen shake.
- **Accelerating dots:** a tapped dot starts at 500 px/s and gains 250 px/s every second; bumped dots return at 1020 px/s.
- **Cleared lines disappear** with their dots; the Well Done screen shows an empty board.
- **Ending:** when the last dot is about to reach its partner the game goes into slow motion and zooms in on the meeting point; the end screen comes with the pop.
- **Panning at any zoom**, including the smallest (no more stuck off-centre board).

**Level editor**
- **Chapters:** each folder under `levels/` is a chapter with its own levels, history and collections.
- **Generate from a drawing, stroke mode:** each stroke of the drawing becomes one line, ends land on other strokes; smooth rounded lines with no kinks; one dot size per level (**Dot size**) and **big dots** on small round details; runs in the background so the editor never freezes. Part 2 adds an **overlap pattern** of X and T cross lines.
- **Opening a local folder** from the web editor works with the project folder or its `levels` folder, and errors are shown instead of silently doing nothing.

[Play v0.3.0](https://taigd98.github.io/dot-line/v0.3.0/demo/) · [Docs v0.3.0](https://taigd98.github.io/dot-line/v0.3.0/docs/)

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
| 2026-11-18 | Released v0.3.0 |
