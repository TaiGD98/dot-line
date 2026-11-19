// Minimal SVG reader that runs without a browser (build tools). Supports what the level art
// uses: path (M L H V C S Q T Z, absolute or relative), line, polyline, polygon, rect, circle,
// ellipse, inside nested groups with transforms (matrix, translate, scale, rotate, skewX, skewY)
// and stroke widths inherited from the groups, as a browser draws them. Nothing inside defs,
// clipPath, mask, symbol, pattern or marker is drawn. data-big="1" (or class="big") marks a stroke
// for big dots. What it cannot read (use, image, text...) is listed in `warnings`.
// The editor uses the browser's own SVG engine instead (src/editor/sources.ts).
import type { Pt } from './path';
import type { Stroke } from './trace';

export interface SvgDrawing {
    strokes: Stroke[];
    width: number;
    height: number;
    /** Parts of the file that were not read (so the drawing may differ from the browser's). */
    warnings: string[];
}

/** 2D affine matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f. */
type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];
const apply = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
/** A transform attribute (a list, applied left to right as in SVG) -> one matrix. */
function parseTransform(t: string | undefined): Mat {
    let m: Mat = IDENTITY;
    if (!t) return m;
    for (const f of t.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
        const v = nums(f[2]), rad = ((v[0] ?? 0) * Math.PI) / 180;
        let n: Mat = IDENTITY;
        if (f[1] === 'matrix' && v.length >= 6) n = [v[0], v[1], v[2], v[3], v[4], v[5]];
        else if (f[1] === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        else if (f[1] === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        else if (f[1] === 'rotate') {
            const r: Mat = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
            n = v.length >= 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
        } else if (f[1] === 'skewX') n = [1, 0, Math.tan(rad), 1, 0, 0];
        else if (f[1] === 'skewY') n = [1, Math.tan(rad), 0, 1, 0, 0];
        m = mul(m, n);
    }
    return m;
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
    const warnings: string[] = [];
    // Stroke widths (an element's own, else its groups', else the <svg> default) give each stroke a weight.
    const widthOf = (a: Record<string, string>) => Number(a['stroke-width'] ?? /stroke-width\s*:\s*([\d.]+)/.exec(a.style ?? '')?.[1] ?? NaN);
    const found: number[] = [];
    const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);
    const HIDDEN = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'metadata', 'title', 'desc', 'style']);
    const UNREAD = new Set(['use', 'image', 'text', 'foreignObject']);
    // Walk the tags: groups push their transform and stroke width, closing tags pop them.
    const stack: { tag: string; m: Mat; w: number; hidden: boolean }[] = [{ tag: '#root', m: IDENTITY, w: NaN, hidden: false }];
    const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
    for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)\b([^>]*?)(\/?)>/g)) {
        const closing = m[1] === '/', tag = m[2].replace(/^svg:/, ''), a = attrs(m[3]), selfClosing = m[4] === '/';
        if (closing) {
            for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
            continue;
        }
        const top = stack[stack.length - 1];
        const own = widthOf(a);
        const here = { tag, m: tag === 'svg' ? top.m : mul(top.m, parseTransform(a.transform)), w: isNaN(own) ? top.w : own, hidden: top.hidden || HIDDEN.has(tag) };
        if (!SHAPES.has(tag)) {
            if (UNREAD.has(tag) && !here.hidden) warnings.push(`<${tag}> is not read (draw it as a path)`);
            if (!selfClosing) stack.push(here);
            continue;
        }
        if (here.hidden) continue;
        const big = a['data-big'] === '1' || (a.class ?? '').split(/\s+/).includes('big');
        const add = (pts: Pt[], closed: boolean) => {
            strokes.push({ pts: pts.map((q) => { const t = apply(here.m, q); return { x: t.x - ox, y: t.y - oy }; }), closed, big });
            found.push(here.w);
        };
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
    // Weight = width / the most common width (the main lines). Only when widths differ.
    const known = found.filter((w) => !isNaN(w));
    if (known.length && new Set(known).size > 1) {
        const count = new Map<number, number>();
        for (const w of known) count.set(w, (count.get(w) ?? 0) + 1);
        const main = [...count].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
        strokes.forEach((st, k) => { if (!isNaN(found[k]) && found[k] < main) st.weight = Math.max(0.4, found[k] / main); });
    }
    return { strokes, width, height, warnings: [...new Set(warnings)] };
}
