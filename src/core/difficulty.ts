// Difficulty score (0-100) of a level, from measurable criteria. The same formula and weights
// are in design/level-system.xlsx ("Difficulty criteria"), which recomputes it with formulas.
import { Level } from './level';
import { BlockModel } from './solver';
import { solve } from './solver';

export const DIFFICULTY = {
    /** Pairs: more pairs = more to read and plan. Normalised over [min, max]. */
    pairs: { weight: 0.3, min: 3, max: 100 },
    /** Blocking depth: rounds needed when every open pair is cleared each round. */
    depth: { weight: 0.3, min: 1, max: 12 },
    /** Trap share: share of dots that would bump something if tapped at the start; full marks at `max`. */
    traps: { weight: 0.3, min: 0, max: 0.6 },
    /** Colours: more colours make pairs harder to read. */
    colours: { weight: 0.1, min: 2, max: 12 }
};

const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export interface DifficultyMetrics {
    pairs: number;
    colours: number;
    depth: number;
    traps: number;
    bigDots: number;
    solvable: boolean;
    score: number;
}

/** Dots at least this many px bigger than the default count as big dots (accents / blockers). */
export const BIG_DOT_RADIUS = 22;

export function difficulty(level: Level): DifficultyMetrics {
    const pairs = level.pairs.length;
    const colours = new Set(level.pairs.map((p) => p.color)).size;
    const sim = solve(level);
    const model = new BlockModel(level.pairs);
    const alive = new Set(level.pairs.map((p) => p.id));
    let trapped = 0;
    for (const p of level.pairs) for (const side of ['a', 'b'] as const) if (!model.isOpen(p, side, alive)) trapped++;
    const traps = pairs ? trapped / (pairs * 2) : 0;
    const bigDots = level.pairs.reduce((n, p) => n + (p.a.r >= BIG_DOT_RADIUS ? 1 : 0) + (p.b.r >= BIG_DOT_RADIUS ? 1 : 0), 0);
    const d = DIFFICULTY;
    const score = Math.round(100 * (
        d.pairs.weight * norm(pairs, d.pairs.min, d.pairs.max) +
        d.depth.weight * norm(sim.rounds, d.depth.min, d.depth.max) +
        d.traps.weight * norm(traps, d.traps.min, d.traps.max) +
        d.colours.weight * norm(colours, d.colours.min, d.colours.max)));
    return { pairs, colours, depth: sim.rounds, traps: Math.round(traps * 1000) / 1000, bigDots, solvable: sim.solvable, score };
}
