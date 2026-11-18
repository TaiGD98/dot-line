# 5. Changelog

Every published version stays playable at its own URL. The [landing page](https://taigd98.github.io/dot-line/) lists them all.

## latest (main) <Badge type="tip" text="Live" />

- **Well Done screen:** no faded picture behind it any more (the board stays empty).
- **New colours:** dots and lines use the 28 colours of the Voxel materials (with their shading ramps for the dots' rim and gloss); new board colours for the light and dark themes; lines that would sink into the board get a thin edge in their own tone. Each level in the game is coloured with one colour scheme (complementary, split-complementary or triadic), as many of its colours as possible, near lines in different colours.
- **Pinch-to-zoom tutorial on level 3** (Pumpkin): it ends after the first zoom.
- **Level 2 (bump tutorial):** the first bump is free; a message says the next one costs a heart. Caption: "Blocked dots bounce back".
- **More colours, no white or grey:** the levels in the game (chapter 1 levels 1–2, chapter 5) were recoloured: up to 14 colours per level, near lines never share a colour.
- **Play order (playlist):** the game plays level 1–2 of chapter 1 (with their tutorials), then chapter 5 from its level 1 (30 levels). Set in `src/game/playlist.ts`; the dev menu lists the playlist first, then every other level.
- **Boosters at the bottom:** a bottom panel (in the background colour, over the board) holds the boosters: **Hint** (moved from the top right) and the new **Cut** (scissors): arm it, then tap a line or dot to remove that pair.
- **Ending:** when the last dot is about to reach its partner the game goes into slow motion and the camera zooms in with the meeting point in the middle of the screen; the end screen comes with the pop.
- **Panning at any zoom:** the board can be dragged at the smallest zoom too (zooming out at the edge no longer leaves it stuck off-centre).
- **No more white and grey:** they sank into the background. Levels that still use them get another colour when they are loaded (one no near line has).
- **Dark theme:** switch between light and dark in Settings (the pause button); remembered in the browser.
- **Striped dots:** after a bump, the bumping pair gets white stripes; striped dots bump for free (no heart). Other dots bumping into a striped dot still cost a heart and get striped.
- **Ball feel:** moving dots stretch along their path and leave a fading trail; bumps make both dots wobble elastically.
- **Cleared lines disappear** with their dots.
- No more screen shake on a bump (the dots' elastic wobble is the feedback).
- **Glossy dots with soft drop shadows** (light from the top-left).
- **Accelerating dots:** a tapped dot starts at 500 px/s, reaches 750 px/s after 1 second and keeps accelerating the same way to the end of its line (bumped dots return at 1020 px/s).
- **Stroke mode (editor, Generate part 1):** each stroke of the drawing becomes one line; its ends land on other strokes (blocking them) or stay free, like hand-made levels of the genre. Blocking loops are removed automatically, and the level is nudged toward ~1/3 open and ~1.3 blocks per line.
- **Smooth generated lines:** traced strokes are smoothed, every sharp corner is rounded, and an end joins the line it lands on along a curve that continues the stroke (no kinks, no hooks at the ends).
- **One line width, one dot size:** every line is 5.1 px wide and every normal dot of a generated level has the same radius (Generate → **Dot size**, default 16, at least 11). When the drawing needs more room the board grows instead of the dots shrinking. Level checks tell when dots are not all one size.
- **Big dots:** a small closed round detail of the drawing (an eye, a nose, a button, a bauble) becomes a big dot instead of a line. A line of the drawing that touches the detail carries it (big dot + normal dot); two details with no line become one pair (big + big).
- **Chapters:** each folder under `levels/` is a chapter. The current 110 levels are **chapter 1** (`levels/chapter-1/`); the editor has a Chapter picker (each chapter has its own levels, history and collections) and the game plays the chapters in order.
- **Chapter 3** (`levels/chapter-3/`): 100 new levels built to the profile of the reference data (rhythm of harder levels, lines, blocking depth, ~21% open at start), with our own drawings.
- **Levels 1–10 rebuilt with a 2-part generator:** part 1 fills the lines of the drawing; part 2 adds an **overlap pattern** of cross lines (X: crosses lines, blocks nothing; T: one dot on another line, blocks it). The pattern decorates the picture (stripes, columns, fringe, rays), mirrored on symmetric drawings, and the original shape stays visible. Target lines = base + X + T; crossing lines never share a colour and near lines don't either.
- **Level editor:** Generate now has two independent parts (Fill the lines / Overlap pattern with X cross, T cross and a pattern choice), a Line type per pair, and new checks for colours and cross lines. Hand-drawn lines round themselves (hold Alt for sharp corners); Smooth also rounds corners.
- **Earlier step (levels 11–21 still use it):** from level 5 every level has at least 27 pairs, about 60 at level 19 (up to 100 later), with no big jumps between neighbours. The drawing's main lines are long, symmetric pairs; random blocker pairs fill the space inside. Each pair is blocked by ~1.4 others and ~1/3 of the pairs are open at the start, at every difficulty. Levels 5–21 use symmetric drawings (owl, crown, trophy, rocket, gift, mushroom, butterfly, window replace key, whale, bucket, shoe, pencil cup, jellyfish, pear, wheel).
- Difficulty score now counts pairs up to 100 and blocking depth up to 12.
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
