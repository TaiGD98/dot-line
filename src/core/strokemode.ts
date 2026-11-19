// Generator "stroke mode": one stroke of the drawing = one line, as in the reference levels
// (research/ref-patterns.md). Instead of cutting contours into consecutive pairs, every stroke
// keeps its shape and its ends land where the drawing puts them:
//   - an end that touches another stroke becomes a dot ON that stroke (it blocks it: a "T");
//   - an end in open space is a free tip;
//   - two ends meeting tip to tip: one is pulled back so the dots sit side by side (rare).
// Dots: every normal dot of a level has ONE radius (option `radius`). The exception is the big dot:
// a small closed round detail of the drawing (an eye, a nose, a button) is not a line, it becomes a
// big dot. A line of the drawing that ends on the detail carries it (big dot + normal dot); two
// details with no line are linked into one pair (big + big); a lone one gets a short line to the
// nearest line.
// An end is always joined to its line along a curve that continues the stroke (no hook, no kink).
// Then: blocking cycles are removed by pulling back the cheapest T end; the level is nudged toward
// the target bands (open share, blocks per line, depth) with small moves only; missing lines are
// added as ornaments (generator part 2, overlap); near lines never share a colour.
import { BIG_DOT, DEFAULT_RADIUS, Pair } from './level';
import { Anchor, Pt, dist, distToPolyline, fitSmooth, pointAt, resample, samplePath } from './path';
import { HIT_SCALE, solve, SolveResult } from './solver';
import { Line, colourPairs, prepareStrokes, rng, settleNearDots, slice, strokeFrame, toLine } from './generator';
import { generateOverlap, PatternStyle } from './overlap';
import type { Stroke } from './trace';

export interface StrokeModeOptions {
    /** Target number of lines. Fewer strokes than this: ornaments fill up; more: reported. */
    pairs: number;
    colors: number;
    /** 1..5: target bands (open share, blocks per line, depth per line). */
    difficulty: number;
    seed?: number;
    /** World size of the drawing's longest side; default: from the line density of the reference. */
    size?: number;
    tries?: number;
    keep?: number;
    /** Fill missing lines with ornaments (default true). */
    fill?: boolean;
    /**
     * Grow the world (x1.2, x1.45) when strokes of the drawing are too small for the dots at the
     * given size, and keep the size that loses the fewest (default true).
     */
    grow?: boolean;
    pattern?: PatternStyle;
    /** Radius of every normal dot of the level (default 16). */
    radius?: number;
    /** Small closed round details become big dots (default true). */
    bigDots?: boolean;
    /** Stop trying more layouts / board sizes after about this many ms (default: no limit). */
    budgetMs?: number;
}

export interface StrokeModeStats {
    strokes: number;
    lines: number;
    ornaments: number;
    tDots: number;
    freeDots: number;
    touchingDots: number;
    openShare: number;
    blocksPerLine: number;
    depth: number;
    crossingsPerLine: number;
    pulledBack: number;
    extended: number;
    /** Strokes of the drawing that could not become a line (too small for the dots at this size). */
    lost: number;
    size: number;
    /** Radius of the normal dots. */
    radius: number;
    /** Big dots placed on round details. */
    bigDots: number;
}

export interface StrokeModeCandidate {
    pairs: Pair[];
    sim: SolveResult;
    stats: StrokeModeStats;
    score: number;
    warnings: string[];
}

/** Target bands per difficulty (reference levels, research/ref-patterns.md section 2). */
export function strokeTargets(difficulty: number) {
    const d = Math.max(1, Math.min(5, Math.round(difficulty)));
    return {
        open: [0.55, 0.42, 0.36, 0.34, 0.32][d - 1],
        blocks: [0.8, 1.05, 1.26, 1.35, 1.45][d - 1],
        depthPerLine: [0.12, 0.2, 0.27, 0.22, 0.2][d - 1]
    };
}

/** Reference density: ~15 px of line per 1000 px² of board (dot radius 16). */
const DENSITY = 15 / 1000;
/** Round details up to this size become big dots (radii of a 16 px dot on a 1000 px board); bigger closed shapes stay lines. */
const BIG_MAX = 2.8;
/** A dot this many normal radii or more counts as big (stats). */
const BIG_MIN = BIG_DOT;
/** A big dot is at least this many normal radii, even when its detail is smaller. */
const BIG_OVER = 1.3;

/** World size that gives the reference line density for this drawing and line count. */
export function strokeWorldSize(strokes: Stroke[], pairs: number): number {
    const lines = prepareStrokes(strokes, 700);
    if (!lines.length) return 700;
    const total = lines.reduce((s, l) => s + l.len, 0);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of lines) for (const p of l.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    // Ornaments are short (2-4 dot diameters): each adds about a quarter of a stroke's length.
    const grow = Math.min(1.8, 1 + 0.25 * Math.max(0, pairs / Math.max(1, lines.length) - 1));
    return Math.round(Math.max(500, Math.min(1900, 700 * (total / area / DENSITY) * grow)));
}

type Side = 'a' | 'b';
const SIDES: Side[] = ['a', 'b'];

/** One end of a line. */
interface End {
    r: number;
    /** A real end of the stroke (not a cut between two lines of one stroke, not a big dot). */
    real: boolean;
    /** Points added beyond the end of the stroke, going outward; the last one is the dot. */
    ext?: Pt[];
    extLen: number;
    /** Line of the drawing this dot was put on (a T). */
    on?: number;
    /** A big dot on a round detail: it never moves. `floor` = the smallest radius it may shrink to. */
    fixed?: boolean;
    floor?: number;
    detail?: number;
    /** Pulled back from something: never extended again. */
    pulled?: boolean;
}

/** A line of the level: the part [s0, s1] of a stroke, plus what was added at its ends. */
interface SSeg {
    line: number;
    s0: number;
    s1: number; // may exceed len on closed lines (wraps)
    a: End;
    b: End;
    dead?: boolean;
}

/** A small closed round shape of the drawing: the place of a big dot. */
interface Detail {
    c: Pt;
    /** Radius of the circle with the same area (world px). */
    req: number;
    r: number;
    floor: number;
    /** The line it sits on (a ball hanging from a branch): line index and arc position. */
    host?: { li: number; s: number };
}

/** Area, centroid and radial spread of a polygon. */
function shapeOf(p: Pt[]) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < p.length; i++) {
        const q = p[(i + 1) % p.length], w = p[i].x * q.y - q.x * p[i].y;
        a += w; cx += (p[i].x + q.x) * w; cy += (p[i].y + q.y) * w;
    }
    if (Math.abs(a) < 1e-6) return null;
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    let rmin = Infinity, rmax = 0;
    for (const q of p) { const d = dist(q, c); if (d < rmin) rmin = d; if (d > rmax) rmax = d; }
    return { c, area: Math.abs(a) / 2, rmin, rmax };
}

/**
 * Circle through a run of points (least squares): centre, radius, how far the points stray from it
 * (mean |distance - R| / R) and how much of the circle they go round (0..1).
 */
function circleFit(p: Pt[]) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    const n = p.length;
    if (n < 5) return null;
    const o = p[0]; // work relative to the first point (keeps the numbers small)
    for (const q of p) {
        const x = q.x - o.x, y = q.y - o.y, z = x * x + y * y;
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
    }
    const M = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]];
    for (let i = 0; i < 3; i++) {
        let m = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[m][i])) m = r;
        [M[i], M[m]] = [M[m], M[i]];
        if (Math.abs(M[i][i]) < 1e-9) return null;
        for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; }
    }
    const a = M[0][3] / M[0][0], b = M[1][3] / M[1][1], c = M[2][3] / M[2][2];
    const r2 = (a * a + b * b) / 4 - c;
    if (!(r2 > 0)) return null;
    const R = Math.sqrt(r2), centre = { x: o.x - a / 2, y: o.y - b / 2 };
    let dev = 0;
    for (const q of p) dev += Math.abs(dist(q, centre) - R);
    const ang = p.map((q) => Math.atan2(q.y - centre.y, q.x - centre.x)).sort((x, y) => x - y);
    let gap = 0;
    for (let i = 0; i < ang.length; i++) gap = Math.max(gap, (ang[(i + 1) % ang.length] - ang[i] + 2 * Math.PI) % (2 * Math.PI) || (n > 1 ? 0 : 2 * Math.PI));
    return { c: centre, R, dev: dev / n / R, cover: 1 - gap / (2 * Math.PI) };
}

/** A traced circle strays this little from a true circle (mean, share of the radius). */
const ROUND_DEV = 0.06;

