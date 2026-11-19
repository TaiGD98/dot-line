// Generator part 2 ("overlap"): decorates a level with CROSS LINES on top of its base lines.
//
// Part 1 (generator.ts) only fills the lines of the drawing. Part 2 is independent: it never moves
// or cuts a base line, it only adds pairs marked `cross`:
//   - X cross: both dots in empty space, the line crosses at least one other line. Blocks nothing.
//   - T cross: one dot sits ON another pair's line (blocks it), the other dot is in empty space.
// Rules (designer):
//   - never both dots on other pairs' lines (at least one dot in empty space);
//   - lines that cross or touch never share a colour;
//   - cross lines may cross / sit on other cross lines too (a twig on a bristle = deeper blocking);
//   - the result must read as an ORNAMENT on the picture, not as scribbles: one motif repeated at
//     an even rhythm, mirrored when the drawing is symmetric, and the original shape stays visible.
// Patterns: "fringe" (bristles and stitches at right angles along every line), "rays" (the same,
// pointing at the centre), "stripes" / "columns" / "diagonal" (parallel lines across the drawing).
// Nothing here can make the level unsolvable: a cross line is only ever blocked by a twig on it.
import { Check, DEFAULT_RADIUS, Dot, Pair, mainRadius } from './level';
import { PALETTE, farApart } from './palette';
import { Anchor, Pt, arcLengths, dist, distToPolyline, pointAt, samplePath } from './path';
import { HIT_SCALE, SolveResult, solve } from './solver';
import { NEAR_LINES, fixNearColours, nearPairs, rng, settleNearDots } from './generator';

export type CrossKind = 'x' | 't';
export type PatternStyle = 'auto' | 'fringe' | 'rays' | 'stripes' | 'columns' | 'diagonal';
export const PATTERN_STYLES: { id: PatternStyle; label: string }[] = [
    { id: 'auto', label: 'Auto (several)' },
    { id: 'fringe', label: 'Fringe (ticks along the lines)' },
    { id: 'rays', label: 'Rays (towards the centre)' },
    { id: 'stripes', label: 'Stripes (horizontal)' },
    { id: 'columns', label: 'Columns (vertical)' },
    { id: 'diagonal', label: 'Diagonal' }
];

export interface OverlapOptions {
    /** Number of X cross lines. */
    x: number;
    /** Number of T cross lines. */
    t: number;
    /** 1..5 (the level's target difficulty): how many T lines sit on other cross lines (deeper blocking). */
    difficulty?: number;
    style?: PatternStyle;
    seed?: number;
    tries?: number;
    keep?: number;
}

export interface OverlapCandidate {
    /** The new cross pairs only (the base pairs are untouched). */
    pairs: Pair[];
    x: number;
    t: number;
    style: string;
    symmetric: boolean;
    /** T lines sitting on other cross lines. */
    stacked: number;
    warnings: string[];
    score: number;
    sim: SolveResult;
}

/** Dot radius of the cross lines: the dot size of the level (set per run by generateOverlap). */
let R = DEFAULT_RADIUS;
/** Centre distance at which a dot blocks a line. */
let HIT = 2 * R * HIT_SCALE;
/** A free dot stays this far from every line, and every line this far from other pairs' dots. */
let CLEAR = HIT + 3;
/** Between two dot centres (normal dots). */
let DOT_GAP = 2 * R + 6;
/** Cross lines get the same dots as the base lines: their most common radius. */
function useRadius(base: Pair[]) {
    R = mainRadius(base);
    HIT = 2 * R * HIT_SCALE;
    CLEAR = HIT + 3;
    DOT_GAP = 2 * R + 6;
}
/** "Close to a line": used to recognise clean crossings and reject running alongside. */
const BAND = 10;
const MAX_RUN = 40;
const CELL = 24;
const STEP = 3;
const MIN_LEN = 48;

interface SLine { pts: Pt[]; acc: number[]; len: number; keys: number[]; ndots: number; /** Biggest dot of the pair that runs on this line. */ rad: number }
interface El { kind: CrossKind; path: Anchor[]; pts: Pt[]; host: number }
interface Rec { el: El; idx: number; crossed: number[]; unit: number; twin?: number; len: number; dir: Pt; pass: string }
interface Slot { p: Pt; dir: Pt; host: number; grip: number; span?: number; bridge?: number; axis?: boolean; /** The same slot moved along its line (fringe only). */ shift?: (by: number) => Slot | null }
interface Group { t: Slot[]; x: Slot[]; /** More T-capable slots of the same row (used only to fill up). */ alt: Slot[] }
interface Style { name: string; field: 'normal' | 'radial' | 'fixed'; angle: number; shape: 'straight' | 'arc' | 'hook' | 'wave'; len: number; side: 'in' | 'out' | 'alt'; bend: number }

const add = (p: Pt, v: Pt, k: number): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const rot = (v: Pt, a: number): Pt => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const r1 = (v: number) => Math.round(v * 10) / 10;
const cellKey = (cx: number, cy: number) => (cx + 5000) * 10000 + (cy + 5000);

/** All lines and dots, with a grid for fast "what is near this point" queries. Lines are added and removed last-in first-out. */
class Scene {
    lines: SLine[] = [];
    dots: { x: number; y: number; r: number; line: number }[] = [];
    private grid = new Map<number, number[]>();
    private maxRad = R;

    add(pts: Pt[], dots: (Pt & { r: number })[], rad = R): number {
        const idx = this.lines.length;
        const keys: number[] = [];
        for (const p of pts) {
            const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
            let c = this.grid.get(k);
            if (!c) this.grid.set(k, (c = []));
            c.push(p.x, p.y, idx);
            keys.push(k);
        }
        const acc = arcLengths(pts);
        this.lines.push({ pts, acc, len: acc[acc.length - 1], keys, ndots: dots.length, rad });
        this.maxRad = Math.max(this.maxRad, rad);
        for (const d of dots) this.dots.push({ x: d.x, y: d.y, r: d.r, line: idx });
        return idx;
    }

