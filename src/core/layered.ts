// Level generator v3 ("layered"): the designer's level philosophy.
//
// 1. Outline: the main lines of the drawing become a few LONG pairs, cut at positions that are
//    symmetric about the vertical axis (self-symmetric strokes and mirrored stroke pairs).
// 2. Blockers: extra pairs with random shapes and sizes fill the empty space inside the outline.
//    One end of most blockers is hooked onto another pair's line (its dot sits on that line and
//    blocks it), preferring the pairs that are blocked least so far.
// 3. Two numbers stay about the same at every difficulty: each pair is blocked by ~1.3-1.5 other
//    pairs on average, and ~1/3 of the pairs can be cleared right away. Difficulty comes from the
//    number of pairs (27 -> 100) and the blocking depth that results.
// Every added blocker keeps the level solvable.
import { Pair } from './level';
import { Pt, arcLengths, dist, distToPolyline, samplePath } from './path';
import { BlockModel, HIT_SCALE, solve, SolveResult } from './solver';
import { Line, Seg, colourPairs, nearest, prepareStrokes, rng, slice, toLine, toPair } from './generator';
import type { Stroke } from './trace';

export interface LayeredOptions {
    pairs: number;
    colors: number;
    seed?: number;
    /** Share of pairs used for the outline (the rest are blockers). */
    outlineShare?: number;
    /** Target average number of blockers per pair. */
    blockTarget?: number;
    /**
     * Target blocking depth (rounds). While the level is shallower, new blockers sit on the open
     * pair at the bottom of the longest blocking chain, so the chain grows by one.
     */
    depthTarget?: number;
    /** Share of blocker lines drawn straight (the rest are soft arcs). Default 0. */
    straightShare?: number;
    /** Target share of pairs open at the start. */
    openTarget?: number;
    tries?: number;
    /** World size of the drawing's longest side (default layeredSize(pairs)). */
    size?: number;
}

export interface LayeredStats {
    avgBlockers: number;
    openShare: number;
    outline: number;
    blockers: number;
    symmetricStrokes: number;
}

export interface LayeredCandidate {
    pairs: Pair[];
    sim: SolveResult;
    stats: LayeredStats;
    score: number;
    warnings: string[];
}

const R = 16;
const GAP = R + 1;

/** World size grows with the pair count so dense levels keep room (pinch zoom helps on phones). */
export const layeredSize = (pairs: number) => Math.round(700 * Math.max(1, Math.min(2.1, Math.sqrt(pairs / 24))));

/** Average blockers per pair (both directions together) and share of pairs open at the start. */
export function blockStats(pairs: Pair[]): { avgBlockers: number; openShare: number } {
    if (!pairs.length) return { avgBlockers: 0, openShare: 1 };
    const model = new BlockModel(pairs);
    const alive = new Set(pairs.map((p) => p.id));
    let total = 0, open = 0;
    for (const p of pairs) {
        total += new Set([...model.blockers(p, 'a', alive), ...model.blockers(p, 'b', alive)]).size;
        if (model.openSide(p, alive)) open++;
    }
    return { avgBlockers: total / pairs.length, openShare: open / pairs.length };
}

function mirrorScore(a: Line, b: Line): number {
    let sum = 0, n = 0;
    for (let i = 0; i < a.pts.length; i += 4) { sum += nearest(b.pts, { x: -a.pts[i].x, y: a.pts[i].y }).d; n++; }
    return n ? sum / n : Infinity;
}

/** Closed symmetric loops start at their top point on the axis, so uniform cuts are symmetric. */
function startAtAxis(l: Line): Line {
    if (!l.closed) return l;
    let best = 0;
    for (let i = 0; i < l.pts.length; i++) {
        const p = l.pts[i], q = l.pts[best];
        if (Math.abs(p.x) < 6 && (Math.abs(q.x) >= 6 || p.y < q.y)) best = i;
    }
    const pts = [...l.pts.slice(best, -1), ...l.pts.slice(0, best + 1)];
    return toLine(pts, true, l.big);
}

