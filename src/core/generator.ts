// Level generator v2: works on strokes (lines of a drawing), from traced line art or SVG.
//
// Design rules taken from studying hand-made levels of the genre (docs/guide/editor.md, 2.1):
// 1. T-junction = blocking: a stroke that ends on another stroke gets its dot ON that stroke,
//    so the "detail" pair must be cleared before the "frame" pair under it.
// 2. X crossings never block (lines cross freely).
// 3. Long strokes and closed loops are cut into several pairs, preferably at corners; at a cut
//    two dots sit side by side. A closed loop with one cut is a single pair whose dots touch.
// 4. Big dots only where the drawing asks for them (SVG data-big="1"): an accent or a big blocker,
//    never sprinkled everywhere.
// 5. Touching dots get different colours.
// Each call builds many random candidates, repairs blocking cycles so every candidate is
// solvable, scores them against the target difficulty and returns the best few.
import { DEFAULT_RADIUS, MIN_RADIUS, Pair } from './level';
import { PALETTE } from './palette';
import { Pt, arcLengths, dist, distToPolyline, fitSmooth, pointAt, resample, roundCorners, samplePath, slicePolyline, smoothPolyline } from './path';
import { HIT_SCALE, solve, SolveResult } from './solver';
import type { Stroke } from './trace';

export type { Stroke };

export interface GenerateOptions {
    pairs: number;
    colors: number;
    /** 1..5, used to score candidates. */
    difficulty: number;
    seed?: number;
    /** World size of the drawing's longest side. */
    size?: number;
    /** Candidates to try (more = slower, better fit). */
    tries?: number;
    /** How many of the best candidates to return. */
    keep?: number;
    /**
     * 0..1: chance that a cut is placed where this line crosses another one, so a dot sits ON the
     * other line and blocks it (turns an X crossing into a T). The main difficulty dial.
     */
    crossBlocks?: number;
    /** Radius of every dot (default 16): one size for the whole level. */
    radius?: number;
}

export interface Candidate {
    pairs: Pair[];
    score: number;
    sim: SolveResult;
    stats: { tJunctions: number; cuts: number; accents: number };
    warnings: string[];
}

/**
 * World size (longest side of the drawing, px) for a level with this many lines in total
 * (base + X + T): more lines need more room, dots keep their size. 700 up to 24 lines, 1470 at 100+.
 */
export const worldSize = (lines: number) => Math.round(700 * Math.max(1, Math.min(2.1, Math.sqrt(lines / 24))));

/** Placeholder suggestion rule for a target difficulty 1..5 (spec: TBD). */
export function suggest(difficulty: number): { pairs: number; colors: number } {
    const d = clampInt(difficulty, 1, 5);
    return { pairs: [6, 12, 20, 32, 48][d - 1], colors: [3, 5, 7, 9, 11][d - 1] };
}

/** Placeholder difficulty targets (spec: TBD): blocking depth and share of pairs open at start. */
export function targets(difficulty: number, pairs: number) {
    const d = clampInt(difficulty, 1, 5);
    return { rounds: Math.max(1, Math.round(1 + (d - 1) * 1.4 + pairs / 30)), openShare: [0.6, 0.45, 0.33, 0.25, 0.18][d - 1] };
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v) || lo));

export function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface Line {
    pts: Pt[];
    acc: number[];
    len: number;
    closed: boolean;
    corners: number[];
    big?: boolean;
    /** Line weight from the drawing (1 = main, ~0.7 detail, ~0.5 fine). */
    weight?: number;
    /** Arc positions where another line crosses this one (filled by findCrossings). */
    crossings: number[];
}

export function toLine(pts: Pt[], closed: boolean, big?: boolean): Line {
    const acc = arcLengths(pts);
    const len = acc[acc.length - 1];
    // Corners: direction change over ±12px above ~50 degrees.
    const corners: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pointAt(pts, acc, acc[i] - 12), b = pointAt(pts, acc, acc[i] + 12), p = pts[i];
        if (!closed && (acc[i] < 15 || acc[i] > len - 15)) continue;
        const v1 = { x: p.x - a.x, y: p.y - a.y }, v2 = { x: b.x - p.x, y: b.y - p.y };
        const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
        if (cos < 0.64 && (!corners.length || acc[i] - corners[corners.length - 1] > 25)) corners.push(acc[i]);
    }
    return { pts, acc, len, closed, corners, big, crossings: [] };
}