    pop() {
        const l = this.lines.pop()!;
        for (const k of l.keys) this.grid.get(k)!.length -= 3;
        this.dots.length -= l.ndots;
    }

    /** Nearest line point within `radius` (ignoring one line, and lines from index `limit` on). */
    near(q: Pt, radius: number, ignore = -1, limit = Infinity): { d: number; line: number; x: number; y: number } {
        let best = radius, line = -1, bx = 0, by = 0;
        const x0 = Math.floor((q.x - radius) / CELL), x1 = Math.floor((q.x + radius) / CELL);
        const y0 = Math.floor((q.y - radius) / CELL), y1 = Math.floor((q.y + radius) / CELL);
        for (let cx = x0; cx <= x1; cx++)
            for (let cy = y0; cy <= y1; cy++) {
                const c = this.grid.get(cellKey(cx, cy));
                if (!c) continue;
                for (let i = 0; i < c.length; i += 3) {
                    const li = c[i + 2];
                    if (li === ignore || li >= limit) continue;
                    const d = Math.hypot(c[i] - q.x, c[i + 1] - q.y);
                    if (d < best) { best = d; line = li; bx = c[i]; by = c[i + 1]; }
                }
            }
        return { d: line < 0 ? Infinity : best, line, x: bx, y: by };
    }

    /** Every line within `radius` of q, with its smallest distance. */
    linesNear(q: Pt, radius: number, ignore = -1): [number, number][] {
        const out: [number, number][] = [];
        const x0 = Math.floor((q.x - radius) / CELL), x1 = Math.floor((q.x + radius) / CELL);
        const y0 = Math.floor((q.y - radius) / CELL), y1 = Math.floor((q.y + radius) / CELL);
        for (let cx = x0; cx <= x1; cx++)
            for (let cy = y0; cy <= y1; cy++) {
                const c = this.grid.get(cellKey(cx, cy));
                if (!c) continue;
                for (let i = 0; i < c.length; i += 3) {
                    const li = c[i + 2];
                    if (li === ignore) continue;
                    const d = Math.hypot(c[i] - q.x, c[i + 1] - q.y);
                    if (d >= radius) continue;
                    const e = out.find((o) => o[0] === li);
                    if (!e) out.push([li, d]); else if (d < e[1]) e[1] = d;
                }
            }
        return out;
    }

    /** A dot of radius r at q blocks no line (bigger dots on a line need more room), ignoring one line. */
    clearOfLines(q: Pt, r: number, ignore = -1): boolean {
        for (const [li, d] of this.linesNear(q, (this.maxRad + r) * HIT_SCALE + 3, ignore)) if (d < (this.lines[li].rad + r) * HIT_SCALE + 3) return false;
        return true;
    }

    /** No other dot within touching distance (plus a gap) of a dot of radius r at q. */
    dotFree(q: Pt, r: number): boolean {
        for (const d of this.dots) if (Math.hypot(d.x - q.x, d.y - q.y) < r + d.r + 6) return false;
        return true;
    }
}

interface Ctx {
    sc: Scene;
    nBase: number;
    sym: boolean;
    cx: number;
    c: Pt;
    size: number;
    box: { x0: number; y0: number; x1: number; y1: number };
    pad: number;
    enc: Map<number, number>;
    colours: string[];
    /** Base lines too short to carry ornaments (small details of the drawing). */
    minor: boolean[];
}

function prepare(base: Pair[]): Ctx {
    const sc = new Scene();
    for (const p of base) sc.add(samplePath(p.path, STEP), [p.a, p.b], Math.max(p.a.r, p.b.r));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of sc.lines) for (const p of l.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2;
    // Mirror symmetry about the vertical axis through the middle (20 px covers the gaps at cut dots).
    let n = 0, hit = 0;
    for (const l of sc.lines) for (let i = 0; i < l.pts.length; i += 4) { n++; if (sc.near({ x: 2 * cx - l.pts[i].x, y: l.pts[i].y }, 20).line >= 0) hit++; }
    const size = Math.max(x1 - x0, y1 - y0, 200);
    return { sc, nBase: sc.lines.length, sym: n > 0 && hit / n >= 0.9, cx, c: { x: cx, y: (y0 + y1) / 2 }, size, box: { x0, y0, x1, y1 }, pad: Math.max(120, size * 0.17), enc: new Map(), colours: base.map((p) => p.color), minor: sc.lines.map((l) => l.len < size * 0.2) };
}

const inPad = (ctx: Ctx, p: Pt) => p.x > ctx.box.x0 - ctx.pad && p.x < ctx.box.x1 + ctx.pad && p.y > ctx.box.y0 - ctx.pad && p.y < ctx.box.y1 + ctx.pad;
const inBox = (ctx: Ctx, p: Pt) => p.x > ctx.box.x0 && p.x < ctx.box.x1 && p.y > ctx.box.y0 && p.y < ctx.box.y1;

/** 0..1: how enclosed by base lines a point is (1 = inside a closed shape, ~0.5 or less = outside). */
function enclosure(ctx: Ctx, q: Pt): number {
    const key = cellKey(Math.round(q.x / 8), Math.round(q.y / 8));
    const cached = ctx.enc.get(key);
    if (cached !== undefined) return cached;
    let hits = 0;
    for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6 + 0.13, v = { x: Math.cos(a), y: Math.sin(a) };
        for (let d = 10; d < ctx.size * 1.5; d += 8) {
            const p = add(q, v, d);
            if (!inBox(ctx, p)) break;
            if (ctx.sc.near(p, 5, -1, ctx.nBase).line >= 0) { hits++; break; }
        }
    }
    ctx.enc.set(key, hits / 12);
    return hits / 12;
}