/** Where segment pq crosses segment rs: position along pq (0..1), or null. */
function hit(p: Pt, q: Pt, r: Pt, s: Pt): number | null {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
    const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const polyLen = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

/**
 * Who blocks whom, with the rule of solver.ts (BlockModel, solve) on already sampled lines:
 * the same answers, much faster on big levels (the generator asks this hundreds of times).
 */
function analyse(pairs: Pair[], polys: Pt[][]) {
    const n = pairs.length;
    const box = polys.map((pl) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of pl) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        return [x0, y0, x1, y1];
    });
    const blockA: number[][] = [], blockB: number[][] = [];
    /** on[j][0|1] = lines that dot a|b of pair j sits on (within the hitbox of that line's bigger dot). */
    const on: [number[], number[]][] = pairs.map(() => [[], []]);
    for (let i = 0; i < n; i++) {
        const X = pairs[i], b = box[i], la: number[] = [], lb: number[] = [], rmax = Math.max(X.a.r, X.b.r);
        for (let j = 0; j < n; j++) {
            if (j === i) continue;
            let inA = false, inB = false;
            [pairs[j].a, pairs[j].b].forEach((d, k) => {
                const far = (rmax + d.r) * HIT_SCALE;
                if (d.x < b[0] - far || d.x > b[2] + far || d.y < b[1] - far || d.y > b[3] + far) return;
                const dd = distToPolyline(d, polys[i]);
                if (dd < (X.a.r + d.r) * HIT_SCALE) inA = true;
                if (dd < (X.b.r + d.r) * HIT_SCALE) inB = true;
                if (dd < far) on[j][k].push(i);
            });
            if (inA) la.push(j);
            if (inB) lb.push(j);
        }
        blockA.push(la); blockB.push(lb);
    }
    const alive = new Uint8Array(n).fill(1);
    let left = n, rounds = 0;
    while (left) {
        const open: number[] = [];
        for (let i = 0; i < n; i++) if (alive[i] && (blockA[i].every((j) => !alive[j]) || blockB[i].every((j) => !alive[j]))) open.push(i);
        if (!open.length) break;
        rounds++;
        for (const i of open) alive[i] = 0;
        left -= open.length;
    }
    /** Pairs that block each pair at the start (from either side). */
    const by = pairs.map((_, i) => new Set([...blockA[i], ...blockB[i]]).size);
    return { solvable: left === 0, stuck: pairs.filter((_, i) => alive[i]).map((p) => p.id), rounds, by, on };
}