/** Source units -> world: world = (p - c) * k. The longest side of the drawing becomes `size`. */
export function strokeFrame(strokes: Stroke[], size = 700) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const p of s.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!isFinite(x0)) return { k: 1, cx: 0, cy: 0 };
    return { k: size / Math.max(x1 - x0, y1 - y0, 1), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Sharp corners of a drawing are rounded with about this radius (world px). */
export const CORNER_RADIUS = 12;

/**
 * Normalises strokes to world units (longest side = size, centred) and smooths them.
 * Strokes shorter than `minLen` (world px) are dropped.
 */
export function prepareStrokes(strokes: Stroke[], size = 700, minLen = 40): Line[] {
    if (!strokes.some((s) => s.pts.length)) return [];
    const { k, cx, cy } = strokeFrame(strokes, size);
    return strokes
        .map((s) => {
            const w = s.pts.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
            if (s.closed && dist(w[0], w[w.length - 1]) > 0.5) w.push({ ...w[0] });
            // Traced strokes: remove the pixel stair-steps (about 1.8 source pixels). Then every stroke
            // gets its sharp corners rounded: generated lines have no kinks.
            let even = resample(w, 2);
            if (s.closed) even[even.length - 1] = { ...even[0] };
            if (s.smooth) even = smoothPolyline(even, Math.max(3, Math.min(5, 1.8 * k)), s.closed);
            const smooth = resample(roundCorners(even, CORNER_RADIUS, s.closed), 4);
            if (s.closed) smooth[smooth.length - 1] = { ...smooth[0] };
            const line = toLine(smooth, s.closed, s.big);
            if (s.weight) line.weight = s.weight;
            return line;
        })
        .filter((l) => l.pts.length >= 2 && l.len >= minLen);
}

/** Arc positions where lines cross each other (X crossings, away from line ends). Grid-bucketed. */
function findCrossings(lines: Line[]) {
    const cell = 24;
    const grid = new Map<string, [number, number][]>();
    lines.forEach((l, li) => {
        for (let i = 1; i < l.pts.length; i++) {
            const a = l.pts[i - 1], b = l.pts[i];
            const k = `${Math.floor((a.x + b.x) / 2 / cell)},${Math.floor((a.y + b.y) / 2 / cell)}`;
            (grid.get(k) ?? grid.set(k, []).get(k)!).push([li, i]);
        }
    });
    const seen = new Set<string>();
    for (const [key, list] of grid) {
        const [cx, cy] = key.split(',').map(Number);
        const near: [number, number][] = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(grid.get(`${cx + dx},${cy + dy}`) ?? []));
        for (const [la, ia] of list)
            for (const [lb, ib] of near) {
                if (la >= lb) continue;
                const A = lines[la], B = lines[lb];
                const p = A.pts[ia - 1], q = A.pts[ia], r = B.pts[ib - 1], t = B.pts[ib];
                const d = (q.x - p.x) * (t.y - r.y) - (q.y - p.y) * (t.x - r.x);
                if (Math.abs(d) < 1e-9) continue;
                const u = ((r.x - p.x) * (t.y - r.y) - (r.y - p.y) * (t.x - r.x)) / d;
                const v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
                if (u < 0 || u > 1 || v < 0 || v > 1) continue;
                const sa = A.acc[ia - 1] + u * (A.acc[ia] - A.acc[ia - 1]);
                const sb = B.acc[ib - 1] + v * (B.acc[ib] - B.acc[ib - 1]);
                const id = `${la}:${Math.round(sa / 8)}:${lb}:${Math.round(sb / 8)}`;
                if (seen.has(id)) continue;
                seen.add(id);
                // Real crossings only (ends touching = T-junctions, handled separately).
                if ((A.closed || (sa > 30 && sa < A.len - 30)) && (B.closed || (sb > 30 && sb < B.len - 30))) { A.crossings.push(sa); B.crossings.push(sb); }
            }
    }
}

export interface Seg {
    line: number;
    s0: number;
    s1: number; // may exceed len on closed lines (wraps)
    ra: number;
    rb: number;
    snapA?: Pt;
    snapB?: Pt;
    accent?: boolean;
    /** Segment index whose dot sits next to this end at a cut. */
    pa?: number;
    pb?: number;
    /** Merged into its neighbour during repair. */
    dead?: boolean;
}

