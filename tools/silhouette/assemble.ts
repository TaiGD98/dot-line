// From lines to level pairs: Bezier paths, colours, and the checks that go into the report
// (lines inside the black, edges traced, area filled).
import { Pair } from '../../src/core/level';
import { PALETTE } from '../../src/core/palette';
import { Pt, samplePath } from '../../src/core/path';
import { BlockModel, solve } from '../../src/core/solver';
import { fitAnchors } from './fit';
import { Grid } from './geom';
import { LineOut } from './ink';
import { Mask, edt } from './raster';
import { ART } from './shape';

/** Line colours of the silhouette levels: the eleven clearly different hues of the palette. */
export const COLOURS = ['blue', 'red', 'green', 'orange', 'purple', 'light_blue', 'yellow', 'pink', 'dark_green', 'brown', 'grey'];

function lab(hex: string): [number, number, number] {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    const X = (0.4124 * v[0] + 0.3576 * v[1] + 0.1805 * v[2]) / 0.95047, Y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2], Z = (0.0193 * v[0] + 0.1192 * v[1] + 0.9505 * v[2]) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const LAB = new Map(PALETTE.map((c) => [c.name, lab(c.base)]));
/** 1 = same colour, towards 0 = easy to tell apart. */
function alike(a: string, b: string): number {
    if (a === b) return 1;
    const x = LAB.get(a)!, y = LAB.get(b)!;
    const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    return Math.max(0, 1 - d / 70) * 0.6;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function toPairs(lines: LineOut[], radius: (l: LineOut) => number, tol = 1.0): Pair[] {
    return lines.map((ln, i) => {
        const path = fitAnchors(ln.pts, tol);
        const r = radius(ln);
        const a = path[0], b = path[path.length - 1];
        return { id: `p${i + 1}`, color: 'blue', a: { x: a.x, y: a.y, r }, b: { x: b.x, y: b.y, r }, path };
    });
}

/**
 * Colours: lines that cross or touch get the most different colours, lines that run side by side
 * must differ too, and all colours are used evenly. Returns the number of neighbours left with the
 * same colour (0 unless a line has more neighbours than there are colours).
 */
export function colourPairs(pairs: Pair[], colours: string[], nearDist: number, rand: () => number): { same: number; crossings: number } {
    const lines = pairs.map((p) => samplePath(p.path, 4));
    const grid = new Grid<number>(nearDist);
    lines.forEach((pts, i) => pts.forEach((p) => grid.add(p, i)));
    const n = pairs.length;
    const w: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    let crossings = 0;
    for (let i = 0; i < n; i++) {
        const best = new Map<number, number>();
        for (const p of lines[i]) for (const h of grid.near(p, nearDist)) if (h.v !== i && h.d < (best.get(h.v) ?? Infinity)) best.set(h.v, h.d);
        for (const [j, d] of best) {
            // touching or crossing: 3; side by side within the pattern pitch: 2; further: 1
            const weight = d < 5 ? 3 : d < nearDist * 0.55 ? 2 : 1;
            if (d < 5 && j > i) crossings++;
            w[i].set(j, Math.max(w[i].get(j) ?? 0, weight));
            w[j].set(i, Math.max(w[j].get(i) ?? 0, weight));
        }
    }
    const colour: (string | null)[] = new Array(n).fill(null);
    const used = new Map(colours.map((c) => [c, 0]));
    const order = [...Array(n).keys()];
    const weightSum = (i: number) => { let s = 0; for (const v of w[i].values()) s += v; return s; };
    const todo = new Set(order);
    while (todo.size) {
        // most constrained first: most coloured neighbours, then most neighbours
        let pick = -1, bestKey = -1;
        for (const i of todo) {
            let sat = 0;
            for (const [j, wt] of w[i]) if (colour[j]) sat += wt;
            const key = sat * 1000 + weightSum(i) + rand() * 0.5;
            if (key > bestKey) { bestKey = key; pick = i; }
        }
        todo.delete(pick);
        let bestC = colours[0], bestCost = Infinity;
        for (const c of colours) {
            let cost = 0;
            for (const [j, wt] of w[pick]) if (colour[j]) cost += wt * wt * alike(c, colour[j]!);
            cost += 0.05 * (used.get(c)! / Math.max(1, n / colours.length)) + rand() * 0.01;
            if (cost < bestCost) { bestCost = cost; bestC = c; }
        }
        colour[pick] = bestC;
        used.set(bestC, used.get(bestC)! + 1);
    }
    pairs.forEach((p, i) => { p.color = colour[i]!; });
    let same = 0;
    for (let i = 0; i < n; i++) for (const [j, wt] of w[i]) if (j > i && wt >= 2 && colour[i] === colour[j]) same++;
    return { same, crossings };
}

export interface Blocking {
    solvable: boolean;
    lines: number;
    open: number;
    depth: number;
    /** Average number of lines whose dot sits on a line. */
    blocksPerLine: number;
    /** Lines blocked by 0, 1, 2, 3 or more. */
    hist: [number, number, number, number];
    stuck: number;
}

export function blocking(pairs: Pair[]): Blocking {
    const L = { schema: 'dot-line-level', version: '1.0', id: 'x', name: 'x', pairs, obstacles: [] };
    const sim = solve(L);
    const model = new BlockModel(pairs);
    const alive = new Set(pairs.map((p) => p.id));
    let blocks = 0;
    const hist: [number, number, number, number] = [0, 0, 0, 0];
    for (const p of pairs) { const b = model.blockers(p, p.a.r <= p.b.r ? 'a' : 'b', alive).length; blocks += b; hist[Math.min(3, b)]++; }
    return { solvable: sim.solvable, lines: pairs.length, open: sim.openAtStart, depth: sim.rounds, blocksPerLine: blocks / Math.max(1, pairs.length), hist, stuck: sim.stuck.length };
}

export interface FitReport {
    /** Share of line length whose stroke leaves the black by more than 1 px. */
    overflowShare: number;
    /** Largest distance a stroke edge gets outside the black (px). */
    overflowMax: number;
    /** Share of the silhouette's edge with a line flush against it (within 7 px). */
    edgeFlush: number;
    /** Share of the edge with a line close by (within 22 px: centre lines of thin parts count). */
    edgeNear: number;
    /** Share of the black area within `reach` px of a line. */
    filled: number;
    /** Dots: share of the dot area that lies outside the black. */
    dotsOutside: number;
}

/** How well the lines fit the silhouette. `sdFull` = signed distance to the edge in world px. */
export function fitReport(pairs: Pair[], mask: Mask, sdFull: Float32Array, k: number, lineWidth: (p: Pair) => number, reach: number): FitReport {
    const n = mask.n, S = n / ART, px = k / S;
    const toMask = (p: Pt) => ({ x: (p.x / k + ART / 2) * S - 0.5, y: (p.y / k + ART / 2) * S - 0.5 });
    const ink = new Uint8Array(n * n).fill(1);
    let total = 0, over = 0, overMax = 0;
    for (const p of pairs) {
        const pts = samplePath(p.path, 1.5);
        const hw = lineWidth(p) / 2;
        for (let i = 0; i < pts.length; i++) {
            const m = toMask(pts[i]);
            const x = Math.round(m.x), y = Math.round(m.y);
            if (x < 0 || y < 0 || x >= n || y >= n) { over++; total++; overMax = Math.max(overMax, 99); continue; }
            ink[y * n + x] = 0;
            const out = hw - sdFull[y * n + x];
            total++;
            if (out > 1) over++;
            if (out > overMax) overMax = out;
        }
    }
    const toInk = edt(ink, n);
    let edge = 0, flush = 0, near = 0, black = 0, filled = 0;
    for (let y = 1; y < n - 1; y++)
        for (let x = 1; x < n - 1; x++) {
            const i = y * n + x;
            if (!mask.data[i]) continue;
            black++;
            const d = toInk[i] * px;
            if (d <= reach) filled++;
            if (!mask.data[i - 1] || !mask.data[i + 1] || !mask.data[i - n] || !mask.data[i + n]) { edge++; if (d <= 7) flush++; if (d <= 22) near++; }
        }
    // dots outside the black: sample a small disc per dot
    let dotIn = 0, dotAll = 0;
    for (const p of pairs)
        for (const d of [p.a, p.b])
            for (let a = 0; a < 12; a++)
                for (const rr of [0.45, 0.9]) {
                    const m = toMask({ x: d.x + Math.cos((a * Math.PI) / 6) * d.r * rr, y: d.y + Math.sin((a * Math.PI) / 6) * d.r * rr });
                    const x = Math.round(m.x), y = Math.round(m.y);
                    dotAll++;
                    if (x >= 0 && y >= 0 && x < n && y < n && mask.data[y * n + x]) dotIn++;
                }
    return { overflowShare: over / Math.max(1, total), overflowMax: Math.max(0, overMax), edgeFlush: flush / Math.max(1, edge), edgeNear: near / Math.max(1, edge), filled: filled / Math.max(1, black), dotsOutside: 1 - dotIn / Math.max(1, dotAll) };
}