function buildOnce(strokes: Stroke[], opt: LayeredOptions, rand: () => number): LayeredCandidate {
    const warnings: string[] = [];
    const N = Math.max(3, Math.round(opt.pairs));
    const size = opt.size ?? layeredSize(N);
    const k = size / 700;
    let lines = prepareStrokes(strokes, size);
    const blockTarget = opt.blockTarget ?? 1.4, openTarget = opt.openTarget ?? 1 / 3;

    // --- 1. Outline: few long pairs, symmetric cuts -------------------------------------------
    const mirrorOf = lines.map(() => -1);
    let symmetric = 0;
    lines.forEach((a, i) => {
        if (mirrorOf[i] >= 0) return;
        for (let j = i; j < lines.length; j++) {
            if (mirrorOf[j] >= 0 || Math.abs(lines[j].len - a.len) > a.len * 0.1) continue;
            if (mirrorScore(a, lines[j]) < 6 * k) { mirrorOf[i] = j; mirrorOf[j] = i; symmetric += i === j ? 1 : 2; break; }
        }
    });
    lines = lines.map((l, i) => (mirrorOf[i] === i ? startAtAxis(l) : l));
    const totalLen = lines.reduce((s, l) => s + l.len, 0);
    const outlineTarget = Math.max(lines.length, Math.round(N * (opt.outlineShare ?? 0.32)));
    const minSeg = 280 * k; // outline pairs stay long
    const cuts = lines.map((l) => (l.big ? 1 : Math.max(1, Math.min(Math.floor(l.len / minSeg) || 1, Math.round((l.len / totalLen) * outlineTarget)))));
    lines.forEach((_, i) => { const j = mirrorOf[i]; if (j > i) cuts[j] = cuts[i]; }); // mirrored strokes cut alike

    const segs: Seg[] = [];
    lines.forEach((l, li) => {
        const n = cuts[li];
        const step = l.len / n;
        const first = segs.length;
        if (l.closed) {
            const g = n === 1 ? R * 1.7 : GAP; // a single loop pair: keep its two dots apart
            for (let i = 0; i < n; i++)
                segs.push({ line: li, s0: i * step + g, s1: (i + 1) * step - g, ra: R, rb: R, pa: first + ((i - 1 + n) % n), pb: first + ((i + 1) % n) });
        } else {
            for (let i = 0; i < n; i++)
                segs.push({ line: li, s0: i * step + (i === 0 ? 0 : GAP), s1: (i + 1) * step - (i === n - 1 ? 0 : GAP), ra: R, rb: R, pa: i > 0 ? first + i - 1 : undefined, pb: i < n - 1 ? first + i + 1 : undefined });
        }
        if (l.big && segs.length > first) { segs[first].ra = segs[first].rb = 26; segs[first].accent = true; }
    });
    // T-junctions: a free outline end that lands on another line puts its dot on it.
    for (const g of segs) {
        const l = lines[g.line];
        if (l.closed) continue;
        for (const end of ['a', 'b'] as const) {
            if (end === 'a' ? g.s0 > 0.01 : g.s1 < l.len - 0.01) continue;
            const p = end === 'a' ? l.pts[0] : l.pts[l.pts.length - 1];
            let best: { d: number; q: Pt } | null = null;
            lines.forEach((o, oi) => { if (oi !== g.line) { const q = nearest(o.pts, p); if (q.d < 14 && (!best || q.d < best.d)) best = q; } });
            if (best) { if (end === 'a') g.snapA = (best as { q: Pt }).q; else g.snapB = (best as { q: Pt }).q; }
        }
    }
    // Outline repair: pull apart touching dots, then break blocking cycles (drop T snaps, shorten).
    const retract = (g: Seg, e: 'a' | 'b', by: number) => {
        if (g.s1 - g.s0 - by < 40) return false;
        if (e === 'a') { g.s0 += by; g.snapA = undefined; } else { g.s1 -= by; g.snapB = undefined; }
        return true;
    };
    let pairs = segs.map((g, i) => toPair(lines, g, `p${i + 1}`));
    for (let pass = 0; pass < 30; pass++) {
        let moved = false;
        const ends = pairs.flatMap((p, i) => [{ i, e: 'a' as const, d: p.a }, { i, e: 'b' as const, d: p.b }]);
        for (let x = 0; x < ends.length; x++)
            for (let y = x + 1; y < ends.length; y++) {
                if (ends[x].i === ends[y].i) continue;
                if (dist(ends[x].d, ends[y].d) >= ends[x].d.r + ends[y].d.r + 2) continue;
                const A = segs[ends[x].i], B = segs[ends[y].i];
                const [G, e, H, f] = A.s1 - A.s0 >= B.s1 - B.s0 ? [A, ends[x].e, B, ends[y].e] : [B, ends[y].e, A, ends[x].e];
                moved = retract(G, e, 8) || retract(H, f, 8) || moved;
            }
        if (!moved) break;
        pairs = segs.map((g, i) => toPair(lines, g, `p${i + 1}`));
    }
    let sim = solve({ pairs } as never);
    for (let iter = 0; iter < 12 && !sim.solvable; iter++) {
        const stuck = new Set(sim.stuck);
        const polysNow = pairs.map((p) => samplePath(p.path, 5));
        pairs.forEach((Y, yi) => {
            if (!stuck.has(Y.id)) return;
            for (const e of ['a', 'b'] as const)
                if (pairs.some((X, xi) => xi !== yi && stuck.has(X.id) && distToPolyline(Y[e], polysNow[xi]) < (Y[e].r + Math.max(X.a.r, X.b.r)) * HIT_SCALE)) retract(segs[yi], e, Y[e].r + 6);
        });
        pairs = segs.map((g, i) => toPair(lines, g, `p${i + 1}`));
        sim = solve({ pairs } as never);
    }
    if (!sim.solvable) warnings.push(`Outline has ${sim.stuck.length} pairs blocking each other`);
    const outline = pairs.length;

    // --- 2. Blockers: random curves filling the gaps ----------------------------------------
    const allLines = () => pairs.map((p) => samplePath(p.path, 6));
    let polys = allLines();
    // Spatial grid of line points for fast "is this near a line?" checks.
    const CELL = 16;
    let grid = new Map<string, Pt[]>();
    const indexLines = () => {
        grid = new Map();
        for (const pl of polys) for (const q of samplePath(pl.map((p) => ({ x: p.x, y: p.y })), 4)) {
            const key = `${Math.floor(q.x / CELL)},${Math.floor(q.y / CELL)}`;
            (grid.get(key) ?? grid.set(key, []).get(key)!).push(q);
        }
    };
    indexLines();
    const nearLine = (q: Pt, lo: number, hi: number) => {
        const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL), span = Math.ceil(hi / CELL);
        let best = Infinity;
        for (let dx = -span; dx <= span; dx++) for (let dy = -span; dy <= span; dy++) for (const p of grid.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, dist(p, q));
        return best > lo && best < hi;
    };
    let st = blockStats(pairs);
    void st;
    const xs = lines.flatMap((l) => l.pts.map((p) => p.x)), ys = lines.flatMap((l) => l.pts.map((p) => p.y));
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const dotsClear = (pt: Pt, r: number) => pairs.every((q) => dist(q.a, pt) > q.a.r + r + 4 && dist(q.b, pt) > q.b.r + r + 4);
    // Point on pair `pi`'s line, away from its own dots.
    const pointOn = (pi: number): Pt | null => {
        const pl = polys[pi];
        for (let t = 0; t < 6; t++) {
            const q = pl[Math.floor(pl.length * (0.15 + rand() * 0.7))];
            if (q && dotsClear(q, R)) return { x: q.x, y: q.y };
        }
        return null;
    };
    // Blockers fill the space INSIDE the drawing: its convex hull, grown a little.
    const hull = convexHull(lines.flatMap((l) => l.pts));
    const cxh = hull.reduce((s, q) => s + q.x, 0) / hull.length, cyh = hull.reduce((s, q) => s + q.y, 0) / hull.length;
    const grow = (by: number) => hull.map((q) => { const d = Math.hypot(q.x - cxh, q.y - cyh) || 1; return { x: q.x + ((q.x - cxh) / d) * by, y: q.y + ((q.y - cyh) / d) * by }; });
    const inside = grow(18);
    // When the inside is full, blockers may spread around the drawing (a ring of 22% of its size).
    const around = grow(Math.max(18, 0.22 * Math.max(bx1 - bx0, by1 - by0)));
    let area = inside;
    const inBox = (q: Pt) => inPoly(q, area);
    let attempts = 0;
    // Blocker counts are refreshed only after a pair is accepted (attempts far outnumber accepts).
    let counts: number[] = [], avg = 0, depth = 0;
    /** above[i] = length of the longest chain of pairs waiting (directly or not) for pair i. */
    let above: number[] = [];
    const recount = () => {
        const model = new BlockModel(pairs);
        const alive = new Set(pairs.map((p) => p.id));
        const index = new Map(pairs.map((p, i) => [p.id, i]));
        const waits: number[][] = pairs.map(() => []);
        counts = pairs.map((p, i) => {
            const by = new Set([...model.blockers(p, 'a', alive), ...model.blockers(p, 'b', alive)]);
            for (const id of by) waits[index.get(id)!].push(i);
            return by.size;
        });
        avg = counts.reduce((s, c) => s + c, 0) / Math.max(1, pairs.length);
        if (opt.depthTarget) {
            above = pairs.map(() => -1);
            const up = (i: number, guard = 0): number => {
                if (above[i] >= 0) return above[i];
                above[i] = 0; // cycle guard (levels are kept solvable, so there is none)
                let best = 0;
                if (guard < 400) for (const j of waits[i]) best = Math.max(best, 1 + up(j, guard + 1));
                return (above[i] = best);
            };
            pairs.forEach((_, i) => up(i));
            depth = solve({ pairs } as never).rounds;
        }
    };
    recount();
    while (pairs.length < N && attempts++ < N * 140) {
        if (attempts === N * 70 && area === inside) area = around;
        // Target pair: one of the least-blocked pairs (random among the lowest few).
        // Keep ~1/3 open: when too few pairs are open, pile blocks onto pairs that are already blocked.
        const openNow = counts.filter((c) => c === 0).length / Math.max(1, pairs.length);
        const pool = pairs.map((_, i) => i).filter((i) => openNow > openTarget || counts[i] > 0);
        let order = (pool.length ? pool : pairs.map((_, i) => i)).sort((x, y) => counts[x] - counts[y] + (rand() - 0.5) * 1.5);
        // Deeper level wanted: block the open pair that holds up the longest chain (most of the time).
        if (opt.depthTarget && depth < opt.depthTarget && rand() < 0.7) {
            const open = pairs.map((_, i) => i).filter((i) => counts[i] === 0);
            if (open.length) order = open.sort((x, y) => above[y] - above[x] + (rand() - 0.5) * 0.9);
        }
        const hookA = avg < blockTarget + 0.1 || rand() < 0.5;
        let a: Pt | null;
        let skip = -1;
        if (hookA) { skip = order[0]; a = pointOn(skip); }
        else a = { x: bx0 + rand() * (bx1 - bx0), y: by0 + rand() * (by1 - by0) };
        if (!a || !inBox(a)) continue;
        const L = (70 + rand() * 190) * k;
        const ang = rand() * Math.PI * 2;
        let b: Pt = { x: a.x + Math.cos(ang) * L, y: a.y + Math.sin(ang) * L };
        if (!inBox(b)) continue;
        if (avg < blockTarget || rand() < 0.5) {
            // Hook the other end too, onto the least-blocked line near B.
            let best: { q: Pt; cost: number } | null = null;
            pairs.forEach((_, pi) => {
                if (pi === skip || (openNow < openTarget && counts[pi] === 0)) return;
                const q = nearest(polys[pi], b);
                if (q.d > 80 * k || !dotsClear(q.q, R) || dist(q.q, a!) < 60 * k) return;
                const cost = q.d / (50 * k) + counts[pi] * 1.2;
                if (!best || cost < best.cost) best = { q: q.q, cost };
            });
            if (best) b = (best as { q: Pt }).q;
        }
        // One smooth cubic arc: both handles pushed the same amount to the same side (no kinks).
        const bend = rand() < (opt.straightShare ?? 0) ? 0 : (rand() - 0.5) * 0.8; // straight, or -0.4..0.4 of the chord: a soft arc
        const nx = -(b.y - a.y), ny = b.x - a.x;
        const c1 = { x: a.x + (b.x - a.x) / 3 + nx * bend, y: a.y + (b.y - a.y) / 3 + ny * bend };
        const c2 = { x: a.x + ((b.x - a.x) * 2) / 3 + nx * bend, y: a.y + ((b.y - a.y) * 2) / 3 + ny * bend };
        const path = [{ x: r1(a.x), y: r1(a.y), out: { x: r1(c1.x), y: r1(c1.y) } }, { x: r1(b.x), y: r1(b.y), in: { x: r1(c2.x), y: r1(c2.y) } }];
        const curve = samplePath(path, 6);
        // Fill gaps: away from its ends the curve must not run along existing lines (crossing is fine).
        let close = 0, n = 0;
        for (const q of curve) {
            if (dist(q, a) < 28 || dist(q, b) < 28) continue;
            n++;
            if (nearLine(q, 2, 13 * k)) close++;
        }
        if (n < 4 || close > n * 0.2 || curve.some((q) => !inBox(q))) continue;
        const pa = path[0], pb = path[path.length - 1];
        if (!dotsClear(pa, R) || !dotsClear(pb, R) || dist(pa, pb) < 3 * R) continue;
        const pair: Pair = { id: `p${pairs.length + 1}`, color: '', a: { x: r1(pa.x), y: r1(pa.y), r: R }, b: { x: r1(pb.x), y: r1(pb.y), r: R }, path };
        pairs.push(pair);
        if (!solve({ pairs } as never).solvable) { pairs.pop(); continue; }
        polys = allLines();
        indexLines();
        recount();
    }
    if (pairs.length < N) warnings.push(`Placed ${pairs.length - outline} of ${N - outline} blockers (no more free space)`);

    colourPairs(pairs, opt.colors, rand);
    sim = solve({ pairs } as never);
    st = blockStats(pairs);
    const score = 3 * Math.abs(st.avgBlockers - blockTarget) + 4 * Math.abs(st.openShare - openTarget) + 0.05 * Math.abs(pairs.length - N) + (opt.depthTarget ? 0.15 * Math.abs(sim.rounds - opt.depthTarget) : 0) + (sim.solvable ? 0 : 100);
    return { pairs, sim, stats: { ...st, outline, blockers: pairs.length - outline, symmetricStrokes: symmetric }, score, warnings };
}

/** Several layered layouts, best first (closest to the blocking targets). */
export function generateLayered(strokes: Stroke[], opt: LayeredOptions): LayeredCandidate[] {
    const base = opt.seed ?? Date.now();
    const out: LayeredCandidate[] = [];
    for (let i = 0; i < (opt.tries ?? 6); i++) out.push(buildOnce(strokes, opt, rng(base + i * 7919)));
    return out.sort((a, b) => a.score - b.score);
}

// keep tree-shaking honest for helpers used only in some builds
void arcLengths; void HIT_SCALE; void slice;
function convexHull(pts: Pt[]): Pt[] {
    const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo: Pt[] = [], hi: Pt[] = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function inPoly(q: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}
const r1 = (v: number) => Math.round(v * 10) / 10;
