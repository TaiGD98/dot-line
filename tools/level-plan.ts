// The 100-level system: role and target difficulty of every level (single source of truth for
// the art export, the level build and the design sheet).
//
// Rules (from the designer):
// - Level 1 is the tap tutorial. From level 2, levels go in blocks of 5: the 1st is RELAX (easy),
//   the 3rd is HARD, the others NORMAL. So relax = 2, 7, 12, ... and hard = 4, 9, 14, 19, ...
// - Hard levels before 19 (4, 9, 14) are only a little harder than the normals of their block and
//   than the previous hard level. From 19 on, hard levels are really hard (easy to lose).
// - Big dots: relax = one accent pair, hard = one blocker pair (where the drawing marks it).
// - Targets follow the score range the drawings can actually reach (npm run art:measure):
//   normal 10 -> 55, relax = normal - 8, early hard = block normals + 4, real hard = normal + 20 (max 85).
// - Pair counts (designer, v3): levels 1-4 stay small (tutorials). From level 5 the fewest pairs
//   is 27 (easiest), level 19 (first real hard) has ~60, the most is 100. Neighbouring levels never
//   jump much: normal = 27 -> ~85 on a smooth curve, relax = 0.82 x normal (min 27),
//   early hard = the block's last normal + 3, real hard = 1.18 x normal (max 100).
import { ART, POOLS, Role } from './art-library';
import { DIFFICULTY } from '../src/core/difficulty';
import type { PatternStyle } from '../src/core/overlap';

export interface PlanRow {
    level: number;
    block: number | null;
    slot: number | null;
    role: Role | 'tutorial';
    tutorial?: 'tap' | 'collision' | 'zoom';
    /** Planned difficulty score, computed from the planned lines, depth, blocked share and colours. */
    target: number;
    /** Target lines in total = base + x + t. */
    pairs: number;
    /** Generator part 1: pairs that fill the lines of the drawing. */
    base: number;
    /** Generator part 2: X cross lines (cross other lines, block nothing). */
    x: number;
    /** Generator part 2: T cross lines (one dot on another line: blocks it). */
    t: number;
    /** Overlap pattern used by part 2. */
    pattern: PatternStyle;
    /** Planned blocking depth (rounds). */
    depth: number;
    /** Target difficulty 1..5 given to both generator parts. */
    genDifficulty: number;
    colours: number;
    bigDots: 'none' | 'accent' | 'blocker';
    art: string;
    file: string;
    name: string;
    desc: string;
}

export const FIRST_REAL_HARD = 19;
/** Base difficulty curve of a normal level (score 0-100). */
export const base = (l: number) => 10 + 45 * Math.pow((l - 1) / 99, 0.9);
/** Pairs of a normal level. */
export const MIN_PAIRS = 27;
const SMALL_PAIRS = [3, 6, 12, 16]; // levels 1-4
export const basePairs = (l: number) => (l <= 4 ? SMALL_PAIRS[l - 1] : Math.round(MIN_PAIRS + 60 * (1 - Math.exp(-(l - 5) / 25))));
export const baseColours = (l: number) => (l <= 4 ? 3 + Math.floor(l / 2) : Math.min(12, 6 + Math.floor((l - 5) / 12)));

/**
 * Split of the target lines (designer, 2-part generator): about 42% fill the drawing (base), the
 * rest are cross lines. T share of the cross lines by role: relax 35%, normal 50%, hard before 19
 * 62%, hard from 19 on 70% (T lines block, X lines only decorate). Levels 1-4 are set by hand.
 */
const SMALL_SPLIT: [number, number, number][] = [[3, 0, 0], [4, 1, 1], [6, 4, 2], [8, 3, 5]];
export function split(l: number, role: PlanRow['role'], total: number): { base: number; x: number; t: number } {
    if (l <= 4) { const [base, x, t] = SMALL_SPLIT[l - 1]; return { base, x, t }; }
    const base = Math.round(total * 0.42), cross = total - base;
    const t = Math.round(cross * (role === 'relax' ? 0.35 : role === 'hard' ? (l < FIRST_REAL_HARD ? 0.62 : 0.7) : 0.5));
    return { base, x: cross - t, t };
}