function buildOnce(strokes: Stroke[], opt: StrokeModeOptions, size: number, rand: () => number): StrokeModeCandidate {
    const warnings: string[] = [];
    const rad = Math.max(6, Math.round(opt.radius ?? DEFAULT_RADIUS));
    /** A dot this close to a line blocks it (two normal dots). */
    const SNAP = 2 * rad * HIT_SCALE;
    /** Centre distance of two normal dots side by side. */
    const SIDE = 2 * rad + 2;
    /** Only very long strokes are split (a half circle across the drawing stays one line). */
    const maxLen = 1.7 * size;
    const bigOn = opt.bigDots !== false;
    /**
     * Largest round detail that becomes a big dot (radius, world px): measured on the board, so it
     * does not change with the dot size (2.8 x 16 px on a 1000 px board), and never under 2.8 dots.
     */
    const bigCap = Math.max(BIG_MAX * rad, BIG_MAX * DEFAULT_RADIUS * (size / 1000));
    /** How far apart two strokes that touch in the drawing can be (traced images: about 3.5 pixels). */
    const TOUCH = strokes.some((s) => s.smooth) ? Math.max(3, 3.5 * strokeFrame(strokes, size).k) : 3;

    // ---- 0. Strokes of the drawing: lines, and small round details (big dots) ----
    /**
     * A small closed round shape. `attached` = an arc with both ends on another line (a ball
     * hanging from a branch): the missing part is closed by that line.
     */
    const detailOf = (l: Line, attached: boolean): Detail | null => {
        const n = l.pts.length;
        if (n < 5) return null;
        const open = l.closed ? 0 : dist(l.pts[0], l.pts[n - 1]);
        if (open > (attached ? 0.45 * l.len : Math.max(6, 0.08 * l.len))) return null;
        const s = shapeOf(l.pts);
        if (!s) return null;
        const req = Math.sqrt(s.area / Math.PI);
        if (req < 0.25 * rad || req > bigCap) return null;
        // Roundness: 4πA/P² is 1 for a circle, 0.79 for a square, 0.6 for a triangle. Small shapes
        // only have to be compact (a small rounded triangle reads as a dot); bigger ones must be round.
        const per = l.len + open, q = (4 * Math.PI * s.area) / (per * per), small = req <= 1.5 * rad && !attached;
        if (q < (attached ? 0.86 : small ? 0.62 : 0.82) || s.rmin / s.rmax < (small ? 0.4 : 0.55)) return null;
        // A bigger shape must also lie close to a circle (a little ghost with a wavy hem is round
        // enough by area, but it is a drawing, not a ball).
        if (!small) { const f = circleFit(l.pts); if (!f || f.dev > 0.08) return null; }
        // The big dot is as big as the detail in the drawing (not tied to the dot size), but always
        // clearly bigger than a normal dot. It may give up to 15% where it is crowded.
        const want = Math.max(BIG_OVER * rad, req);
        return { c: s.c, req, r: want, floor: Math.max(BIG_OVER * rad, 0.85 * want) };
    };
    /**
     * How close the two sides of a loop's neck may be: a traced line that crosses itself is cut apart
     * at the crossing by about three line widths (3.6 x TOUCH).
     */
    const NECK = 3.6 * TOUCH;
    /**
     * The big dot of a circle drawn as a line (radius R): a little inside the drawn circle, so the line
     * it hangs from and the lines passing by keep their room; where it is crowded it may shrink down
     * to the smallest big dot.
     */
    const loopBall = (c: Pt, R: number): Detail => {
        const want = Math.max(BIG_OVER * rad, 0.85 * R);
        return { c, req: R, r: want, floor: BIG_OVER * rad };
    };
    /** A round loop of points (the loop of a curl, a ball drawn on its string): the detail, or null. */
    const roundLoop = (pts: Pt[], minCover: number): Detail | null => {
        const f = circleFit(pts);
        if (!f || f.dev > ROUND_DEV || f.cover < minCover || f.R > bigCap || f.R < 0.8 * rad) return null;
        return loopBall(f.c, f.R);
    };
    /** Loops already known to be details (found when the strokes were split). */
    const loopDetails = new Map<Line, Detail>();
    /**
     * The part of a split stroke that was drawn joined to the loop: it carries that big dot (another
     * line ending nearby must not take it: this part's own end would then sit on the big dot, in the way).
     */
    const carrier = new Map<Detail, { line: Line; e: Side }>();
    /**
     * A stroke that goes round a small circle and back to itself: at one end (a balloon and its string
     * drawn in one go) or in the middle (a garland curling round an ornament and going on). The loop
     * becomes a detail (big dot); the stroke is cut at the loop's neck. The longer part keeps its end
     * at the neck (it carries the big dot); the shorter part is pulled back so that its own dot clears
     * the big dot. Several loops in one stroke are all found.
     */
    /**
     * An open curl at an end of a stroke (an ornament drawn as a hook that does not quite close): the
     * last part of the stroke goes most of the way round a small circle. It becomes a detail; the rest
     * of the stroke ends where the curl starts (and carries the big dot).
     */
    const endCurl = (l: Line): Line[] | null => {
        const n = l.pts.length, minArc = 2 * Math.PI * 0.8 * rad * 0.8, maxArc = 2.2 * Math.PI * bigCap;
        let best: { k: number; e: Side; d: Detail; cover: number } | null = null;
        for (const e of SIDES) {
            for (let m = 5; m < n - 2; m++) {
                const k = e === 'b' ? n - 1 - m : m;
                const arc = e === 'b' ? l.len - l.acc[k] : l.acc[k];
                if (arc < minArc) continue;
                if (arc > maxArc) break;
                const part = e === 'b' ? l.pts.slice(k) : l.pts.slice(0, k + 1);
                const f = circleFit(part);
                if (!f || f.dev > ROUND_DEV || f.cover < 0.8 || f.R > bigCap || f.R < 0.8 * rad) continue;
                if (!best || f.cover > best.cover) {
                    best = { k, e, cover: f.cover, d: loopBall(f.c, f.R) };
                }
            }
        }
        if (!best) return null;
        const { k, e, d } = best;
        const curl = e === 'b' ? l.pts.slice(k) : l.pts.slice(0, k + 1);
        const rest = e === 'b' ? l.pts.slice(0, k + 1) : l.pts.slice(k);
        const loop = toLine([...curl, { ...curl[0] }], true);
        loopDetails.set(loop, d);
        if (rest.length < 2 || polyLen(rest) < 2 * rad) return [loop];
        const restLine = toLine(rest, false);
        carrier.set(d, { line: restLine, e: e === 'b' ? 'b' : 'a' });
        return [restLine, loop];
    };
    const splitLoops = (l: Line): Line[] => {
        if (l.closed || l.len < 60) return [l];
        const n = l.pts.length, minArc = 2 * Math.PI * 0.8 * rad, maxArc = 2.3 * Math.PI * bigCap;
        let best: { i: number; j: number; d: Detail; score: number } | null = null;
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) {
                const arc = l.acc[j] - l.acc[i];
                if (arc < minArc) continue;
                if (arc > maxArc) break;
                const neck = dist(l.pts[i], l.pts[j]);
                if (neck > NECK) continue;
                const loopPts = l.pts.slice(i, j + 1);
                let d = roundLoop(loopPts, 0.85);
                // (What the tracer closes tightly: the old rule, by area and perimeter.)
                if (!d && neck <= 6 && (i === 0 || j === n - 1)) d = detailOf(toLine([...loopPts, { ...loopPts[0] }], true), false);
                if (!d) continue;
                const score = (d.req > 0 ? 0 : 1) + neck / NECK;
                if (!best || score < best.score) best = { i, j, d, score };
            }
        if (!best) return endCurl(l) ?? [l];
        const { i, j, d } = best;
        const loop = toLine([...l.pts.slice(i, j + 1), { ...l.pts[i] }], true);
        loopDetails.set(loop, d);
        const before = l.pts.slice(0, i + 1), after = l.pts.slice(j);
        const lenOf = (p: Pt[]) => polyLen(p);
        const keepBefore = lenOf(before) >= lenOf(after);
        // The part that does not carry the big dot starts a dot and a bit away from it.
        const clear = d.r + rad + 6;
        const trim = (p: Pt[], fromStart: boolean): Pt[] => {
            const q = fromStart ? p : [...p].reverse();
            let k = 0;
            while (k < q.length - 1 && dist(q[k], d.c) < clear) k++;
            const out = q.slice(k);
            return fromStart ? out : out.reverse();
        };
        const parts: Line[] = [];
        /** Adds a part (its own loops are split off too); `end` = its end at the neck, when it carries the big dot. */
        const add = (p: Pt[], end?: Side) => {
            if (p.length < 2 || polyLen(p) < 2 * rad) return;
            const pl = toLine(p, false);
            if (end) carrier.set(d, { line: pl, e: end });
            const more = splitLoops(pl);
            // (If the carrier was split again, the piece still ending at the neck carries.)
            if (end && more[0] !== pl) {
                const neck = end === 'a' ? p[0] : p[p.length - 1];
                for (const m of more) if (!m.closed) for (const e of SIDES) {
                    const q = e === 'a' ? m.pts[0] : m.pts[m.pts.length - 1];
                    if (dist(q, neck) < 1) carrier.set(d, { line: m, e });
                }
            }
            parts.push(...more);
        };
        add(keepBefore ? before : trim(before, false), keepBefore ? 'b' : undefined);
        parts.push(loop);
        add(keepBefore ? trim(after, true) : after, keepBefore ? undefined : 'a');
        return parts;
    };
    const lines: Line[] = prepareStrokes(strokes, size, 0).flatMap((l) => (bigOn ? splitLoops(l) : [l]));
    /** Lines of the drawing come first; lines added by the generator (links, stalks) follow. */
    const realCount = lines.length;
    /** line = becomes a line of the level; detail = a round detail (big dot); small = too short for two dots. */
    const kind: ('line' | 'detail' | 'small')[] = lines.map(() => 'line');

    // Grid over the sample points of the drawing's lines (4 px apart), for "what is near here".
    const CELL = 48;
    const grid = new Map<number, number[]>();
    const cellKey = (cx: number, cy: number) => (cx + 8192) * 16384 + (cy + 8192);
    lines.forEach((l, li) => l.pts.forEach((p, i) => {
        const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(li, i);
    }));
    /** Calls fn(line, point index, distance) for every sample point of a line within `r` of p. */
    const around = (p: Pt, r: number, fn: (li: number, i: number, d: number) => void) => {
        const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), y0 = Math.floor((p.y - r) / CELL), y1 = Math.floor((p.y + r) / CELL);
        for (let cx = x0; cx <= x1; cx++)
            for (let cy = y0; cy <= y1; cy++) {
                const a = grid.get(cellKey(cx, cy));
                if (!a) continue;
                for (let k = 0; k < a.length; k += 2) {
                    if (kind[a[k]] !== 'line') continue;
                    const q = lines[a[k]].pts[a[k + 1]], d = Math.hypot(q.x - p.x, q.y - p.y);
                    if (d <= r) fn(a[k], a[k + 1], d);
                }
            }
    };
    /** Nearest sample point of another line within `r` of p. */
    const nearestLine = (p: Pt, r: number, own: number) => {
        const best = { d: Infinity, li: -1, i: -1 };
        around(p, r, (li, i, d) => { if (li !== own && d < best.d) { best.d = d; best.li = li; best.i = i; } });
        return best;
    };

    const details: Detail[] = [];
    if (bigOn) {
        const cand = new Map<number, Detail>();
        lines.forEach((l, li) => { const d = loopDetails.get(l) ?? detailOf(l, false); if (d) cand.set(li, d); });
        // A ring with drawing inside it is a frame (a clock face), not a detail: it stays a line.
        const framed = (li: number, d: Detail) => lines.some((o, oi) => oi !== li && !cand.has(oi) && o.pts.every((p) => dist(p, d.c) <= d.req * 1.05));
        for (let again = true; again;) {
            again = false;
            for (const [li, d] of [...cand]) if (framed(li, d)) { cand.delete(li); again = true; }
        }
        for (const li of cand.keys()) kind[li] = 'detail';
        // A round arc with both ends on a line (a ball hanging from a branch): a detail sitting on that line.
        lines.forEach((l, li) => {
            if (kind[li] !== 'line' || l.closed || l.len > 2.3 * Math.PI * bigCap) return;
            // (Thinning leaves the arc's ends a little off the line it hangs from: up to two TOUCHes.)
            const hA = nearestLine(l.pts[0], 2 * TOUCH, li), hB = nearestLine(l.pts[l.pts.length - 1], 2 * TOUCH, li);
            if (hA.li < 0 || hB.li < 0) return;
            // Round = close to a fitted circle (the gap closed by the host line, not by a straight chord).
            const d = roundLoop(l.pts, 0.78) ?? detailOf(l, true);
            if (!d || framed(li, d)) return;
            const h = dist(lines[hA.li].pts[hA.i], d.c) <= dist(lines[hB.li].pts[hB.i], d.c) ? hA : hB;
            // Where the host passes closest to the middle of the gap.
            const mid = { x: (l.pts[0].x + l.pts[l.pts.length - 1].x) / 2, y: (l.pts[0].y + l.pts[l.pts.length - 1].y) / 2 };
            let bi = h.i, bd = Infinity;
            lines[h.li].pts.forEach((p, i) => { const dd = dist(p, mid); if (dd < bd) { bd = dd; bi = i; } });
            d.host = { li: h.li, s: lines[h.li].acc[bi] };
            cand.set(li, d);
            kind[li] = 'detail';
        });
        const sorted = [...cand.values()].sort((x, y) => y.req - x.req);
        // A detail inside a bigger one (a pupil in an eye) is part of it.
        for (const d of sorted) if (!details.some((o) => dist(o.c, d.c) < o.req)) details.push(d);
        // Two details too close for two big dots become one (two nostrils: one nose).
        for (let i = 0; i < details.length; i++)
            for (let j = details.length - 1; j > i; j--) {
                const a = details[i], b = details[j];
                if (dist(a.c, b.c) >= a.floor + b.floor + 2) continue;
                if (b.req > 0.7 * a.req) a.c = { x: (a.c.x + b.c.x) / 2, y: (a.c.y + b.c.y) / 2 };
                details.splice(j, 1);
            }
        // Big dots that would overlap share the room between them.
        for (let i = 0; i < details.length; i++)
            for (let j = i + 1; j < details.length; j++) {
                const a = details[i], b = details[j], over = a.r + b.r + 2 - dist(a.c, b.c);
                if (over <= 0) continue;
                const sa = a.r - a.floor, sb = b.r - b.floor, tot = sa + sb || 1;
                a.r = Math.max(a.floor, a.r - (over * sa) / tot);
                b.r = Math.max(b.floor, b.r - (over * sb) / tot);
            }
        for (const d of details) d.r = Math.floor(d.r);
    }
    // Strokes too short for two dots are left out (counted as lost).
    lines.forEach((l, li) => { if (kind[li] === 'line' && l.len < 2 * rad + 8) kind[li] = 'small'; });
    const tooSmall = kind.filter((k) => k === 'small').length;
    const strokeCount = kind.filter((k) => k === 'line').length + details.length + tooSmall;

    // A line of the drawing that ends on a detail carries its big dot.
    const bigEnd = new Map<string, number>();
    const linked = new Set<number>();
    {
        const hooks: { cost: number; li: number; e: Side; di: number }[] = [];
        details.forEach((d, di) => lines.forEach((l, li) => {
            if (kind[li] !== 'line' || l.closed || l.len < d.r + 2 * rad + 8) return;
            for (const e of SIDES) {
                const p = e === 'a' ? l.pts[0] : l.pts[l.pts.length - 1], dd = dist(p, d.c);
                if (dd <= Math.max(d.req + 0.5 * SNAP, d.r + 2)) hooks.push({ cost: Math.abs(dd - d.req) - 0.02 * l.len, li, e, di });
            }
        }));
        // The part drawn joined to a loop carries that loop's big dot first.
        details.forEach((d, di) => {
            const c = carrier.get(d), li = c ? lines.indexOf(c.line) : -1;
            if (li >= 0 && kind[li] === 'line' && lines[li].len >= d.r + 2 * rad + 8) hooks.push({ cost: -1e9, li, e: c!.e, di });
        });
        hooks.sort((x, y) => x.cost - y.cost);
        for (const h of hooks) {
            if (linked.has(h.di) || bigEnd.has(`${h.li}:${h.e}`) || bigEnd.get(`${h.li}:${h.e === 'a' ? 'b' : 'a'}`) === h.di) continue;
            bigEnd.set(`${h.li}:${h.e}`, h.di);
            linked.add(h.di);
        }
    }
    // A detail sitting on a line (not at its end): the line is cut there and one part carries the big dot.
    const touches = new Map<number, { s: number; di: number }[]>();
    details.forEach((d, di) => {
        if (linked.has(di)) return;
        let host = d.host;
        if (!host) {
            const best = { d: Infinity, li: -1, i: -1 };
            around(d.c, d.req + TOUCH, (li, i, dd) => { if (dd < best.d) { best.d = dd; best.li = li; best.i = i; } });
            if (best.li >= 0) host = { li: best.li, s: lines[best.li].acc[best.i] };
        }
        if (!host || kind[host.li] !== 'line') return;
        const l = lines[host.li], need = d.r + 2 * rad + 8;
        // One of the two parts must be long enough to be the big dot's line.
        if (!l.closed && Math.max(host.s, l.len - host.s) < need) return;
        if (l.closed && l.len < need + SIDE) return;
        const list = touches.get(host.li) ?? [];
        if (list.some((t) => Math.abs(t.s - host.s) < need)) return;
        list.push({ s: host.s, di });
        touches.set(host.li, list);
        linked.add(di);
    });
    // Details with no line: two of them make one pair. Twins (same size, side by side) go together first.
    const links: [number, number][] = [];
    {
        const free = details.map((_, i) => i).filter((i) => !linked.has(i));
        const combos: { cost: number; i: number; j: number }[] = [];
        for (let x = 0; x < free.length; x++)
            for (let y = x + 1; y < free.length; y++) {
                const a = details[free[x]], b = details[free[y]], dd = dist(a.c, b.c);
                if (dd > 0.6 * size || dd < a.r + b.r + 8) continue;
                const rel = Math.abs(a.req - b.req) / Math.max(a.req, b.req);
                combos.push({ cost: dd * (1 + 3 * rel) * (Math.abs(a.c.y - b.c.y) < 0.25 * dd ? 0.6 : 1), i: free[x], j: free[y] });
            }
        combos.sort((x, y) => x.cost - y.cost);
        for (const c of combos) {
            if (linked.has(c.i) || linked.has(c.j)) continue;
            links.push([c.i, c.j]);
            linked.add(c.i); linked.add(c.j);
            const a = details[c.i], b = details[c.j];
            if (Math.abs(a.r - b.r) / Math.max(a.r, b.r) < 0.25) a.r = b.r = Math.min(a.r, b.r);
        }
    }

    // ---- 1. Lines: one per stroke; closed or very long strokes are split (side-by-side dots) ----
    const segs: SSeg[] = [];
    const segsOf: SSeg[][] = lines.map(() => []);
    const pointOn = (l: Line, s: number) => pointAt(l.pts, l.acc, l.closed ? ((s % l.len) + l.len) % l.len : s);
    const tip = (g: SSeg, e: Side) => pointOn(lines[g.line], e === 'a' ? g.s0 : g.s1);
    const dotAt = (g: SSeg, e: Side) => { const x = g[e].ext; return x ? x[x.length - 1] : tip(g, e); };
    const setExt = (g: SSeg, e: Side, pts?: Pt[]) => { g[e].ext = pts; g[e].extLen = pts ? polyLen([tip(g, e), ...pts]) : 0; };
    const span = (g: SSeg) => g.s1 - g.s0 + g.a.extLen + g.b.extLen;
    const isLive = (g: SSeg) => !g.dead && g.s1 - g.s0 > 2 && span(g) > g.a.r + g.b.r + 6;
    const bigEndOf = (di: number): End => ({ r: details[di].r, real: false, extLen: 0, fixed: true, floor: details[di].floor, detail: di });
    /**
     * A good place to cut a line near arc position `target` (within `window`): away from the ends
     * and crossings of other lines (dots at a cut next to a junction make a clump), at a corner if
     * one is free.
     */
    const pickCut = (li: number, target: number, window: number): number => {
        const l = lines[li], cap = 3 * rad;
        const cands: { s: number; corner: boolean }[] = [];
        for (const c of l.corners) {
            const s = l.closed ? c + Math.round((target - c) / l.len) * l.len : c;
            if (Math.abs(s - target) <= window) cands.push({ s, corner: true });
        }
        for (let t = -window; t <= window; t += 10) cands.push({ s: target + t, corner: false });
        // Clear of other lines first, then a corner, then near the target. Among the places that are
        // about as good, a random one: every layout cuts somewhere else.
        const scored: { s: number; score: number }[] = [];
        for (const c of cands) {
            if (!l.closed && (c.s < 3 * rad || c.s > l.len - 3 * rad)) continue;
            let clear = cap;
            around(pointOn(l, c.s), cap, (oi, _i, d) => { if (oi !== li && d < clear) clear = d; });
            scored.push({ s: c.s, score: Math.min(clear, 2.5 * rad) * 10 + (c.corner ? 8 : 0) - Math.abs(c.s - target) / Math.max(1, window) });
        }
        if (!scored.length) return target;
        const top = Math.max(...scored.map((c) => c.score)), good = scored.filter((c) => c.score >= top - 9);
        return good[Math.floor(rand() * good.length)].s;
    };
    lines.forEach((l, li) => {
        if (kind[li] !== 'line') return;
        const bigA = bigEnd.get(`${li}:a`), bigB = bigEnd.get(`${li}:b`);
        const forced = (touches.get(li) ?? []).sort((x, y) => x.s - y.s);
        // Cut points along the line: its two ends (open lines), cuts, and the details sitting on it.
        const cutsAt: { s: number; di?: number }[] = [];
        if (l.closed) {
            // A small closed shape is one line running all the way round (its two dots side by side).
            const n = l.len < 9 * rad ? 1 : Math.max(2, Math.ceil(l.len / maxLen));
            const first: { s: number; di?: number } = forced.length ? forced[0] : { s: pickCut(li, rand() * l.len, l.len / 2) };
            cutsAt.push(first);
            for (const f of forced.slice(1)) cutsAt.push({ s: f.s < first.s ? f.s + l.len : f.s, di: f.di });
            if (forced.length < 2) for (let k = 1; k < n; k++) cutsAt.push({ s: pickCut(li, first.s + (l.len * k) / n, l.len / n / 3) });
            cutsAt.sort((x, y) => x.s - y.s);
            cutsAt.push({ s: first.s + l.len, di: first.di });
        } else {
            // A stroke whose two ends almost meet (a "U", a petal) can't hold two dots at its tips: split
            // it in the middle like a closed shape, so each half gets its own pair.
            const tipGap = dist(l.pts[0], l.pts[l.pts.length - 1]);
            const nearlyClosed = bigA === undefined && bigB === undefined && !forced.length && tipGap < SIDE + 4 && l.len > 4 * (2 * rad + 8);
            const n = Math.max(nearlyClosed ? 2 : 1, Math.ceil(l.len / maxLen));
            cutsAt.push({ s: 0 }, ...forced);
            if (!forced.length) for (let k = 1; k < n; k++) cutsAt.push({ s: pickCut(li, (l.len * k) / n, l.len / n / 3) });
            cutsAt.sort((x, y) => x.s - y.s);
            cutsAt.push({ s: l.len });
        }
        const r = l.big ? Math.round(1.6 * rad) : rad, gap = r + 2, m = cutsAt.length - 1;
        const first = segs.length;
        for (let k = 0; k < m; k++) {
            const realA = !l.closed && k === 0, realB = !l.closed && k === m - 1;
            const g: SSeg = { line: li, s0: cutsAt[k].s + (realA ? 0 : gap), s1: cutsAt[k + 1].s - (realB ? 0 : gap), a: { r, real: realA, extLen: 0 }, b: { r, real: realB, extLen: 0 } };
            segs.push(g);
            segsOf[li].push(g);
        }
        // The big dot of a detail: the line runs straight to its centre from a little way outside the
        // dot. (Right next to a detail the traced line is unreliable: ink of several lines runs together.)
        const attach = (g: SSeg, e: Side, di: number, from: number) => {
            const d = details[di], dir = e === 'a' ? 1 : -1, part = g.s1 - g.s0;
            const clear = Math.max(0.9 * d.req, d.r + Math.min(2.5 * rad, 0.3 * part));
            let s = from;
            for (let t = 0; t < d.r + 4 * rad && dist(pointOn(l, s), d.c) < clear && part - t > 2 * rad; t += 2) s += dir * 2;
            if (e === 'a') g.s0 = s; else g.s1 = s;
            g[e] = bigEndOf(di);
            setExt(g, e, [d.c]);
        };
        if (bigA !== undefined) attach(segs[first], 'a', bigA, 0);
        if (bigB !== undefined) attach(segs[first + m - 1], 'b', bigB, l.len);
        // A detail sitting on the line: the longer of the two parts next to it carries the big dot.
        for (let k = 0; k <= m; k++) {
            const di = cutsAt[k].di;
            if (di === undefined || (l.closed && k === m)) continue;
            const left = k > 0 ? segs[first + k - 1] : l.closed ? segs[first + m - 1] : null, right = k < m ? segs[first + k] : null;
            const pickLeft = !!left && (!right || left.s1 - left.s0 > right.s1 - right.s0) && !left.b.fixed;
            if (pickLeft && left) attach(left, 'b', di, cutsAt[k].s + (k === 0 ? l.len : 0));
            else if (right && !right.a.fixed) attach(right, 'a', di, cutsAt[k].s);
            else linked.delete(di);
        }
    });
    /** Arc position s of a drawing line is part of a live line, at least `m` from that line's dots. */
    const covered = (li: number, s: number, m: number): boolean => {
        const l = lines[li];
        for (const o of segsOf[li]) {
            if (!isLive(o)) continue;
            for (const t of l.closed ? [s, s + l.len] : [s]) if (t >= o.s0 + m && t <= o.s1 - m) return true;
        }
        return false;
    };

    // Lines that are not in the drawing: the link between two big dots, the stalk of a lone one.
    const addLine = (a: Pt, b: Pt) => { lines.push(toLine(resample([a, b], 4), false)); kind.push('line'); segsOf.push([]); return lines.length - 1; };
    const addSeg = (li: number, a: End, b: End) => { const g: SSeg = { line: li, s0: 0, s1: lines[li].len, a, b }; segs.push(g); segsOf[li].push(g); };
    for (const [i, j] of links) addSeg(addLine(details[i].c, details[j].c), bigEndOf(i), bigEndOf(j));
    details.forEach((d, di) => {
        if (linked.has(di)) return;
        // A lone detail: a straight line to the nearest line of the drawing (not along that line).
        const pick = { dd: Infinity, q: null as Pt | null, li: -1 };
        around(d.c, 12 * rad, (li, i, dd) => {
            if (dd < d.r + rad + 6 || dd >= pick.dd) return;
            const o = lines[li];
            if (!covered(li, o.acc[i], SIDE)) return;
            const a = o.pts[Math.max(0, i - 1)], b = o.pts[Math.min(o.pts.length - 1, i + 1)], q = o.pts[i];
            if (Math.abs(((q.x - d.c.x) * (b.y - a.y) - (q.y - d.c.y) * (b.x - a.x)) / (dd * (dist(a, b) || 1))) < 0.5) return;
            pick.dd = dd; pick.q = q; pick.li = li;
        });
        if (!pick.q) return;
        addSeg(addLine(d.c, pick.q), bigEndOf(di), { r: rad, real: false, extLen: 0, on: pick.li });
        linked.add(di);
    });
    const unplaced = details.length - linked.size;
    if (unplaced) warnings.push(`${unplaced} round detail(s) with nothing near to link to (left out)`);

    // ---- 2. Ends: on another stroke = T (joined along a curve); tip to tip = pull back one; else free ----
    let pulledBack = 0;
    /** Moves an end back along its stroke until `ok` (at most `max` px, never below a playable length). */
    const pullBackUntil = (g: SSeg, e: Side, ok: (q: Pt) => boolean, max = 5 * rad): boolean => {
        const l = lines[g.line], O = g[e === 'a' ? 'b' : 'a'], dir = e === 'a' ? 1 : -1;
        let s = e === 'a' ? g.s0 : g.s1, moved = 0;
        while (moved < max && !ok(pointOn(l, s))) {
            if (g.s1 - g.s0 - moved - 2 + O.extLen < g.a.r + g.b.r + 8) break;
            s += dir * 2;
            moved += 2;
        }
        if (!moved) return false;
        if (e === 'a') g.s0 = s; else g.s1 = s;
        setExt(g, e, undefined);
        g[e].on = undefined;
        g[e].pulled = true;
        pulledBack++;
        return true;
    };
    /** End point of a stroke and the direction the stroke leaves it (outward). */
    const endGeom = (g: SSeg, e: Side) => {
        const l = lines[g.line], s = e === 'a' ? g.s0 : g.s1, back = Math.min(12, (g.s1 - g.s0) / 2);
        const p = pointOn(l, s), b = pointOn(l, e === 'a' ? s + back : s - back), d = dist(p, b) || 1;
        return { p, u: { x: (p.x - b.x) / d, y: (p.y - b.y) / d } };
    };
    /**
     * The stroke crosses another line just before its end (a short tail sticks out past it):
     * arc position of the crossing nearest to the end.
     */
    const tailCross = (g: SSeg, e: Side): { s: number; host: number } | null => {
        const l = lines[g.line], end = e === 'a' ? g.s0 : g.s1, dir = e === 'a' ? 1 : -1;
        const room = Math.min(2.5 * SNAP, g.s1 - g.s0 - (2 * rad + 8));
        let prev = pointOn(l, end);
        for (let t = 3; t <= room; t += 3) {
            const cur = pointOn(l, end + dir * t), from = prev;
            const found = { tt: Infinity, host: -1 };
            around({ x: (from.x + cur.x) / 2, y: (from.y + cur.y) / 2 }, 8, (li, i) => {
                if (li === g.line) return;
                const o = lines[li];
                for (const j of [i, i + 1]) {
                    if (j < 1 || j >= o.pts.length) continue;
                    const tt = hit(from, cur, o.pts[j - 1], o.pts[j]);
                    if (tt !== null && tt < found.tt && covered(li, o.acc[j], 0)) { found.tt = tt; found.host = li; }
                }
            });
            if (found.host >= 0) return { s: end + dir * (t - 3 + 3 * found.tt), host: found.host };
            prev = cur;
        }
        return null;
    };
    /** Nearest live line of the drawing (other than the end's own) within `r` of p. */
    const nearestHost = (p: Pt, r: number, own: number) => {
        const best = { d: Infinity, host: -1 };
        around(p, r, (li, i, d) => { if (li !== own && d < best.d && covered(li, lines[li].acc[i], 0)) { best.d = d; best.host = li; } });
        return best;
    };
    /**
     * Joins an end to a line ahead of it: the stroke goes on along a circular arc that starts in the
     * stroke's own direction (no kink) and lands on the line, not on that line's dots and not along it.
     */
    const reach = (g: SSeg, e: Side, maxReach: number, maxTurn: number): { pts: Pt[]; host: number } | null => {
        const { p, u } = endGeom(g, e), nx = -u.y, ny = u.x;
        const best = { cost: Infinity, q: null as Pt | null, f: 0, lat: 0, host: -1 };
        around(p, maxReach, (li, i, d) => {
            if (li === g.line || d < 1.5) return;
            const o = lines[li], q = o.pts[i];
            const dx = q.x - p.x, dy = q.y - p.y, f = dx * u.x + dy * u.y, lat = dx * nx + dy * ny;
            if (f <= 0.5) return;
            const turn = 2 * Math.atan2(Math.abs(lat), f);
            if (turn > maxTurn) return;
            const len = turn < 0.02 ? d : (d * (turn / 2)) / Math.sin(turn / 2);
            const cost = len * (1 + 1.5 * turn);
            if (len > maxReach || cost >= best.cost || !covered(li, o.acc[i], SIDE)) return;
            const a = o.pts[Math.max(0, i - 1)], b = o.pts[Math.min(o.pts.length - 1, i + 1)], hl = dist(a, b) || 1;
            const sg = lat >= 0 ? 1 : -1, ct = Math.cos(turn), st = Math.sin(turn) * sg;
            const ex = u.x * ct - u.y * st, ey = u.x * st + u.y * ct;
            if (Math.abs(ex * (b.y - a.y) - ey * (b.x - a.x)) / hl < 0.34) return;
            best.cost = cost; best.q = q; best.f = f; best.lat = lat; best.host = li;
        });
        if (!best.q) return null;
        const { q, f, lat } = best, turn = 2 * Math.atan2(Math.abs(lat), f), pts: Pt[] = [];
        if (turn > 0.05) {
            const R = (f * f + lat * lat) / (2 * Math.abs(lat)), sg = lat >= 0 ? 1 : -1, steps = Math.max(2, Math.ceil((R * turn) / 4));
            for (let k = 1; k < steps; k++) {
                const t = (turn * k) / steps, fx = R * Math.sin(t), fy = sg * R * (1 - Math.cos(t));
                pts.push({ x: p.x + u.x * fx + nx * fy, y: p.y + u.y * fx + ny * fy });
            }
        }
        pts.push({ x: q.x, y: q.y });
        return { pts, host: best.host };
    };

    // Ends of other lines next to a big dot: pulled back until the two dots sit side by side.
    const placed = details.filter((_, di) => linked.has(di));
    if (placed.length)
        for (const g of segs)
            for (const e of SIDES) {
                const E = g[e];
                if (E.fixed || g.line >= realCount) continue;
                const clear = (q: Pt) => placed.every((d) => dist(q, d.c) >= d.r + E.r + 2);
                if (!clear(tip(g, e))) pullBackUntil(g, e, clear, 8 * rad);
            }
    // Longer strokes first (roughly: the order varies between layouts): at a corner where two strokes meet, the longer one gives way.
    const realEnds = segs.flatMap((g) => SIDES.filter((e) => g[e].real).map((e) => ({ g, e, key: span(g) * (0.7 + 0.6 * rand()) }))).sort((x, y) => y.key - x.key);
    for (const { g, e } of realEnds) {
        const E = g[e];
        if (!isLive(g) || E.pulled) continue;
        // A short tail past another line: the line ends on it.
        const x = tailCross(g, e);
        if (x && nearestHost(tip(g, e), SNAP, g.line).d < SNAP) {
            if (e === 'a') g.s0 = x.s; else g.s1 = x.s;
            E.on = x.host;
            continue;
        }
        const p = tip(g, e), near = nearestHost(p, SNAP, g.line);
        if (near.host >= 0 && near.d < 3) { E.on = near.host; continue; }
        if (near.host >= 0) {
            const r = reach(g, e, 2.2 * SNAP, Math.PI / 3);
            if (r) { setExt(g, e, r.pts); E.on = r.host; continue; }
        }
        // Tip to tip with another line's dot: side by side.
        const clash = (q: Pt) => segs.some((o) => o !== g && isLive(o) && SIDES.some((f) => dist(dotAt(o, f), q) < E.r + o[f].r + 2));
        if (clash(p)) pullBackUntil(g, e, (q) => !clash(q));
    }

    // Pairs of the current layout. Paths are cached per line: most lines never change.
    const cache = new Map<SSeg, { key: string; a: Pt; b: Pt; path: Anchor[]; poly: Pt[] }>();
    const extKey = (E: End) => (E.ext ? `${E.ext.length}:${E.ext[E.ext.length - 1].x},${E.ext[E.ext.length - 1].y}` : '-');
    let L: SSeg[] = [], pairs: Pair[] = [], polys: Pt[][] = [], boxes: number[][] = [];
    /** Distance from p to line i is below `lim` (cheap bounding-box test first). */
    const within = (p: Pt, i: number, lim: number) => {
        const b = boxes[i];
        if (p.x < b[0] - lim || p.x > b[2] + lim || p.y < b[1] - lim || p.y > b[3] + lim) return false;
        return distToPolyline(p, polys[i]) < lim;
    };
    let sim = analyse(pairs, polys);
    const rebuild = () => {
        L = segs.filter(isLive);
        pairs = L.map((g, i) => {
            const key = `${g.s0}|${g.s1}|${extKey(g.a)}|${extKey(g.b)}`;
            let c = cache.get(g);
            if (!c || c.key !== key) {
                const mid = slice(lines[g.line], g.s0, g.s1);
                const path = fitSmooth([...(g.a.ext ? [...g.a.ext].reverse() : []), ...mid, ...(g.b.ext ?? [])], 1.2);
                c = { key, a: path[0], b: path[path.length - 1], path, poly: samplePath(path, 5) };
                cache.set(g, c);
            }
            const dot = (p: Pt, E: End) => ({ x: p.x, y: p.y, r: E.r, ...(E.fixed || E.r >= BIG_MIN * rad ? { big: true } : {}) });
            return { id: `p${i + 1}`, color: '', a: dot(c.a, g.a), b: dot(c.b, g.b), path: c.path };
        });
        polys = L.map((g) => cache.get(g)!.poly);
        boxes = polys.map((pl) => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const q of pl) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
            return [x0, y0, x1, y1];
        });
        sim = analyse(pairs, polys);
    };
    rebuild();

    /** Pulls an end back along its stroke (anything added beyond the stroke goes too). */
    const retract = (g: SSeg, e: Side, by: number): boolean => {
        const E = g[e], O = g[e === 'a' ? 'b' : 'a'], left = g.s1 - g.s0 - by;
        if (E.fixed || left < 4 || left + O.extLen < g.a.r + g.b.r + 8) return false;
        if (e === 'a') g.s0 += by; else g.s1 -= by;
        setExt(g, e, undefined);
        E.on = undefined;
        E.pulled = true;
        return true;
    };
    /** A big dot gives a little room (never below its floor). */
    const shrink = (g: SSeg, e: Side): boolean => {
        const E = g[e];
        if (!E.fixed || E.floor === undefined || E.r <= E.floor + 0.5) return false;
        E.r = Math.max(Math.ceil(E.floor), Math.round(E.r * 0.88));
        return true;
    };
    /** Pulls apart dots that overlap. Normal dots never shrink: a line that cannot give way is left out. Returns true if anything changed. */
    const fixOverlaps = () => {
        let changed = false;
        for (let pass = 0; pass < 30; pass++) {
            let moved = false;
            const touched = new Set<SSeg>();
            // A line whose own ends nearly meet (a "C"): pull one end back.
            L.forEach((g, i) => {
                const p = pairs[i];
                if (dist(p.a, p.b) >= p.a.r + p.b.r + 1) return;
                if (!(retract(g, 'b', rad + 6) || retract(g, 'a', rad + 6) || shrink(g, 'a') || shrink(g, 'b'))) g.dead = true;
                touched.add(g);
                moved = true;
            });
            const ends = L.flatMap((g, i) => SIDES.map((e) => ({ g, i, e, d: pairs[i][e] })));
            for (let x = 0; x < ends.length; x++)
                for (let y = x + 1; y < ends.length; y++) {
                    const X = ends[x], Y = ends[y], over = X.d.r + Y.d.r + 1 - dist(X.d, Y.d);
                    if (X.i === Y.i || over <= 0) continue;
                    moved = true;
                    if (touched.has(X.g) || touched.has(Y.g)) continue; // moved already in this pass: look again
                    // Pull back the longer line, then the shorter; big dots stay where they are.
                    const [A, B] = span(X.g) >= span(Y.g) ? [X, Y] : [Y, X], by = Math.max(0.75 * rad, over + 5);
                    if (retract(A.g, A.e, by)) touched.add(A.g);
                    else if (retract(B.g, B.e, by)) touched.add(B.g);
                    else if (shrink(A.g, A.e)) touched.add(A.g);
                    else if (shrink(B.g, B.e)) touched.add(B.g);
                    else { const v = B.g[B.e].fixed && !A.g[A.e].fixed ? A : B; v.g.dead = true; touched.add(v.g); }
                }
            if (!moved) break;
            rebuild();
            pulledBack++;
            changed = true;
        }
        return changed;
    };

    /**
     * The halves of a closed shape that block each other (a dense zig-zag ring): make them one line
     * running the whole way round, with its two dots side by side at the cut. A line never blocks
     * itself, so the cycle is gone and the shape stays whole.
     */
    const mergeLoop = (g: SSeg): boolean => {
        const l = lines[g.line], sibs = segsOf[g.line].filter((o) => !o.dead);
        if (!l.closed || sibs.length < 2 || sibs.some((o) => o.a.fixed || o.b.fixed)) return false;
        const first = sibs.reduce((a, o) => (o.s0 < a.s0 ? o : a));
        for (const o of sibs) if (o !== first) o.dead = true;
        first.s1 = first.s0 + l.len - 2 * (first.a.r + 2);
        for (const e of SIDES) { setExt(first, e, undefined); first[e].on = undefined; }
        return true;
    };

    // ---- 3. Remove blocking cycles: pull back the cheapest T end inside a cycle ----
    const backMemo = new Map<SSeg, { key: string; back: number }>();
    const breakCycles = () => {
        for (let iter = 0; iter < segs.length * 4 && !sim.solvable; iter++) {
            const stuck = new Set(sim.stuck);
            const best = { g: null as SSeg | null, e: 'a' as Side, cost: Infinity, back: Infinity };
            pairs.forEach((Y, yi) => {
                if (!stuck.has(Y.id)) return;
                const g = L[yi], l = lines[g.line];
                for (const e of SIDES) {
                    const E = g[e], O = g[e === 'a' ? 'b' : 'a'];
                    const hosts: number[] = [];
                    for (const xi of sim.on[yi][e === 'a' ? 0 : 1]) if (stuck.has(pairs[xi].id)) hosts.push(xi);
                    if (!hosts.length) continue;
                    // How far back until the dot is out of the way of those lines. A dot that stays in the
                    // way wherever it goes (two lines running side by side) cannot be fixed by pulling back.
                    let back = Infinity;
                    // Same line and same lines in the way as last time: same answer (saves the long search).
                    const memoKey = `${e}|${cache.get(g)!.key}|${hosts.map((xi) => `${xi}:${cache.get(L[xi])!.key}`).join(';')}`;
                    const memo = backMemo.get(g);
                    if (memo && memo.key === memoKey) back = memo.back;
                    else if (!E.fixed) {
                        const dir = e === 'a' ? 1 : -1, from = e === 'a' ? g.s0 : g.s1, part = g.s1 - g.s0;
                        const room = Math.min(part - 4, part + O.extLen - (g.a.r + g.b.r + 8), Math.max(4 * rad, 0.5 * part));
                        for (let t = E.ext ? 0 : rad; t <= room; t += Math.max(rad / 2, room / 30)) {
                            const q = pointOn(l, from + dir * t);
                            if (hosts.every((xi) => !within(q, xi, (E.r + Math.max(pairs[xi].a.r, pairs[xi].b.r)) * HIT_SCALE + 1))) { back = t; break; }
                        }
                    }
                    backMemo.set(g, { key: memoKey, back });
                    // Short pull-backs first; a line that cannot get out of the way is left out, the shortest first; big dots go last.
                    const cost = back < Infinity ? 0.5 * back * (0.5 + rand()) : (E.fixed ? 1400 : 700) + 0.3 * span(g) * (0.7 + 0.6 * rand());
                    if (cost < best.cost) { best.g = g; best.e = e; best.cost = cost; best.back = back; }
                }
            });
            if (!best.g) break;
            if (!(best.back < Infinity && retract(best.g, best.e, best.back)) && !shrink(best.g, best.e) && !mergeLoop(best.g)) best.g.dead = true; // cannot get out of the way: leave it out
            pulledBack++;
            rebuild();
        }
    };
    fixOverlaps();
    breakCycles();
    for (let k = 0; k < 3 && fixOverlaps(); k++) breakCycles();
    if (!sim.solvable) warnings.push(`${sim.stuck.length} lines still block each other`);

    // ---- 4. Nudge toward the target bands: free tips go on to a line ahead of them ----
    const tg = strokeTargets(opt.difficulty);
    const measure = (by: number[]) => ({ blocks: by.reduce((a, b) => a + b, 0) / Math.max(1, by.length), open: by.filter((b) => b === 0).length / Math.max(1, by.length) });
    const clashing = () => pairs.some((p, i) => dist(p.a, p.b) < p.a.r + p.b.r + 1 || pairs.some((q, j) => j > i && [p.a, p.b].some((u) => [q.a, q.b].some((v) => dist(u, v) < u.r + v.r + 1))));
    let extended = 0;
    for (let step = 0; step < pairs.length; step++) {
        const m = measure(sim.by), by = sim.by;
        if (m.blocks >= tg.blocks - 0.05 && m.open <= tg.open + 0.05) break;
        // Candidates: free tips with a line within 2 dot diameters ahead of them.
        const opts: { g: SSeg; e: Side; pts: Pt[]; host: number; len: number; open: boolean }[] = [];
        for (const g of L)
            for (const e of SIDES) {
                const E = g[e];
                if (!E.real || E.ext || E.on !== undefined || E.pulled) continue;
                const r = reach(g, e, 4 * rad, (50 * Math.PI) / 180);
                if (!r) continue;
                const q = r.pts[r.pts.length - 1];
                // Is the line it would land on open now? (Blocking an open line lowers the open share.)
                const hi = L.findIndex((o, k) => o.line === r.host && within(q, k, 3));
                opts.push({ g, e, pts: r.pts, host: r.host, len: polyLen([tip(g, e), ...r.pts]), open: hi >= 0 && by[hi] === 0 });
            }
        // Prefer open hosts (lowers the open share) and short reaches (keeps the shape).
        opts.sort((a, b) => (a.open ? 0 : 1) - (b.open ? 0 : 1) || a.len - b.len + (rand() - 0.5) * 10);
        let done = false;
        for (const o of opts.slice(0, 12)) {
            setExt(o.g, o.e, o.pts);
            o.g[o.e].on = o.host;
            rebuild();
            if (sim.solvable && !clashing()) { extended++; done = true; break; }
            setExt(o.g, o.e, undefined);
            o.g[o.e].on = undefined;
        }
        if (!done) { rebuild(); break; }
    }
    rebuild();
    // Dots that still overlap after all that (a crowded corner): the shorter line is left out.
    for (let guard = 0; guard < 60 && clashing(); guard++) {
        let victim: SSeg | null = null;
        for (let i = 0; i < pairs.length && !victim; i++) {
            const p = pairs[i];
            if (dist(p.a, p.b) < p.a.r + p.b.r + 1) victim = L[i];
            for (let j = i + 1; j < pairs.length && !victim; j++) {
                const q = pairs[j];
                if (![p.a, p.b].some((u) => [q.a, q.b].some((v) => dist(u, v) < u.r + v.r + 1))) continue;
                const fi = L[i].a.fixed || L[i].b.fixed, fj = L[j].a.fixed || L[j].b.fixed;
                victim = fi !== fj ? (fi ? L[j] : L[i]) : span(L[i]) <= span(L[j]) ? L[i] : L[j];
            }
        }
        if (!victim) break;
        victim.dead = true;
        rebuild();
    }

    // ---- 4b. Grow back: ends pulled back to make room often have room again once the layout has
    // settled. Each one tries to get back all of its stroke, else half, else a quarter, keeping the
    // level solvable and its dot clear of every other dot.
    if (sim.solvable) {
        for (const g of [...L]) {
            const l = lines[g.line];
            if (l.closed || g.dead) continue;
            for (const e of SIDES) {
                const E = g[e];
                if (!E.pulled || E.fixed || E.ext) continue;
                // As far as the stroke's end, or a dot's room before the next part of the same stroke.
                const sibs = segsOf[g.line].filter((o) => o !== g && !o.dead);
                const limit = e === 'a'
                    ? Math.max(0, ...sibs.filter((o) => o.s1 <= g.s0).map((o) => o.s1 + SIDE))
                    : Math.min(l.len, ...sibs.filter((o) => o.s0 >= g.s1).map((o) => o.s0 - SIDE));
                const room = e === 'a' ? g.s0 - limit : limit - g.s1;
                if (room < rad / 2) continue;
                const at = e === 'a' ? g.s0 : g.s1;
                for (const share of [1, 0.5, 0.25]) {
                    const by = room * share;
                    if (by < rad / 2) break;
                    const q = pointOn(l, e === 'a' ? at - by : at + by);
                    // Cheap test first: the new dot must be clear of every other dot.
                    if (pairs.some((p, i) => L[i] !== g && [p.a, p.b].some((v) => dist(q, v) < v.r + E.r + 1))) continue;
                    if (e === 'a') g.s0 = at - by; else g.s1 = at + by;
                    rebuild();
                    if (sim.solvable && !clashing()) break;
                    if (e === 'a') g.s0 = at; else g.s1 = at;
                    rebuild();
                }
            }
        }
    }

    // What the drawing lost: strokes with no line left, details with no big dot.
    const liveNow = new Set(L);
    let lost = tooSmall + unplaced;
    for (let li = 0; li < realCount; li++) if (kind[li] === 'line' && !segsOf[li].some((g) => liveNow.has(g))) lost++;
    const bigAlive = new Set(L.flatMap((g) => SIDES.map((e) => g[e].detail).filter((d): d is number => d !== undefined)));
    lost += linked.size - bigAlive.size;
    if (lost) warnings.push(`${lost} stroke(s) of the drawing left out: too small for dots of radius ${rad}, or in the way`);
    const bigDots = L.reduce((s, g) => s + SIDES.filter((e) => g[e].r >= BIG_MIN * rad).length, 0);

    // ---- 5. Missing lines: ornaments (generator part 2) in the same colours ----
    let ornaments = 0;
    if ((opt.fill ?? true) && pairs.length < opt.pairs) {
        const missing = opt.pairs - pairs.length;
        // Reference: 65% of dots on lines; ornaments have one end on a line (T) or cross lines (X).
        const t = Math.round(missing * 0.7), x = missing - t;
        colourPairs(pairs, opt.colors, rand);
        const [o] = generateOverlap(pairs, { x, t, difficulty: opt.difficulty, style: opt.pattern ?? 'auto', seed: Math.floor(rand() * 1e9), tries: 6, keep: 1 });
        if (o) {
            ornaments = o.pairs.length;
            pairs = [...pairs, ...o.pairs];
            if (o.warnings.length) warnings.push(...o.warnings);
        }
    } else if (pairs.length > opt.pairs) warnings.push(`The drawing has ${pairs.length} strokes, more than the ${opt.pairs} lines asked for (stroke mode never merges strokes)`);
    // Dots near a line without clearly being on it go onto it (they block it, plainly); colours come
    // after, since moving a dot can bring two lines near each other.
    settleNearDots(pairs);
    colourPairs(pairs, opt.colors, rand);
    // The game's own solver has the last word.
    const final = solve({ pairs } as never);
    if (!final.solvable && sim.solvable && !ornaments) warnings.push(`${final.stuck.length} lines still block each other`);

    // ---- Stats and score ----
    const samples = pairs.map((p) => samplePath(p.path, 5));
    const m = measure(analyse(pairs, samples).by);
    let tDots = 0, touching = 0, free = 0;
    pairs.forEach((Y, yi) => {
        for (const e of SIDES) {
            const on = pairs.some((X, xi) => xi !== yi && distToPolyline(Y[e], samples[xi]) < (Y[e].r + Math.max(X.a.r, X.b.r)) * HIT_SCALE);
            const near = pairs.some((X, xi) => xi !== yi && [X.a, X.b].some((d) => dist(d, Y[e]) < Y[e].r + d.r + 10));
            if (on) tDots++; else if (near) touching++; else free++;
        }
    });
    const nd = Math.max(1, pairs.length * 2);
    let crossings = 0;
    for (let i = 0; i < samples.length; i++)
        for (let j = i + 1; j < samples.length; j++)
            for (let a = 2; a < samples[i].length; a += 2)
                for (let b = 2; b < samples[j].length; b += 2)
                    if (hit(samples[i][a - 2], samples[i][a], samples[j][b - 2], samples[j][b]) !== null) crossings++;
    const stats: StrokeModeStats = {
        strokes: strokeCount, lines: pairs.length, ornaments, tDots: tDots / nd, freeDots: free / nd, touchingDots: touching / nd,
        openShare: m.open, blocksPerLine: m.blocks, depth: final.rounds, crossingsPerLine: crossings / Math.max(1, pairs.length), pulledBack, extended, lost, size, radius: rad, bigDots
    };
    const depthWant = tg.depthPerLine * pairs.length;
    // Losing part of the drawing costs more than missing a target band.
    const score = (final.solvable ? 0 : 100) + 0.3 * lost + (12 * lost) / Math.max(1, strokeCount) + 4 * Math.abs(m.open - tg.open) + 2 * Math.abs(m.blocks - tg.blocks) + 0.15 * Math.abs(final.rounds - depthWant) + 0.05 * Math.abs(pairs.length - opt.pairs);
    return { pairs, sim: final, stats, score, warnings };
}

