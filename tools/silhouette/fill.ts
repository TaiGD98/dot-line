// Builds the ink of a silhouette level: contour loops and thin centre lines from the shape, then a
// fill pattern clipped to the black. Every dot (stroke end) keeps clear of other dots and of ink it
// should not block, so the blocking of the finished level is exactly what the T nodes say.
import type { Pt } from '../../src/core/path';
import { Grid, at, cut, dist, lengths, project, resample, smooth, tangent } from './geom';
import { isoLoops } from './raster';
import { End, Stroke, makeStroke } from './ink';
import { INSET, Shape } from './shape';

export interface Style {
    /** Dot radius of the level. */
    R: number;
    /** Distance between neighbouring fill lines. */
    pitch: number;
    /** Extra room between dots that sit on the same line (default 8). */
    spread?: number;
}

export interface Dims {
    R: number;
    pitch: number;
    /** Two dots never come closer than this. */
    dotGap: number;
    /** A dot closer than this to a line blocks it (plus a safety margin). */
    clear: number;
    minLen: number;
    /** Extra room between two dots on the same host line. */
    spread: number;
}

export const dims = (st: Style): Dims => ({ R: st.R, pitch: st.pitch, dotGap: 2 * st.R + 3, clear: 0.85 * 2 * st.R + 1.5, minLen: 2 * st.R + 10, spread: st.spread ?? 8 });

export type Pattern =
    | { kind: 'stripes'; angle: number }
    | { kind: 'waves'; angle: number; amp: number; wavelength: number }
    | { kind: 'zigzag'; angle: number; amp: number; wavelength: number }
    | { kind: 'ripples'; cx: number; cy: number }
    | { kind: 'rays'; cx: number; cy: number }
    | { kind: 'cross'; angle: number; ratio: number }
    | { kind: 'rings' }
    | { kind: 'bricks'; angle: number }
    | { kind: 'chevrons'; angle: number }
    | { kind: 'none' };

/** Curves of a pattern family over the box of the shape (world px, sampled every 2 px). */
function family(p: Pattern, sh: Shape, pitch: number, phase: number, which = 0): Pt[][] {
    const { x0, y0, x1, y1 } = sh.box;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rad = Math.hypot(x1 - x0, y1 - y0) / 2 + 20;
    const out: Pt[][] = [];
    const along = (ang: number, off: number, wob: (t: number) => number) => {
        const a = (ang * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        const pts: Pt[] = [];
        for (let t = -rad; t <= rad; t += 2) { const w = off + wob(t); pts.push({ x: cx + dx * t + nx * w, y: cy + dy * t + ny * w }); }
        return pts;
    };
    if (p.kind === 'stripes' || p.kind === 'bricks' || p.kind === 'cross' || p.kind === 'chevrons') {
        const ang = p.angle + (which ? 90 : 0);
        const step = which && p.kind === 'cross' ? pitch * p.ratio : pitch;
        if (p.kind === 'chevrons') {
            // V lines: the two arms meet on the axis through the centre
            const a = (p.angle * Math.PI) / 180, ax = Math.cos(a), ay = Math.sin(a), nx = -ay, ny = ax;
            const slope = 0.85;
            for (let off = -rad * 2; off <= rad * 2; off += pitch * Math.hypot(1, slope)) {
                const pts: Pt[] = [];
                for (let u = -rad; u <= rad; u += 2) { const v = off + phase - Math.abs(u) * slope; pts.push({ x: cx + nx * u + ax * v, y: cy + ny * u + ay * v }); }
                out.push(pts);
            }
            return out;
        }
        for (let off = -rad + ((phase % step) + step) % step; off <= rad; off += step) out.push(along(ang, off, () => 0));
        return out;
    }
    if (p.kind === 'waves') {
        for (let off = -rad + phase; off <= rad; off += pitch) out.push(along(p.angle, off, (t) => p.amp * Math.sin((2 * Math.PI * t) / p.wavelength)));
        return out;
    }
    if (p.kind === 'zigzag') {
        const tri = (t: number) => { const u = ((t / p.wavelength) % 1 + 1) % 1; return p.amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u); };
        for (let off = -rad + phase; off <= rad; off += pitch) out.push(along(p.angle, off, tri));
        return out;
    }
    if (p.kind === 'ripples') {
        const fx = x0 + (x1 - x0) * p.cx, fy = y0 + (y1 - y0) * p.cy;
        const far = Math.max(Math.hypot(fx - x0, fy - y0), Math.hypot(fx - x1, fy - y0), Math.hypot(fx - x0, fy - y1), Math.hypot(fx - x1, fy - y1));
        for (let r = pitch * 0.6 + phase; r <= far + pitch; r += pitch) {
            const n = Math.max(24, Math.ceil((2 * Math.PI * r) / 2));
            const pts: Pt[] = [];
            for (let i = 0; i <= n; i++) pts.push({ x: fx + r * Math.cos((2 * Math.PI * i) / n), y: fy + r * Math.sin((2 * Math.PI * i) / n) });
            out.push(pts);
        }
        return out;
    }
    if (p.kind === 'rays') {
        const fx = x0 + (x1 - x0) * p.cx, fy = y0 + (y1 - y0) * p.cy;
        const far = Math.max(Math.hypot(fx - x0, fy - y0), Math.hypot(fx - x1, fy - y0), Math.hypot(fx - x0, fy - y1), Math.hypot(fx - x1, fy - y1));
        // spacing = pitch at 45% of the reach; inner ends start staggered so the centre is not crowded
        const n = Math.max(8, Math.round((2 * Math.PI * far * 0.45) / pitch));
        for (let i = 0; i < n; i++) {
            const a = (2 * Math.PI * (i + phase / pitch)) / n;
            const r0 = (i % 4 === 0 ? 0.6 : i % 2 === 0 ? 1.6 : 3.0) * pitch;
            const pts: Pt[] = [];
            for (let r = r0; r <= far; r += 2) pts.push({ x: fx + r * Math.cos(a), y: fy + r * Math.sin(a) });
            out.push(pts);
        }
        return out;
    }
    return out;
}