/** Distance from p along dir to the next line (Infinity if none before leaving the drawing). */
function freeDist(ctx: Ctx, p: Pt, dir: Pt, ignore: number): number {
    for (let d = 12; d < ctx.size * 1.5; d += 4) {
        const q = add(p, dir, d);
        if (!inPad(ctx, q)) return Infinity;
        if (ctx.sc.near(q, 5, d < 24 ? ignore : -1).line >= 0) return d;
    }
    return Infinity;
}

function at(l: SLine, s: number): { p: Pt; t: Pt } {
    const p = pointAt(l.pts, l.acc, s), p0 = pointAt(l.pts, l.acc, Math.max(0, s - 4)), p1 = pointAt(l.pts, l.acc, Math.min(l.len, s + 4));
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    return { p, t: { x: (p1.x - p0.x) / d, y: (p1.y - p0.y) / d } };
}

/** One motif stroke from `a` along `dir`: straight, a soft arc, a curl (hook) or an S wave. */
function shapePath(a: Pt, dir: Pt, len: number, shape: Style['shape'], sign: number): Anchor[] {
    const side = { x: -dir.y * sign, y: dir.x * sign };
    const P = (along: number, across: number): Pt => ({ x: r1(a.x + dir.x * len * along + side.x * len * across), y: r1(a.y + dir.y * len * along + side.y * len * across) });
    const A = { x: r1(a.x), y: r1(a.y) };
    if (shape === 'arc') return [{ ...A, out: P(0.33, 0.2) }, { ...P(1, 0), in: P(0.67, 0.2) }];
    if (shape === 'hook') return [{ ...A, out: P(0.5, 0) }, { ...P(0.74, 0.4), in: P(1.08, 0.1) }];
    if (shape === 'wave') return [{ ...A, out: P(0.33, 0.2) }, { ...P(1, 0), in: P(0.67, -0.2) }];
    return [A, P(1, 0)];
}

const element = (kind: CrossKind, path: Anchor[], host: number): El => ({ kind, path, pts: samplePath(path, STEP), host });

function mirrorEl(el: El, cx: number): El {
    const m = (p: Pt): Pt => ({ x: r1(2 * cx - p.x), y: p.y });
    const path = el.path.map((an) => { const o: Anchor = m(an); if (an.in) o.in = m(an.in); if (an.out) o.out = m(an.out); return o; });
    return { kind: el.kind, path, pts: el.pts.map((p) => ({ x: 2 * cx - p.x, y: p.y })), host: -1 };
}

function moveEl(el: El, dx: number, dy: number): El {
    const m = (p: Pt): Pt => ({ x: r1(p.x + dx), y: r1(p.y + dy) });
    const path = el.path.map((an) => { const o: Anchor = m(an); if (an.in) o.in = m(an.in); if (an.out) o.out = m(an.out); return o; });
    return { kind: el.kind, path, pts: el.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })), host: el.host };
}

/** Checks every rule for one new line. Returns the lines it crosses, or null when it breaks a rule. */
function check(ctx: Ctx, el: El): number[] | null {
    const sc = ctx.sc, pts = el.pts, n = pts.length;
    if (n < 4) return null;
    const a = pts[0], b = pts[n - 1];
    if (dist(a, b) < DOT_GAP) return null;
    for (let i = 0; i < n; i += 3) if (!inPad(ctx, pts[i])) return null;
    if (!inPad(ctx, b)) return null;
    // Dots: clear of every other dot; free dots clear of every line; a T dot only touches its host.
    if (!sc.dotFree(a, R) || !sc.dotFree(b, R)) return null;
    if (!sc.clearOfLines(a, R, el.kind === 't' ? el.host : -1)) return null;
    if (!sc.clearOfLines(b, R)) return null;
    // Other pairs' dots never sit on (or next to) the new line: nothing else blocks it.
    for (const d of sc.dots) {
        const lim = (R + d.r) * HIT_SCALE + 3;
        for (let i = 0; i < n; i += 2) if (Math.abs(pts[i].x - d.x) < lim && Math.hypot(pts[i].x - d.x, pts[i].y - d.y) < lim) return null;
    }
    // Lines: clean crossings only (one line at a time), never alongside another line.
    const crossed: number[] = [];
    const runMin = new Map<number, number>();
    let s = 0, run = -1;
    for (let i = 0; i < n; i++) {
        if (i) s += dist(pts[i - 1], pts[i]);
        const close = sc.linesNear(pts[i], BAND, el.kind === 't' && s < 16 ? el.host : -1);
        if (close.length) {
            if (i === 0 || i === n - 1) return null;
            if (run < 0) { run = s; runMin.clear(); }
            for (const [li, d] of close) runMin.set(li, Math.min(runMin.get(li) ?? Infinity, d));
        } else if (run >= 0) {
            if (s - run > MAX_RUN || runMin.size !== 1) return null;
            const [[li, d]] = [...runMin];
            if (d > 2.6) return null;
            crossed.push(li);
            run = -1;
        }
    }
    if (run >= 0) return null;
    if (el.kind === 'x' && !crossed.length) return null;
    if (el.kind === 't' && crossed.includes(el.host)) return null;
    return crossed;
}

function styleFor(kind: PatternStyle, i: number, rand: () => number, size: number): Style {
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const order: Exclude<PatternStyle, 'auto'>[] = ['fringe', 'stripes', 'rays', 'columns', 'diagonal'];
    const k = kind === 'auto' ? order[i % order.length] : kind;
    const bend = rand() < 0.5 ? 1 : -1;
    // Strokes long enough to read as lines between their two dots: 10-13% of the drawing.
    const len = Math.round(Math.max(66, Math.min(120, size * (0.1 + rand() * 0.03))));
    if (k === 'fringe') { const shape = pick<Style['shape']>(['straight', 'arc', 'hook', 'straight']); return { name: `fringe (${shape})`, field: 'normal', angle: 0, shape, len, side: pick<Style['side']>(['in', 'in', 'in', 'alt']), bend }; }
    if (k === 'rays') return { name: 'rays', field: 'radial', angle: 0, shape: 'straight', len: len + 8, side: pick<Style['side']>(['in', 'in', 'out']), bend };
    const shape = pick<Style['shape']>(['straight', 'straight', 'wave']);
    if (k === 'stripes') return { name: `stripes (${shape})`, field: 'fixed', angle: 0, shape, len, side: 'in', bend };
    if (k === 'columns') return { name: `columns (${shape})`, field: 'fixed', angle: Math.PI / 2, shape, len, side: 'in', bend };
    return { name: `diagonal (${shape})`, field: 'fixed', angle: Math.PI / 4, shape, len, side: 'in', bend };
}

