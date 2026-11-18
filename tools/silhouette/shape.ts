// The shape of a silhouette at a given world scale: where lines may go.
//   - contour loops: the outline of every thick black part, inset by half a line width so the
//     stroke sits exactly inside the edge;
//   - thin strokes: centre lines of the parts too thin for two contour lines (whiskers, wires);
//   - distance fields to keep every other line inside the black.
import type { Pt } from '../../src/core/path';
import { chains, strokesFromChains, thin } from '../../src/core/trace';
import { Mask, components, edt, isoLoops, sample, signedDistance } from './raster';
import { Grid, lengths, resample, signedArea, smooth } from './geom';

/** Centre of a contour line: this far inside the edge (half the 7 px line + 1 px margin). */
export const INSET = 4.5;
/** Parts with a half-width under this get one centre line instead of two contour lines. */
export const THIN_HALF = 7;
/** A thin part must stick out at least this far to count (shorter = a corner tip). */
const THIN_MIN_EXTENT = 12;
/** Canvas of the art (units). */
export const ART = 400;

export interface Loop {
    /** Closed polyline (first point repeated at the end), world px. */
    pts: Pt[];
    acc: number[];
    len: number;
    /** True when it goes around a white hole. */
    hole: boolean;
    /** Black component it belongs to (label of the mask). */
    comp: number;
    /** Per sample: 1 where a dot may sit (no other stretch of contour within reach). */
    wide: Uint8Array;
    wideLen: number;
}

export interface ThinStroke {
    pts: Pt[];
    closed: boolean;
}

export interface Shape {
    k: number;
    n: number;
    /** World px per mask pixel. */
    px: number;
    /** Signed distance to the edge of the whole silhouette (world px, + inside). */
    sdFull: Float32Array;
    /** Signed distance to the edge of the thick part (thin parts removed). */
    sd: Float32Array;
    loops: Loop[];
    thin: ThinStroke[];
    /** Number of components drawn as centre lines because they are tubes. */
    tubes: number;
    /** Black area (world px²) and bounding box of the black (world px). */
    area: number;
    box: { x0: number; y0: number; x1: number; y1: number };
    toMask(p: Pt): Pt;
    toWorld(p: Pt): Pt;
    /** Inside distance of the thick part at a world point. */
    d(p: Pt): number;
    dFull(p: Pt): number;
}

/** Marks, for every loop sample, whether a dot could sit there without also touching another stretch of contour. */
export function markWide(loops: Loop[], clear: number): void {
    const grid = new Grid<{ l: number; s: number }>(clear + 2);
    loops.forEach((l, li) => { for (let i = 0; i < l.pts.length - 1; i++) grid.add(l.pts[i], { l: li, s: l.acc[i] }); });
    loops.forEach((l, li) => {
        l.wide = new Uint8Array(l.pts.length);
        let wideLen = 0;
        for (let i = 0; i < l.pts.length; i++) {
            let narrow = false;
            for (const h of grid.near(l.pts[i], clear)) {
                if (h.v.l !== li) { narrow = true; break; }
                const ds = Math.abs(h.v.s - l.acc[i]);
                if (Math.min(ds, l.len - ds) > clear * 2.2) { narrow = true; break; }
            }
            l.wide[i] = narrow ? 0 : 1;
            if (!narrow && i > 0) wideLen += l.acc[i] - l.acc[i - 1];
        }
        l.wideLen = wideLen;
    });
}

