// Line-art tracing: ink mask -> 1px skeleton (Zhang-Suen) -> pixel chains.
// Works on a plain mask so it can run without a DOM.
import { Pt } from './path';

export interface Mask {
    w: number;
    h: number;
    /** 1 = ink */
    data: Uint8Array;
}

/** Dark, opaque pixels become ink. */
export function maskFromRGBA(rgba: Uint8ClampedArray, w: number, h: number, threshold = 140): Mask {
    const data = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const a = rgba[i * 4 + 3];
        const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
        data[i] = a > 128 && lum < threshold ? 1 : 0;
    }
    return { w, h, data };
}

export function thin(mask: Mask): Mask {
    const { w, h } = mask;
    const img = mask.data.slice();
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
    let changed = true;
    const del: number[] = [];
    while (changed) {
        changed = false;
        for (let pass = 0; pass < 2; pass++) {
            del.length = 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (!img[y * w + x]) continue;
                    const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
                    const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
                    const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                    if (b < 2 || b > 6) continue;
                    const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
                    let a = 0;
                    for (let i = 0; i < 8; i++) if (!seq[i] && seq[i + 1]) a++;
                    if (a !== 1) continue;
                    if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
                    del.push(y * w + x);
                }
            }
            if (del.length) changed = true;
            for (const i of del) img[i] = 0;
        }
    }
    return { w, h, data: img };
}

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAG: [number, number, number, number][] = [
    // diagonal dx,dy and the indices of the two 4-neighbours that would make it redundant
    [1, -1, 0, 1], [1, 1, 1, 2], [-1, 1, 2, 3], [-1, -1, 3, 0]
];

/** Skeleton neighbours; a diagonal counts only when no 4-neighbour already bridges it. */
function neighbours(sk: Mask, x: number, y: number): number[] {
    const { w, h, data } = sk;
    const on = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && data[yy * w + xx] === 1;
    const out: number[] = [];
    const four = N4.map(([dx, dy]) => on(x + dx, y + dy));
    N4.forEach(([dx, dy], i) => { if (four[i]) out.push((y + dy) * w + x + dx); });
    for (const [dx, dy, i, j] of DIAG) if (on(x + dx, y + dy) && !four[i] && !four[j]) out.push((y + dy) * w + x + dx);
    return out;
}

/** Splits a skeleton into chains of pixels between endpoints / junctions (loops included). */
export function chains(sk: Mask, minLength = 6): Pt[][] {
    const { w, data } = sk;
    const nb = new Map<number, number[]>();
    for (let i = 0; i < data.length; i++) if (data[i]) nb.set(i, neighbours(sk, i % w, (i / w) | 0));
    const isNode = (i: number) => nb.get(i)!.length !== 2;
    const usedEdge = new Set<string>();
    const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const visited = new Uint8Array(data.length);
    const out: number[][] = [];

    const walk = (start: number, next: number) => {
        const chain = [start, next];
        usedEdge.add(key(start, next));
        visited[start] = visited[next] = 1;
        let prev = start, cur = next;
        while (!isNode(cur)) {
            const n = nb.get(cur)!.find((k) => k !== prev && !usedEdge.has(key(cur, k)));
            if (n === undefined) break;
            usedEdge.add(key(cur, n));
            chain.push(n);
            visited[n] = 1;
            prev = cur; cur = n;
            if (cur === start) break;
        }
        out.push(chain);
    };

    for (const [i, ns] of nb) if (isNode(i)) for (const n of ns) if (!usedEdge.has(key(i, n))) walk(i, n);
    for (const [i, ns] of nb) if (!visited[i] && ns.length === 2) walk(i, ns[0]);

    return out
        .filter((c) => c.length >= minLength)
        .map((c) => c.map((i) => ({ x: i % w, y: (i / w) | 0 })));
}

export interface Stroke {
    pts: Pt[];
    closed: boolean;
    /** Smooth before use (true for pixel-traced lines; vector strokes keep their exact shape). */
    smooth?: boolean;
    /** Big dots on this stroke's pair (SVG: data-big="1"): an accent or a big blocker. */
    big?: boolean;
    /**
     * Line weight from the SVG stroke-width, relative to the drawing's main width: 1 = main line,
     * about 0.7 = detail, 0.5 = fine detail. Sets the dot size (and so the line width) in stroke mode.
     */
    weight?: number;
}

/**
 * Joins traced chains into strokes: at each junction, chain ends that continue in the same
 * direction (an X crossing, or the straight part of a T) are linked; an end with no partner
 * stays a stroke end (the stem of a T). Chains linked into a ring become closed strokes.
 */
