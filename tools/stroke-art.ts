// Stroke-style drawings for chapter 4, made to research/image_requirement.md: every stroke is a
// future line; most stroke ends start or stop exactly ON another stroke (a branch starts on its host
// at 20-40% / 60-80% of the host's length; a bridge joins two strokes), the rest end in open space.
// Three weights: main / detail / fine. Portrait canvas 400 x 520 (height / width = 1.3).
// Used by tools/build-chapter4.ts, which writes art/chapter-4/*.svg and builds the levels.

export interface P { x: number; y: number }
export type Weight = 'main' | 'detail' | 'fine';
export interface St { ctrl: P[]; w: Weight; pts: P[]; acc: number[] }
export const W = 400, H = 520, CX = W / 2;
export const WIDTH: Record<Weight, number> = { main: 5, detail: 3.5, fine: 2.5 };

const add = (a: P, b: P, k = 1): P => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const rot = (a: P, deg: number): P => { const r = (deg * Math.PI) / 180; return { x: a.x * Math.cos(r) - a.y * Math.sin(r), y: a.x * Math.sin(r) + a.y * Math.cos(r) }; };
export const pt = (x: number, y: number): P => ({ x, y });

/** Cubic Bezier segments of a Catmull-Rom curve through the control points. */
function segments(c: P[]): [P, P, P, P][] {
    const out: [P, P, P, P][] = [];
    for (let i = 0; i < c.length - 1; i++) {
        const p0 = c[i], p1 = c[i + 1], pm = c[i - 1] ?? p0, pn = c[i + 2] ?? p1;
        out.push([p0, add(p0, sub(p1, pm), 1 / 6), add(p1, sub(pn, p0), -1 / 6), p1]);
    }
    return out;
}
const bez = (s: [P, P, P, P], t: number): P => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x, y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y };
};

export function mk(ctrl: P[], w: Weight = 'main'): St {
    const pts: P[] = [ctrl[0]];
    for (const s of segments(ctrl)) for (let k = 1; k <= 32; k++) pts.push(bez(s, k / 32));
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])));
    return { ctrl, w, pts, acc };
}

/** Point, unit tangent and unit normal at arc fraction t of a stroke. */
export function at(s: St, t: number): { p: P; tan: P; nrm: P } {
    const L = s.acc[s.acc.length - 1], target = Math.max(0, Math.min(1, t)) * L;
    let i = 1;
    while (i < s.acc.length - 1 && s.acc[i] < target) i++;
    const f = (target - s.acc[i - 1]) / ((s.acc[i] - s.acc[i - 1]) || 1);
    const p = add(s.pts[i - 1], sub(s.pts[i], s.pts[i - 1]), f);
    const tan = unit(sub(s.pts[Math.min(s.pts.length - 1, i + 2)], s.pts[Math.max(0, i - 3)]));
    return { p, tan, nrm: { x: -tan.y, y: tan.x } };
}

/** Closest point of a stroke to q. */
export function near(s: St, q: P): P {
    let best = s.pts[0], bd = Infinity;
    for (const p of s.pts) { const d = len(sub(p, q)); if (d < bd) { bd = d; best = p; } }
    return best;
}

/**
 * A stroke that starts ON `host` at fraction t and leaves it at `angle` degrees from the host's
 * direction (positive = to the host's left), `length` long, bent by `bend` (fraction of length).
 */
export function branch(host: St, t: number, angle: number, length: number, bend = 0.15, w: Weight = 'detail'): St {
    const b = at(host, t);
    const d = rot(b.tan, -angle);
    const end = add(b.p, d, length);
    const mid = add(add(b.p, d, length * 0.5), { x: -d.y, y: d.x }, bend * length);
    return mk([b.p, mid, end], w);
}

/** A stroke from `a` at fraction ta to `b` at fraction tb (both ends ON strokes), bent by `bend`. */
export function bridge(a: St, ta: number, b: St, tb: number, bend = 0.12, w: Weight = 'detail'): St {
    const p = at(a, ta).p, q = at(b, tb).p, d = sub(q, p);
    return mk([p, add(add(p, d, 0.5), { x: -d.y, y: d.x }, bend), q], w);
}

