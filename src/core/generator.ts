// Level generator v2: works on strokes (lines of a drawing), from traced line art or SVG.
//
// Design rules taken from studying hand-made levels of the genre (docs/guide/editor.md, 2.1):
// 1. T-junction = blocking: a stroke that ends on another stroke gets its dot ON that stroke,
//    so the "detail" pair must be cleared before the "frame" pair under it.
// 2. X crossings never block (lines cross freely).
// 3. Long strokes and closed loops are cut into several pairs, preferably at corners; at a cut
//    two dots sit side by side. A closed loop with one cut is a single pair whose dots touch.
// 4. Short stand-alone strokes become accent pairs with big dots.
// 5. Touching dots get different colours.
// Each call builds many random candidates, repairs blocking cycles so every candidate is
// solvable, scores them against the target difficulty and returns the best few.
import { Pair } from './level';
import { PALETTE } from './palette';
import { Pt, arcLengths, dist, distToPolyline, fitPath, pointAt, samplePath, simplify, slicePolyline } from './path';
import { solve, SolveResult } from './solver';
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
}

export interface Candidate {
    pairs: Pair[];
    score: number;
    sim: SolveResult;
    stats: { tJunctions: number; cuts: number; accents: number };
    warnings: string[];
}

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

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Line {
    pts: Pt[];
    acc: number[];
    len: number;
    closed: boolean;
    corners: number[];
}

function toLine(pts: Pt[], closed: boolean): Line {
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
    return { pts, acc, len, closed, corners };
}