export function buildShape(mask: Mask, k: number, clear = 28.7): Shape {
    const { n } = mask;
    const S = n / ART, px = k / S;
    const toWorld = (p: Pt): Pt => ({ x: ((p.x + 0.5) / S - ART / 2) * k, y: ((p.y + 0.5) / S - ART / 2) * k });
    const toMask = (p: Pt): Pt => ({ x: (p.x / k + ART / 2) * S - 0.5, y: (p.y / k + ART / 2) * S - 0.5 });

    const sdFull = signedDistance(mask);
    for (let i = 0; i < sdFull.length; i++) sdFull[i] *= px;
    const { labels: compOf, comps } = components(mask.data, n, 1);

    /** Black that an opening by `half` does not reach and that sticks out far enough: the thin parts. */
    const thinFor = (half: number): Uint8Array => {
        const notCore = new Uint8Array(n * n);
        for (let i = 0; i < notCore.length; i++) notCore[i] = sdFull[i] >= half ? 0 : 1;
        const toCore = edt(notCore, n);
        const res = new Uint8Array(n * n);
        for (let i = 0; i < res.length; i++) res[i] = mask.data[i] && toCore[i] * px > half + 1.5 ? 1 : 0;
        const { labels, comps: rc } = components(res, n, 1);
        const extent = new Float32Array(rc.length + 1);
        for (let i = 0; i < labels.length; i++) { const l = labels[i]; if (l) { const e = toCore[i] * px - half; if (e > extent[l]) extent[l] = e; } }
        const out = new Uint8Array(n * n);
        for (let i = 0; i < labels.length; i++) if (labels[i] && extent[labels[i]] >= THIN_MIN_EXTENT) out[i] = 1;
        return out;
    };
    const thinSmall = thinFor(THIN_HALF);
    let thinBig: Uint8Array | null = null;
    /** Half-width under which a tube cannot carry two contour lines with dots on them. */
    const TUBE_HALF = (clear + 2 * INSET) / 2 + 1;
    const tube = new Uint8Array(comps.length + 1);

    const thinMask = new Uint8Array(n * n);
    const thick: Mask = { n, data: new Uint8Array(n * n) };
    let sd = new Float32Array(0);
    let loops: Loop[] = [];
    const build = () => {
        for (let i = 0; i < thinMask.length; i++) {
            const c = compOf[i];
            thinMask[i] = c ? (tube[c] ? thinBig![i] : thinSmall[i]) : 0;
            thick.data[i] = mask.data[i] && !thinMask[i] ? 1 : 0;
        }
        sd = signedDistance(thick);
        for (let i = 0; i < sd.length; i++) sd[i] *= px;
        loops = [];
        for (const raw of isoLoops(sd, n, INSET)) {
            let pts = raw.map(toWorld);
            pts.push({ ...pts[0] });
            if (lengths(pts).pop()! < 12) continue;
            pts = smooth(resample(pts, 2.5), true, 2);
            const acc = lengths(pts);
            const m = toMask(pts[0]);
            // component under the loop: look a little inside the black
            let comp = 0;
            for (let r = 0; r < 6 && !comp; r++) for (let a = 0; a < 8 && !comp; a++) { const x = Math.round(m.x + r * Math.cos(a * 0.785)), y = Math.round(m.y + r * Math.sin(a * 0.785)); if (x >= 0 && y >= 0 && x < n && y < n) comp = compOf[y * n + x]; }
            loops.push({ pts, acc, len: acc[acc.length - 1], hole: signedArea(pts) > 0, comp, wide: new Uint8Array(0), wideLen: 0 });
        }
        markWide(loops, clear);
    };
    build();
    // components with a loop that has no room for dots are tubes: redo them with centre lines
    let again = false;
    for (const l of loops) if (l.comp && !tube[l.comp] && l.len > 60 && l.wideLen < Math.min(l.len * 0.25, 2.5 * clear)) { tube[l.comp] = 1; again = true; }
    if (again) { thinBig = thinFor(TUBE_HALF); build(); }
    let area = 0, x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) { area++; const x = i % n, y = (i / n) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }

    // Centre lines of the thin parts.
    const thinStrokes: ThinStroke[] = [];
    let tx0 = n, ty0 = n, tx1 = -1, ty1 = -1;
    for (let i = 0; i < thinMask.length; i++) if (thinMask[i]) { const x = i % n, y = (i / n) | 0; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
    if (tx1 >= 0) {
        const w = tx1 - tx0 + 3, h = ty1 - ty0 + 3;
        const sub = new Uint8Array(w * h);
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (thinMask[y * n + x]) sub[(y - ty0 + 1) * w + (x - tx0 + 1)] = 1;
        const sk = thin({ w, h, data: sub });
        const minLen = Math.max(6, Math.round(10 / px));
        for (const s of strokesFromChains(chains(sk, minLen), Math.max(3, Math.round(3 / px)))) {
            let pts = s.pts.map((p) => toWorld({ x: p.x + tx0 - 1, y: p.y + ty0 - 1 }));
            if (s.closed) pts.push({ ...pts[0] });
            if (lengths(pts).pop()! < 10) continue;
            pts = smooth(resample(pts, 2.5), s.closed, 3);
            thinStrokes.push({ pts, closed: s.closed });
        }
    }

    const d = (p: Pt) => { const m = toMask(p); return sample(sd, n, m.x, m.y); };
    const dFull = (p: Pt) => { const m = toMask(p); return sample(sdFull, n, m.x, m.y); };
    const c0 = toWorld({ x: x0, y: y0 }), c1 = toWorld({ x: x1, y: y1 });
    return { k, n, px, sdFull, sd, loops, thin: thinStrokes, tubes: tube.reduce((a, b) => a + b, 0), area: area * px * px, box: { x0: c0.x, y0: c0.y, x1: c1.x, y1: c1.y }, toMask, toWorld, d, dFull };
}