export function slice(l: Line, s0: number, s1: number): Pt[] {
    if (l.closed && s0 >= l.len) { s0 -= l.len; s1 -= l.len; }
    if (!l.closed || s1 <= l.len) return slicePolyline(l.pts, l.acc, Math.max(0, s0), Math.min(l.len, s1));
    const a = slicePolyline(l.pts, l.acc, s0, l.len);
    const b = slicePolyline(l.pts, l.acc, 0, s1 - l.len);
    return [...a, ...b.slice(1)];
}

export function segPoints(lines: Line[], g: Seg): Pt[] {
    const pts = slice(lines[g.line], g.s0, g.s1);
    if (g.snapA) pts.unshift(g.snapA);
    if (g.snapB) pts.push(g.snapB);
    return pts;
}

export function toPair(lines: Line[], g: Seg, id: string): Pair {
    const path = fitSmooth(segPoints(lines, g), 1.2);
    const a = path[0], b = path[path.length - 1];
    const big = g.accent ? { big: true } : {};
    return { id, color: '', a: { x: r1(a.x), y: r1(a.y), r: g.ra, ...big }, b: { x: r1(b.x), y: r1(b.y), r: g.rb, ...big }, path };
}

function buildCandidate(lines: Line[], opt: GenerateOptions, rand: () => number): Candidate {
    const warnings: string[] = [];
    // One dot size for the whole level.
    const rad = Math.max(6, Math.round(opt.radius ?? DEFAULT_RADIUS)), R = () => rad;
    // Long enough pairs keep the drawing readable (many tiny pairs look like a dotted line).
    const minSeg = 95;
    const total = Math.max(1, Math.round(opt.pairs));

    // 1. How many pairs per line (by length; closed loops at least one).
    const totalLen = lines.reduce((s, l) => s + l.len, 0);
    const maxFor = (l: Line) => Math.max(1, Math.floor(l.len / minSeg));
    // A big-dot stroke stays one pair (its two big dots are the accent).
    const maxFor2 = (l: Line) => (l.big ? 1 : maxFor(l));
    const counts = lines.map((l) => Math.min(maxFor2(l), Math.max(1, Math.round((l.len / totalLen) * total * (0.8 + rand() * 0.4)))));
    let sum = counts.reduce((a, b) => a + b, 0);
    for (let guard = 0; sum !== total && guard < 2000; guard++) {
        const i = Math.floor(rand() * lines.length);
        if (sum < total && counts[i] < maxFor2(lines[i])) { counts[i]++; sum++; }
        else if (sum > total && counts[i] > 1) { counts[i]--; sum--; }
        else if (sum > total && counts.every((c) => c <= 1)) break;
        else if (sum < total && counts.every((c, k) => c >= maxFor2(lines[k]))) break;
    }
    if (sum < total) warnings.push(`The drawing only fits ${sum} pairs`);
    if (sum > total) warnings.push(`The drawing needs at least ${sum} pairs (one per line)`);

    // 2. Cut each line, preferring corners.
    const segs: Seg[] = [];
    let cuts = 0, accents = 0;
    lines.forEach((l, li) => {
        const k = counts[li];
        const spacing = l.len / k;
        const pickCut = (target: number) => {
            // Difficulty dial: put a dot right on a crossing line (the cut sits r+1 past the crossing).
            const xs = l.crossings.filter((c) => Math.abs(c - target) < spacing * 0.45);
            if (xs.length && rand() < (opt.crossBlocks ?? 0)) return xs[Math.floor(rand() * xs.length)] + (rand() < 0.5 ? 16 : -16);
            const near = l.corners.filter((c) => Math.abs(c - target) < spacing * 0.35);
            if (near.length && rand() < 0.7) return near[Math.floor(rand() * near.length)];
            return target + (rand() - 0.5) * spacing * 0.4;
        };
        if (l.closed) {
            const offset = rand() * l.len;
            const cs = Array.from({ length: k }, (_, i) => pickCut((offset + i * spacing) % l.len)).map((c) => ((c % l.len) + l.len) % l.len).sort((a, b) => a - b);
            const rs = cs.map(() => [R(), R()] as [number, number]);
            cuts += k;
            const first = segs.length;
            for (let i = 0; i < k; i++) {
                const start = cs[i], end = i + 1 < k ? cs[i + 1] : cs[0] + l.len;
                segs.push({ line: li, s0: start + rs[i][1] + 1, s1: end - rs[(i + 1) % k][0] - 1, ra: rs[i][1], rb: rs[(i + 1) % k][0], pa: first + ((i - 1 + k) % k), pb: first + ((i + 1) % k) });
            }
        } else {
            const cs = Array.from({ length: k - 1 }, (_, i) => pickCut((i + 1) * spacing)).sort((a, b) => a - b);
            const rs = cs.map(() => [R(), R()] as [number, number]);
            cuts += cs.length;
            const bounds = [0, ...cs, l.len];
            const first = segs.length;
            for (let i = 0; i < k; i++) {
                const ra = i === 0 ? R() : rs[i - 1][1], rb = i === k - 1 ? R() : rs[i][0];
                segs.push({ line: li, s0: bounds[i] + (i === 0 ? 0 : ra + 1), s1: bounds[i + 1] - (i === k - 1 ? 0 : rb + 1), ra, rb, pa: i > 0 ? first + i - 1 : undefined, pb: i < k - 1 ? first + i + 1 : undefined });
            }
            // Marked stroke (data-big): one pair with big dots, as an accent or a big blocker.
            if (l.big) { const big = 24 + Math.round(rand() * 6); segs[segs.length - 1].ra = big; segs[segs.length - 1].rb = big; segs[segs.length - 1].accent = true; accents++; }
        }
    });

    // 3. T-junctions: a free line end that lands on another line puts its dot on that line.
    let tJunctions = 0;
    for (const g of segs) {
        const l = lines[g.line];
        if (l.closed) continue;
        for (const end of ['a', 'b'] as const) {
            const atEnd = end === 'a' ? g.s0 <= 0.01 : g.s1 >= l.len - 0.01;
            if (!atEnd) continue;
            const p = end === 'a' ? l.pts[0] : l.pts[l.pts.length - 1];
            let best: { d: number; q: Pt } | null = null;
            lines.forEach((o, oi) => {
                if (oi === g.line) return;
                const q = nearest(o.pts, p);
                if (q.d < 14 && (!best || q.d < best.d)) best = q;
            });
            if (best) {
                const q = (best as { q: Pt }).q;
                if (end === 'a') g.snapA = q; else g.snapB = q;
                tJunctions++;
            }
        }
    }

    // 4. Pull dots apart where they overlap (shorten the segment).
    const ends = () => segs.flatMap((_, i) => [{ i, e: 'a' as const }, { i, e: 'b' as const }]);
    const pos = (g: Seg, e: 'a' | 'b') => {
        const pts = segPoints(lines, g);
        return e === 'a' ? pts[0] : pts[pts.length - 1];
    };
    let retracted = 0;
    const retract = (g: Seg, e: 'a' | 'b', by: number) => {
        if (g.s1 - g.s0 - by < 30) return false;
        if (e === 'a') { g.s0 += by; g.snapA = undefined; } else { g.s1 -= by; g.snapB = undefined; }
        retracted += by;
        return true;
    };
    /** Slides a cut (this dot and the touching dot of the next pair) along the line. */
    const shiftCut = (g: Seg, e: 'a' | 'b', delta: number) => {
        const j = e === 'a' ? g.pa : g.pb;
        if (j === undefined) return false;
        const o = segs[j];
        if (e === 'b') {
            if (g.s1 + delta - g.s0 < 30 || o.s1 - (o.s0 + delta) < 30) return false;
            g.s1 += delta; o.s0 += delta;
        } else {
            if (g.s1 - (g.s0 + delta) < 30 || o.s1 + delta - o.s0 < 30) return false;
            g.s0 += delta; o.s1 += delta;
        }
        return true;
    };
    for (let pass = 0; pass < 12; pass++) {
        let moved = false;
        const es = ends();
        const P = es.map(({ i, e }) => pos(segs[i], e));
        for (let x = 0; x < es.length; x++)
            for (let y = x + 1; y < es.length; y++) {
                const A = segs[es[x].i], B = segs[es[y].i];
                const ra = es[x].e === 'a' ? A.ra : A.rb, rb = es[y].e === 'a' ? B.ra : B.rb;
                if (Math.abs(P[x].x - P[y].x) > ra + rb + 1 || Math.abs(P[x].y - P[y].y) > ra + rb + 1) continue;
                if (dist(P[x], P[y]) < ra + rb + 1) {
                    const pick = A.s1 - A.s0 > B.s1 - B.s0 ? x : y;
                    const G = segs[es[pick].i];
                    if (retract(G, es[pick].e, 6)) { P[pick] = pos(G, es[pick].e); moved = true; }
                }
            }
        if (!moved) break;
    }

    // 5. Repair blocking cycles so the level is always solvable.
    // Pair ids are p<segment index + 1> while repairing, renumbered at the end.
    const build = () => segs.flatMap((g, i) => (g.dead ? [] : [toPair(lines, g, `p${i + 1}`)]));
    const segOf = (id: string) => segs[+id.slice(1) - 1];
    let pairs = build();
    let sim = solve({ pairs } as never);
    let level = rad;
    for (let iter = 0; iter < 10 && !sim.solvable; iter++) {
        const stuck = new Set(sim.stuck);
        const lineOf = new Map(pairs.map((p) => [p.id, samplePath(p.path, 5)]));
        let smaller = false;
        for (const id of stuck) {
            const X = pairs.find((p) => p.id === id)!;
            const xl = lineOf.get(id)!;
            const rx = Math.max(X.a.r, X.b.r);
            for (const Y of pairs) {
                if (Y.id === id || !stuck.has(Y.id)) continue;
                for (const e of ['a', 'b'] as const) {
                    if (distToPolyline(Y[e], xl) >= (Y[e].r + rx) * HIT_SCALE) continue;
                    const g = segOf(Y.id);
                    const step = (Y[e].r + rx) * 2 + 6;
                    // Prefer sliding the cut (keeps the drawing whole); else shorten a little; else smaller
                    // dots for the whole level (a dot never changes size on its own).
                    if (shiftCut(g, e, rand() < 0.5 ? step : -step) || shiftCut(g, e, rand() < 0.5 ? -step : step)) continue;
                    if (iter < 4) retract(g, e, Y[e].r + 6);
                    else smaller = true;
                }
            }
        }
        if (smaller && level > MIN_RADIUS) {
            level = Math.max(MIN_RADIUS, level - 2);
            for (const g of segs) if (!g.accent) { g.ra = Math.min(g.ra, level); g.rb = Math.min(g.rb, level); }
        }
        pairs = build();
        sim = solve({ pairs } as never);
    }
    // Still stuck (dense drawings, many pairs): merge a stuck pair with the next pair on the same
    // line (remove the cut). Fewer pairs, but the drawing stays whole.
    let merged = 0;
    const mergeWithNext = (i: number): boolean => {
        const g = segs[i], j = g.pb;
        if (j === undefined || j === i || segs[j].dead) return false;
        const o = segs[j], len = lines[g.line].len;
        let s1 = o.s1;
        while (lines[g.line].closed && s1 <= g.s1) s1 += len;
        g.s1 = s1; g.rb = o.rb; g.snapB = o.snapB; g.pb = o.pb;
        o.dead = true;
        if (o.pb !== undefined && segs[o.pb].pa === j) segs[o.pb].pa = i;
        if (g.pb === i) { g.pb = undefined; g.pa = undefined; } // a closed line is now one pair
        merged++;
        return true;
    };
    // Pairs squeezed so short that their own two dots touch: join them to a neighbour.
    for (let pass = 0; pass < 3; pass++) {
        let did = false;
        segs.forEach((g, i) => {
            if (g.dead) return;
            const pts = segPoints(lines, g);
            if (dist(pts[0], pts[pts.length - 1]) >= g.ra + g.rb + 2) return;
            if (mergeWithNext(i) || (g.pa !== undefined && !segs[g.pa].dead && segs[g.pa].pb === i && mergeWithNext(g.pa))) did = true;
        });
        if (!did) break;
    }
    pairs = build();
    sim = solve({ pairs } as never);
    for (let iter = 0; iter < 30 && !sim.solvable; iter++) {
        let did = false;
        for (const id of sim.stuck) {
            const i = +id.slice(1) - 1, g = segs[i];
            if (g.dead) continue;
            if (mergeWithNext(i) || (g.pa !== undefined && !segs[g.pa].dead && segs[g.pa].pb === i && mergeWithNext(g.pa))) did = true;
        }
        if (!did) break;
        pairs = build();
        sim = solve({ pairs } as never);
    }
    if (merged) warnings.push(`Joined ${merged} pair(s) into their neighbours to keep the level solvable`);
    if (!sim.solvable) {
        warnings.push(`Dropped ${sim.stuck.length} pair(s) that kept blocking each other`);
        pairs = pairs.filter((p) => !sim.stuck.includes(p.id));
    }
    pairs = pairs.map((p, i) => ({ ...p, id: `p${i + 1}` }));
    sim = solve({ pairs } as never);

    colourPairs(pairs, opt.colors, rand);
    // Last resort for dots that still touch: the whole level gets a smaller dot. Every normal dot
    // keeps the same size; only an accent (big) dot is shrunk on its own.
    let tight = Infinity;
    for (let a = 0; a < pairs.length; a++)
        for (const ea of ['a', 'b'] as const)
            for (let b = a + 1; b < pairs.length; b++)
                for (const eb of ['a', 'b'] as const) {
                    const d1 = pairs[a][ea], d2 = pairs[b][eb], d = dist(d1, d2);
                    if (d >= d1.r + d2.r + 1) continue;
                    if (d1.r > rad) d1.r = Math.max(rad, Math.floor(d - d2.r - 1));
                    else if (d2.r > rad) d2.r = Math.max(rad, Math.floor(d - d1.r - 1));
                    else tight = Math.min(tight, d);
                }
    if (tight < Infinity) {
        const small = Math.max(MIN_RADIUS, Math.min(rad, Math.floor((tight - 1) / 2)));
        for (const p of pairs) for (const d of [p.a, p.b]) if (d.r <= rad) d.r = small;
    }
    sim = solve({ pairs } as never); // smaller dots only remove blocks
    const t = targets(opt.difficulty, total);
    const n = pairs.length || 1;
    const score = 2 * Math.abs(sim.rounds - t.rounds) + 8 * Math.abs(sim.openAtStart / n - t.openShare) + 0.3 * Math.abs(n - total) + retracted / 60 + (sim.solvable ? 0 : 100);
    return { pairs, score, sim, stats: { tJunctions, cuts, accents }, warnings };
}

