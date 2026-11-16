// Level generator from traced line art (editor spec 2.1).
//
// 1. Each traced line is split into segments; each segment becomes a pair (dots at both ends).
// 2. Extra "crossing" pairs are added between random points on those lines, so their dots sit
//    on other lines and create blocking. Every candidate is kept only if the level stays solvable.
// 3. Colours are spread over the pairs.
// The split ratio (70% line pairs / 30% crossing pairs) and the crossing shape are placeholder
// rules (spec: TBD) to be replaced once the designer decides.
import { Level, Pair } from './level';
import { PALETTE } from './palette';
import { Anchor, Pt, arcLengths, dist, fitPath, pointAt, samplePath, simplify, slicePolyline } from './path';
import { solve } from './solver';

export interface GenerateOptions {
    pairs: number;
    colors: number;
    seed?: number;
    /** World size of the drawing's longest side. */
    size?: number;
    minRadius?: number;
    maxRadius?: number;
}

export interface GenerateResult {
    pairs: Pair[];
    linePairs: number;
    crossPairs: number;
    warnings: string[];
}

/** Placeholder suggestion rule for a target difficulty 1..5 (spec: TBD). */
export function suggest(difficulty: number): { pairs: number; colors: number } {
    const d = Math.max(1, Math.min(5, Math.round(difficulty)));
    return { pairs: 6 + d * 4, colors: Math.min(PALETTE.length, 2 + d) };
}

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
}

function toLine(pts: Pt[]): Line {
    const acc = arcLengths(pts);
    return { pts, acc, len: acc[acc.length - 1] };
}