/** Evenly spaced slots along every base line (left half only when the drawing is symmetric). */
function fringeSlots(ctx: Ctx, style: Style, count: number, opt: { all?: boolean; every?: number; minor?: boolean } = {}): { slots: Slot[]; axis: Slot[] } {
    const sc = ctx.sc, M = DOT_GAP + 2, minSp = opt.every ?? DOT_GAP + 8, half = ctx.sym && !opt.all;
    const segs: { li: number; s0: number; s1: number }[] = [];
    const axis: Slot[] = [];
    const dirAt = (li: number, s: number, index: number): Slot | null => {
        const { p, t } = at(sc.lines[li], s);
        const nrm = { x: -t.y, y: t.x };
        let side = 1;
        const eIn = enclosure(ctx, add(p, nrm, 34)), eOut = enclosure(ctx, add(p, nrm, -34));
        if (Math.abs(eIn - eOut) > 0.09) side = eIn > eOut ? 1 : -1;
        else side = (ctx.c.x - p.x) * nrm.x + (ctx.c.y - p.y) * nrm.y >= 0 ? 1 : -1;
        if (style.side === 'out') side = -side;
        if (style.side === 'alt' && index % 2) side = -side;
        let dir = { x: nrm.x * side, y: nrm.y * side };
        let grip = 1;
        if (style.field === 'radial') {
            const d = Math.hypot(p.x - ctx.c.x, p.y - ctx.c.y) || 1, rad = { x: (p.x - ctx.c.x) / d, y: (p.y - ctx.c.y) / d };
            grip = Math.abs(rad.x * nrm.x + rad.y * nrm.y);
            if (grip < 0.62) return null;
            dir = rad.x * dir.x + rad.y * dir.y >= 0 ? rad : { x: -rad.x, y: -rad.y };
        }
        const l = sc.lines[li];
        return { p, dir, host: li, grip, shift: (by) => (s + by < M || s + by > l.len - M || (half && pointAt(l.pts, l.acc, s + by).x > ctx.cx - 20) ? null : dirAt(li, s + by, index)) };
    };
    for (let li = 0; li < ctx.nBase; li++) {
        const l = sc.lines[li];
        if (ctx.minor[li] && !opt.minor) continue;
        if (!half) { if (l.len - 2 * M >= 0) segs.push({ li, s0: M, s1: l.len - M }); continue; }
        let start = -1;
        for (let i = 0; i < l.pts.length; i++) {
            const ok = l.pts[i].x < ctx.cx - 20 && l.acc[i] >= M && l.acc[i] <= l.len - M;
            if (ok && start < 0) start = l.acc[i];
            if (start >= 0 && (!ok || i === l.pts.length - 1)) { segs.push({ li, s0: start, s1: l.acc[ok ? i : i - 1] }); start = -1; }
            // A line crossing the axis level: a slot on the axis mirrors onto itself.
            if (i && (l.pts[i - 1].x - ctx.cx) * (l.pts[i].x - ctx.cx) <= 0 && l.acc[i] >= M && l.acc[i] <= l.len - M) {
                const sl = dirAt(li, l.acc[i], 0);
                if (sl && Math.abs(sl.dir.x) < 0.12) axis.push({ ...sl, p: { x: ctx.cx, y: sl.p.y }, dir: { x: 0, y: Math.sign(sl.dir.y) || 1 }, axis: true });
            }
        }
    }
    // Share `count` between the segments by length (largest remainder), within each one's capacity.
    const cap = segs.map((g) => Math.floor((g.s1 - g.s0) / minSp) + 1);
    const total = Math.min(count, cap.reduce((a, b) => a + b, 0));
    const w = segs.map((g) => g.s1 - g.s0 + minSp * 0.6), wSum = w.reduce((a, b) => a + b, 0) || 1;
    const share = segs.map((_, j) => Math.min(cap[j], Math.floor((total * w[j]) / wSum)));
    let left = total - share.reduce((a, b) => a + b, 0);
    const byRest = segs.map((_, j) => j).sort((i, j) => ((total * w[j]) / wSum) % 1 - ((total * w[i]) / wSum) % 1);
    for (let pass = 0; left > 0 && pass < 50; pass++) for (const j of byRest) if (left > 0 && share[j] < cap[j]) { share[j]++; left--; }
    const slots: Slot[] = [];
    segs.forEach((g, j) => {
        for (let i = 0; i < share[j]; i++) {
            const sl = dirAt(g.li, g.s0 + ((g.s1 - g.s0) * (i + 0.5)) / share[j], slots.length);
            if (sl) slots.push(sl);
        }
    });
    return { slots, axis };
}

