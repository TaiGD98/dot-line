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
import { ART, POOLS, Role } from './art-library';

export interface PlanRow {
    level: number;
    block: number | null;
    slot: number | null;
    role: Role | 'tutorial';
    tutorial?: 'tap' | 'collision' | 'zoom';
    target: number;
    pairs: number;
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
export const basePairs = (l: number) => Math.round(5 + 33 * Math.pow((l - 1) / 99, 0.9));
export const baseColours = (l: number) => Math.min(12, 3 + Math.floor((l - 1) / 11));

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
        if (role === 'relax') { target = l === 2 ? 12 : Math.max(5, base(l) - 8); pairs = Math.max(3, Math.round(basePairs(l) * 0.7)); colours = Math.max(3, colours - 1); bigDots = 'accent'; }
        if (role === 'hard') {
            if (l < FIRST_REAL_HARD) {
                // A little above the normals of its block (the last normal is l + 2) and the last hard.
                target = Math.max(base(l + 2) + 4, prevHard + 3);
                pairs = basePairs(l) + 2;
            } else {
                target = Math.min(85, base(l) + 20);
                pairs = Math.round(basePairs(l) * 1.2);
                colours = Math.min(12, colours + 1);
                bigDots = 'blocker';
            }
            prevHard = target;
        }
        const art = role === 'tutorial' ? take.first.shift()! : take[role].shift()!;
        const a = ART[art];
        rows.push({
            level: l, block, slot, role, target: Math.round(target), pairs, colours, bigDots, art,
            file: `${String(l).padStart(3, '0')}_${art}.svg`, name: a.name, desc: a.desc,
            tutorial: l === 1 ? 'tap' : l === 2 ? 'collision' : l === 8 ? 'zoom' : undefined
        });
    }
    return rows;
}