export function nearest(pts: Pt[], p: Pt): { d: number; q: Pt } {
    let best = { d: Infinity, q: pts[0] };
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
        const q = { x: a.x + t * dx, y: a.y + t * dy };
        const d = dist(p, q);
        if (d < best.d) best = { d, q };
    }
    return best;
}

/** Lines closer than this (px, line to line) count as "near each other" for colouring. */
export const NEAR_LINES = 40;

/** Pairs of indices whose lines touch, cross or run within NEAR_LINES px of each other. */
export function nearPairs(pairs: Pair[], gap = NEAR_LINES): [number, number][] {
    const lines = pairs.map((p) => samplePath(p.path, 8));
    const box = lines.map((l) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of l) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        return { x0: x0 - gap, y0: y0 - gap, x1: x1 + gap, y1: y1 + gap };
    });
    const out: [number, number][] = [];
    for (let i = 0; i < pairs.length; i++)
        for (let j = i + 1; j < pairs.length; j++) {
            const a = box[i], b = box[j];
            if (a.x1 < b.x0 + gap || b.x1 < a.x0 + gap || a.y1 < b.y0 + gap || b.y1 < a.y0 + gap) continue;
            // 8 px samples on both lines: within gap + 6 of each other means the lines are within ~gap.
            search: for (const p of lines[i]) for (const q of lines[j]) if (Math.abs(p.x - q.x) < gap + 6 && Math.hypot(p.x - q.x, p.y - q.y) < gap + 6) { out.push([i, j]); break search; }
        }
    return out;
}