/** Parallel rows across the drawing: where a row meets a base line there is a slot. */
function stripeGroups(ctx: Ctx, style: Style, spacing: number, all = false): Group[] {
    const sc = ctx.sc, u = { x: Math.cos(style.angle), y: Math.sin(style.angle) }, w = { x: -u.y, y: u.x };
    const back = { x: -u.x, y: -u.y };
    const M = DOT_GAP + 2, half = ctx.sym && !all;
    const corners = [{ x: ctx.box.x0, y: ctx.box.y0 }, { x: ctx.box.x1, y: ctx.box.y0 }, { x: ctx.box.x0, y: ctx.box.y1 }, { x: ctx.box.x1, y: ctx.box.y1 }].map((p) => p.x * w.x + p.y * w.y);
    const lo = Math.min(...corners), hi = Math.max(...corners), c0 = ctx.c.x * w.x + ctx.c.y * w.y;
    const groups: Group[] = [];
    for (let k = Math.ceil((lo - c0) / spacing - 0.5); c0 + (k + 0.5) * spacing < hi; k++) {
        const c = c0 + (k + 0.5) * spacing;
        if (c < lo + 8 || c > hi - 8) continue;
        const ints: { p: Pt; li: number; t: number; grip: number; edge: boolean }[] = [];
        for (let li = 0; li < ctx.nBase; li++) {
            const l = sc.lines[li];
            for (let i = 1; i < l.pts.length; i++) {
                const f0 = l.pts[i - 1].x * w.x + l.pts[i - 1].y * w.y - c, f1 = l.pts[i].x * w.x + l.pts[i].y * w.y - c;
                if (f0 === 0 || f0 * f1 >= 0) continue;
                const lam = f0 / (f0 - f1), p = { x: l.pts[i - 1].x + (l.pts[i].x - l.pts[i - 1].x) * lam, y: l.pts[i - 1].y + (l.pts[i].y - l.pts[i - 1].y) * lam };
                const s = l.acc[i - 1] + (l.acc[i] - l.acc[i - 1]) * lam, tg = at(l, s).t, grip = Math.abs(tg.x * w.x + tg.y * w.y);
                ints.push({ p, li, t: p.x * u.x + p.y * u.y, grip, edge: ctx.minor[li] || grip < 0.6 || s < M || s > l.len - M });
            }
        }
        ints.sort((a, b) => a.t - b.t);
        const leftOk = (p: Pt) => !half || p.x < ctx.cx - 20;
        const g: Group = { t: [], x: [], alt: [] };
        const span = (from: { p: Pt }, dir: Pt, gap: number): number | undefined => {
            if (!isFinite(gap)) return undefined; // pointing out of the drawing: a short bristle
            let v = Math.min(gap - (CLEAR + 4), ctx.size * 0.55);
            if (half && dir.x > 0.05) v = Math.min(v, (ctx.cx - 21 - from.p.x) / dir.x);
            return v;
        };
        ints.forEach((it, j) => {
            const nextGap = j + 1 < ints.length ? ints[j + 1].t - it.t : Infinity, prevGap = j ? it.t - ints[j - 1].t : Infinity;
            if (!it.edge && leftOk(it.p)) {
                // A stitch across this line; across the next one too when it is close (a rung).
                const far = j + 1 < ints.length && !ints[j + 1].edge && nextGap > 30 && (nextGap < 170 || (half && Math.abs(it.p.x + ints[j + 1].p.x - 2 * ctx.cx) < 4 && nextGap < ctx.size * 0.45));
                g.x.push({ p: it.p, dir: u, host: it.li, grip: it.grip, bridge: far ? nextGap : undefined });
                // Bristles from this line, both ways (the regular pass uses one per cell, see below).
                for (const [dir, gap] of [[u, nextGap], [back, prevGap]] as [Pt, number][]) {
                    const sp = span(it, dir, gap);
                    if (sp === undefined || sp >= MIN_LEN) g.alt.push({ p: it.p, dir, host: it.li, grip: it.grip, span: sp });
                }
            }
            if (j + 1 >= ints.length) return;
            // One T per cell, anchored on alternate sides row by row (teeth of two combs).
            const nx = ints[j + 1];
            let from = (k + j) % 2 === 0 ? it : nx;
            if (from.edge || !leftOk(from.p)) from = from === it ? nx : it;
            if (from.edge || !leftOk(from.p)) return;
            const dir = from === it ? u : back, sp = span(from, dir, nextGap)!;
            if (sp >= MIN_LEN) g.t.push({ p: from.p, dir, host: from.li, grip: from.grip, span: sp });
        });
        if (g.t.length || g.x.length || g.alt.length) groups.push(g);
    }
    return groups;
}

