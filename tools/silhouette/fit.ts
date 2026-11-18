// Least-squares cubic Bezier fitting (Schneider, Graphics Gems 1990): turns a dense polyline into
// few anchors with handles while staying within `tolerance` of it. Sharp corners split the fit so
// they stay sharp.
import type { Anchor, Pt } from '../../src/core/path';

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

type Bez = [Pt, Pt, Pt, Pt];

const bez = (b: Bez, t: number): Pt => {
    const u = 1 - t;
    return { x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x, y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y };
};
const bez1 = (b: Bez, t: number): Pt => {
    const u = 1 - t;
    return add(add(mul(sub(b[1], b[0]), 3 * u * u), mul(sub(b[2], b[1]), 6 * u * t)), mul(sub(b[3], b[2]), 3 * t * t));
};
const bez2 = (b: Bez, t: number): Pt => add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t));

function chordParams(d: Pt[], first: number, last: number): number[] {
    const u = [0];
    for (let i = first + 1; i <= last; i++) u.push(u[i - first - 1] + len(sub(d[i], d[i - 1])));
    const total = u[u.length - 1] || 1;
    return u.map((v) => v / total);
}

function generate(d: Pt[], first: number, last: number, u: number[], t1: Pt, t2: Pt): Bez {
    const p0 = d[first], p3 = d[last];
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i <= last - first; i++) {
        const t = u[i], s = 1 - t;
        const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
        const a1 = mul(t1, b1), a2 = mul(t2, b2);
        c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
        const tmp = sub(d[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
        x0 += dot(a1, tmp); x1 += dot(a2, tmp);
    }
    const det = c00 * c11 - c01 * c01;
    let al = Math.abs(det) > 1e-9 ? (x0 * c11 - x1 * c01) / det : 0;
    let ar = Math.abs(det) > 1e-9 ? (c00 * x1 - c01 * x0) / det : 0;
    const seg = len(sub(p3, p0)), eps = 1e-6 * seg;
    if (al < eps || ar < eps || al > seg * 2 || ar > seg * 2) al = ar = seg / 3;
    return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

function maxError(d: Pt[], first: number, last: number, b: Bez, u: number[]): { err: number; split: number } {
    let err = 0, split = (first + last) >> 1;
    for (let i = first + 1; i < last; i++) {
        const e = len(sub(bez(b, u[i - first]), d[i]));
        if (e > err) { err = e; split = i; }
    }
    return { err, split };
}

function reparam(d: Pt[], first: number, last: number, u: number[], b: Bez): number[] {
    return u.map((t, i) => {
        const p = d[first + i];
        const q = sub(bez(b, t), p), q1 = bez1(b, t), q2 = bez2(b, t);
        const den = dot(q1, q1) + dot(q, q2);
        return Math.abs(den) < 1e-9 ? t : Math.max(0, Math.min(1, t - dot(q, q1) / den));
    });
}

function fitCubic(d: Pt[], first: number, last: number, t1: Pt, t2: Pt, tol: number, out: Bez[], depth = 0): void {
    if (last - first === 1) {
        const dd = len(sub(d[last], d[first])) / 3;
        out.push([d[first], add(d[first], mul(t1, dd)), add(d[last], mul(t2, dd)), d[last]]);
        return;
    }
    let u = chordParams(d, first, last);
    let b = generate(d, first, last, u, t1, t2);
    let { err, split } = maxError(d, first, last, b, u);
    if (err < tol) { out.push(b); return; }
    if (err < tol * 6) {
        for (let i = 0; i < 5; i++) {
            u = reparam(d, first, last, u, b);
            b = generate(d, first, last, u, t1, t2);
            const r = maxError(d, first, last, b, u);
            err = r.err; split = r.split;
            if (err < tol) { out.push(b); return; }
        }
    }
    if (depth > 40) { out.push(b); return; }
    // tangent at the split from its neighbours
    const lo = Math.max(first, split - 2), hi = Math.min(last, split + 2);
    let tc = norm(sub(d[lo], d[hi]));
    if (!isFinite(tc.x) || (tc.x === 0 && tc.y === 0)) tc = norm(sub(d[split - 1], d[split + 1]));
    fitCubic(d, first, split, t1, tc, tol, out, depth + 1);
    fitCubic(d, split, last, mul(tc, -1), t2, tol, out, depth + 1);
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Anchors for a polyline. `cornerDeg`: a turn sharper than this (measured over a few points on each
 * side) is kept as a sharp corner.
 */
export function fitAnchors(raw: Pt[], tol = 1.2, cornerDeg = 42): Anchor[] {
    const d = raw.filter((p, i) => i === 0 || len(sub(p, raw[i - 1])) > 0.05);
    if (d.length < 2) return d.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
    if (d.length === 2) return d.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
    // corners: turning angle between the directions a few px before and after
    const acc = [0];
    for (let i = 1; i < d.length; i++) acc.push(acc[i - 1] + len(sub(d[i], d[i - 1])));
    const total = acc[acc.length - 1];
    const W = 7;
    const turn = new Float32Array(d.length);
    for (let i = 1; i < d.length - 1; i++) {
        let a = i, b = i;
        while (a > 0 && acc[i] - acc[a] < W) a--;
        while (b < d.length - 1 && acc[b] - acc[i] < W) b++;
        const v1 = norm(sub(d[i], d[a])), v2 = norm(sub(d[b], d[i]));
        turn[i] = (Math.acos(Math.max(-1, Math.min(1, dot(v1, v2)))) * 180) / Math.PI;
    }
    const corners = [0];
    for (let i = 1; i < d.length - 1; i++) {
        if (turn[i] < cornerDeg) continue;
        // local maximum of the turn, away from the ends and from the previous corner
        let isMax = true;
        for (let j = Math.max(1, i - 4); j <= Math.min(d.length - 2, i + 4); j++) if (turn[j] > turn[i]) { isMax = false; break; }
        if (isMax && acc[i] > 5 && total - acc[i] > 5 && acc[i] - acc[corners[corners.length - 1]] > 5) corners.push(i);
    }
    corners.push(d.length - 1);
    const out: Anchor[] = [{ x: r1(d[0].x), y: r1(d[0].y) }];
    for (let c = 0; c < corners.length - 1; c++) {
        const first = corners[c], last = corners[c + 1];
        const k = Math.min(3, last - first);
        const t1 = norm(sub(d[first + k], d[first])), t2 = norm(sub(d[last - k], d[last]));
        const pieces: Bez[] = [];
        fitCubic(d, first, last, t1, t2, tol, pieces);
        for (const b of pieces) {
            const prev = out[out.length - 1];
            const straight = len(sub(b[1], b[0])) < 0.3 && len(sub(b[2], b[3])) < 0.3;
            if (!straight) prev.out = { x: r1(b[1].x), y: r1(b[1].y) };
            const a: Anchor = { x: r1(b[3].x), y: r1(b[3].y) };
            if (!straight) a.in = { x: r1(b[2].x), y: r1(b[2].y) };
            out.push(a);
        }
    }
    // straight pieces: drop handles that lie on the chord
    for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], b = out[i + 1];
        if (!a.out || !b.in) continue;
        const ab = sub(b, a), l = len(ab) || 1;
        const off = (p: Pt) => Math.abs((p.x - a.x) * ab.y - (p.y - a.y) * ab.x) / l;
        if (off(a.out) < 0.25 && off(b.in) < 0.25) { delete a.out; delete b.in; }
    }
    return out;
}