/** From `a` at fraction ta through the given points, ending ON the closest point of `b` to the last one. */
export function reach(a: St, ta: number, via: P[], b: St, w: Weight = 'detail'): St {
    const p = at(a, ta).p;
    return mk([p, ...via.slice(0, -1), near(b, via[via.length - 1])], w);
}

/** From `a` at fraction ta through the given points (last point = free tip). */
export function from(a: St, ta: number, via: P[], w: Weight = 'detail'): St {
    return mk([at(a, ta).p, ...via], w);
}

export const mirror = (s: St): St => mk(s.ctrl.map((p) => ({ x: 2 * CX - p.x, y: p.y })), s.w);

export function toSvg(strokes: St[], title: string): string {
    const f = (v: number) => Math.round(v * 10) / 10;
    const body = strokes.map((s) => {
        const segs = segments(s.ctrl);
        const d = `M${f(segs[0][0].x)} ${f(segs[0][0].y)}` + segs.map((g) => ` C${f(g[1].x)} ${f(g[1].y)} ${f(g[2].x)} ${f(g[2].y)} ${f(g[3].x)} ${f(g[3].y)}`).join('');
        return `  <path d="${d}"${s.w === 'main' ? '' : ` stroke-width="${WIDTH[s.w]}"`}/>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" stroke="#222" stroke-width="${WIDTH.main}" stroke-linecap="round" stroke-linejoin="round">\n  <!-- ${title}. One path = one line. Drawn to research/image_requirement.md. -->\n${body}\n</svg>\n`;
}

/** The numbers of research/image_requirement.md for a drawing (in drawing units). */
export function measure(strokes: St[]) {
    const ends: { onLine: boolean; frac: number; tipToTip: boolean; clear: number }[] = [];
    strokes.forEach((s, i) => {
        for (const e of [s.pts[0], s.pts[s.pts.length - 1]]) {
            let best = Infinity, frac = 0, host = -1, k = -1;
            strokes.forEach((o, j) => {
                if (j === i) return;
                // Distance to each segment of the other stroke (ends often sit between samples).
                for (let idx = 1; idx < o.pts.length; idx++) {
                    const a = o.pts[idx - 1], b = o.pts[idx], ab = sub(b, a), L2 = ab.x * ab.x + ab.y * ab.y || 1;
                    const u = Math.max(0, Math.min(1, ((e.x - a.x) * ab.x + (e.y - a.y) * ab.y) / L2));
                    const d = len(sub(add(a, ab, u), e));
                    if (d < best) { best = d; host = j; k = idx; }
                }
            });
            if (host >= 0) { const o = strokes[host]; frac = o.acc[k] / o.acc[o.acc.length - 1]; }
            const onLine = best < 1.2;
            ends.push({ onLine, frac, tipToTip: onLine && (frac < 0.06 || frac > 0.94), clear: best });
        }
    });
    let crossings = 0;
    const seg = (a: P, b: P, c: P, d: P) => { const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
    for (let i = 0; i < strokes.length; i++)
        for (let j = i + 1; j < strokes.length; j++) {
            const A = strokes[i].pts, B = strokes[j].pts;
            for (let a = 4; a < A.length - 2; a += 2)
                for (let b = 4; b < B.length - 2; b += 2) if (seg(A[a - 2], A[a], B[b - 2], B[b])) crossings++;
        }
    const on = ends.filter((e) => e.onLine), free = ends.filter((e) => !e.onLine);
    const xs = strokes.flatMap((s) => s.pts.map((p) => p.x)), ys = strokes.flatMap((s) => s.pts.map((p) => p.y));
    return {
        strokes: strokes.length,
        onLine: on.length / ends.length,
        free: free.length / ends.length,
        tipToTip: on.filter((e) => e.tipToTip).length / ends.length,
        hostMiddle: on.filter((e) => Math.min(e.frac, 1 - e.frac) >= 0.15).length / Math.max(1, on.length),
        tightFree: free.filter((e) => e.clear < 14).length,
        crossingsPerStroke: crossings / strokes.length,
        weights: { main: strokes.filter((s) => s.w === 'main').length, detail: strokes.filter((s) => s.w === 'detail').length, fine: strokes.filter((s) => s.w === 'fine').length },
        aspect: (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
    };
}
