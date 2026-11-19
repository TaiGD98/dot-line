# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://taigd98.github.io/dot-line/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- No changes since v0.5.0.

[Play latest](https://taigd98.github.io/dot-line/demo/)

## v0.5.0

**Three ways to play** (landing page: **Play Classic**, **Play Jelly**, **Play Magic**; the same levels in each)
- **Jelly** ([/jelly/](https://taigd98.github.io/dot-line/jelly/)): dots deform while they move instead of leaving a trail, jiggle more on a bump, and a dot that reaches its partner presses into it and merges into one blob before popping.
- **Magic** ([/magic/](https://taigd98.github.io/dot-line/magic/)): the level is a seal on a double door in the board colours. The leaves slam shut, one dot of each pair runs along its line to the other end, then play starts (a tutorial caption only shows from then on). When the last dot is gone the level's map (lines and dots) glows gold, the seam lights up and the door opens, each leaf taking its half of the map, onto a glowing room behind it; the HUD bands slide away for the Well Done screen and back in on the next level. Glass orb dots in every colour.

**Feel**
- **Droplets:** when two dots bump, each splashes a few droplets in its own colour; a dot reaching its partner splashes too before the pair pops (every version).
- **Smaller hitbox:** two dots bump when their centres are closer than 78% of their radii (was 85%). A dot a few px clear of a line (centre 25 px or more from it) no longer stops a dot running on that line; dots that do block a line now sit plainly on it.

**Colours**
- **No two look-alike colours side by side:** the 28 colours form 10 families (reds, oranges, yellows, limes, greens, cyans, blues, purples, magenta, pinks). Lines within 60 px of each other never share a colour or a family and always look clearly different, on the light and on the dark board alike. A level uses as many colours as it can.
- **No line edges; colours that would sink into the board are swapped** for a readable colour of the same family (light ones on the light board, deep ones on the dark board), and swapped back when the theme changes.

**Levels**
- **All 30 levels generated again** (chapter 6, same order, same tutorials) with the new colour rule, dots plainly on or off lines, and big dots on circles drawn as lines (the Christmas tree's ornaments). Small ghosts and other not-quite-round shapes stay lines.
- **Fix:** LEVEL 6 (Christmas tree) is no longer upside down.

**Level editor**
- **Big dots from drawn circles:** a line that curls round a circle, a loop or an open hook at the end of a line, and a round arc hanging from another line become big dots; lines pulled back to make room grow back where there is room again, so less of the drawing is lost.
- **Saving no longer reloads the editor page** (only the dev game reloads with the new levels).

[Play v0.5.0](https://taigd98.github.io/dot-line/v0.5.0/demo/) · [Docs v0.5.0](https://taigd98.github.io/dot-line/v0.5.0/docs/)

## v0.4.0

- **Play on:** the "Out of Hearts!" screen has PLAY ON (AD): the hearts are refilled and the level goes on from where it stopped. QUIT asks "Are you sure?" first, showing the level's progress and that it will be lost: PLAY ON or REPLAY (start the level again).
- **No more slow-motion ending:** the last dot runs at normal speed and the end screen comes half a second after the pop.
- **The game build contains exactly the play order** (levels/game.json): only those levels, in that order (the game bundle shrank from ~3.9 MB to ~1 MB).
- **Organiser:** a **Game · play order** list (levels from any chapter, saved in `levels/game.json`, which the game now reads), a picture of every level in the lists, and a **Tutorial** choice per level.
- **Level editor:** a level-wide **Dot size** in the Inspector (every normal dot, cross lines included; big dots keep theirs) and a **big dot** box per dot (a pair can have one big and one normal dot). Big dots are sized from the drawing's detail, at least 1.3× the dot size. Small clusters of thick strokes (a nose with an "x" mouth) are no longer taken for a filled round detail.
- **New level order:** chapter 5's levels 25–28 now come right after the two tutorials (LEVEL 3–6); the pinch-to-zoom tutorial moved with them to LEVEL 3. Pumpkin (now LEVEL 7) was reworked by hand (17 lines).

[Play v0.4.0](https://taigd98.github.io/dot-line/v0.4.0/demo/) · [Docs v0.4.0](https://taigd98.github.io/dot-line/v0.4.0/docs/)

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
| 2026-11-19 | Released v0.5.0 |
| 2026-11-18 | Released v0.3.0 |
