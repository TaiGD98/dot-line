// Blocking model shared by the editor (checks, simulation, generator) and the game.
//
// Tapping dot `a` sends it along the line to `b`. The move is blocked when the moving dot would
// touch a dot of another uncleared pair: distance from that dot's centre to the line is below
// HIT_SCALE x the sum of the two radii. Lines never block. A pair is open if either of its dots can go.
// Clearing a pair only removes blockers, so a greedy "clear anything open" search decides
// solvability exactly: the level is solvable iff repeatedly clearing open pairs empties it.
import { Level, Pair } from './level';
import { Pt, distToPolyline, samplePath } from './path';

export type Side = 'a' | 'b';

/**
 * Hitbox = this share of the sum of the two radii. Below 1 so dots that only touch at the edge
 * (e.g. two dots side by side at a cut) don't count as a bump; a dot sitting on a line still blocks.
 * 0.78: two normal dots (radius 16) bump when their centres are closer than 25 px, so a dot whose
 * edge is a few px clear of a line (centre 25 px or more from it) lets a dot on that line pass.
 */
export const HIT_SCALE = 0.78;
/** The hitbox before (0.85): dots the generators placed this close to a line were meant to block it. */
export const OLD_HIT_SCALE = 0.85;

export class BlockModel {
    private lines = new Map<string, Pt[]>();

    constructor(private pairs: Pair[]) {
        for (const p of pairs) this.lines.set(p.id, samplePath(p.path, 5));
    }

    line(id: string): Pt[] {
        return this.lines.get(id)!;
    }

    /** Ids of pairs whose dots block `pair` moving from `side`, among the `alive` set. */
    blockers(pair: Pair, side: Side, alive: Set<string>): string[] {
        const line = this.lines.get(pair.id)!;
        const r = pair[side].r;
        const out: string[] = [];
        for (const o of this.pairs) {
            if (o.id === pair.id || !alive.has(o.id)) continue;
            if (distToPolyline(o.a, line) < (r + o.a.r) * HIT_SCALE || distToPolyline(o.b, line) < (r + o.b.r) * HIT_SCALE) out.push(o.id);
        }
        return out;
    }

    isOpen(pair: Pair, side: Side, alive: Set<string>): boolean {
        return this.blockers(pair, side, alive).length === 0;
    }

    openSide(pair: Pair, alive: Set<string>): Side | null {
        if (this.isOpen(pair, 'a', alive)) return 'a';
        if (this.isOpen(pair, 'b', alive)) return 'b';
        return null;
    }
}

export interface SolveResult {
    solvable: boolean;
    /** One valid clearing order (pair ids). */
    order: string[];
    /** Pairs that can never be cleared (if unsolvable). */
    stuck: string[];
    openAtStart: number;
    blockedAtStart: number;
    /** Minimum number of rounds when every open pair is cleared each round (depth of the blocking chain). */
    rounds: number;
}

export function solve(level: Level): SolveResult {
    const model = new BlockModel(level.pairs);
    const alive = new Set(level.pairs.map((p) => p.id));
    const byId = new Map(level.pairs.map((p) => [p.id, p]));
    const order: string[] = [];
    let rounds = 0;
    let openAtStart = -1;
    while (alive.size) {
        const open = [...alive].filter((id) => model.openSide(byId.get(id)!, alive));
        if (openAtStart < 0) openAtStart = open.length;
        if (!open.length) break;
        rounds++;
        for (const id of open) { alive.delete(id); order.push(id); }
    }
    if (openAtStart < 0) openAtStart = 0;
    return {
        solvable: alive.size === 0,
        order,
        stuck: [...alive],
        openAtStart,
        blockedAtStart: level.pairs.length - openAtStart,
        rounds
    };
}