export function generate(imageChains: Pt[][], imgW: number, imgH: number, opt: GenerateOptions): GenerateResult {
    const rand = rng(opt.seed ?? Date.now());
    const size = opt.size ?? 700;
    const rMin = opt.minRadius ?? 13, rMax = opt.maxRadius ?? 19;
    const radius = () => Math.round(rMin + rand() * (rMax - rMin));
    const warnings: string[] = [];
    const scale = size / Math.max(imgW, imgH);

    // Image px -> world, smoothed so pixel stairs disappear.
    const lines = imageChains
        .map((c) => c.map((p) => ({ x: (p.x - imgW / 2) * scale, y: (p.y - imgH / 2) * scale })))
        .map((c) => toLine(samplePath(fitPath(simplify(c, 1.2 * scale), 1.5 * scale), 4)))
        .filter((l) => l.len >= 70)
        .sort((a, b) => b.len - a.len);
    if (!lines.length) return { pairs: [], linePairs: 0, crossPairs: 0, warnings: ['No lines found in the image'] };

    const total = Math.max(1, Math.round(opt.pairs));
    const wantLine = Math.max(1, Math.round(total * 0.7));
    const gap = Math.round(rMax * 1.5 + 6);
    const minSeg = gap * 2 + 40;

    // Share line pairs across lines by length.
    const totalLen = lines.reduce((s, l) => s + l.len, 0);
    const counts = lines.map((l) => Math.max(1, Math.round((l.len / totalLen) * wantLine)));
    for (let i = 0; i < lines.length; i++) counts[i] = Math.min(counts[i], Math.max(1, Math.floor(lines[i].len / minSeg)));
    while (counts.reduce((a, b) => a + b, 0) > wantLine) {
        const i = counts.findIndex((c, k) => c > 1 && counts.every((o, j) => j === k || o <= c));
        if (i < 0) break;
        counts[i]--;
    }

    const pairs: Pair[] = [];
    let n = 1;
    const allDots = () => pairs.flatMap((p) => [p.a, p.b]);
    const fits = (pt: Pt, r: number) => allDots().every((d) => dist(d, pt) > d.r + r + 6);

    lines.forEach((line, li) => {
        const k = counts[li];
        const segLen = line.len / k;
        for (let s = 0; s < k; s++) {
            const ra = radius(), rb = radius();
            // Slide each end inward until its dot is clear of dots already placed
            // (chain ends often meet other chains at a junction).
            const start = s * segLen + (s === 0 ? 0 : gap), end = (s + 1) * segLen - (s === k - 1 ? 0 : gap);
            let s0 = start, s1 = end;
            while (s1 - s0 >= minSeg - gap && !fits(pointAt(line.pts, line.acc, s0), ra)) s0 += gap / 2;
            while (s1 - s0 >= minSeg - gap && !fits(pointAt(line.pts, line.acc, s1), rb)) s1 -= gap / 2;
            if (s1 - s0 < minSeg - gap) continue;
            const path = fitPath(slicePolyline(line.pts, line.acc, s0, s1), 2);
            const a = path[0], b = path[path.length - 1];
            if (!fits(a, ra) || !fits(b, rb) || dist(a, b) < ra + rb + 6) continue;
            pairs.push({ id: `p${n++}`, color: '', a: { x: a.x, y: a.y, r: ra }, b: { x: b.x, y: b.y, r: rb }, path });
        }
    });

    // The traced lines must be solvable on their own; shrink, then drop, stuck pairs.
    const base = { pairs } as Level;
    let res = solve(base);
    if (!res.solvable) {
        for (const id of res.stuck) { const p = pairs.find((q) => q.id === id)!; p.a.r = p.b.r = rMin - 3; }
        res = solve(base);
        if (!res.solvable) {
            warnings.push(`Dropped ${res.stuck.length} traced pair(s) that blocked each other`);
            for (const id of res.stuck) pairs.splice(pairs.findIndex((q) => q.id === id), 1);
        }
    }
    const linePairs = pairs.length;

    // Crossing pairs: from a point on one pair's line to a point on another's.
    const want = Math.max(0, total - linePairs);
    const sampled = pairs.map((p) => toLine(samplePath(p.path, 4)));
    let added = 0;
    for (let attempt = 0; attempt < want * 40 && added < want && sampled.length > 1; attempt++) {
        const i = Math.floor(rand() * sampled.length);
        let j = Math.floor(rand() * sampled.length);
        if (j === i) j = (j + 1) % sampled.length;
        const pick = (l: Line) => (l.len > gap * 4 ? pointAt(l.pts, l.acc, gap * 2 + rand() * (l.len - gap * 4)) : null);
        const P = pick(sampled[i]), Q = pick(sampled[j]);
        if (!P || !Q) continue;
        const d = dist(P, Q);
        if (d < 100 || d > 380) continue;
        const ra = radius(), rb = radius();
        if (!fits(P, ra) || !fits(Q, rb)) continue;
        const nx = -(Q.y - P.y) / d, ny = (Q.x - P.x) / d;
        const bend = (rand() - 0.5) * d * 0.6;
        const path: Anchor[] = [
            { x: P.x, y: P.y, out: { x: P.x + (Q.x - P.x) / 3 + nx * bend, y: P.y + (Q.y - P.y) / 3 + ny * bend } },
            { x: Q.x, y: Q.y, in: { x: Q.x - (Q.x - P.x) / 3 + nx * bend, y: Q.y - (Q.y - P.y) / 3 + ny * bend } }
        ];
        const pair: Pair = { id: `p${n}`, color: '', a: { x: P.x, y: P.y, r: ra }, b: { x: Q.x, y: Q.y, r: rb }, path: roundPath(path) };
        pairs.push(pair);
        if (solve(base).solvable) { n++; added++; }
        else pairs.pop();
    }
    if (added < want) warnings.push(`Placed ${added} of ${want} crossing pairs (no more solvable spots)`);

    // Colours: a random subset of the palette, spread so each is used.
    const m = Math.max(1, Math.min(PALETTE.length, Math.round(opt.colors), pairs.length));
    const names = PALETTE.map((c) => c.name).sort(() => rand() - 0.5).slice(0, m);
    const order = pairs.map((_, i) => i).sort(() => rand() - 0.5);
    order.forEach((pi, k) => { pairs[pi].color = names[k % m]; });

    for (const p of pairs) { p.a.x = r1(p.a.x); p.a.y = r1(p.a.y); p.b.x = r1(p.b.x); p.b.y = r1(p.b.y); }
    return { pairs, linePairs, crossPairs: added, warnings };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const roundPath = (path: Anchor[]) =>
    path.map((a) => ({ x: r1(a.x), y: r1(a.y), ...(a.in ? { in: { x: r1(a.in.x), y: r1(a.in.y) } } : {}), ...(a.out ? { out: { x: r1(a.out.x), y: r1(a.out.y) } } : {}) }));
