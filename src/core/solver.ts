// Blocking model shared by the editor (checks, simulation, generator) and the game.
//
// Tapping dot `a` sends it along the line to `b`. The move is blocked when the moving dot would
// touch a dot of another uncleared pair: distance from that dot's centre to the line is below
// HIT_SCALE x the sum of the two radii. Lines never block, except a rope (Pair.rope): the moving
// dot may not cross it or come closer than HIT_SCALE x its radius + ROPE_HALF to it. A lock on a
// pair's line blocks that pair until its key is taken (the key's pair has run over it; in the search:
// the key's pair is cleared). A pair is open if either of its dots can go.
// Clearing a pair only removes blockers, so a greedy "clear anything open" search decides
// solvability exactly: the level is solvable iff repeatedly clearing open pairs empties it.
import { LOCK_ON, Level, LockObstacle, Obstacle, Pair } from './level';
import { Pt, distToPolyline, distToSegment, samplePath } from './path';

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

/** Half the width of a rope as it blocks (and about as it is drawn). */
export const ROPE_HALF = 6;

/** How close a dot of radius r may come to a rope's centre line before it bumps. */
export const ropeReach = (r: number) => r * HIT_SCALE + ROPE_HALF;

/** Shortest distance between two polylines (0 when they cross). */
export function polylineGap(a: Pt[], b: Pt[], stop = 0): number {
    let best = Infinity;
    for (let i = 1; i < a.length; i++) {
        for (let j = 1; j < b.length; j++) {
            const p0 = a[i - 1], p1 = a[i], q0 = b[j - 1], q1 = b[j];
            if (segmentsCross(p0, p1, q0, q1)) return 0;
            best = Math.min(best, distToSegment(p0, q0, q1), distToSegment(p1, q0, q1), distToSegment(q0, p0, p1), distToSegment(q1, p0, p1));
            if (best <= stop) return best;
        }
    }
    return best;
}

function segmentsCross(p0: Pt, p1: Pt, q0: Pt, q1: Pt): boolean {
    const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = d(q0, q1, p0), d2 = d(q0, q1, p1), d3 = d(p0, p1, q0), d4 = d(p0, p1, q1);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export class BlockModel {
    private lines = new Map<string, Pt[]>();
    /** For each pair and side: the ropes (pair ids) its moving dot would run into. */
    private ropeHits = new Map<string, string[]>();
    /** Locks on each pair's line; the pairs each lock sits on; the pairs whose ball runs over each lock's key. */
    private locks = new Map<string, LockObstacle[]>();
    private lockPairs = new Map<string, string[]>();
    private keyTakers = new Map<string, string[]>();

    constructor(private pairs: Pair[], obstacles: Obstacle[] = []) {
        for (const p of pairs) this.lines.set(p.id, samplePath(p.path, 5));
        for (const o of obstacles) {
            if (o.type === 'lock') {
                const on = pairs.filter((p) => distToPolyline(o, this.lines.get(p.id)!) < LOCK_ON).map((p) => p.id);
                this.lockPairs.set(o.id, on);
                for (const id of on) this.locks.set(id, [...(this.locks.get(id) ?? []), o]);
            } else this.keyTakers.set(o.lock, pairs.filter((p) => distToPolyline(o, this.lines.get(p.id)!) < Math.min(p.a.r, p.b.r)).map((p) => p.id));
        }
        const ropes = pairs.filter((p) => p.rope);
        if (!ropes.length) return;
        const box = (pts: Pt[]) => pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [Infinity, Infinity, -Infinity, -Infinity]);
        const boxes = new Map(pairs.map((p) => [p.id, box(this.lines.get(p.id)!)]));
        for (const p of pairs) for (const side of ['a', 'b'] as const) {
            const reach = ropeReach(p[side].r), out: string[] = [];
            const pb = boxes.get(p.id)!;
            for (const o of ropes) {
                if (o.id === p.id) continue;
                const ob = boxes.get(o.id)!;
                if (pb[0] > ob[2] + reach || ob[0] > pb[2] + reach || pb[1] > ob[3] + reach || ob[1] > pb[3] + reach) continue;
                if (polylineGap(this.lines.get(p.id)!, this.lines.get(o.id)!, reach) < reach) out.push(o.id);
            }
            this.ropeHits.set(`${p.id}:${side}`, out);
        }
    }

    line(id: string): Pt[] {
        return this.lines.get(id)!;
    }

    /** Locks on a pair's line. */
    locksOn(id: string): LockObstacle[] {
        return this.locks.get(id) ?? [];
    }

    /** Pairs a lock sits on. */
    pairsOfLock(id: string): string[] {
        return this.lockPairs.get(id) ?? [];
    }

    /** Pairs whose ball runs over a lock's key. */
    takersOfKey(lockId: string): string[] {
        return this.keyTakers.get(lockId) ?? [];
    }

    /**
     * Is the lock open? `opened`: the locks whose key has been taken (game). Else (search): a pair whose
     * ball runs over its key has left the board (it took the key on its way).
     */
    lockOpen(lock: LockObstacle, alive: Set<string>, opened?: Set<string>): boolean {
        if (opened) return opened.has(lock.id);
        return this.takersOfKey(lock.id).some((id) => !alive.has(id));
    }

    /**
     * Ids of pairs that block `pair` moving from `side`, among the `alive` set: pairs whose dots (or rope)
     * are in the way, and for each closed lock on its line the pair holding the key (or the lock's id
     * when it has no key: then it never opens).
     */
    blockers(pair: Pair, side: Side, alive: Set<string>, opened?: Set<string>): string[] {
        const line = this.lines.get(pair.id)!;
        const r = pair[side].r;
        const out: string[] = [];
        for (const o of this.pairs) {
            if (o.id === pair.id || !alive.has(o.id)) continue;
            if (distToPolyline(o.a, line) < (r + o.a.r) * HIT_SCALE || distToPolyline(o.b, line) < (r + o.b.r) * HIT_SCALE) out.push(o.id);
        }
        for (const id of this.ropeHits.get(`${pair.id}:${side}`) ?? []) if (alive.has(id) && !out.includes(id)) out.push(id);
        for (const l of this.locksOn(pair.id)) {
            if (this.lockOpen(l, alive, opened)) continue;
            // The pairs that can bring its key (or the lock itself when none can: it never opens).
            const takers = this.takersOfKey(l.id).filter((id) => alive.has(id) && id !== pair.id);
            for (const k of takers.length ? takers : [l.id]) if (!out.includes(k)) out.push(k);
        }
        return out;
    }

    isOpen(pair: Pair, side: Side, alive: Set<string>, opened?: Set<string>): boolean {
        return this.blockers(pair, side, alive, opened).length === 0;
    }

    openSide(pair: Pair, alive: Set<string>, opened?: Set<string>): Side | null {
        if (this.isOpen(pair, 'a', alive, opened)) return 'a';
        if (this.isOpen(pair, 'b', alive, opened)) return 'b';
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
    const model = new BlockModel(level.pairs, level.obstacles ?? []);
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