function build(ctx: Ctx, opt: OverlapOptions, style: Style, rand: () => number, taken: Set<string>): OverlapCandidate {
    const sc = ctx.sc;
    const X = Math.max(0, Math.round(opt.x)), T = Math.max(0, Math.round(opt.t));
    const d = Math.max(1, Math.min(5, Math.round(opt.difficulty ?? 3)));
    const warnings: string[] = [];
    const placed: Rec[] = [];
    let needT = T, needX = X, unit = 0, pass = 'pattern';
    // T lines stacked on other cross lines (twigs) and X lines crossing a bristle (ticks).
    let twigsLeft = Math.min(Math.floor(T / 2), Math.round(T * [0, 0, 0.2, 0.34, 0.45][d - 1]));
    let ticksLeft = X >= 4 ? Math.max(0, Math.min(T - 2 * twigsLeft, Math.round(X * [0, 0, 0.15, 0.2, 0.25][d - 1]))) : 0;
    const bristles = T - twigsLeft, stitches = X - ticksLeft, units = bristles + stitches;
    const twigRate = bristles ? twigsLeft / bristles : 0, tickRate = bristles - twigsLeft > 0 ? ticksLeft / (bristles - twigsLeft) : 0;
    let twigAcc = 0.5, tickAcc = 0.5;

    const placeOne = (el: El, len: number, dir: Pt): Rec | null => {
        const crossed = check(ctx, el);
        if (!crossed) return null;
        const n = el.pts.length;
        const rec: Rec = { el, idx: sc.add(el.pts, [{ ...el.pts[0], r: R }, { ...el.pts[n - 1], r: R }]), crossed, unit, len, dir, pass };
        placed.push(rec);
        return rec;
    };
    const undo = () => { sc.pop(); placed.pop(); };
    /** Places the line and, on a symmetric drawing, its mirror image. `max` = lines still wanted. */
    const placeSym = (el: El, len: number, dir: Pt, max: number): Rec[] => {
        if (max < 1) return [];
        const a = el.pts[0], b = el.pts[el.pts.length - 1];
        const self = (Math.abs(a.x - ctx.cx) < 3 && Math.abs(b.x - ctx.cx) < 3) || (Math.abs(a.x + b.x - 2 * ctx.cx) < 3 && Math.abs(a.y - b.y) < 3);
        if (!ctx.sym || self) { const r = placeOne(el, len, dir); return r ? [r] : []; }
        if (max < 2) return [];
        const first = placeOne(el, len, dir);
        if (!first) return [];
        let tw = mirrorEl(el, ctx.cx);
        if (tw.kind === 't') {
            // Hand-made drawings are rarely mirrored to the pixel: slide the twin onto its line.
            const h = sc.near(tw.pts[0], 12, first.idx);
            if (h.line >= 0) tw = moveEl(tw, h.x - tw.pts[0].x, h.y - tw.pts[0].y);
            tw.host = h.line;
        }
        const second = tw.kind === 't' && tw.host < 0 ? null : placeOne(tw, len, { x: -dir.x, y: dir.y });
        if (!second) { undo(); return []; }
        first.twin = second.idx; second.twin = first.idx;
        return [first, second];
    };
    const single = (el: El, len: number, dir: Pt): Rec[] => { const r = placeOne(el, len, dir); return r ? [r] : []; };

    /** A twig (T) or a tick (X) on a bristle that is already placed. */
    const extra = (kind: CrossKind, host: Rec, sym: boolean): number => {
        const l = sc.lines[host.idx];
        if (l.len < 2 * DOT_GAP + 6) return 0;
        const { p, t } = at(l, l.len * (kind === 't' ? 0.5 : 0.56));
        const max = kind === 't' ? needT : needX;
        if (max < 1) return 0;
        for (const sign of unit % 2 ? [1, -1] : [-1, 1]) {
            let recs: Rec[];
            if (kind === 't') {
                const dir = rot(t, sign * 1.08), len = Math.max(52, Math.min(76, style.len * 0.72));
                const el = element('t', shapePath(p, dir, len, 'straight', 1), host.idx);
                recs = sym ? placeSym(el, len, dir, max) : single(el, len, dir);
            } else {
                const dir = { x: -t.y * sign, y: t.x * sign }, h = CLEAR + 8;
                const el = element('x', shapePath(add(p, dir, -h), dir, 2 * h, 'straight', 1), host.idx);
                recs = sym ? placeSym(el, 2 * h, dir, max) : single(el, 2 * h, dir);
            }
            if (recs.length) return recs.length;
        }
        return 0;
    };

    const tryT = (slot: Slot, sym: boolean): boolean => {
        const want = Math.min(needT, needT - Math.max(0, twigsLeft));
        if (want < 1) return false;
        twigAcc += twigRate; tickAcc += tickRate;
        const twig = twigsLeft > 0 && twigAcc >= 1, tick = !twig && ticksLeft > 0 && tickAcc >= 1;
        if (twig) twigAcc -= 1;
        if (tick) tickAcc -= 1;
        const base = slot.span ?? Math.max(style.len, twig || tick ? 2 * DOT_GAP + 14 : 0);
        const free = slot.span ? Infinity : freeDist(ctx, slot.p, slot.dir, slot.host);
        const lens = [base, base * 0.82, base * 0.66].map((v) => Math.min(v, free - CLEAR - 3)).filter((v, i, a) => v >= MIN_LEN && a.indexOf(v) === i);
        for (const len of lens) {
            const shape = slot.span && style.shape !== 'wave' ? 'straight' : style.shape;
            const el = element('t', shapePath(slot.p, slot.dir, len, shape, style.bend), slot.host);
            const recs = sym ? placeSym(el, len, slot.dir, want) : single(el, len, slot.dir);
            if (!recs.length) continue;
            needT -= recs.length;
            if (twig && needT > 0) { const k = extra('t', recs[0], recs.length > 1); needT -= k; twigsLeft -= k; }
            else if (tick && needX > 0) { const k = extra('x', recs[0], recs.length > 1); needX -= k; ticksLeft -= k; }
            return true;
        }
        return false;
    };
    const tryX = (slot: Slot, sym: boolean): boolean => {
        const want = Math.min(needX, needX - Math.max(0, ticksLeft));
        if (want < 1) return false;
        const h = Math.max((CLEAR + 5) / Math.max(0.5, slot.grip), style.len * 0.5);
        const shape = style.shape === 'wave' ? 'wave' : 'straight';
        const tries: [number, number][] = slot.bridge ? [[h, slot.bridge + h], [h, h]] : [[h, h]];
        for (const [back, fwd] of tries) {
            const el = element('x', shapePath(add(slot.p, slot.dir, -back), slot.dir, back + fwd, shape, style.bend), slot.host);
            const recs = sym ? placeSym(el, back + fwd, slot.dir, want) : single(el, back + fwd, slot.dir);
            if (recs.length) { needX -= recs.length; return true; }
        }
        return false;
    };

    // ---- 1. The pattern: slots at an even rhythm, T and X units alternating by their share ----
    let groups: Group[] = [], axis: Slot[] = [];
    const mult = ctx.sym ? 2 : 1;
    if (style.field === 'fixed') {
        for (let sp = ctx.size * 0.4; ; sp *= 0.88) {
            groups = stripeGroups(ctx, style, Math.max(sp, DOT_GAP + 8));
            const cap = groups.reduce((n, g) => n + Math.max(g.t.length, g.x.length), 0) * mult;
            if (cap >= units || sp <= DOT_GAP + 8) break;
        }
    } else {
        const f = fringeSlots(ctx, style, Math.ceil(units / mult));
        groups = f.slots.map((s) => ({ t: [s], x: [s], alt: [] }));
        axis = f.axis;
    }
    /** One unit at a slot: the wanted kind first, then the other; a fringe slot may slide a little along its line. */
    const fillSlot = (slot: Slot, wantT: boolean, sym: boolean): boolean => {
        for (const by of slot.shift ? [0, 12, -12, 24, -24] : [0]) {
            const sl = by ? slot.shift!(by) : slot;
            if (!sl) continue;
            if (wantT ? tryT(sl, sym) || tryX(sl, sym) : tryX(sl, sym) || tryT(sl, sym)) return true;
        }
        return false;
    };
    const ratio = units ? bristles / units : 0;
    let acc = 0.5;
    for (const g of groups) {
        if (needT <= 0 && needX <= 0) break;
        acc += ratio;
        let wantT = acc >= 1;
        if (wantT) acc -= 1;
        if (wantT && needT - twigsLeft < 1) wantT = false;
        if (!wantT && needX - ticksLeft < 1) wantT = true;
        if (g.t.length === 1 && g.t[0] === g.x[0]) { unit++; fillSlot(g.t[0], wantT, true); continue; }
        for (const kind of wantT ? ['t', 'x'] : ['x', 't']) {
            let any = false;
            for (const slot of kind === 't' ? g.t : g.x) { unit++; if (kind === 't' ? tryT(slot, true) : tryX(slot, true)) any = true; }
            if (any) break;
        }
    }
    // ---- 2. What is still missing goes into the widest gaps, in the same pattern: mirrored ----
    // ---- pairs first, a line on the axis for an odd rest, single lines only as a last resort ----
    if (needT > 0 || needX > 0) {
        const anchors = () => placed.map((r) => r.el.pts[0]);
        const dense = (all: boolean): Slot[] => style.field === 'fixed'
            ? stripeGroups(ctx, style, (DOT_GAP + 8) / 2, all).flatMap((g) => [...g.x, ...g.alt])
            : fringeSlots(ctx, style, 999, { every: 16, all }).slots;
        const widest = (slots: Slot[], sym: boolean) => {
            const pool = [...slots];
            while (pool.length && (needT > 0 || needX > 0)) {
                const pts = anchors();
                let best = 0, bestD = -1;
                pool.forEach((sl, i) => { const dmin = pts.reduce((m, q) => Math.min(m, dist(q, sl.p)), 1e6); if (dmin > bestD) { bestD = dmin; best = i; } });
                const [sl] = pool.splice(best, 1);
                if (bestD < DOT_GAP) break;
                unit++;
                fillSlot({ ...sl, shift: undefined }, needT - twigsLeft >= needX - ticksLeft, sym);
            }
        };
        const stack = (sym: boolean) => {
            for (const rec of [...placed]) {
                if (needT <= 0 && needX <= 0) break;
                if (rec.el.kind !== 't' || rec.el.host >= ctx.nBase || (sym && rec.twin === undefined)) continue;
                unit++;
                if (needT > 0) needT -= extra('t', rec, sym);
                else needX -= extra('x', rec, sym);
            }
        };
        pass = 'fill';
        widest(dense(false), true);
        if (ctx.sym) {
            pass = 'stack';
            if (needT > 0 || needX > 0) stack(true);
            pass = 'axis';
            if (needT > 0 || needX > 0) widest(axis.length ? axis : fringeSlots(ctx, { ...style, field: 'normal' }, 1).axis, true);
            pass = 'single';
            if (needT > 0 || needX > 0) widest(dense(true), false);
        }
        pass = 'stack1';
        if (needT > 0 || needX > 0) stack(false);
        pass = 'any';
        if (needT > 0 || needX > 0) widest(fringeSlots(ctx, { ...style, field: 'normal', side: 'in' }, 999, { every: 16, all: true, minor: true }).slots, false);
    }
    if (needT > 0) warnings.push(`Placed ${T - needT} of ${T} T lines (no room for more in this pattern)`);
    if (needX > 0) warnings.push(`Placed ${X - needX} of ${X} X lines (no room for more in this pattern)`);

    // ---- 3. Colours: lines that cross, touch or run near never get colours too alike (palette.farApart:
    // not the same colour or family, clearly different on both boards); mirrored lines match ----
    const palette = [...new Set(ctx.colours)];
    const colourOf: string[] = [...ctx.colours];
    const stride = palette.length > 2 ? 1 + Math.floor(rand() * (palette.length - 1)) : 1;
    let added = 0;
    for (const rec of placed) {
        const n = rec.el.pts.length, ends = [rec.el.pts[0], rec.el.pts[n - 1]];
        const hard = new Set(rec.crossed.map((li) => colourOf[li]));
        if (rec.el.kind === 't') hard.add(colourOf[rec.el.host]);
        // Near lines (same rule as part 1): avoided whenever the palette allows it.
        const nearby = new Set<string>();
        for (let i = 0; i < n; i += 3) for (const [li] of sc.linesNear(rec.el.pts[i], NEAR_LINES, rec.idx)) if (colourOf[li]) nearby.add(colourOf[li]);
        const soft = new Set<string>();
        const softer = new Set<string>();
        for (const dot of sc.dots) {
            if (dot.line === rec.idx || dot.line === rec.twin || !colourOf[dot.line]) continue;
            const dd = Math.min(...ends.map((e) => Math.hypot(e.x - dot.x, e.y - dot.y)));
            if (dd < 2 * R + 24) soft.add(colourOf[dot.line]);
            else if (dd < 2 * R + 80) softer.add(colourOf[dot.line]);
        }
        const start = (rec.unit * stride) % Math.max(1, palette.length);
        const ring = palette.map((_, i) => palette[(start + i) % palette.length]);
        const twin = rec.twin !== undefined ? colourOf[rec.twin] : undefined;
        const apart = (c: string, set: Set<string>) => [...set].every((o) => farApart(c, o));
        const ok = (c: string) => apart(c, hard) && apart(c, nearby);
        let pick = twin && ok(twin) ? twin : ring.find((c) => ok(c) && apart(c, soft) && apart(c, softer)) ?? ring.find((c) => ok(c) && apart(c, soft)) ?? ring.find(ok);
        if (!pick) {
            // None of the level's colours fits here: a palette colour that does (else the least bad one).
            pick = PALETTE.map((c) => c.name).find(ok) ?? ring.find((c) => apart(c, hard)) ?? ring[0];
            if (!palette.includes(pick)) { palette.push(pick); added++; }
        }
        colourOf[rec.idx] = pick;
    }
    if (added) warnings.push(`${added} extra colour(s) added so crossing lines differ`);

    let nx = 0, nt = 0;
    const id = (k: CrossKind) => { let s: string; do s = `${k}${k === 'x' ? ++nx : ++nt}`; while (taken.has(s)); return s; };
    const pairs: Pair[] = placed.map((rec) => {
        const path = rec.el.path.map((an) => ({ ...an, x: r1(an.x), y: r1(an.y) }));
        const a = path[0], b = path[path.length - 1];
        return { id: id(rec.el.kind), color: colourOf[rec.idx], a: { x: a.x, y: a.y, r: R }, b: { x: b.x, y: b.y, r: R }, path, cross: rec.el.kind };
    });
    const stacked = placed.filter((r) => r.el.kind === 't' && r.el.host >= ctx.nBase).length;
    const lonely = ctx.sym ? placed.filter((r) => r.twin === undefined && Math.abs(r.el.pts[0].x + r.el.pts[r.el.pts.length - 1].x - 2 * ctx.cx) > 6).length : 0;
    while (sc.lines.length > ctx.nBase) sc.pop();
    return { pairs, x: X - needX, t: T - needT, style: style.name, symmetric: ctx.sym && !lonely, stacked, warnings, score: 100 * (needT + needX) + 4 * lonely, sim: { solvable: true, order: [], stuck: [], openAtStart: 0, blockedAtStart: 0, rounds: 0 } as unknown as SolveResult };
}