export function strokesFromChains(chs: Pt[][], joinRadius = 5): Stroke[] {
    type End = { c: number; e: 0 | 1; p: Pt; dir: Pt };
    const ends: End[] = [];
    const dirAt = (c: Pt[], e: 0 | 1): Pt => {
        const a = e === 0 ? c[0] : c[c.length - 1];
        const k = Math.min(c.length - 1, 8);
        const b = e === 0 ? c[k] : c[c.length - 1 - k];
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    };
    chs.forEach((c, i) => {
        ends.push({ c: i, e: 0, p: c[0], dir: dirAt(c, 0) });
        ends.push({ c: i, e: 1, p: c[c.length - 1], dir: dirAt(c, 1) });
    });
    // Cluster ends that meet at the same junction.
    const cluster = ends.map((_, i) => i);
    const find = (i: number): number => (cluster[i] === i ? i : (cluster[i] = find(cluster[i])));
    for (let i = 0; i < ends.length; i++)
        for (let j = i + 1; j < ends.length; j++)
            if (Math.hypot(ends[i].p.x - ends[j].p.x, ends[i].p.y - ends[j].p.y) <= joinRadius) cluster[find(i)] = find(j);
    // Two junctions joined by a very short chain are one crossing that thick ink (a filled nose in
    // the middle of an "x") split in two: the short chain is dropped and the two junctions become
    // one, so the lines go straight through it (each arm with the opposite one).
    const BRIDGE = 14; // about 1.5 line widths of a typical traced drawing (600 px)
    const bridged = new Uint8Array(chs.length);
    {
        const members = new Map<number, number[]>();
        ends.forEach((_, i) => { const r = find(i); members.set(r, [...(members.get(r) ?? []), i]); });
        const merged = new Set<number>();
        chs.forEach((c, ci) => {
            if (c.length > BRIDGE) return;
            const a = find(ci * 2), b = find(ci * 2 + 1);
            // Both ends at a real junction (2+ other lines there), two different junctions, each merged
            // once at most (a dense knot of junctions is left alone), and the merged one stays small.
            if (a === b || merged.has(a) || merged.has(b)) return;
            const ma = members.get(a) ?? [], mb = members.get(b) ?? [];
            if (ma.length < 3 || mb.length < 3) return;
            const pts = [...ma, ...mb].filter((i) => ends[i].c !== ci).map((i) => ends[i].p);
            if (pts.some((p) => pts.some((q) => Math.hypot(p.x - q.x, p.y - q.y) > 2 * BRIDGE))) return;
            bridged[ci] = 1;
            merged.add(a); merged.add(b);
            cluster[a] = b;
        });
    }
    const groups = new Map<number, number[]>();
    ends.forEach((_, i) => { if (bridged[ends[i].c]) return; const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });

    // Link the most opposite directions first (straight continuation). The ink is continuous at a
    // junction, so the line goes on through it where it can: two ends meeting at a corner are one
    // line (unless the corner is a sharp spike), and where three lines meet (a "Y") the two that
    // turn the least go on as one line and the third ends on it. This leaves one dot at a junction
    // instead of a clump of two or three.
    const link = new Map<number, number>();
    for (const g of groups.values()) {
        const cand: [number, number, number][] = [];
        const limit = g.length === 2 ? 0.5 : -0.17;
        for (let a = 0; a < g.length; a++)
            for (let b = a + 1; b < g.length; b++) {
                const d = ends[g[a]].dir.x * ends[g[b]].dir.x + ends[g[a]].dir.y * ends[g[b]].dir.y;
                if (d < limit && ends[g[a]].c !== ends[g[b]].c) cand.push([d, g[a], g[b]]);
                else if (d < -0.5) cand.push([d, g[a], g[b]]);
            }
        cand.sort((x, y) => x[0] - y[0]);
        for (const [, a, b] of cand) if (!link.has(a) && !link.has(b)) { link.set(a, b); link.set(b, a); }
    }

    const endIndex = (c: number, e: 0 | 1) => c * 2 + e;
    // Ends meeting at a real junction (3+ ends): the skeleton pixels next to it are pulled towards
    // the other branches. Joining two chains there as they are leaves a little step in the line, so
    // those pixels are dropped on both sides and the gap becomes a straight bridge.
    const junction = new Uint8Array(ends.length);
    for (const g of groups.values()) if (g.length >= 3) for (const i of g) junction[i] = 1;
    const TRIM = 4;
    const used = new Uint8Array(chs.length);
    bridged.forEach((b, ci) => { if (b) used[ci] = 1; }); // dropped bridges are never walked
    const out: Stroke[] = [];
    const walk = (startC: number, startE: 0 | 1): Stroke => {
        const pts: Pt[] = [];
        let c = startC, e = startE, closed = false, viaJunction = false;
        for (;;) {
            used[c] = 1;
            const seq = e === 0 ? chs[c] : [...chs[c]].reverse();
            const spare = Math.max(0, Math.floor(seq.length / 2) - 1);
            const other = endIndex(c, e === 0 ? 1 : 0);
            const nxt = link.get(other);
            const from = !pts.length ? 0 : viaJunction ? Math.min(TRIM, spare) : pts[pts.length - 1].x === seq[0].x && pts[pts.length - 1].y === seq[0].y ? 1 : 0;
            const to = seq.length - (nxt !== undefined && junction[other] ? Math.min(TRIM, spare) : 0);
            pts.push(...seq.slice(from, to));
            if (nxt === undefined) break;
            viaJunction = !!junction[other];
            const nc = ends[nxt].c, ne = ends[nxt].e;
            if (used[nc]) {
                closed = nc === startC && ne === startE;
                // A ring closing through a junction: trim its first pixels as well.
                if (closed && viaJunction) pts.splice(0, Math.min(TRIM, Math.max(0, Math.floor(chs[startC].length / 2) - 1)));
                break;
            }
            c = nc; e = ne;
        }
        return { pts, closed, smooth: true };
    };
    for (let i = 0; i < ends.length; i++) {
        const { c, e } = ends[i];
        if (!used[c] && !link.has(i)) out.push(walk(c, e));
    }
    for (let c = 0; c < chs.length; c++) if (!used[c]) out.push(walk(c, 0));
    return out;
}

