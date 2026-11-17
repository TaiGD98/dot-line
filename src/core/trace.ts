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
    const groups = new Map<number, number[]>();
    ends.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });

    // Link the most opposite directions first (straight continuation).
    const link = new Map<number, number>();
    for (const g of groups.values()) {
        const cand: [number, number, number][] = [];
        for (let a = 0; a < g.length; a++)
            for (let b = a + 1; b < g.length; b++) {
                const d = ends[g[a]].dir.x * ends[g[b]].dir.x + ends[g[a]].dir.y * ends[g[b]].dir.y;
                if (d < -0.5) cand.push([d, g[a], g[b]]);
            }
        cand.sort((x, y) => x[0] - y[0]);
        for (const [, a, b] of cand) if (!link.has(a) && !link.has(b)) { link.set(a, b); link.set(b, a); }
    }

    const endIndex = (c: number, e: 0 | 1) => c * 2 + e;
    const used = new Uint8Array(chs.length);
    const out: Stroke[] = [];
    const walk = (startC: number, startE: 0 | 1): Stroke => {
        const pts: Pt[] = [];
        let c = startC, e = startE, closed = false;
        for (;;) {
            used[c] = 1;
            const seq = e === 0 ? chs[c] : [...chs[c]].reverse();
            pts.push(...(pts.length ? seq.slice(1) : seq));
            const other = endIndex(c, e === 0 ? 1 : 0);
            const nxt = link.get(other);
            if (nxt === undefined) break;
            const nc = ends[nxt].c, ne = ends[nxt].e;
            if (used[nc]) { closed = nc === startC && ne === startE; break; }
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
