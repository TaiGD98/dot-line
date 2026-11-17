// Minimal SVG reader that runs without a browser (build tools). Supports what the level art
// uses: path (M L H V C S Q T Z, absolute or relative), line, polyline, polygon, rect, circle,
// ellipse; no transforms. data-big="1" (or class="big") marks a stroke for big dots.
// The editor uses the browser's own SVG engine instead (src/editor/sources.ts).
import type { Pt } from './path';
import type { Stroke } from './trace';

export interface SvgDrawing {
    strokes: Stroke[];
    width: number;
    height: number;
}

const attrs = (s: string) => {
    const out: Record<string, string> = {};
    for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
    return out;
};
const nums = (s: string) => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Pt[] {
    const out: Pt[] = [];
    for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
    }
    return out;
}

/** Path data -> subpaths (each a polyline, closed if it ended with Z). */
export function parsePath(d: string): { pts: Pt[]; closed: boolean }[] {
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
    const out: { pts: Pt[]; closed: boolean }[] = [];
    let cur: Pt[] = [];
    let p: Pt = { x: 0, y: 0 }, start: Pt = { x: 0, y: 0 }, lastCtrl: Pt | null = null, lastQ: Pt | null = null;
    let cmd = '';
    let i = 0;
    const num = () => Number(tokens[i++]);
    const flush = (closed: boolean) => { if (cur.length > 1) out.push({ pts: cur, closed }); cur = []; };
    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
        const rel = cmd === cmd.toLowerCase();
        const C = cmd.toUpperCase();
        const off = (x: number, y: number) => (rel ? { x: p.x + x, y: p.y + y } : { x, y });
        if (C === 'Z') { if (cur.length) cur.push({ ...start }); p = { ...start }; flush(true); lastCtrl = lastQ = null; continue; }
        if (C === 'M') { flush(false); p = off(num(), num()); start = { ...p }; cur = [p]; cmd = rel ? 'l' : 'L'; lastCtrl = lastQ = null; continue; }
        if (C === 'L') { p = off(num(), num()); cur.push(p); lastCtrl = lastQ = null; continue; }
        if (C === 'H') { const x = num(); p = { x: rel ? p.x + x : x, y: p.y }; cur.push(p); lastCtrl = lastQ = null; continue; }
        if (C === 'V') { const y = num(); p = { x: p.x, y: rel ? p.y + y : y }; cur.push(p); lastCtrl = lastQ = null; continue; }
        if (C === 'C' || C === 'S') {
            const c1: Pt = C === 'C' ? off(num(), num()) : lastCtrl ? { x: 2 * p.x - lastCtrl.x, y: 2 * p.y - lastCtrl.y } : { ...p };
            const c2 = off(num(), num()), e = off(num(), num());
            cur.push(...cubic(p, c1, c2, e));
            lastCtrl = c2; lastQ = null; p = e;
            continue;
        }
        if (C === 'Q' || C === 'T') {
            const q: Pt = C === 'Q' ? off(num(), num()) : lastQ ? { x: 2 * p.x - lastQ.x, y: 2 * p.y - lastQ.y } : { ...p };
            const e = off(num(), num());
            cur.push(...cubic(p, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, { x: e.x + (2 / 3) * (q.x - e.x), y: e.y + (2 / 3) * (q.y - e.y) }, e));
            lastQ = q; lastCtrl = null; p = e;
            continue;
        }
        throw new Error(`Unsupported path command "${cmd}" (use M L H V C S Q T Z; draw arcs with circle/ellipse or C)`);
    }
    flush(false);
    return out;
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number) =>
    Array.from({ length: 73 }, (_, k) => ({ x: cx + rx * Math.cos((k / 72) * Math.PI * 2), y: cy + ry * Math.sin((k / 72) * Math.PI * 2) }));

export function parseSvg(text: string): SvgDrawing {
    const root = attrs(text.match(/<svg\b([^>]*)>/)?.[1] ?? '');
    const vb = nums(root.viewBox ?? '');
    const width = vb[2] ?? Number(root.width ?? 400), height = vb[3] ?? Number(root.height ?? 400);
    const ox = vb[0] ?? 0, oy = vb[1] ?? 0;
    const strokes: Stroke[] = [];
    for (const m of text.matchAll(/<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*?)\/?>/g)) {
        const tag = m[1], a = attrs(m[2]);
        const big = a['data-big'] === '1' || (a.class ?? '').split(/\s+/).includes('big');
        const add = (pts: Pt[], closed: boolean) => strokes.push({ pts: pts.map((q) => ({ x: q.x - ox, y: q.y - oy })), closed, big });
        const n = (k: string) => Number(a[k] ?? 0);
        if (tag === 'path') for (const sp of parsePath(a.d ?? '')) add(sp.pts, sp.closed);
        else if (tag === 'line') add([{ x: n('x1'), y: n('y1') }, { x: n('x2'), y: n('y2') }], false);
        else if (tag === 'polyline' || tag === 'polygon') {
            const v = nums(a.points ?? '');
            const pts = Array.from({ length: v.length / 2 }, (_, k) => ({ x: v[2 * k], y: v[2 * k + 1] }));
            if (tag === 'polygon') pts.push({ ...pts[0] });
            add(pts, tag === 'polygon');
        } else if (tag === 'rect') {
            const x = n('x'), y = n('y'), w = n('width'), h = n('height');
            add([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }], true);
        } else if (tag === 'circle') add(ellipsePts(n('cx'), n('cy'), n('r'), n('r')), true);
        else if (tag === 'ellipse') add(ellipsePts(n('cx'), n('cy'), n('rx'), n('ry')), true);
    }
    // Densify straight segments so the generator sees evenly spaced points.
    for (const s of strokes) {
        const d: Pt[] = [s.pts[0]];
        for (let k = 1; k < s.pts.length; k++) {
            const a = s.pts[k - 1], b = s.pts[k], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
            for (let j = 1; j <= steps; j++) d.push({ x: a.x + ((b.x - a.x) * j) / steps, y: a.y + ((b.y - a.y) * j) / steps });
        }
        s.pts = d;
    }
    return { strokes, width, height };
}