/** Counts of base / X / T lines in a level. */
export function crossCounts(pairs: Pair[]): { base: number; x: number; t: number } {
    return { base: pairs.filter((p) => !p.cross).length, x: pairs.filter((p) => p.cross === 'x').length, t: pairs.filter((p) => p.cross === 't').length };
}

/**
 * Several overlap layouts for the given base pairs, best first (all lines placed, symmetric).
 * `existing` may contain old cross pairs: they are ignored (and replaced by the caller).
 */
export function generateOverlap(existing: Pair[], opt: OverlapOptions): OverlapCandidate[] {
    const base = existing.filter((p) => !p.cross);
    if (!base.length || opt.x + opt.t <= 0) return [];
    useRadius(base);
    const ctx = prepare(base);
    const taken = new Set(base.map((p) => p.id));
    const seed = opt.seed ?? Date.now();
    const out: OverlapCandidate[] = [];
    // If no layout holds every line yet, keep trying a while (other seeds and patterns).
    const tries = opt.tries ?? 10;
    for (let i = 0; i < tries || (i < tries * 3 && !out.some((c) => c.score < 100)); i++) {
        const rand = rng(seed + i * 7919);
        const c = build(ctx, opt, styleFor(opt.style ?? 'auto', i, rand, ctx.size), rand, taken);
        const all = [...base, ...c.pairs], own = new Set(c.pairs.map((_, k) => base.length + k));
        if (settleNearDots(all, own)) fixNearColours(all, own);
        c.sim = solve({ pairs: [...base, ...c.pairs] } as never);
        if (!c.sim.solvable) c.score += 1000;
        out.push(c);
    }
    out.sort((a, b) => a.score - b.score);
    // Prefer showing different patterns.
    const seen = new Set<string>(), first: OverlapCandidate[] = [], rest: OverlapCandidate[] = [];
    for (const c of out) (seen.has(c.style.split(' ')[0]) ? rest : first).push(c), seen.add(c.style.split(' ')[0]);
    first.sort((a, b) => a.score - b.score);
    return [...first, ...rest].slice(0, opt.keep ?? 3);
}