/** Hue (0..360), lightness and saturation (0..1) of a #RRGGBB colour. */
function hsl(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return { h: 0, l, s: 0 };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, l, s };
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Colour schemes of the level colour guide: hues spread around the colour wheel. */
export const COLOUR_SCHEMES = {
    complementary: [0, 180],
    split: [0, 150, 210],
    triadic: [0, 120, 240]
} as const;
export type ColourScheme = keyof typeof COLOUR_SCHEMES;

/**
 * The colours of one level, after the colour guide: a scheme (complementary, split-complementary or
 * triadic) turned to a random hue; every palette colour close to one of its hues (within 30°)
 * belongs to that hue's group. The first group is the dominant colour. Up to `max` colours, taken
 * from all groups in turn, closest to their hue first.
 */
export function levelColours(max: number, rand: () => number, scheme?: ColourScheme) {
    const pick: ColourScheme = scheme ?? (['split', 'triadic', 'split', 'triadic', 'complementary'] as const)[Math.floor(rand() * 5)];
    const turn = rand() * 360;
    const hues = COLOUR_SCHEMES[pick].map((d) => (turn + d) % 360);
    const all = PALETTE.map((c) => {
        const { h } = hsl(c.base);
        const gaps = hues.map((x) => hueGap(h, x));
        const group = gaps.indexOf(Math.min(...gaps));
        return { name: c.name, group, gap: gaps[group] };
    });
    const groups = hues.map((_, i) => all.filter((c) => c.group === i && c.gap <= 30).sort((a, b) => a.gap - b.gap));
    // Always a few colours per group, even when the scheme lands between palette hues.
    groups.forEach((g, i) => { if (g.length < 2) g.push(...all.filter((c) => c.group === i && !g.includes(c)).sort((a, b) => a.gap - b.gap).slice(0, 2 - g.length)); });
    const size = groups.reduce((n, g) => n + g.length, 0);
    const k = Math.max(1, Math.min(Math.round(max), size));
    const names: string[] = [], group = new Map<string, number>();
    for (let round = 0; names.length < k; round++)
        for (let i = 0; i < groups.length && names.length < k; i++) {
            const c = groups[i][round];
            if (c) { names.push(c.name); group.set(c.name, i); }
        }
    return { scheme: pick, hues, names, group };
}

