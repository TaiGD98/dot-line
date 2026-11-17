// Turns a generator input file into strokes: traced line art (PNG/JPG) or an SVG drawing.
import type { Stroke } from '../core/trace';
import { chains, maskFromRGBA, strokesFromChains, thin } from '../core/trace';
import type { Pt } from '../core/path';

export interface SourceStrokes {
    strokes: Stroke[];
    /** Size of the source in its own units (image px or SVG viewBox), origin at 0,0. */
    width: number;
    height: number;
}

export const isSvg = (b: Blob) => b.type === 'image/svg+xml' || (b as File).name?.toLowerCase().endsWith('.svg');

export async function strokesFrom(blob: Blob): Promise<SourceStrokes> {
    return isSvg(blob) ? svgStrokes(await blob.text()) : imageStrokes(blob);
}

async function imageStrokes(blob: Blob): Promise<SourceStrokes> {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const strokes = strokesFromChains(chains(thin(maskFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h)), 8));
    return { strokes, width: w, height: h };
}

/** Every path / line / polyline / polygon / rect / circle / ellipse becomes one or more strokes. */
function svgStrokes(text: string): SourceStrokes {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const src = doc.documentElement;
    if (src.nodeName.toLowerCase() !== 'svg') throw new Error('Not an SVG file');
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
    const svg = document.importNode(src, true) as unknown as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : parseFloat(svg.getAttribute('width') ?? '') || 1000;
    const hgt = vb && vb.height ? vb.height : parseFloat(svg.getAttribute('height') ?? '') || 1000;
    // 1 user unit = 1 px, origin at the viewBox corner.
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(hgt));
    host.append(svg);
    document.body.append(host);
    try {
        const out: Stroke[] = [];
        for (const el of svg.querySelectorAll<SVGGeometryElement>('path, line, polyline, polygon, rect, circle, ellipse')) {
            const total = el.getTotalLength();
            if (!(total > 0)) continue;
            const step = Math.max(0.5, total / 1500);
            const m = el.getCTM();
            let cur: Pt[] = [];
            let prev: Pt | null = null;
            const flush = () => {
                if (cur.length > 2) {
                    const closed = Math.hypot(cur[0].x - cur[cur.length - 1].x, cur[0].y - cur[cur.length - 1].y) < step * 2.5 ||
                        ['polygon', 'rect', 'circle', 'ellipse'].includes(el.tagName.toLowerCase());
                    const big = el.getAttribute('data-big') === '1' || (el.getAttribute('class') ?? '').split(/\s+/).includes('big');
                    out.push({ pts: cur, closed, big });
                }
                cur = [];
            };
            for (let t = 0; t <= total + 1e-6; t += step) {
                const q = el.getPointAtLength(Math.min(t, total));
                const p = m ? new DOMPoint(q.x, q.y).matrixTransform(m) : q;
                const pt = { x: p.x, y: p.y };
                if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) > step * 4) flush(); // new subpath (M)
                cur.push(pt);
                prev = pt;
            }
            flush();
        }
        return { strokes: out, width: w, height: hgt };
    } finally {
        host.remove();
    }
}
