// Polyline helpers shared by the silhouette tools (world px).
import type { Pt } from '../../src/core/path';

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function lengths(pts: Pt[]): number[] {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
    return acc;
}

export function at(pts: Pt[], acc: number[], s: number): Pt {
    if (s <= 0) return pts[0];
    const total = acc[acc.length - 1];
    if (s >= total) return pts[pts.length - 1];
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] < s) lo = mid; else hi = mid; }
    const t = (s - acc[lo]) / (acc[hi] - acc[lo] || 1);
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

/** Sub-polyline between arc lengths s0 < s1. */
export function cut(pts: Pt[], acc: number[], s0: number, s1: number): Pt[] {
    const out: Pt[] = [at(pts, acc, s0)];
    for (let i = 0; i < pts.length; i++) if (acc[i] > s0 + 1e-6 && acc[i] < s1 - 1e-6) out.push(pts[i]);
    out.push(at(pts, acc, s1));
    return out;
}

/** Evenly spaced copy (about `step` apart, ends kept). A closed polyline repeats its first point at the end. */
export function resample(pts: Pt[], step: number): Pt[] {
    const acc = lengths(pts), total = acc[acc.length - 1];
    const n = Math.max(1, Math.round(total / step));
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) out.push(at(pts, acc, (total * i) / n));
    return out;
}

/** [1 2 1] smoothing. Closed: first point == last point. Open: ends stay. */
export function smooth(pts: Pt[], closed: boolean, passes = 1): Pt[] {
    let p = pts;
    for (let k = 0; k < passes; k++) {
        const n = p.length;
        const q = p.map((v, i) => {
            if (!closed && (i === 0 || i === n - 1)) return v;
            const a = closed ? p[(i - 1 + (n - 1)) % (n - 1)] : p[i - 1];
            const b = closed ? p[(i + 1) % (n - 1)] : p[i + 1];
            return { x: (a.x + 2 * v.x + b.x) / 4, y: (a.y + 2 * v.y + b.y) / 4 };
        });
        if (closed) q[n - 1] = { ...q[0] };
        p = q;
    }
    return p;
}

export function signedArea(pts: Pt[]): number {
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
    return a / 2;
}

/** Closest point on a polyline: distance, arc position and the point. */
export function project(pts: Pt[], acc: number[], p: Pt): { d: number; s: number; q: Pt } {
    let best = { d: Infinity, s: 0, q: pts[0] };
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const q = { x: a.x + t * dx, y: a.y + t * dy };
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < best.d) best = { d, s: acc[i - 1] + t * Math.sqrt(l2), q };
    }
    return best;
}

/** Unit tangent of a polyline at arc length s (averaged over +-w). */
export function tangent(pts: Pt[], acc: number[], s: number, w = 6): Pt {
    const a = at(pts, acc, s - w), b = at(pts, acc, s + w);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
}

/** Uniform grid for "which sample points are near here" queries. */
export class Grid<T> {
    private cells = new Map<number, { p: Pt; v: T }[]>();
    constructor(private size: number) {}
    private key(cx: number, cy: number) { return (cx + 4096) * 16384 + (cy + 4096); }
    add(p: Pt, v: T) {
        const k = this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size));
        const c = this.cells.get(k);
        if (c) c.push({ p, v }); else this.cells.set(k, [{ p, v }]);
    }
    /** Every entry within `r` of `p`. */
    near(p: Pt, r: number): { p: Pt; v: T; d: number }[] {
        const out: { p: Pt; v: T; d: number }[] = [];
        const x0 = Math.floor((p.x - r) / this.size), x1 = Math.floor((p.x + r) / this.size);
        const y0 = Math.floor((p.y - r) / this.size), y1 = Math.floor((p.y + r) / this.size);
        for (let cy = y0; cy <= y1; cy++)
            for (let cx = x0; cx <= x1; cx++) {
                const c = this.cells.get(this.key(cx, cy));
                if (!c) continue;
                for (const e of c) { const d = Math.hypot(e.p.x - p.x, e.p.y - p.y); if (d <= r) out.push({ ...e, d }); }
            }
        return out;
    }
}

/** Deterministic random numbers (mulberry32). */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
