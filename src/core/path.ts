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
        // Sharp corner (> ~60 degrees): keep it sharp, no handles.
        if (i > 0 && i < out.length - 1) {
            const ax = out[i].x - prev.x, ay = out[i].y - prev.y, bx = next.x - out[i].x, by = next.y - out[i].y;
            if ((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1) < 0.5) continue;
        }
        const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
        if (i > 0) out[i].in = { x: round(out[i].x - tx), y: round(out[i].y - ty) };
        if (i < out.length - 1) out[i].out = { x: round(out[i].x + tx), y: round(out[i].y + ty) };
    }
    return out;
}

/**
 * Clean curve from a hand-drawn stroke: evens out the samples, removes hand jitter, keeps few
 * anchors and rounds every corner (unless `keepCorners`: turns sharper than ~90 degrees stay sharp).
 * Handles follow the neighbours' direction with lengths matched to each side, so the curve has no
 * kinks or overshoots. `tolerance` = how far (world px) the result may drift from the stroke.
 */
export function fitFreehand(raw: Pt[], tolerance = 6, keepCorners = false): Anchor[] {
    const cleaned = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.5);
    if (cleaned.length < 2) return cleaned.map((p) => ({ x: round(p.x), y: round(p.y) }));
    // 1. Even samples (spacing ~ tolerance / 2).
    const acc = arcLengths(cleaned), len = acc[acc.length - 1];
    if (len < 1) return [{ x: round(cleaned[0].x), y: round(cleaned[0].y) }];
    const step = Math.max(1, tolerance / 2);
    const n = Math.max(2, Math.round(len / step) + 1);
    let pts: Pt[] = Array.from({ length: n }, (_, i) => pointAt(cleaned, acc, (len * i) / (n - 1)));
    // 2. Remove jitter: a few passes of [1 2 1] averaging, ends fixed.
    const corners = new Set<number>();
    if (keepCorners) {
        const w = Math.max(2, Math.round(12 / step));
        for (let i = w; i < n - w; i++) {
            const a = pts[i - w], b = pts[i], c = pts[i + w];
            const ax = b.x - a.x, ay = b.y - a.y, bx = c.x - b.x, by = c.y - b.y;
            if ((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1) < 0) corners.add(i);
        }
    }
    for (let pass = 0; pass < 4; pass++)
        pts = pts.map((p, i) => (i === 0 || i === n - 1 || corners.has(i) ? p : { x: (pts[i - 1].x + 2 * p.x + pts[i + 1].x) / 4, y: (pts[i - 1].y + 2 * p.y + pts[i + 1].y) / 4 }));
    // 3. Few anchors.
    const key = simplify(pts, tolerance);
    const out: Anchor[] = key.map((p) => ({ x: round(p.x), y: round(p.y) }));
    if (out.length === 2) {
        // A gentle bend that simplify flattened: keep it as one cubic through the stroke's middle.
        const mid = pts[Math.floor(n / 2)], m = { x: (out[0].x + out[1].x) / 2, y: (out[0].y + out[1].y) / 2 };
        if (dist(mid, m) < tolerance / 2) return out;
        const dx = (mid.x - m.x) * (4 / 3), dy = (mid.y - m.y) * (4 / 3);
        out[0].out = { x: round(out[0].x + (out[1].x - out[0].x) / 3 + dx), y: round(out[0].y + (out[1].y - out[0].y) / 3 + dy) };
        out[1].in = { x: round(out[1].x - (out[1].x - out[0].x) / 3 + dx), y: round(out[1].y - (out[1].y - out[0].y) / 3 + dy) };
        return out;
    }
    const isCorner = (p: Pt) => [...corners].some((i) => dist(pts[i], p) < 0.6);
    for (let i = 0; i < out.length; i++) {
        const prev = out[Math.max(0, i - 1)], next = out[Math.min(out.length - 1, i + 1)], p = out[i];
        if (i > 0 && i < out.length - 1 && isCorner(p)) continue;
        let tx = next.x - prev.x, ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        if (i > 0) { const l = dist(prev, p) / 3; p.in = { x: round(p.x - tx * l), y: round(p.y - ty * l) }; }
        if (i < out.length - 1) { const l = dist(p, next) / 3; p.out = { x: round(p.x + tx * l), y: round(p.y + ty * l) }; }
    }
    // End handles point at the neighbour's incoming handle so the ends leave smoothly too.
    const fixEnd = (e: Anchor, h: 'in' | 'out', nb: Anchor, nh?: Pt) => {
        const t = nh ?? nb, l = dist(e, nb) / 3, d = Math.hypot(t.x - e.x, t.y - e.y) || 1;
        e[h] = { x: round(e.x + ((t.x - e.x) / d) * l), y: round(e.y + ((t.y - e.y) / d) * l) };
    };
    fixEnd(out[0], 'out', out[1], out[1].in);
    fixEnd(out[out.length - 1], 'in', out[out.length - 2], out[out.length - 2].out);
    return out;
}