/** Planned blocking depth: normal 3 (+1 every 30 levels), relax one less, hard one more (two from level 19). */
export function depthPlan(l: number, role: PlanRow['role']): number {
    if (l === 1) return 1;
    if (l <= 3) return 2;
    const normal = 3 + Math.floor((l - 5) / 30);
    return role === 'relax' ? normal - 1 : role === 'hard' ? (l === 4 ? 3 : normal + (l < FIRST_REAL_HARD ? 1 : 2)) : normal;
}

/** The game's difficulty formula applied to planned values (blocked share = T lines / all lines). */
export function plannedScore(lines: number, depth: number, blocked: number, colours: number): number {
    const n = (v: number, c: { min: number; max: number }) => Math.max(0, Math.min(1, (v - c.min) / (c.max - c.min)));
    const d = DIFFICULTY;
    return Math.round(100 * (d.pairs.weight * n(lines, d.pairs) + d.depth.weight * n(depth, d.depth) + d.traps.weight * n(blocked, d.traps) + d.colours.weight * n(colours, d.colours)));
}

/** Overlap pattern per drawing (levels rebuilt with the 2-part generator); others: auto. */
const PATTERNS: Record<string, PatternStyle> = {
    lollipop: 'fringe', tshirt: 'stripes', ladder: 'columns', phone: 'stripes', book: 'stripes',
    mushroom: 'columns', star: 'fringe', fence: 'stripes', clock: 'rays'
};

export function plan(): PlanRow[] {
    const take = { first: [...POOLS.first], relax: [...POOLS.relax], hard: [...POOLS.hard], normal: [...POOLS.normal] };
    const rows: PlanRow[] = [];
    let prevHard = 0;
    for (let l = 1; l <= 100; l++) {
        const block = l === 1 ? null : Math.floor((l - 2) / 5) + 1;
        const slot = l === 1 ? null : ((l - 2) % 5) + 1;
        const role: PlanRow['role'] = l === 1 ? 'tutorial' : slot === 1 ? 'relax' : slot === 3 ? 'hard' : 'normal';
        let target = base(l), pairs = basePairs(l), colours = baseColours(l);
        let bigDots: PlanRow['bigDots'] = 'none';
        if (role === 'tutorial') { target = 2; pairs = 3; colours = 3; }
        if (role === 'relax') { target = l === 2 ? 12 : Math.max(5, base(l) - 8); pairs = l <= 4 ? basePairs(l) : Math.max(MIN_PAIRS, Math.round(basePairs(l) * 0.82)); colours = Math.max(3, colours - 1); bigDots = 'accent'; }
        if (role === 'hard') {
            if (l < FIRST_REAL_HARD) {
                // A little above the normals of its block (the last normal is l + 2) and the last hard.
                target = Math.max(base(l + 2) + 4, prevHard + 3);
                pairs = l <= 4 ? basePairs(l) : basePairs(l + 2) + 3;
            } else {
                target = Math.min(85, base(l) + 20);
                pairs = Math.min(100, Math.round(basePairs(l) * 1.18));
                colours = Math.min(12, colours + 1);
                bigDots = 'blocker';
            }
            prevHard = target;
        }
        const art = role === 'tutorial' ? take.first.shift()! : take[role].shift()!;
        const a = ART[art];
        const sp = split(l, role, pairs), depth = depthPlan(l, role);
        const genDifficulty = l <= 2 ? 1 : l <= 4 ? l - 1 : role === 'relax' ? 2 : role === 'hard' ? (l < FIRST_REAL_HARD ? 4 : 5) : 3;
        target = plannedScore(pairs, depth, sp.t / pairs, colours);
        rows.push({
            level: l, block, slot, role, target: Math.round(target), pairs, ...sp, pattern: PATTERNS[art] ?? 'auto', depth, genDifficulty, colours, bigDots, art,
            file: `${String(l).padStart(3, '0')}_${art}.svg`, name: a.name, desc: a.desc,
            tutorial: l === 1 ? 'tap' : l === 2 ? 'collision' : l === 8 ? 'zoom' : undefined
        });
    }
    return rows;
}
