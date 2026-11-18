// Plan of the silhouette levels: the difficulty rules of the designer, as data.
// tools/build-silhouettes.ts builds the levels from it and writes it, with what was measured, to
// design/silhouette-levels-report.json; the sheet design/silhouette-level-difficulty.xlsx is exported
// from that report (python3 tools/export-silhouette-sheet.py).
//
// Rules (designer, 2026-11-18):
//   - Difficulty grows mainly with the number of lines (median 27 -> 62 -> 79 -> 113 for difficulty
//     0-3) and with the depth (rounds that must be cleared one after the other).
//     Levels 1, 2, 3 are tutorials and may have fewer lines.
//   - Two numbers stay about the same at every difficulty: each line is blocked about 1.3-1.5 times,
//     and about 1/3 of the lines can be cleared right away.
//   - Hard levels sit at 9, 14, 19, ... (every fifth level). The "Hard" label shows from level 19.
//     The level after a hard one is easy and simple, to relax.
import type { Pattern, Style } from './fill';

export type Role = 'tutorial' | 'normal' | 'relax' | 'hard';
/** Difficulty 0-3 of the designer's scale. */
export type Difficulty = 0 | 1 | 2 | 3;

export const TIERS: { difficulty: Difficulty; name: string; lines: number; depth: number; depthPerLine: number }[] = [
    { difficulty: 0, name: 'normal', lines: 27, depth: 7, depthPerLine: 0.27 },
    { difficulty: 1, name: 'hard', lines: 62, depth: 10, depthPerLine: 0.17 },
    { difficulty: 2, name: 'very hard', lines: 79, depth: 16, depthPerLine: 0.2 },
    { difficulty: 3, name: 'super hard', lines: 113, depth: 18, depthPerLine: 0.16 }
];

/** The same at every difficulty. */
export const CONSTANTS = { blocksPerLine: { min: 1.3, target: 1.4, max: 1.5 }, openShare: { min: 0.28, target: 1 / 3, max: 0.4 } };

/** First level that shows the "Hard" label. */
export const HARD_LABEL_FROM = 19;

/** Hard slots (every fifth level from 9): difficulty and lines. */
export const HARD_SLOTS: Record<number, { difficulty: Difficulty; lines: number; depth: number }> = {
    9: { difficulty: 1, lines: 42, depth: 8 },
    14: { difficulty: 1, lines: 50, depth: 9 },
    19: { difficulty: 1, lines: 56, depth: 10 },
    24: { difficulty: 1, lines: 60, depth: 10 },
    29: { difficulty: 1, lines: 62, depth: 10 },
    34: { difficulty: 1, lines: 64, depth: 11 },
    39: { difficulty: 2, lines: 72, depth: 14 },
    44: { difficulty: 1, lines: 62, depth: 10 },
    49: { difficulty: 1, lines: 66, depth: 11 },
    54: { difficulty: 2, lines: 76, depth: 15 },
    59: { difficulty: 1, lines: 68, depth: 12 },
    64: { difficulty: 2, lines: 78, depth: 16 },
    69: { difficulty: 1, lines: 70, depth: 12 },
    74: { difficulty: 2, lines: 80, depth: 16 },
    79: { difficulty: 3, lines: 104, depth: 17 },
    84: { difficulty: 2, lines: 84, depth: 17 },
    89: { difficulty: 3, lines: 113, depth: 18 },
    94: { difficulty: 2, lines: 88, depth: 18 },
    99: { difficulty: 3, lines: 122, depth: 20 }
};

export interface Row {
    level: number;
    role: Role;
    difficulty: Difficulty;
    /** "Hard" label on screen. */
    label: boolean;
    lines: number;
    depth: number;
    open: number;
    blocks: number;
    tutorial?: 'tap' | 'collision' | 'zoom';
    /** Silhouette file stem, e.g. 087_heart (set by the builder). */
    art: string;
    /** Kind of picture: solid shape, line drawing (thin strokes) or many separate parts (set by the builder). */
    picture?: 'solid' | 'line drawing' | 'many parts';
    pattern: string;
    style: string;
}

/** Fill patterns in rotation. Each has a name for the sheet, the geometry and how it joins lines. */
export interface PatternDef {
    name: string;
    describe: string;
    pattern: Pattern;
    /** Share of line ends that are free tips, before tuning. */
    tipShare: number;
    /** Pitch as a multiple of the style's pitch (wide patterns breathe more). */
    pitch?: number;
    /** Fits simple levels (relax, tutorials). */
    simple?: boolean;
}

