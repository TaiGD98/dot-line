// Path geometry shared by the editor and the game.
// A path is a chain of cubic bezier anchors, like an SVG path: each anchor has
// optional handles `in` / `out` (absolute coordinates).

export interface Pt {
    x: number;
    y: number;
}

export interface Anchor extends Pt {
    in?: Pt;
    out?: Pt;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Polyline approximation of a path, roughly `step` world px apart. */
export function samplePath(path: Anchor[], step = 6): Pt[] {
    if (path.length === 0) return [];
    const out: Pt[] = [{ x: path[0].x, y: path[0].y }];
    for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[i], p3 = path[i + 1];
        const p1 = p0.out ?? p0, p2 = p3.in ?? p3;
        const rough = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
        const n = Math.max(2, Math.ceil(rough / step));
        for (let k = 1; k <= n; k++) out.push(cubic(p0, p1, p2, p3, k / n));
    }
    return out;
}

/** Cumulative arc length per polyline point. */
export function arcLengths(pts: Pt[]): number[] {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
    return acc;
}

/** Point at arc length `s` along a polyline (with precomputed lengths). */
export function pointAt(pts: Pt[], acc: number[], s: number): Pt {
    if (s <= 0) return pts[0];
    const total = acc[acc.length - 1];
    if (s >= total) return pts[pts.length - 1];
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (acc[mid] < s) lo = mid;
        else hi = mid;
    }
    const seg = acc[hi] - acc[lo] || 1;
    const t = (s - acc[lo]) / seg;
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

/** Sub-polyline between arc lengths s0 and s1. */
export function slicePolyline(pts: Pt[], acc: number[], s0: number, s1: number): Pt[] {
    const out: Pt[] = [pointAt(pts, acc, s0)];
    for (let i = 0; i < pts.length; i++) if (acc[i] > s0 && acc[i] < s1) out.push(pts[i]);
    out.push(pointAt(pts, acc, s1));
    return out;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p: Pt, pts: Pt[]): number {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
    return pts.length === 1 ? dist(p, pts[0]) : best;
}

/** Ramer-Douglas-Peucker simplification. */
export function simplify(pts: Pt[], tolerance: number): Pt[] {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop()!;
        let maxD = 0, idx = -1;
        for (let i = a + 1; i < b; i++) {
            const d = distToSegment(pts[i], pts[a], pts[b]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > tolerance && idx > 0) {
            keep[idx] = 1;
            stack.push([a, idx], [idx, b]);
        }
    }
    return pts.filter((_, i) => keep[i]);
}

/**
 * Turns a raw polyline (freehand stroke or traced image line) into a smooth bezier path:
 * simplify, then Catmull-Rom tangents converted to cubic handles.
 */
export function fitPath(raw: Pt[], tolerance = 4): Anchor[] {
    const cleaned = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.5);
    if (cleaned.length < 2) return cleaned.map((p) => ({ x: p.x, y: p.y }));
    const pts = simplify(cleaned, tolerance);
    const out: Anchor[] = pts.map((p) => ({ x: round(p.x), y: round(p.y) }));
    if (out.length === 2) return out;
    for (let i = 0; i < out.length; i++) {
        const prev = out[Math.max(0, i - 1)], next = out[Math.min(out.length - 1, i + 1)];
        const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
        if (i > 0) out[i].in = { x: round(out[i].x - tx), y: round(out[i].y - ty) };
        if (i < out.length - 1) out[i].out = { x: round(out[i].x + tx), y: round(out[i].y + ty) };
    }
    return out;
}

/** Re-smooths an existing path (Smooth button). */
export function smoothPath(path: Anchor[]): Anchor[] {
    return fitPath(samplePath(path, 4), 3);
}

export function translatePath(path: Anchor[], dx: number, dy: number): Anchor[] {
    const mv = (p?: Pt) => (p ? { x: p.x + dx, y: p.y + dy } : undefined);
    return path.map((a) => {
        const n: Anchor = { x: a.x + dx, y: a.y + dy };
        if (a.in) n.in = mv(a.in);
        if (a.out) n.out = mv(a.out);
        return n;
    });
}

export const round = (v: number) => Math.round(v * 10) / 10;