interface Cand { pts: Pt[]; e: [EndKind, EndKind]; family: number; row: number }
type EndKind = 'T' | 'tip';

export interface InkInfo {
    base: number;
    thin: number;
    splits: number;
    rungs: number;
    spurs: number;
    /** Pattern strokes with one end pulled back from the outline, to open a loop. */
    pulled: number;
    /** Long thin / outline strokes cut in two to reach the line count (dots side by side). */
    edgeSplits: number;
    loopCuts: number;
    dropped: number;
    loops: number;
}

export interface InkOptions {
    pattern: Pattern;
    style: Style;
    /** Wanted number of lines. */
    target: number;
    /** Wanted share of stroke ends that are free tips. */
    tipShare: number;
    phase: number;
    rand: () => number;
    /** No splits / rungs to reach the target (used when measuring a silhouette). */
    plain?: boolean;
    /** Most pattern strokes to keep (the longest win); default: no limit. */
    maxBase?: number;
    /** Open every closed stroke with a cut only (no rungs or spurs): the first tutorial has no blocking at all. */
    loopsCutOnly?: boolean;
}

export function buildInk(sh: Shape, opt: InkOptions): { strokes: Stroke[]; info: InkInfo } {
    const D = dims(opt.style);
    const { rand } = opt;
    const info: InkInfo = { base: 0, thin: 0, splits: 0, rungs: 0, spurs: 0, pulled: 0, edgeSplits: 0, loopCuts: 0, dropped: 0, loops: 0 };
    const strokes: Stroke[] = [];
    let nextId = 0;
    const tipClear = D.clear + 0.5;

    // ---- hosts: contour loops
    const MIN_LOOP = D.dotGap + D.minLen + 4;
    const smallR = Math.max(7, Math.round(D.R * 0.6));
    const smallLoops: typeof sh.loops = [];
    for (const l of sh.loops) {
        // a small hole is left without an outline (lines still keep off it); a small part keeps its outline
        if (l.len < (l.hole ? 4.2 * D.dotGap : 2 * (2 * smallR + 3) + 8)) { info.dropped++; continue; }
        if (!l.hole && l.len < 3.6 * D.dotGap) { smallLoops.push(l); continue; }
        strokes.push(makeStroke(nextId++, l.pts, true, 'contour'));
        info.loops++;
    }
    // ink index: every accepted stroke's samples
    // (a stroke that changes shape is added again with a new generation; older entries are ignored)
    const inkAll = new Grid<{ id: number; s: number; gen: number }>(D.clear + 4);
    const inkGen = new Map<number, number>();
    const addInk = (s: Stroke) => {
        const gen = (inkGen.get(s.id) ?? 0) + 1;
        inkGen.set(s.id, gen);
        for (let i = 0; i < s.pts.length; i++) inkAll.add(s.pts[i], { id: s.id, s: s.acc[i], gen });
    };
    const ink = { near: (p: Pt, r: number) => inkAll.near(p, r).filter((h) => h.v.gen === inkGen.get(h.v.id)) };
    strokes.forEach(addInk);
    const byId = (id: number) => strokes.find((s) => s.id === id)!;
    const dots: Pt[] = [];
    /** Stroke that owns each dot (the stroke whose end it is). */
    const dotStroke: number[] = [];
    const dotGrid = new Grid<number>(D.dotGap + 4);
    const dotDead: boolean[] = [];
    const addDot = (p: Pt, stroke = -1) => { dotGrid.add(p, dots.length); dots.push(p); dotStroke.push(stroke); dotDead.push(false); };
    const retireDot = (p: Pt) => { for (const h of dotGrid.near(p, 0.6)) dotDead[h.v] = true; };
    /** Strokes that have a dot within reach of this stroke's ink (they block it). */
    const blockersOf = (st: Stroke): Set<number> => {
        const out = new Set<number>();
        for (let i = 0; i < st.pts.length; i += 2) for (const h of dotGrid.near(st.pts[i], D.clear)) if (!dotDead[h.v] && dotStroke[h.v] !== st.id && dotStroke[h.v] >= 0) out.add(dotStroke[h.v]);
        return out;
    };
    /** Strokes whose ink a dot at p would touch. */
    const touched = (p: Pt, self: number, reach = D.clear): Set<number> => {
        const out = new Set<number>();
        for (const h of ink.near(p, reach)) if (h.v.id !== self) out.add(h.v.id);
        return out;
    };
    /** Strokes that block `id`, directly or through others (by the dots placed so far). */
    const ancestors = (id: number): Set<number> => {
        const out = new Set<number>();
        const stack = [...blockersOf(strokes.find((s) => s.id === id)!)];
        while (stack.length) {
            const x = stack.pop()!;
            if (out.has(x) || x === id) continue;
            out.add(x);
            const st = strokes.find((s) => s.id === x);
            if (st) for (const y of blockersOf(st)) stack.push(y);
        }
        return out;
    };
    const dotFree = (p: Pt, gap = D.dotGap) => !dotGrid.near(p, gap - 0.01).some((h) => !dotDead[h.v]);
    /** Live dots within r of p. */
    const dotsNear = (p: Pt, r: number) => dotGrid.near(p, r).filter((h) => !dotDead[h.v]);
    /** Nearest ink of other strokes (ignoring `self` and, on `host`, anything; plus own-loop ink further than `skip` along). */
    const inkClear = (p: Pt, ignore: number[], r = D.clear): boolean => {
        for (const h of ink.near(p, r)) if (!ignore.includes(h.v.id)) return false;
        return true;
    };
    /** Host loop / stroke under a point, if any (within tol). */
    const hostAt = (p: Pt, tol: number, ignore: number[] = []): { id: number; s: number; q: Pt } | null => {
        let best: { id: number; d: number } | null = null;
        for (const h of ink.near(p, tol + 3)) if (!ignore.includes(h.v.id) && (!best || h.d < best.d)) best = { id: h.v.id, d: h.d };
        if (!best) return null;
        const st = byId(best.id);
        const pr = project(st.pts, st.acc, p);
        if (pr.d > tol) return null;
        return { id: st.id, s: pr.s, q: pr.q };
    };
    /** True when a dot at host position blocks other ink too: another stretch of contour / stroke within reach. */
    const narrowAt = (p: Pt, hostId: number, s: number): boolean => {
        const host = byId(hostId);
        for (const h of ink.near(p, D.clear)) {
            if (h.v.id !== hostId) return true;
            let ds = Math.abs(h.v.s - s);
            if (host.closed) ds = Math.min(ds, host.len - ds);
            if (ds > D.clear * 2.2) return true;
        }
        return false;
    };
    const accept = (pts: Pt[], role: Stroke['role'], ends: [End, End], fam = 0): Stroke => {
        const st = makeStroke(nextId++, pts, false, role, ends);
        st.family = fam;
        strokes.push(st);
        addInk(st);
        addDot(pts[0], st.id); addDot(pts[pts.length - 1], st.id);
        return st;
    };

    // ---- small parts: an outline with small dots (a detail line, never a host); opened with the other loops below
    for (const l of smallLoops) {
        const st = makeStroke(nextId++, l.pts, true, 'contour');
        st.r = smallR;
        strokes.push(st);
        addInk(st);
        info.loops++;
    }

    // ---- thin centre lines (longest first, so the short ones can end on them)
    // a centre line that comes back to its own start (a ring through a junction) is a closed stroke
    const ring = (t: { pts: Pt[]; closed: boolean }) => t.closed || (t.pts.length > 8 && dist(t.pts[0], t.pts[t.pts.length - 1]) < 4);
    const thinOpen = sh.thin.filter((t) => !ring(t)).map((t) => ({ pts: t.pts, len: lengths(t.pts).pop()! })).sort((x, y) => y.len - x.len);
    for (const t of sh.thin) {
        if (!ring(t)) continue;
        const pts = t.closed ? t.pts : [...t.pts.slice(0, -1), { ...t.pts[0] }];
        if (lengths(pts).pop()! >= MIN_LOOP) { const st = makeStroke(nextId++, pts, true, 'thin'); strokes.push(st); addInk(st); info.thin++; }
        else info.dropped++;
    }
    const thinGrid = new Grid<number>(12);
    thinOpen.forEach((t, i) => t.pts.forEach((p) => thinGrid.add(p, i)));
    sh.thin.filter((t) => t.closed).forEach((t) => t.pts.forEach((p) => thinGrid.add(p, -1)));
    const pending: number[] = [];
    const placeThin = (ti: number, last: boolean): boolean => {
        const t = thinOpen[ti];
        // normal dots first; a stroke that is too short or too crowded for them becomes a detail line with small dots
        for (const small of [false, true]) {
            const gapOther = small ? D.R + smallR + 3 : D.dotGap;
            const minLen = small ? 2 * smallR + 8 : D.minLen;
            let pts = t.pts;
            const ends: [End, End] = [{ host: -1, s: 0 }, { host: -1, s: 0 }];
            for (const e of [0, 1] as const) {
                const p = e === 0 ? pts[0] : pts[pts.length - 1];
                const h = hostAt(p, 20);
                if (h && byId(h.id).r === undefined && dotFree(h.q, gapOther)) {
                    ends[e] = { host: h.id, s: h.s };
                    pts = e === 0 ? [h.q, ...pts] : [...pts, h.q];
                } else if (!h && !last && thinGrid.near(p, 8).some((x) => x.v !== ti)) return false; // its host comes later
            }
            const acc = lengths(pts);
            let s0 = 0, s1 = acc[acc.length - 1];
            if (ends[0].host < 0) while (s0 < s1 && !dotFree(at(pts, acc, s0), gapOther)) s0 += 3;
            if (ends[1].host < 0) while (s1 > s0 && !dotFree(at(pts, acc, s1), gapOther)) s1 -= 3;
            // its own two dots must not touch (a hook-shaped stroke): shorten the far end
            const own = small ? 2 * smallR + 2 : D.dotGap;
            while (s1 > s0 && dist(at(pts, acc, s0), at(pts, acc, s1)) < own) { if (ends[1].host < 0) s1 -= 3; else if (ends[0].host < 0) s0 += 3; else break; }
            if (dist(at(pts, acc, s0), at(pts, acc, s1)) < own) continue;
            // a pulled-back end leaves part of the picture without a line: only accept that for normal dots when it is small
            const lost = s0 + (acc[acc.length - 1] - s1);
            if (s1 - s0 < minLen || (!small && lost > 12)) continue;
            const st = accept(resample(cut(pts, acc, s0, s1), 2.5), 'thin', ends);
            if (small) st.r = smallR;
            info.thin++;
            return true;
        }
        info.dropped++;
        return true;
    };
    thinOpen.forEach((_, i) => { if (!placeThin(i, false)) pending.push(i); });
    for (const i of pending) placeThin(i, true);

    // ---- fill pattern
    const pat = opt.pattern;
    const fams = pat.kind === 'none' || pat.kind === 'rings' ? 0 : pat.kind === 'cross' ? 2 : 1;
    const gapMin = Math.max(12, D.pitch * 0.5);
    const cands: Cand[] = [];
    for (let f = 0; f < fams; f++) {
        const curves = family(pat, sh, D.pitch, opt.phase, f);
        for (let ci = 0; ci < curves.length; ci++) {
            const curve = curves[ci];
            // runs inside the contour line
            const e = curve.map((p) => sh.d(p) - INSET);
            let i = 0;
            while (i < curve.length) {
                while (i < curve.length && e[i] < 0) i++;
                if (i >= curve.length) break;
                let j = i;
                while (j + 1 < curve.length && e[j + 1] >= 0) j++;
                const lerp = (a: number, b: number): Pt => { const t = e[a] / (e[a] - e[b]); return { x: curve[a].x + (curve[b].x - curve[a].x) * t, y: curve[a].y + (curve[b].y - curve[a].y) * t }; };
                const run: Pt[] = [];
                const startHit = i > 0, endHit = j < curve.length - 1;
                if (startHit) run.push(lerp(i, i - 1));
                for (let q = i; q <= j; q++) run.push(curve[q]);
                if (endHit) run.push(lerp(j, j + 1));
                i = j + 1;
                if (run.length < 3) continue;
                // split where the middle runs too close to the contour
                const acc = lengths(run), len = acc[acc.length - 1];
                const ee = run.map((p) => sh.d(p) - INSET);
                const approach = 2.8 * gapMin;
                // approach zones: from each end until the clearance first exceeds gapMin
                let a0 = 0; while (a0 < run.length && ee[a0] < gapMin && acc[a0] < approach) a0++;
                let a1 = run.length - 1; while (a1 >= 0 && ee[a1] < gapMin && len - acc[a1] < approach) a1--;
                const pieces: { s0: number; s1: number; k0: EndKind; k1: EndKind }[] = [];
                const steep0 = startHit && a0 < run.length && ee[a0] >= gapMin, steep1 = endHit && a1 >= 0 && ee[a1] >= gapMin;
                if (a0 > a1) {
                    // a short chord across a narrow place: fine when both ends hit and it is long enough
                    if (startHit && endHit && len >= D.dotGap + 2) pieces.push({ s0: 0, s1: len, k0: 'T', k1: 'T' });
                } else {
                    // walk the middle, cutting out dips
                    const tipLevel = Math.max(tipClear, gapMin);
                    const tipAt = (from: number, dir: 1 | -1): number => { let q = from; while (q >= 0 && q < run.length && ee[q] < tipLevel) q += dir; return q; };
                    let segStart = steep0 ? 0 : acc[Math.min(run.length - 1, tipAt(0, 1))];
                    let k0: EndKind = steep0 ? 'T' : 'tip';
                    let q = a0;
                    while (q <= a1) {
                        if (ee[q] < gapMin) {
                            // dip: close the piece before it, reopen after it
                            const back = tipAt(q, -1), fwd = tipAt(q, 1);
                            if (back >= 0 && acc[back] - segStart >= D.minLen) pieces.push({ s0: segStart, s1: acc[back], k0, k1: 'tip' });
                            if (fwd >= run.length) { segStart = Infinity; break; }
                            segStart = acc[fwd]; k0 = 'tip'; q = fwd;
                        } else q++;
                    }
                    if (segStart !== Infinity) {
                        const endS = steep1 ? len : acc[Math.max(0, tipAt(run.length - 1, -1))];
                        if (endS - segStart >= D.minLen) pieces.push({ s0: segStart, s1: endS, k0, k1: steep1 ? 'T' : 'tip' });
                    }
                }
                for (const pc of pieces) cands.push({ pts: cut(run, acc, pc.s0, pc.s1), e: [pc.k0, pc.k1], family: f, row: ci });
            }
        }
    }
    // longest first, so short leftovers adapt to them
    cands.sort((a, b) => lengths(b.pts).pop()! - lengths(a.pts).pop()!);
    const fillStrokes: Stroke[] = [];
    for (const c of cands) {
        if (opt.maxBase !== undefined && fillStrokes.length >= opt.maxBase) break;
        let pts = c.pts;
        const ends: [End, End] = [{ host: -1, s: 0 }, { host: -1, s: 0 }];
        const kinds: [EndKind, EndKind] = [...c.e];
        // T ends: on a contour loop, away from other dots and from narrow places
        for (const e of [0, 1] as const) {
            if (kinds[e] !== 'T') continue;
            const p = e === 0 ? pts[0] : pts[pts.length - 1];
            const h = hostAt(p, 3.5);
            if (h && byId(h.id).role !== 'fill' && byId(h.id).r === undefined && dotFree(h.q, D.dotGap + D.spread) && !narrowAt(h.q, h.id, h.s)) {
                ends[e] = { host: h.id, s: h.s };
                if (e === 0) pts[0] = h.q; else pts[pts.length - 1] = h.q;
            } else kinds[e] = 'tip';
        }
        // tips: trim back until clear of the contour, other ink and other dots
        const acc = lengths(pts);
        let s0 = 0, s1 = acc[acc.length - 1];
        const okTip = (p: Pt) => sh.d(p) - INSET >= tipClear && dotFree(p) && inkClear(p, [], D.clear);
        if (kinds[0] === 'tip') while (s0 < s1 && !okTip(at(pts, acc, s0))) s0 += 3;
        if (kinds[1] === 'tip') while (s1 > s0 && !okTip(at(pts, acc, s1))) s1 -= 3;
        if (s1 - s0 < D.minLen) continue;
        // the body must not run over a dot or (same family) too close to accepted ink
        const body = resample(cut(pts, acc, s0, s1), 2.5);
        let bad = false;
        for (let q = 2; q < body.length - 2 && !bad; q += 2) if (dotsNear(body[q], D.clear).some((h) => dist(dots[h.v], body[0]) > 1 && dist(dots[h.v], body[body.length - 1]) > 1)) bad = true;
        if (bad) continue;
        const st = accept(body, 'fill', ends, c.family);
        st.row = c.row;
        fillStrokes.push(st);
    }
    info.base = fillStrokes.length;

    const count = () => strokes.filter((s) => !s.closed).length;

    // ---- helpers to add strokes
    const hostedOn = (id: number) => strokes.flatMap((s) => (s.closed ? [] : s.ends.filter((e) => e.host === id)));
    /** A straight rung from stroke A at arc position s along its normal (side +1/-1) to the next ink. */
    const rungFrom = (A: Stroke, s: number, sign: number, maxLen: number): boolean => {
        const p = at(A.pts, A.acc, s);
        if (!dotFree(p, D.dotGap + D.spread) || narrowAt(p, A.id, s)) return false;
        const t = tangent(A.pts, A.acc, s);
        const n = { x: -t.y * sign, y: t.x * sign };
        let hit: { id: number; s: number; q: Pt } | null = null, L = 0;
        for (let u = D.dotGap * 0.6; u <= maxLen; u += 2) {
            const q = { x: p.x + n.x * u, y: p.y + n.y * u };
            if (sh.d(q) < INSET - 1.5) break;
            const h = hostAt(q, 2.2, [A.id]);
            if (h) { hit = h; L = dist(p, h.q); break; }
        }
        if (!hit || L < D.dotGap + 1 || byId(hit.id).r !== undefined) return false;
        if (!dotFree(hit.q, D.dotGap + D.spread) || narrowAt(hit.q, hit.id, hit.s)) return false;
        const pts: Pt[] = [];
        const m = Math.max(2, Math.round(L / 2.5));
        for (let i = 0; i <= m; i++) pts.push({ x: p.x + ((hit.q.x - p.x) * i) / m, y: p.y + ((hit.q.y - p.y) * i) / m });
        // the body keeps clear of other dots and of ink it would graze
        if (pts.some((q, i) => i > 3 && i < m - 3 && (dotsNear(q, D.clear).length > 0 || !inkClear(q, [A.id, hit!.id], D.clear * 0.6)))) return false;
        accept(pts, 'rung', [{ host: A.id, s }, { host: hit.id, s: hit.s }], 9);
        info.rungs++;
        return true;
    };
    /** A short spur from a loop into the black, ending in a free tip. */
    const spurFrom = (loop: Stroke, s: number): boolean => {
        const p = at(loop.pts, loop.acc, s);
        if (!dotFree(p, D.dotGap + D.spread) || narrowAt(p, loop.id, s)) return false;
        const t = tangent(loop.pts, loop.acc, s);
        for (const sign of [1, -1]) {
            const n = { x: -t.y * sign, y: t.x * sign };
            const L = D.clear + 6;
            const tip = { x: p.x + n.x * L, y: p.y + n.y * L };
            if (sh.d(tip) - INSET < tipClear || !dotFree(tip) || !inkClear(tip, [])) continue;
            let ok = true;
            for (let u = 6; u < L && ok; u += 4) { const q = { x: p.x + n.x * u, y: p.y + n.y * u }; if (sh.d(q) < INSET) ok = false; }
            if (!ok) continue;
            const pts: Pt[] = [];
            for (let u = 0; u <= L; u += 2.5) pts.push({ x: p.x + n.x * u, y: p.y + n.y * u });
            pts[pts.length - 1] = tip;
            accept(pts, 'spur', [{ host: loop.id, s }, { host: -1, s: 0 }]);
            info.spurs++;
            return true;
        }
        return false;
    };
    /** Turns a closed stroke into an open one whose two dots sit side by side (the gap hides under them). */
    /** A stroke that is a line by itself (nothing ends on it, it ends on nothing): what its dots touch is what it blocks. */
    const isPart = (id: number) => { const st = strokes.find((s) => s.id === id); return !!st && hostedOn(id).length === 0 && (st.closed || (st.ends[0].host < 0 && st.ends[1].host < 0)); };
    const cutLoopWith = (loop: Stroke, small: boolean): boolean => {
        const r = small ? smallR : D.R;
        const gap = 2 * r + 4, other = small ? D.R + smallR + 3 : D.dotGap;
        const reach = small ? 0.85 * (smallR + D.R) + 1.5 : D.clear;
        if (loop.len - gap < 2 * r + 8) return false;
        let bestS = -1, bestScore = -Infinity;
        const start = rand() * loop.len;
        const anc = ancestors(loop.id);
        // neighbouring parts make each other wait: aim for one (sometimes two, sometimes no) part under the two dots
        const u = rand();
        const want = u < 0.55 ? 1 : u < 0.85 ? 2 : 0;
        const steps = Math.max(40, Math.min(200, Math.round(loop.len / 5)));
        for (let i = 0; i < steps; i++) {
            const s = (start + (i * loop.len) / steps) % loop.len;
            const s2 = (s + gap) % loop.len;
            const a = at(loop.pts, loop.acc, s), b = at(loop.pts, loop.acc, s2);
            if (!dotFree(a, other) || !dotFree(b, other) || dist(a, b) < 2 * r + 1.5) continue;
            if (strokes.some((st) => !st.closed && st.ends.some((e) => e.host === loop.id && ((e.s - s + loop.len) % loop.len) < gap + 1))) continue;
            const outs = new Set([...touched(a, loop.id, reach), ...touched(b, loop.id, reach)]);
            let cyc = 0, structured = 0, good = 0;
            for (const o of outs) { if (anc.has(o)) cyc++; else if (!isPart(o)) structured++; else good++; }
            // never a line that already waits for this one; rather not a line that is part of a bigger structure
            const score = -30 * cyc - 4 * structured - Math.abs(good - want) - 0.01 * i / steps;
            if (score > bestScore) { bestScore = score; bestS = s; if (score > -0.02) break; }
        }
        if (bestS < 0) return false;
        const s0 = (bestS + gap) % loop.len;
        const keep = loop.len - gap;
        const pts = s0 + keep <= loop.len ? cut(loop.pts, loop.acc, s0, s0 + keep) : [...cut(loop.pts, loop.acc, s0, loop.len), ...cut(loop.pts, loop.acc, 0, s0 + keep - loop.len).slice(1)];
        const shift = (s: number) => (s - s0 + loop.len) % loop.len;
        for (const st of strokes) for (const e of st.ends) if (e.host === loop.id) e.s = Math.max(0.5, Math.min(shift(e.s), keep - 0.5));
        loop.pts = pts; loop.acc = lengths(pts); loop.len = loop.acc[loop.acc.length - 1]; loop.closed = false;
        loop.ends = [{ host: -1, s: 0 }, { host: -1, s: 0 }];
        if (small) loop.r = smallR;
        addInk(loop);
        addDot(pts[0], loop.id); addDot(pts[pts.length - 1], loop.id);
        info.loopCuts++;
        return true;
    };
    /** Opens a closed stroke with one cut: normal dots, else small dots (only when nothing ends on it). */
    const cutLoop = (loop: Stroke): boolean => (loop.r === undefined && cutLoopWith(loop, false)) || (hostedOn(loop.id).length === 0 && cutLoopWith(loop, true));

    // ---- ring pattern: inner copies of the outline, one pitch apart
    if (pat.kind === 'rings') {
        for (let j = 1; j < 60; j++) {
            const raw = isoLoops(sh.sd, sh.n, INSET + j * D.pitch);
            if (!raw.length) break;
            for (const r of raw) {
                let pts = r.map(sh.toWorld);
                pts.push({ ...pts[0] });
                if (lengths(pts).pop()! < MIN_LOOP + D.dotGap) continue;
                pts = smooth(resample(pts, 2.5), true, 2);
                const st = makeStroke(nextId++, pts, true, 'fill');
                st.family = j;
                strokes.push(st); addInk(st);
                info.base++;
            }
        }
    }

    // ---- brick pattern: regular rungs between neighbouring stripes, shifted from row to row
    if (pat.kind === 'bricks') {
        const brick = D.pitch * 2.4;
        const rows = fillStrokes.slice().sort((a, b) => a.row! - b.row!);
        for (const A of rows) {
            if (count() >= opt.target) break;
            const off = (((A.row! % 2) + 2) % 2) * brick * 0.5 + (opt.phase % brick);
            for (let u = off % brick; u < A.len; u += brick) {
                if (count() >= opt.target) break;
                if (u < D.dotGap * 0.7 || u > A.len - D.dotGap * 0.7) continue;
                rungFrom(A, u, 1, D.pitch * 1.4);
            }
        }
    }

    // ---- every closed stroke needs two "safe" stems to be opened: stems whose other end is a free tip, or sits
    //      on a stroke that does not lead back to this loop (else the opened loop and that stroke block each other).
    //      Made by pulling one end of a pattern stroke back from the outline, else a spur, else one cut.
    const leadsTo = (from: number, target: number, seen = new Set<number>()): boolean => {
        if (from === target) return true;
        if (from < 0 || seen.has(from)) return false;
        seen.add(from);
        const st = byId(from);
        if (!st || st.closed) return false;
        return st.ends.some((e) => leadsTo(e.host, target, seen));
    };
    const safeStems = (id: number) => strokes.reduce((n, s) => {
        if (s.closed) return n;
        for (const e of [0, 1] as const) if (s.ends[e].host === id && !leadsTo(s.ends[1 - e].host, id)) n++;
        return n;
    }, 0);
    /** Turns one T end of a pattern stroke into a free tip, pulled back from what it touched. */
    const pullBack = (st: Stroke, e: 0 | 1): boolean => {
        const old = e === 0 ? st.pts[0] : st.pts[st.pts.length - 1];
        const okTip = (p: Pt) => sh.d(p) - INSET >= tipClear && dotFree(p) && inkClear(p, [st.id]);
        for (let back = tipClear; back <= st.len - D.minLen; back += 3) {
            const s = e === 0 ? back : st.len - back;
            const p = at(st.pts, st.acc, s);
            if (!okTip(p)) continue;
            const hs = hostedOn(st.id);
            if (hs.some((h) => (e === 0 ? h.s < back + D.dotGap : h.s > st.len - back - D.dotGap))) return false;
            const pts = resample(e === 0 ? cut(st.pts, st.acc, back, st.len) : cut(st.pts, st.acc, 0, st.len - back), 2.5);
            if (e === 0) for (const h of hs) h.s = Math.max(0.5, h.s - back);
            st.pts = pts; st.acc = lengths(pts); st.len = st.acc[st.acc.length - 1];
            st.ends[e] = { host: -1, s: 0 };
            retireDot(old);
            addInk(st);
            addDot(p, st.id);
            info.pulled++;
            return true;
        }
        return false;
    };
    const loopsFirst = strokes.filter((s) => s.closed).sort((a, b) => (a.role === 'contour' ? 0 : 1) - (b.role === 'contour' ? 0 : 1) || (a.r === undefined ? 0 : 1) - (b.r === undefined ? 0 : 1) || b.len - a.len);
    for (const loop of loopsFirst) {
        if (opt.loopsCutOnly || loop.r !== undefined || (pat.kind === 'rings' && loop.role === 'fill')) {
            if (!cutLoop(loop)) { strokes.splice(strokes.indexOf(loop), 1); inkGen.set(loop.id, -1); info.dropped++; if (loop.role === 'contour') info.loops--; }
            continue;
        }
        // 1. pattern strokes that end on this loop: free their other end (longest first)
        const chords = strokes.filter((s) => !s.closed && s.role === 'fill' && (s.ends[0].host === loop.id || s.ends[1].host === loop.id)).sort((a, b) => b.len - a.len);
        for (const c of chords) {
            if (safeStems(loop.id) >= 2) break;
            const far: 0 | 1 = c.ends[0].host === loop.id ? 1 : 0;
            if (c.ends[far].host < 0 || !leadsTo(c.ends[far].host, loop.id)) continue; // already safe
            if (c.len < D.minLen + tipClear + 6) continue;
            pullBack(c, far);
        }
        // 2. rungs to neighbouring ink that does not lead back here, or spurs
        const tries = Math.max(10, Math.floor(loop.len / 9));
        const start = rand() * loop.len;
        for (let i = 0; i < tries && safeStems(loop.id) < 2; i++) {
            const s = (start + (i * loop.len * 0.618)) % loop.len;
            if (hostedOn(loop.id).some((e) => Math.min(Math.abs(e.s - s), loop.len - Math.abs(e.s - s)) < D.dotGap * 1.6)) continue;
            if (!spurFrom(loop, s)) { rungFrom(loop, s, 1, D.pitch * 1.6) || rungFrom(loop, s, -1, D.pitch * 1.6); }
        }
        // 3. one cut
        if (safeStems(loop.id) < 2 && !cutLoop(loop)) {
            // nothing can open it: leave this outline out (reported as skipped) rather than ship an unsolvable level
            for (const st of strokes) for (const e of st.ends) if (e.host === loop.id) { e.host = -1; e.s = 0; }
            strokes.splice(strokes.indexOf(loop), 1);
            inkGen.set(loop.id, -1);
            info.dropped++; info.loops--;
        }
    }

    if (opt.plain) return { strokes, info };

    // ---- reach the target: split long fill strokes (2 tips each) and add rungs (2 T ends each)
    const want = opt.target;
    const endsNow = () => { let t = 0, tips = 0; for (const s of strokes) if (!s.closed) for (const e of s.ends) { t++; if (e.host < 0) tips++; } return { ends: t, tips }; };
    const trySplit = (): boolean => {
        const gap = D.dotGap + 6;
        const cand = strokes.filter((s) => !s.closed && s.role === 'fill' && s.len >= 2 * D.minLen + gap + 16).sort((a, b) => b.len - a.len);
        for (const st of cand.slice(0, 8)) {
            for (let k = 0; k < 14; k++) {
                const u = D.minLen + 8 + rand() * (st.len - 2 * D.minLen - gap - 16);
                const a = at(st.pts, st.acc, u), b = at(st.pts, st.acc, u + gap);
                if (!dotFree(a) || !dotFree(b) || !inkClear(a, [st.id]) || !inkClear(b, [st.id])) continue;
                const hs = hostedOn(st.id);
                if (hs.some((e) => e.s > u - D.dotGap && e.s < u + gap + D.dotGap)) continue;
                const second = makeStroke(nextId++, resample(cut(st.pts, st.acc, u + gap, st.len), 2.5), false, st.role, [{ host: -1, s: 0 }, st.ends[1]]);
                second.family = st.family; second.row = st.row;
                for (const e of hs) if (e.s >= u + gap) { e.host = second.id; e.s = Math.max(0.5, Math.min(second.len - 0.5, e.s - (u + gap))); }
                st.pts = resample(cut(st.pts, st.acc, 0, u), 2.5); st.acc = lengths(st.pts); st.len = st.acc[st.acc.length - 1];
                st.ends = [st.ends[0], { host: -1, s: 0 }];
                for (const e of hs) if (e.host === st.id) e.s = Math.max(0.5, Math.min(st.len - 0.5, e.s));
                strokes.push(second);
                addInk(st); addInk(second);
                addDot(a, st.id); addDot(b, second.id);
                info.splits++;
                return true;
            }
        }
        return false;
    };
    const tryRung = (): boolean => {
        const hosts = strokes.filter((s) => (s.role === 'fill' || s.role === 'contour') && s.r === undefined && s.len >= D.dotGap * 2);
        if (!hosts.length) return false;
        for (let k = 0; k < 80; k++) {
            const A = hosts[Math.floor(rand() * hosts.length)];
            const s = D.dotGap * 0.8 + rand() * (A.len - D.dotGap * 1.6);
            if (rungFrom(A, s, rand() < 0.5 ? 1 : -1, D.pitch * 1.7)) return true;
        }
        return false;
    };
    /**
     * Last resort for pictures made of few long lines (wire-like silhouettes): cut a long thin or outline
     * stroke in two, with the two new dots side by side so the cut hides under them.
     */
    const trySplitEdge = (): boolean => {
        const gap = D.dotGap + 1;
        const cand = strokes.filter((s) => !s.closed && s.r === undefined && (s.role === 'thin' || s.role === 'contour') && s.len >= 2 * (D.minLen + 24) + gap).sort((a, b) => b.len - a.len);
        for (const st of cand.slice(0, 5)) {
            const hs = hostedOn(st.id);
            let best = -1, bestScore = -Infinity;
            for (let k = 0; k < 24; k++) {
                const u = D.minLen + 24 + rand() * (st.len - 2 * (D.minLen + 24) - gap);
                const a = at(st.pts, st.acc, u), b = at(st.pts, st.acc, u + gap);
                if (!dotFree(a) || !dotFree(b) || dist(a, b) < D.dotGap - 0.5) continue;
                if (hs.some((e) => e.s > u - D.dotGap && e.s < u + gap + D.dotGap)) continue;
                // not where the stroke runs past itself (the two sides of a thin bar): the halves would block each other
                if (narrowAt(a, st.id, u) || narrowAt(b, st.id, u + gap)) continue;
                const score = -(touched(a, st.id).size + touched(b, st.id).size) - Math.abs(u + gap / 2 - st.len / 2) / st.len;
                if (score > bestScore) { bestScore = score; best = u; }
            }
            if (best < 0 || bestScore < -0.6) continue; // only where the new dots touch nothing else
            const u = best;
            const a = at(st.pts, st.acc, u), b = at(st.pts, st.acc, u + gap);
            const second = makeStroke(nextId++, resample(cut(st.pts, st.acc, u + gap, st.len), 2.5), false, st.role, [{ host: -1, s: 0 }, st.ends[1]]);
            for (const e of hs) if (e.s >= u + gap) { e.host = second.id; e.s = Math.max(0.5, Math.min(second.len - 0.5, e.s - (u + gap))); }
            st.pts = resample(cut(st.pts, st.acc, 0, u), 2.5); st.acc = lengths(st.pts); st.len = st.acc[st.acc.length - 1];
            st.ends = [st.ends[0], { host: -1, s: 0 }];
            for (const e of hs) if (e.host === st.id) e.s = Math.max(0.5, Math.min(st.len - 0.5, e.s));
            strokes.push(second);
            addInk(st); addInk(second);
            addDot(a, st.id); addDot(b, second.id);
            info.edgeSplits++;
            return true;
        }
        return false;
    };
    let guard = 0;
    while (count() < want && guard++ < 800) {
        const { ends, tips } = endsNow();
        const preferSplit = tips / Math.max(1, ends) < opt.tipShare;
        if (preferSplit ? trySplit() || tryRung() : tryRung() || trySplit()) continue;
        if (trySplitEdge()) continue;
        break;
    }
    return { strokes, info };
}