/** Source units -> world: world = (p - c) * k. The longest side of the drawing becomes `size`. */
export function strokeFrame(strokes: Stroke[], size = 700) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const p of s.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!isFinite(x0)) return { k: 1, cx: 0, cy: 0 };
    return { k: size / Math.max(x1 - x0, y1 - y0, 1), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Normalises strokes to world units (longest side = size, centred) and smooths them. */
export function prepareStrokes(strokes: Stroke[], size = 700): Line[] {
    if (!strokes.some((s) => s.pts.length)) return [];
    const { k, cx, cy } = strokeFrame(strokes, size);
    return strokes
        .map((s) => {
            const w = s.pts.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
            if (s.closed && dist(w[0], w[w.length - 1]) > 0.5) w.push({ ...w[0] });
            const smooth = s.smooth ? samplePath(fitPath(simplify(w, Math.max(0.8, 1.2 * k)), 1.2), 4) : samplePath(w.map((p) => ({ x: p.x, y: p.y })), 4);
            if (s.closed) smooth[smooth.length - 1] = { ...smooth[0] };
            return toLine(smooth, s.closed);
        })
        .filter((l) => l.len >= 40);
}

interface Seg {
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
}

function slice(l: Line, s0: number, s1: number): Pt[] {
    if (l.closed && s0 >= l.len) { s0 -= l.len; s1 -= l.len; }
    if (!l.closed || s1 <= l.len) return slicePolyline(l.pts, l.acc, Math.max(0, s0), Math.min(l.len, s1));
    const a = slicePolyline(l.pts, l.acc, s0, l.len);
    const b = slicePolyline(l.pts, l.acc, 0, s1 - l.len);
    return [...a, ...b.slice(1)];
}

function segPoints(lines: Line[], g: Seg): Pt[] {
    const pts = slice(lines[g.line], g.s0, g.s1);
    if (g.snapA) pts.unshift(g.snapA);
    if (g.snapB) pts.push(g.snapB);
    return pts;
}

function toPair(lines: Line[], g: Seg, id: string): Pair {
    const path = fitPath(segPoints(lines, g), 1.5);
    const a = path[0], b = path[path.length - 1];
    return { id, color: '', a: { x: r1(a.x), y: r1(a.y), r: g.ra }, b: { x: r1(b.x), y: r1(b.y), r: g.rb }, path };
}

function buildCandidate(lines: Line[], opt: GenerateOptions, rand: () => number): Candidate {
    const warnings: string[] = [];
    const R = () => 14 + Math.round(rand() * 4);
    const minSeg = 70;
    const total = Math.max(1, Math.round(opt.pairs));

    // 1. How many pairs per line (by length; closed loops at least one).
    const totalLen = lines.reduce((s, l) => s + l.len, 0);
    const maxFor = (l: Line) => Math.max(1, Math.floor(l.len / minSeg));
    const counts = lines.map((l) => Math.min(maxFor(l), Math.max(1, Math.round((l.len / totalLen) * total * (0.8 + rand() * 0.4)))));
    let sum = counts.reduce((a, b) => a + b, 0);
    for (let guard = 0; sum !== total && guard < 2000; guard++) {
        const i = Math.floor(rand() * lines.length);
        if (sum < total && counts[i] < maxFor(lines[i])) { counts[i]++; sum++; }
        else if (sum > total && counts[i] > 1) { counts[i]--; sum--; }
        else if (sum > total && counts.every((c) => c <= 1)) break;
        else if (sum < total && counts.every((c, k) => c >= maxFor(lines[k]))) break;
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
            // Short stand-alone stroke: accent pair with big dots.
            if (k === 1 && l.len < 170) { const big = 24 + Math.round(rand() * 6); segs[segs.length - 1].ra = big; segs[segs.length - 1].rb = big; segs[segs.length - 1].accent = true; accents++; }
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
    let pairs = segs.map((g, i) => toPair(lines, g, `p${i + 1}`));
    let sim = solve({ pairs } as never);
    for (let iter = 0; iter < 10 && !sim.solvable; iter++) {
        const stuck = new Set(sim.stuck);
        const lineOf = new Map(pairs.map((p) => [p.id, samplePath(p.path, 5)]));
        for (const id of stuck) {
            const X = pairs.find((p) => p.id === id)!;
            const xl = lineOf.get(id)!;
            const rx = Math.max(X.a.r, X.b.r);
            for (const Y of pairs) {
                if (Y.id === id || !stuck.has(Y.id)) continue;
                for (const e of ['a', 'b'] as const) {
                    if (distToPolyline(Y[e], xl) >= Y[e].r + rx) continue;
                    const g = segs[+Y.id.slice(1) - 1];
                    const step = (Y[e].r + rx) * 2 + 6;
                    // Prefer sliding the cut (keeps the drawing whole); else shrink the dot; else shorten.
                    if (shiftCut(g, e, rand() < 0.5 ? step : -step) || shiftCut(g, e, rand() < 0.5 ? -step : step)) continue;
                    if (e === 'a' ? g.ra > 11 : g.rb > 11) { if (e === 'a') g.ra = 11; else g.rb = 11; continue; }
                    retract(g, e, Y[e].r + 6);
                }
            }
        }
        pairs = segs.map((g, i) => toPair(lines, g, `p${i + 1}`));
        sim = solve({ pairs } as never);
    }
    if (!sim.solvable) {
        warnings.push(`Dropped ${sim.stuck.length} pair(s) that kept blocking each other`);
        pairs = pairs.filter((p) => !sim.stuck.includes(p.id)).map((p, i) => ({ ...p, id: `p${i + 1}` }));
        sim = solve({ pairs } as never);
    }

    colourPairs(pairs, opt.colors, rand);
    // Last resort for dots that still touch: shrink them.
    for (let a = 0; a < pairs.length; a++)
        for (const ea of ['a', 'b'] as const)
            for (let b = 0; b < pairs.length; b++)
                for (const eb of ['a', 'b'] as const) {
                    if (a === b && ea === eb) continue;
                    const d1 = pairs[a][ea], d2 = pairs[b][eb];
                    const over = d1.r + d2.r + 1 - dist(d1, d2);
                    if (over > 0) { d1.r = Math.max(8, Math.floor(d1.r - over / 2 - 0.5)); d2.r = Math.max(8, Math.floor(d2.r - over / 2 - 0.5)); }
                }
    sim = solve({ pairs } as never); // smaller dots only remove blocks
    const t = targets(opt.difficulty, total);
    const n = pairs.length || 1;
    const score = 2 * Math.abs(sim.rounds - t.rounds) + 8 * Math.abs(sim.openAtStart / n - t.openShare) + 0.3 * Math.abs(n - total) + retracted / 60 + (sim.solvable ? 0 : 100);
    return { pairs, score, sim, stats: { tJunctions, cuts, accents }, warnings };
}

function nearest(pts: Pt[], p: Pt): { d: number; q: Pt } {
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

/** Greedy colouring: touching / nearby dots of different pairs avoid sharing a colour. */
function colourPairs(pairs: Pair[], m: number, rand: () => number) {
    const k = Math.max(1, Math.min(PALETTE.length, Math.round(m), pairs.length));
    const names = PALETTE.map((c) => c.name).sort(() => rand() - 0.5).slice(0, k);
    const near = (p: Pair, q: Pair) =>
        [p.a, p.b].some((d) => [q.a, q.b].some((e) => dist(d, e) < d.r + e.r + 24));
    const used = new Map<string, number>(names.map((n) => [n, 0]));
    const order = [...pairs].sort(() => rand() - 0.5);
    for (const p of order) {
        const bad = new Set(pairs.filter((q) => q !== p && q.color && near(p, q)).map((q) => q.color));
        const options = names.filter((n) => !bad.has(n));
        const pool = options.length ? options : names;
        pool.sort((a, b) => used.get(a)! - used.get(b)! || rand() - 0.5);
        p.color = pool[0];
        used.set(pool[0], used.get(pool[0])! + 1);
    }
}

/** Builds `tries` candidates from strokes and returns the `keep` best (lowest score first). */
export function generate(strokes: Stroke[], opt: GenerateOptions): Candidate[] {
    const lines = prepareStrokes(strokes, opt.size ?? 700);
    if (!lines.length) return [];
    const base = opt.seed ?? Date.now();
    const out: Candidate[] = [];
    const tries = opt.tries ?? 24;
    for (let i = 0; i < tries; i++) out.push(buildCandidate(lines, opt, rng(base + i * 7919)));
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, opt.keep ?? 3);
}

const r1 = (v: number) => Math.round(v * 10) / 10;
