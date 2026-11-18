# Level system (100 levels)

The 100 levels of the game are planned, drawn and built by a small pipeline. The design sheet
**`design/level-system.xlsx`** holds the criteria, the level table and the image descriptions.

## Pipeline

| Step | Command | Output |
|---|---|---|
| Plan (roles, targets, pairs, colours) | `tools/level-plan.ts` | used by the steps below |
| Drawings | `npm run art` (keeps existing files; `-- --force` overwrites) | `art/levels/NNN_<subject>.svg` |
| Order drawings by structure | `npm run art:measure` | prints the pool order (simple → structured) |
| Build levels (chapter 1) | `npm run levels:build` (or `-- 12 37` for some levels) | `levels/chapter-1/NNN-<subject>.json`, collection **Main**, `design/level-report.json` |
| Build chapter 3 | `npm run levels:chapter3` (or `-- 12 37`) | `levels/chapter-3/c3-NNN-<subject>.json`, its drawings in `art/chapter-3/`, `design/chapter-3-report.json` |
| Design sheet | `python3 tools/export-sheet.py` | `design/level-system.xlsx` |

**Replacing a picture:** edit or replace `art/levels/NNN_<subject>.svg` (any vector tool), then run
`npm run levels:build -- NNN` and `python3 tools/export-sheet.py`. Don't run `npm run art -- --force`
afterwards: it would overwrite hand-made SVGs with the built-in drawings.

## Difficulty score

0–100, the same formula in the game, the editor and the sheet (`src/core/difficulty.ts`):

| Criterion | Measured as | Range (0 → full) | Weight |
|---|---|---|---|
| Pairs | number of pairs | 3 → 100 | 30% |
| Blocking depth | rounds when every open pair is cleared each round | 1 → 12 | 30% |
| Trap share | dots that would bump something if tapped first | 0 → 60% | 30% |
| Colours | distinct colours | 2 → 12 | 10% |

## Rules

- Level 1 = tap tutorial. From level 2, blocks of 5: slot 1 **relax**, slot 3 **hard**, slots 2/4/5 **normal**
  (relax 2, 7, 12, …; hard 4, 9, 14, 19, …).
- Relax is easier than every normal of its block (level 2 is the collision tutorial and has one block).
- Hard levels 4, 9, 14 are only a little harder than their block and the previous hard level.
  From **level 19** hard levels are really hard: base + 20 (max 85).
- Targets (v2 levels): normal 10 → 55, relax = normal − 8. The builder picks, for every level, the layout closest
  to the target that also respects the rules, sweeping the generator's difficulty dial (dots placed on
  crossing lines) and ±25% pairs.
- **Pair counts:** levels 1–4 are small (3, 6, 12, 16). From level 5 the fewest is **27** (easiest),
  about **60 at level 19**, up to **100**. Normal = 27 + 60 × (1 − e^−(level−5)/25); relax = 0.82 × normal
  (min 27); early hard = last normal of the block + 3; hard from 19 = 1.18 × normal (max 100), so
  neighbouring levels never jump much.
- **2-part generator (levels 1–10, more to follow):** target lines = **base + X + T**.
  - Part 1 (`src/core/strokemode.ts`, stroke mode): one line per stroke of the drawing; the drawing decides
    how many. Part 2 adds the rest of the target lines with the planned X / T split. Near lines never share a colour.
  - Part 2 (`src/core/overlap.ts`): the cross lines, as a pattern over the picture. **X** crosses other lines
    with both dots in empty space (blocks nothing); **T** has one dot on another line (blocks it). Never both
    dots on other lines; crossing lines never share a colour; mirrored when the drawing is symmetric.
  - T share of the cross lines: relax 35%, normal 50%, hard before 19 62%, hard from 19 on 70%. Levels 1–4 by
    hand: 3+0+0, 4+1+1, 6+4+2, 8+3+5.
  - Target score = the difficulty formula on the plan (lines, planned depth, blocked share = T / lines, colours).
  - Pattern per drawing (`PATTERNS` in `tools/level-plan.ts`): stripes for the T-shirt, phone, book and fence,
    columns for the ladder and mushroom, fringe for the lollipop and star, rays for the clock.
  - The world grows with the line count (`worldSize`), and again by up to 40% if a pattern has no room.
  - Block rules compare a level only with levels built by the same generator (and levels 1–4 among themselves).
- **Old layouts:** levels 11–21 still use generator v3 and levels 22–100 generator v2 until they are rebuilt
  with the 2-part generator (grey rows in the sheet).
- **Generator v3 (levels 11–21, `src/core/layered.ts`, to be replaced):**
  1. The main lines of the drawing become **long pairs**, cut symmetrically about the vertical axis
     (mirrored strokes are cut alike; closed loops start on the axis).
  2. **Blocker pairs** with random shapes and sizes then fill the empty space inside the drawing. Their
     ends sit on other pairs' lines (that's what blocks them), favouring the pairs blocked least.
  3. Two numbers stay about the same at every difficulty: each pair is blocked by **~1.3–1.5** others,
     and **~1/3** of the pairs can be cleared right away. Difficulty comes from the pair count and the
     blocking depth that follows. Every blocker keeps the level solvable.
  Drawings for levels 5–21 are symmetric with few strokes.
- **Big dots** only on strokes marked `data-big="1"` in the SVG: one accent pair on relax levels,
  sometimes a blocker on hard levels. Never sprinkled.
- Tutorials: level 1 tap, level 2 bumping, level 8 pinch zoom. Hard slots show the "Hard" label.

## Drawing rules (SVG)

- A stroke that **ends exactly on** another stroke is a T-junction: its dot blocks that stroke.
- Crossing strokes don't block, unless the generator puts a dot on the crossing (difficulty dial).
- Never let two strokes overlap along an edge (e.g. two rectangles sharing a side).
- Supported elements: `path` (M L H V C S Q T Z), `line`, `polyline`, `polygon`, `rect`, `circle`,
  `ellipse`; no transforms. Canvas 400 × 400.

## Chapter 3: profile of the reference data

Chapter 3 (`tools/build-chapter3.ts`) holds 100 **original** levels whose numbers follow the profile
the designer measured on another game of the genre (first 100 levels of its default playlist).
Only the numbers are reused; the drawings are ours and every layout is generated, nothing is copied.

| | Reference (median, 10–90%) | Chapter 3 plan |
|---|---|---|
| Rhythm | 71% normal, 20% hard, 8% very hard, 1 super hard; a harder level every 1–6 levels (median 3) | same rule, gaps sampled from the reference |
| Normal | 22 lines (14–30), 17 → 25 over the chapter; depth 9 (6–15); 21% open; 1.4 blocks/line | same, with random spread |
| Hard | 61 lines (52–81); depth 13; 27% open | same |
| Very hard | 82 lines (71–113); depth 18; 28% open | same (max 100 lines) |
| Super hard | 104 lines; depth 45 | 100 lines; depth 30 |
| Style | 40% straight lines; 9–11 colours | 40% straight blockers; 9–11 colours |
| Tutorials | 3, 4, 6 lines | 3, 4, 6 lines (tap, bump); zoom on the first hard level |

Drawings are matched by size: the levels with the most lines get the drawings with the most strokes.
Chapter 3 reuses the drawing library of chapter 1 (each drawing once); replace any
`art/chapter-3/NNN_<subject>.svg` and run `npm run levels:chapter3 -- NNN` to rebuild that level.