export const PATTERNS: PatternDef[] = [
    { name: 'stripes', describe: 'straight parallel lines across the shape, long', pattern: { kind: 'stripes', angle: 0 }, tipShare: 0.18, simple: true },
    { name: 'diagonal', describe: 'stripes at 45 degrees', pattern: { kind: 'stripes', angle: 45 }, tipShare: 0.18, simple: true },
    { name: 'waves', describe: 'parallel wavy lines', pattern: { kind: 'waves', angle: 0, amp: 0.3, wavelength: 4.2 }, tipShare: 0.18 },
    { name: 'bricks', describe: 'rows joined by short rungs, shifted from row to row (short lines, many Ts)', pattern: { kind: 'bricks', angle: 0 }, tipShare: 0.1 },
    { name: 'rings', describe: 'copies of the outline nested inside each other, joined by rungs', pattern: { kind: 'rings' }, tipShare: 0.3, simple: true },
    { name: 'columns', describe: 'vertical stripes', pattern: { kind: 'stripes', angle: 90 }, tipShare: 0.18, simple: true },
    { name: 'zigzag', describe: 'parallel zigzag lines', pattern: { kind: 'zigzag', angle: 0, amp: 0.28, wavelength: 2.6 }, tipShare: 0.18 },
    { name: 'ripples', describe: 'circles around a point, like ripples', pattern: { kind: 'ripples', cx: 0.5, cy: 0.45 }, tipShare: 0.18 },
    { name: 'weave', describe: 'two directions crossing each other (crossings never block)', pattern: { kind: 'cross', angle: 30, ratio: 2 }, tipShare: 0.12, pitch: 1.15 },
    { name: 'rays', describe: 'lines fanning out from a point', pattern: { kind: 'rays', cx: 0.5, cy: 0.5 }, tipShare: 0.2 },
    { name: 'slant', describe: 'stripes at -30 degrees', pattern: { kind: 'stripes', angle: -30 }, tipShare: 0.18, simple: true },
    { name: 'chevrons', describe: 'V-shaped lines pointing down', pattern: { kind: 'chevrons', angle: 90 }, tipShare: 0.18 },
    { name: 'tall waves', describe: 'vertical wavy lines', pattern: { kind: 'waves', angle: 90, amp: 0.3, wavelength: 4.2 }, tipShare: 0.18 },
    { name: 'tiles', describe: 'vertical rows joined by short rungs', pattern: { kind: 'bricks', angle: 90 }, tipShare: 0.1 },
    { name: 'lattice', describe: 'two diagonals crossing: a diamond lattice', pattern: { kind: 'cross', angle: 45, ratio: 1.6 }, tipShare: 0.12, pitch: 1.25 },
    { name: 'corner ripples', describe: 'arcs around a corner of the picture', pattern: { kind: 'ripples', cx: 0.1, cy: 0.95 }, tipShare: 0.18 }
];

/** Dot sizes in rotation ("ball size"): the pitch follows the dot so neighbours never touch. */
export const STYLES: { name: string; style: Style }[] = [
    { name: 'normal', style: { R: 16, pitch: 42, spread: 5 } },
    { name: 'fine', style: { R: 13, pitch: 35, spread: 5 } },
    { name: 'bold', style: { R: 19, pitch: 50, spread: 6 } }
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The 100 rows, without the pictures. */
export function plan(): Row[] {
    const rows: Row[] = [];
    let patternTurn = 0, simpleTurn = 0;
    const simple = PATTERNS.filter((p) => p.simple);
    for (let level = 1; level <= 100; level++) {
        const hard = HARD_SLOTS[level];
        let row: Row;
        if (level <= 3) {
            const [lines, depth] = [[3, 1], [5, 2], [8, 3]][level - 1];
            row = { level, role: 'tutorial', difficulty: 0, label: false, lines, depth, open: level === 1 ? 1 : 0.4, blocks: level === 1 ? 0 : 1, art: '', pattern: 'rings', style: 'bold' };
            if (level === 1) row.tutorial = 'tap';
            if (level === 2) row.tutorial = 'collision';
        } else if (hard) {
            row = { level, role: 'hard', difficulty: hard.difficulty, label: level >= HARD_LABEL_FROM, lines: hard.lines, depth: hard.depth, open: CONSTANTS.openShare.target, blocks: CONSTANTS.blocksPerLine.target, art: '', pattern: '', style: 'normal' };
            if (level === 9) row.tutorial = 'zoom';
        } else {
            // normal levels grow from 20 lines (level 4) to 34 (level 98): median 27
            const normal = Math.round(20 + (14 * (level - 4)) / 94);
            const relax = HARD_SLOTS[level - 1] !== undefined;
            const lines = relax ? clamp(Math.round(normal * 0.72), 16, 24) : normal;
            row = { level, role: relax ? 'relax' : 'normal', difficulty: 0, label: false, lines, depth: Math.max(3, Math.round(lines * (relax ? 0.22 : 0.27))), open: CONSTANTS.openShare.target, blocks: CONSTANTS.blocksPerLine.target, art: '', pattern: '', style: 'normal' };
        }
        if (!row.pattern) {
            if (row.role === 'relax') { row.pattern = simple[simpleTurn++ % simple.length].name; row.style = 'bold'; }
            else {
                row.pattern = PATTERNS[patternTurn++ % PATTERNS.length].name;
                // ball size in rotation: mostly normal, every third level fine; hard levels never bold
                row.style = patternTurn % 3 === 2 ? 'fine' : row.role === 'normal' && patternTurn % 7 === 4 ? 'bold' : 'normal';
            }
        }
        rows.push(row);
    }
    return rows;
}