/**
 * Colours the pairs so that lines near each other never share a colour: lines that touch, cross or
 * run close together (neighbours along a stroke included). The colours come from one colour scheme
 * (levelColours); near lines also prefer different hue groups (strong contrast), and the dominant
 * group is used a little more. Most constrained line first. Returns how many near pairs still share
 * a colour (only with too few colours).
 */
export function colourPairs(pairs: Pair[], m: number, rand: () => number): number {
    const k = Math.max(1, Math.min(PALETTE.length, Math.round(m), pairs.length));
    const { names, group } = levelColours(k, rand);
    const adj: number[][] = pairs.map(() => []);
    for (const [i, j] of nearPairs(pairs)) { adj[i].push(j); adj[j].push(i); }
    const used = new Map<string, number>(names.map((n) => [n, 0]));
    const weight = (n: string) => (group.get(n) === 0 ? 1.5 : 1);
    const colour: (string | null)[] = pairs.map(() => null);
    const tie = pairs.map(() => rand());
    let clashes = 0;
    for (let done = 0; done < pairs.length; done++) {
        // Next: the uncoloured line that already sees the most different colours around it.
        let best = -1, bestSat = -1;
        for (let i = 0; i < pairs.length; i++) {
            if (colour[i]) continue;
            const sat = new Set(adj[i].map((j) => colour[j]).filter(Boolean)).size + adj[i].length / 1000 + tie[i] / 1e6;
            if (sat > bestSat) { bestSat = sat; best = i; }
        }
        const around = adj[best].map((j) => colour[j]).filter(Boolean) as string[];
        const free = names.filter((n) => !around.includes(n));
        const count = (n: string) => around.filter((c) => c === n).length;
        const pool = free.length ? free : names.filter((n) => count(n) === Math.min(...names.map(count)));
        if (!free.length) clashes += count(pool[0]);
        // Balanced use (dominant group a little more), and a different hue group from the neighbours.
        const sameGroup = (n: string) => around.filter((c) => group.get(c) === group.get(n)).length;
        const score = new Map(pool.map((n) => [n, used.get(n)! / weight(n) + 0.6 * sameGroup(n) + rand() * 0.3]));
        pool.sort((a, b) => score.get(a)! - score.get(b)!);
        colour[best] = pool[0];
        used.set(pool[0], used.get(pool[0])! + 1);
    }
    pairs.forEach((p, i) => { p.color = colour[i]!; });
    return clashes;
}

/** Builds `tries` candidates from strokes and returns the `keep` best (lowest score first). */
export function generate(strokes: Stroke[], opt: GenerateOptions): Candidate[] {
    const lines = prepareStrokes(strokes, opt.size ?? 700);
    if (!lines.length) return [];
    findCrossings(lines);
    const base = opt.seed ?? Date.now();
    const out: Candidate[] = [];
    const tries = opt.tries ?? 24;
    for (let i = 0; i < tries; i++) out.push(buildCandidate(lines, opt, rng(base + i * 7919)));
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, opt.keep ?? 3);
}

const r1 = (v: number) => Math.round(v * 10) / 10;