export interface Blob { x: number; y: number; r: number }

/**
 * Filled round details (solid eyes, noses, buttons). Finds them, ERASES them from the mask (so
 * thinning does not turn them into scraps of line) and returns them. Two kinds:
 *  - a compact filled shape standing on its own (not touching any line): small ones only have to
 *    be compact (a little triangle nose), bigger ones must be a real disc or oval;
 *  - a round ball much thicker than the drawing's lines, sitting on a line or at its end. Thick
 *    places that are not balls (where several lines meet, the wide end of a brush stroke) are left
 *    alone: around a ball there is only white and one or two thin lines.
 * Nothing bigger than `maxR` (default 9% of the long side) is touched.
 */
export function takeBlobs(mask: Mask, maxR = Math.max(mask.w, mask.h) * 0.09): Blob[] {
    const { w, h, data } = mask;
    const ink = data.slice();
    const small = Math.max(w, h) * 0.04;
    const out: Blob[] = [];
    const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    /** Connected components (8-neighbours) of the pixels accepted by `inside`. */
    const components = (inside: (i: number) => boolean) => {
        const seen = new Uint8Array(w * h);
        const comps: { px: number[]; x0: number; y0: number; x1: number; y1: number }[] = [];
        for (let i = 0; i < w * h; i++) {
            if (seen[i] || !inside(i)) continue;
            const c = { px: [] as number[], x0: w, y0: h, x1: 0, y1: 0 };
            const stack = [i];
            seen[i] = 1;
            while (stack.length) {
                const k = stack.pop()!, x = k % w, y = (k / w) | 0;
                c.px.push(k);
                c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
                for (const [dx, dy] of N8) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const j = ny * w + nx;
                    if (!seen[j] && inside(j)) { seen[j] = 1; stack.push(j); }
                }
            }
            comps.push(c);
        }
        return comps;
    };
    /** Ink on a circle around (cx, cy): share of the circle that is ink, number of separate ink arcs, and the longest of them (px). */
    const ring = (cx: number, cy: number, rr: number) => {
        const n = Math.max(48, Math.round(2 * Math.PI * rr));
        const on: boolean[] = [];
        for (let k = 0; k < n; k++) {
            const x = Math.round(cx + rr * Math.cos((k / n) * 2 * Math.PI)), y = Math.round(cy + rr * Math.sin((k / n) * 2 * Math.PI));
            on.push(x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x] === 1);
        }
        const count = on.filter(Boolean).length;
        if (count === n) return { share: 1, arcs: 1, longest: 2 * Math.PI * rr };
        // Start on a white sample so that no arc is split by the start of the circle.
        const start = on.indexOf(false);
        let arcs = 0, run = 0, longest = 0;
        for (let k = 1; k <= n; k++) {
            if (on[(start + k) % n]) { if (!run) arcs++; run++; if (run > longest) longest = run; } else run = 0;
        }
        return { share: count / n, arcs, longest: (longest * 2 * Math.PI * rr) / n };
    };
    /** Chamfer distance from every ink pixel to the background (0 on the background). */
    const distanceField = () => {
        const d = new Float32Array(w * h);
        const INF = 1e6, D1 = 1, D2 = Math.SQRT2;
        for (let i = 0; i < w * h; i++) d[i] = data[i] ? INF : 0;
        const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!d[i]) continue;
            d[i] = Math.min(d[i], at(x - 1, y) + D1, at(x, y - 1) + D1, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
        }
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (!d[i]) continue;
            d[i] = Math.min(d[i], at(x + 1, y) + D1, at(x, y + 1) + D1, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
        }
        return d;
    };
    // A. Compact filled shapes standing on their own.
    const solid = distanceField();
    for (const c of components((i) => data[i] === 1)) {
        const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, r = Math.sqrt(bw * bh) / 2;
        if (Math.max(bw, bh) > 2 * maxR || Math.min(bw, bh) < 5) continue;
        const aspect = Math.max(bw, bh) / Math.min(bw, bh), fill = c.px.length / (bw * bh);
        // Bigger shapes must be a disc or an oval (a disc fills 79% of its box), not just compact.
        if (r > small ? aspect > 1.4 || fill < 0.68 || fill > 0.88 : aspect > 1.8 || fill < 0.45) continue;
        // And solid: the widest point inside is a good part of the shape's width (a dot, an eye). A
        // cluster of thick strokes that only fills its box (a nose with a mouth drawn as "x") is not.
        let core = 0;
        for (const k of c.px) if (solid[k] > core) core = solid[k];
        if (core < 0.4 * (Math.min(bw, bh) / 2)) continue;
        for (const k of c.px) data[k] = 0;
        out.push({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, r });
    }
    // B. Round bulges on the lines: distance to the background, then cores far thicker than a line.
    const dist = distanceField();
    // Typical half-width of a line = median of the ridge (local maxima) of the distance.
    const ridge: number[] = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const d = dist[y * w + x];
        if (d < 1) continue;
        let top = true;
        for (const [dx, dy] of N8) if (dist[(y + dy) * w + x + dx] > d) { top = false; break; }
        if (top) ridge.push(d);
    }
    if (!ridge.length) return out;
    ridge.sort((a, b) => a - b);
    const half = ridge[ridge.length >> 1];
    const T = 2.4 * half + 1;
    for (const c of components((i) => dist[i] >= T)) {
        const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
        const hw = bw / 2 + T - 0.5, hh = bh / 2 + T - 0.5, r = Math.sqrt(hw * hh);
        if (r > maxR || Math.max(hw, hh) / Math.min(hw, hh) > 1.7 || c.px.length / (bw * bh) < 0.55) continue;
        const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
        // A ball has white around it, except for one or two thin lines.
        const around = ring(cx, cy, Math.max(hw, hh) + Math.max(2.5, 0.35 * r));
        // (A thick end of a brush stroke is ruled out: what leaves a ball is as thin as a line.)
        if (around.share > 0.25 || around.arcs > 2 || around.longest > 3.2 * half + 1.5) continue;
        for (let y = Math.max(0, Math.floor(cy - hh - 2)); y <= Math.min(h - 1, Math.ceil(cy + hh + 2)); y++)
            for (let x = Math.max(0, Math.floor(cx - hw - 2)); x <= Math.min(w - 1, Math.ceil(cx + hw + 2)); x++)
                if (((x - cx) / (hw + 1.5)) ** 2 + ((y - cy) / (hh + 1.5)) ** 2 <= 1) data[y * w + x] = 0;
        out.push({ x: cx, y: cy, r });
    }
    return out;
}

/**
 * Line art (RGBA pixels) -> strokes, the same way for the editor and the build tools:
 * filled round details become small circles (stroke mode turns circles into big dots), lines are
 * thinned and joined into strokes, and scraps shorter than 4% of the long side (fur, hatching,
 * specks) are dropped: they are shorter than any line worth playing.
 */
export function traceImage(rgba: Uint8ClampedArray, w: number, h: number): Stroke[] {
    const mask = maskFromRGBA(rgba, w, h);
    const blobs = takeBlobs(mask);
    const strokes = strokesFromChains(chains(thin(mask), 8));
    const minLen = 0.04 * Math.max(w, h);
    const length = (s: Stroke) => s.pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - s.pts[i - 1].x, p.y - s.pts[i - 1].y) : 0), 0);
    const out = strokes.filter((s) => length(s) >= (s.closed ? 12 : minLen));
    for (const b of blobs)
        out.push({ pts: Array.from({ length: 25 }, (_, k) => ({ x: b.x + b.r * Math.cos((k / 24) * Math.PI * 2), y: b.y + b.r * Math.sin((k / 24) * Math.PI * 2) })), closed: true });
    return out;
}
