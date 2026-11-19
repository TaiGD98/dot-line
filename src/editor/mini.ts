// Small picture of a level (its lines and dots), for level lists and generator candidates.
import { s as svgEl } from './dom';
import type { Pair } from '../core/level';
import { COMPLETED_LINE, colour } from '../core/palette';

export function miniature(c: { pairs: Pair[] }, cls = 'mini') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of c.pairs) for (const q of [...p.path, p.a, p.b]) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    if (!isFinite(x0)) { x0 = y0 = -100; x1 = y1 = 100; }
    const pad = 24, size = Math.max(x1 - x0, y1 - y0) + pad * 2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // Lines and dots drawn thicker than in the game, so a small picture stays readable.
    const lw = Math.max(5.1, size / 70), dr = (r: number) => Math.max(r, size / 60);
    return svgEl('svg', { viewBox: `${cx - size / 2} ${cy - size / 2} ${size} ${size}`, class: cls },
        c.pairs.map((p) => {
            const col = colour(p.color)?.base ?? COMPLETED_LINE;
            let d = `M${p.path[0].x} ${p.path[0].y}`;
            for (let i = 1; i < p.path.length; i++) { const a = p.path[i - 1], b = p.path[i]; const o = a.out ?? a, n = b.in ?? b; d += ` C${o.x} ${o.y} ${n.x} ${n.y} ${b.x} ${b.y}`; }
            return svgEl('g', {}, svgEl('path', { d, stroke: col, 'stroke-width': lw, fill: 'none', 'stroke-linecap': 'round' }), svgEl('circle', { cx: p.a.x, cy: p.a.y, r: dr(p.a.r), fill: col }), svgEl('circle', { cx: p.b.x, cy: p.b.y, r: dr(p.b.r), fill: col }));
        }));
}