/** Editor checks for the colour and cross-line rules (shown with the other level checks). */
export function crossChecks(pairs: Pair[]): Check[] {
    const out: Check[] = [];
    if (pairs.length < 2) return out;
    const ids = (list: [number, number][]) => [...new Set(list.flatMap(([i, j]) => [pairs[i].id, pairs[j].id]))];
    // Lines near each other: never the same colour or family, and clearly different on both boards (palette.farApart).
    const same = ([i, j]: [number, number]) => !farApart(pairs[i].color, pairs[j].color);
    const near = nearPairs(pairs).filter(same);
    out.push(near.length
        ? { level: 'warn', text: `Near lines with colours too alike (same family, or alike on the light / dark board): ${ids(near).join(', ')}`, pairs: ids(near) }
        : { level: 'ok', text: 'Near lines have clearly different colours' });
    if (pairs.some((p) => p.cross)) {
        const lines = pairs.map((p) => samplePath(p.path, 5));
        const onLine = (d: Dot, self: number) => pairs.some((q, qi) => qi !== self && distToPolyline(d, lines[qi]) < (d.r + Math.max(q.a.r, q.b.r)) * HIT_SCALE);
        const both = pairs.filter((p, i) => p.cross && onLine(p.a, i) && onLine(p.b, i));
        out.push(both.length
            ? { level: 'warn', text: `Cross line with both dots on other lines: ${both.map((p) => p.id).join(', ')}`, pairs: both.map((p) => p.id) }
            : { level: 'ok', text: 'Every cross line keeps a dot in empty space' });
        const c = crossCounts(pairs);
        out.push({ level: 'info', text: `Lines: ${c.base} base + ${c.x} X + ${c.t} T = ${pairs.length}` });
    }
    return out;
}