/** Re-smooths an existing path (Smooth button): every corner rounded, jitter removed. */
export function smoothPath(path: Anchor[]): Anchor[] {
    return fitFreehand(samplePath(path, 3), 5);
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

// ---------- Smoothing for generated lines (no kinks, rounded corners) ----------

/** Evenly spaced points (about `step` apart) along a polyline; keeps the first and last point. */
export function resample(pts: Pt[], step: number): Pt[] {
    if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
    const acc = arcLengths(pts), len = acc[acc.length - 1];
    if (len < 1e-6) return [{ x: pts[0].x, y: pts[0].y }];
    const n = Math.max(1, Math.round(len / step));
    return Array.from({ length: n + 1 }, (_, i) => pointAt(pts, acc, (len * i) / n));
}

/**
 * Low-pass filter for an evenly sampled polyline: removes pixel stair-steps and small jogs.
 * `sigma` is in the same units as the points. Open lines keep their two end points; closed lines
 * (first point = last point) are smoothed all the way round.
 */
export function smoothPolyline(pts: Pt[], sigma: number, closed = false): Pt[] {
    const n = pts.length;
    if (n < 4 || sigma <= 0) return pts.map((p) => ({ x: p.x, y: p.y }));
    const acc = arcLengths(pts), step = acc[n - 1] / (n - 1) || 1;
    // Each [1 2 1] pass adds a variance of step² / 2.
    const passes = Math.max(1, Math.round(2 * (sigma / step) ** 2));
    let cur = pts.map((p) => ({ x: p.x, y: p.y }));
    if (closed) cur.pop();
    const m = cur.length;
    for (let pass = 0; pass < passes; pass++) {
        const next = cur.map((p, i) => {
            if (!closed && (i === 0 || i === m - 1)) return p;
            const a = cur[(i - 1 + m) % m], b = cur[(i + 1) % m];
            return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
        });
        cur = next;
    }
    if (closed) cur.push({ ...cur[0] });
    return cur;
}

/**
 * Rounds the sharp corners of an evenly sampled polyline: each corner (direction change of more
 * than `minTurn` degrees) is replaced by a curve that leaves the line `radius` before the corner
 * and joins it again `radius` after it (less on short legs). The rest is untouched.
 */
export function roundCorners(pts: Pt[], radius: number, closed = false, minTurn = 35): Pt[] {
    const n0 = pts.length;
    if (n0 < 5 || radius <= 0) return pts.map((p) => ({ x: p.x, y: p.y }));
    const ring = closed ? pts.slice(0, -1) : pts;
    // Closed lines: work on three copies and keep the middle one, so corners near the seam are handled.
    const src = closed ? [...ring, ...ring, ...ring] : ring;
    const n = src.length, off = closed ? ring.length : 0;
    const acc = arcLengths(src), h = acc[n - 1] / (n - 1) || 1;
    const arm = Math.max(1, Math.round(5 / h));
    const turn = new Float32Array(n);
    for (let i = arm; i < n - arm; i++) {
        const a = src[i - arm], p = src[i], b = src[i + arm];
        const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
        const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
        turn[i] = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
    }
    // Corners = local maxima of the turn above the threshold.
    const corners: number[] = [];
    for (let i = arm; i < n - arm; i++) {
        if (turn[i] < minTurn) continue;
        let top = true;
        for (let j = Math.max(arm, i - 2 * arm); j <= Math.min(n - arm - 1, i + 2 * arm); j++) if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) { top = false; break; }
        if (top) corners.push(i);
    }
    if (!corners.length) return pts.map((p) => ({ x: p.x, y: p.y }));
    const out = src.map((p) => ({ x: p.x, y: p.y }));
    corners.forEach((ci, k) => {
        const prev = k ? corners[k - 1] : closed ? ci - n : 0, next = k < corners.length - 1 ? corners[k + 1] : closed ? ci + n : n - 1;
        const m = Math.floor(Math.min(radius / h, 0.45 * (ci - prev), 0.45 * (next - ci), ci, n - 1 - ci));
        if (m < 2) return;
        const A = src[ci - m], V = src[ci], B = src[ci + m];
        for (let j = -m + 1; j < m; j++) {
            const t = (j + m) / (2 * m), u = 1 - t;
            out[ci + j] = { x: u * u * A.x + 2 * u * t * V.x + t * t * B.x, y: u * u * A.y + 2 * u * t * V.y + t * t * B.y };
        }
    });
    if (!closed) return out;
    const mid = out.slice(off, off + ring.length);
    mid.push({ ...mid[0] });
    return mid;
}

/**
 * Bezier path through an already smooth polyline: few anchors, and the direction is continuous
 * at every anchor (no sharp point anywhere). `tolerance` = how far it may drift from the polyline.
 */
export function fitSmooth(raw: Pt[], tolerance = 1.2): Anchor[] {
    const cleaned = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.5);
    if (cleaned.length < 2) return cleaned.map((p) => ({ x: round(p.x), y: round(p.y) }));
    const key = simplify(cleaned, tolerance);
    const out: Anchor[] = key.map((p) => ({ x: round(p.x), y: round(p.y) }));
    if (out.length === 2) return out;
    for (let i = 1; i < out.length - 1; i++) {
        const prev = out[i - 1], next = out[i + 1], p = out[i];
        let tx = next.x - prev.x, ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const li = dist(prev, p) / 3, lo = dist(p, next) / 3;
        p.in = { x: round(p.x - tx * li), y: round(p.y - ty * li) };
        p.out = { x: round(p.x + tx * lo), y: round(p.y + ty * lo) };
    }
    // The two ends leave towards their neighbour's handle.
    const end = (e: Anchor, h: 'in' | 'out', nb: Anchor, nh?: Pt) => {
        const t = nh ?? nb, l = dist(e, nb) / 3, d = Math.hypot(t.x - e.x, t.y - e.y) || 1;
        e[h] = { x: round(e.x + ((t.x - e.x) / d) * l), y: round(e.y + ((t.y - e.y) / d) * l) };
    };
    end(out[0], 'out', out[1], out[1].in);
    end(out[out.length - 1], 'in', out[out.length - 2], out[out.length - 2].out);
    return out;
}