/** Growing the world one step (x1.2) makes the dots smaller on screen: it must be worth this much score. */
const GROW_COST = 0.8;
/**
 * Board size limits, in diameters of the standard dot (radius 16), not of the chosen dot size: a
 * smaller dot size gives smaller dots on the same picture (more room for small details), it does
 * not shrink the picture with them. The board never grows past 45 standard dots on the long side
 * (reference: a dot is 1/30 of it on normal levels, 1/40 on hard ones) and is at least 22.
 */
const MAX_SIDE_IN_DOTS = 45;
const MIN_SIDE_IN_DOTS = 22;
/** Smallest board for a drawing (see MIN_SIDE_IN_DOTS). */
export const MIN_BOARD = MIN_SIDE_IN_DOTS * 2 * DEFAULT_RADIUS;

/** Stroke-mode layouts, best first. All of them have the same world size (`stats.size`). */
export function generateStrokes(strokes: Stroke[], opt: StrokeModeOptions): StrokeModeCandidate[] {
    // A drawing with few strokes still needs room: the long side is at least 22 standard dots.
    const size = opt.size ?? Math.max(strokeWorldSize(strokes, opt.pairs), MIN_BOARD);
    const base = opt.seed ?? Date.now(), tries = opt.tries ?? 6, probe = Math.min(2, tries);
    const build = (k: number, i: number) => buildOnce(strokes, opt, Math.round(size * k), rng(base + i * 7919));
    // Two quick layouts per world size decide the size: bigger only when the drawing clearly needs the
    // room (strokes too small for the dots, dots crowding each other at the junctions). Up to x1.45
    // always; further only while the dots stay big enough on the picture.
    const steps = opt.grow === false ? [1] : [1, 1.2, 1.45, 1.75, 2.1].filter((k) => k <= 1.45 || size * k <= MAX_SIDE_IN_DOTS * 2 * DEFAULT_RADIUS);
    // A big drawing is slow: with a time budget, fewer sizes and layouts are tried (always at least one).
    const t0 = Date.now(), budget = opt.budgetMs ?? Infinity, late = (share: number) => Date.now() - t0 > budget * share;
    let best = { k: 1, score: Infinity, out: [] as StrokeModeCandidate[] };
    for (const k of steps) {
        if (best.out.length && late(0.6)) break;
        const out: StrokeModeCandidate[] = [];
        for (let i = 0; i < probe && !(out.length && late(0.6)); i++) out.push(build(k, i));
        const score = Math.min(...out.map((c) => c.score)) + (GROW_COST * Math.log(k)) / Math.log(1.2);
        if (score < best.score) best = { k, score, out };
    }
    for (let i = probe; i < tries && !late(1); i++) best.out.push(build(best.k, i));
    return best.out.sort((a, b) => a.score - b.score).slice(0, opt.keep ?? 3);
}
