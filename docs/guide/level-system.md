# Level system (100 levels)

The 100 levels of the game are planned, drawn and built by a small pipeline. The design sheet
**`design/level-system.xlsx`** holds the criteria, the level table and the image descriptions.

## Pipeline

| Step | Command | Output |
|---|---|---|
| Plan (roles, targets, pairs, colours) | `tools/level-plan.ts` | used by the steps below |
| Drawings | `npm run art` (keeps existing files; `-- --force` overwrites) | `art/levels/NNN_<subject>.svg` |
| Order drawings by structure | `npm run art:measure` | prints the pool order (simple → structured) |
| Build levels | `npm run levels:build` (or `-- 12 37` for some levels) | `levels/NNN-<subject>.json`, collection **Main**, `design/level-report.json` |
| Design sheet | `python3 tools/export-sheet.py` | `design/level-system.xlsx` |

**Replacing a picture:** edit or replace `art/levels/NNN_<subject>.svg` (any vector tool), then run
`npm run levels:build -- NNN` and `python3 tools/export-sheet.py`. Don't run `npm run art -- --force`
afterwards: it would overwrite hand-made SVGs with the built-in drawings.

## Difficulty score

0–100, the same formula in the game, the editor and the sheet (`src/core/difficulty.ts`):

| Criterion | Measured as | Range (0 → full) | Weight |
|---|---|---|---|
| Pairs | number of pairs | 3 → 45 | 30% |
| Blocking depth | rounds when every open pair is cleared each round | 1 → 6 | 30% |
| Trap share | dots that would bump something if tapped first | 0 → 60% | 30% |
| Colours | distinct colours | 2 → 12 | 10% |

## Rules

- Level 1 = tap tutorial. From level 2, blocks of 5: slot 1 **relax**, slot 3 **hard**, slots 2/4/5 **normal**
  (relax 2, 7, 12, …; hard 4, 9, 14, 19, …).
- Relax is easier than every normal of its block (level 2 is the collision tutorial and has one block).
- Hard levels 4, 9, 14 are only a little harder than their block and the previous hard level.
  From **level 19** hard levels are really hard: base + 20 (max 85).
- Targets: normal 10 → 55, relax = normal − 8. The builder picks, for every level, the layout closest
  to the target that also respects the rules, sweeping the generator's difficulty dial (dots placed on
  crossing lines) and ±25% pairs.
- **Big dots** only on strokes marked `data-big="1"` in the SVG: one accent pair on relax levels,
  sometimes a blocker on hard levels. Never sprinkled.
- Tutorials: level 1 tap, level 2 bumping, level 8 pinch zoom. Hard slots show the "Hard" label.

## Drawing rules (SVG)

- A stroke that **ends exactly on** another stroke is a T-junction: its dot blocks that stroke.
- Crossing strokes don't block, unless the generator puts a dot on the crossing (difficulty dial).
- Never let two strokes overlap along an edge (e.g. two rectangles sharing a side).
- Supported elements: `path` (M L H V C S Q T Z), `line`, `polyline`, `polygon`, `rect`, `circle`,
  `ellipse`; no transforms. Canvas 400 × 400.
