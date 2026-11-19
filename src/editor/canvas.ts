// SVG work area: draws the level, selection, anchors/handles, Figma-style snapping, and
// handles every pointer interaction (select, move, copy, draw a new pair, edit curves, pan, zoom).
import { DEFAULT_RADIUS, Level, Pair, levelBounds, nextPairId, syncEnds } from '../core/level';
import { COMPLETED_LINE, colour } from '../core/palette';
import { Anchor, Pt, dist, distToPolyline, fitFreehand, samplePath, translatePath } from '../core/path';
import { clear, s } from './dom';

export type Tool = 'select' | 'pair' | 'pan';

export interface CanvasHost {
    level(): Level;
    selection: Set<string>;
    tool: Tool;
    activeColour: string;
    /** Snapshot for undo before a change starts. */
    begin(): void;
    /** Change finished; `changed` = something actually moved. */
    end(changed: boolean): void;
    /** Live change during a drag (refresh side panels). */
    live(): void;
    selectionChanged(): void;
    /** Radius of a newly drawn dot (the level's dot size). */
    radiusDefault(): number;
    overlay(): { image?: { url: string; x: number; y: number; w: number; h: number; opacity: number }; order?: Map<string, number>; stuck?: Set<string> };
}

type Drag =
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { kind: 'move'; start: Pt; orig: Map<string, Pair>; moved: boolean }
    | { kind: 'dot'; pair: string; end: 'a' | 'b'; moved: boolean }
    | { kind: 'anchor'; pair: string; idx: number; moved: boolean }
    | { kind: 'handle'; pair: string; idx: number; side: 'in' | 'out'; alt: boolean; moved: boolean }
    | { kind: 'marquee'; start: Pt; cur: Pt; additive: boolean }
    | { kind: 'stroke'; pts: Pt[]; start: Pt };

const pathD = (path: Anchor[]) => {
    if (!path.length) return '';
    let d = `M${path[0].x} ${path[0].y}`;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const c1 = a.out ?? a, c2 = b.in ?? b;
        d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    }
    return d;
};

const clonePair = (p: Pair): Pair => JSON.parse(JSON.stringify(p));

export class Canvas {
    readonly el: SVGSVGElement;
    private gImage = s('g');
    private gLines = s('g');
    private gDots = s('g');
    private gEdit = s('g');
    private gGuides = s('g');
    private gTemp = s('g');
    private view = { x: -400, y: -500, w: 800, h: 1000 };
    private drag: Drag | null = null;
    private pendingA: Pt | null = null;
    private spaceDown = false;

    constructor(private host: CanvasHost) {
        this.el = s('svg', { class: 'canvas', tabindex: 0 }, this.gImage, this.gLines, this.gDots, this.gEdit, this.gGuides, this.gTemp);
        this.el.addEventListener('pointerdown', (e) => this.down(e));
        this.el.addEventListener('pointermove', (e) => this.move(e));
        this.el.addEventListener('pointerup', (e) => this.up(e));
        this.el.addEventListener('dblclick', (e) => this.dbl(e));
        this.el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
        this.el.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this.spaceDown = true; this.el.style.cursor = 'grab'; } });
        window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; this.el.style.cursor = ''; } });
        new ResizeObserver(() => this.applyView()).observe(this.el);
    }

    // ---------- view ----------

    private get scale() {
        const r = this.el.getBoundingClientRect();
        return Math.min(r.width / this.view.w, r.height / this.view.h) || 1;
    }

    private applyView() {
        const r = this.el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        // Keep aspect: grow the view to the element's aspect around its centre.
        const k = Math.min(r.width / this.view.w, r.height / this.view.h);
        const w = r.width / k, h = r.height / k;
        const cx = this.view.x + this.view.w / 2, cy = this.view.y + this.view.h / 2;
        this.view = { x: cx - w / 2, y: cy - h / 2, w, h };
        this.el.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);
        this.renderEdit();
    }

    fit() {
        const b = levelBounds(this.host.level(), 60);
        this.view = { x: b.x, y: b.y, w: Math.max(b.w, 300), h: Math.max(b.h, 300) };
        this.applyView();
    }

    private world(e: { clientX: number; clientY: number }): Pt {
        const pt = this.el.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = this.el.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    }

    private wheel(e: WheelEvent) {
        e.preventDefault();
        const p = this.world(e);
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
            const w = Math.min(20000, Math.max(80, this.view.w * f));
            const k = w / this.view.w;
            this.view = { x: p.x - (p.x - this.view.x) * k, y: p.y - (p.y - this.view.y) * k, w, h: this.view.h * k };
        } else {
            this.view.x += e.deltaX / this.scale;
            this.view.y += e.deltaY / this.scale;
        }
        this.applyView();
    }

    // ---------- rendering ----------

    render() {
        const level = this.host.level();
        const ov = this.host.overlay();
        clear(this.gImage); clear(this.gLines); clear(this.gDots);
        if (ov.image) this.gImage.append(s('image', { href: ov.image.url, x: ov.image.x, y: ov.image.y, width: ov.image.w, height: ov.image.h, opacity: ov.image.opacity, style: 'pointer-events:none' }));
        for (const p of level.pairs) {
            const c = colour(p.color);
            const sel = this.host.selection.has(p.id);
            const stroke = c?.base ?? COMPLETED_LINE;
            const d = pathD(p.path);
            this.gLines.append(
                s('path', { d, class: 'hit', 'data-kind': 'line', 'data-pair': p.id }),
                s('path', { d, stroke, class: `line${sel ? ' sel' : ''}${ov.stuck?.has(p.id) ? ' stuck' : ''}`, 'data-kind': 'line', 'data-pair': p.id })
            );
            for (const end of ['a', 'b'] as const) {
                const dot = p[end];
                this.gDots.append(s('g', { 'data-kind': 'dot', 'data-pair': p.id, 'data-end': end, class: `dot${sel ? ' sel' : ''}` },
                    s('circle', { cx: dot.x, cy: dot.y, r: dot.r, fill: stroke }),
                    s('circle', { cx: dot.x - dot.r * 0.28, cy: dot.y - dot.r * 0.3, r: dot.r * 0.38, fill: c?.inner ?? '#fff', opacity: 0.55, style: 'pointer-events:none' }),
                    sel ? s('circle', { cx: dot.x, cy: dot.y, r: dot.r + 4, class: 'ring' }) : null));
            }
            const n = ov.order?.get(p.id);
            if (n !== undefined) {
                const m = samplePath(p.path, 8);
                const mid = m[Math.floor(m.length / 2)];
                this.gDots.append(s('g', { class: 'order', style: 'pointer-events:none' },
                    s('circle', { cx: mid.x, cy: mid.y, r: 12 }), s('text', { x: mid.x, y: mid.y + 4.5 }, n)));
            }
        }
        this.renderEdit();
    }

    /** Anchors and handles of a single selected pair (sized in screen px). */
    private renderEdit() {
        clear(this.gEdit);
        if (this.host.selection.size !== 1) return;
        const p = this.host.level().pairs.find((q) => this.host.selection.has(q.id));
        if (!p) return;
        const k = 1 / this.scale;
        p.path.forEach((an, i) => {
            for (const side of ['in', 'out'] as const) {
                const hd = an[side];
                if (!hd) continue;
                this.gEdit.append(
                    s('line', { x1: an.x, y1: an.y, x2: hd.x, y2: hd.y, class: 'hline', 'stroke-width': k }),
                    s('circle', { cx: hd.x, cy: hd.y, r: 4.5 * k, class: 'handle', 'stroke-width': 1.5 * k, 'data-kind': 'handle', 'data-pair': p.id, 'data-idx': i, 'data-side': side }));
            }
            if (i > 0 && i < p.path.length - 1)
                this.gEdit.append(s('rect', { x: an.x - 4.5 * k, y: an.y - 4.5 * k, width: 9 * k, height: 9 * k, class: 'anchor', 'stroke-width': 1.5 * k, 'data-kind': 'anchor', 'data-pair': p.id, 'data-idx': i }));
        });
    }

    private guides(xs: number[], ys: number[]) {
        clear(this.gGuides);
        const k = 1 / this.scale;
        for (const x of xs) this.gGuides.append(s('line', { x1: x, y1: this.view.y, x2: x, y2: this.view.y + this.view.h, class: 'guide', 'stroke-width': k }));
        for (const y of ys) this.gGuides.append(s('line', { x1: this.view.x, y1: y, x2: this.view.x + this.view.w, y2: y, class: 'guide', 'stroke-width': k }));
    }

    /** Figma-like snap: align x / y with other dots within 8 screen px. */
    private snap(p: Pt, exclude: Pt[]): Pt {
        const th = 8 / this.scale;
        const others = this.host.level().pairs.flatMap((q) => [q.a, q.b]).filter((d) => !exclude.includes(d));
        let bx: number | null = null, by: number | null = null, dx = th, dy = th;
        for (const o of others) {
            if (Math.abs(o.x - p.x) < dx) { dx = Math.abs(o.x - p.x); bx = o.x; }
            if (Math.abs(o.y - p.y) < dy) { dy = Math.abs(o.y - p.y); by = o.y; }
        }
        this.guides(bx === null ? [] : [bx], by === null ? [] : [by]);
        return { x: bx ?? p.x, y: by ?? p.y };
    }

    // ---------- pointer ----------

    private pair(id: string | undefined) {
        return this.host.level().pairs.find((p) => p.id === id);
    }

    private down(e: PointerEvent) {
        this.el.focus();
        const t = (e.target as Element).closest('[data-kind]') as SVGElement | null;
        const kind = t?.dataset.kind, pid = t?.dataset.pair;
        const p = this.world(e);
        this.el.setPointerCapture(e.pointerId);

        if (e.button === 1 || e.button === 2 || this.spaceDown || this.host.tool === 'pan') {
            this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
            return;
        }
        if (this.host.tool === 'pair') {
            this.drag = { kind: 'stroke', pts: [p], start: this.snap(p, []) };
            return;
        }
        const sel = this.host.selection;
        if (kind === 'handle' || kind === 'anchor') {
            this.host.begin();
            this.drag = kind === 'handle'
                ? { kind: 'handle', pair: pid!, idx: +t!.dataset.idx!, side: t!.dataset.side as 'in' | 'out', alt: e.altKey, moved: false }
                : { kind: 'anchor', pair: pid!, idx: +t!.dataset.idx!, moved: false };
            return;
        }
        if (kind === 'dot' || kind === 'line') {
            if (e.shiftKey) {
                if (sel.has(pid!)) sel.delete(pid!); else sel.add(pid!);
                this.host.selectionChanged();
                return;
            }
            if (!sel.has(pid!)) { sel.clear(); sel.add(pid!); this.host.selectionChanged(); }
            this.host.begin();
            if (kind === 'dot' && sel.size === 1 && !e.altKey) {
                this.drag = { kind: 'dot', pair: pid!, end: t!.dataset.end as 'a' | 'b', moved: false };
                return;
            }
            if (e.altKey) this.duplicateSelection(0);
            const orig = new Map(this.host.level().pairs.filter((q) => sel.has(q.id)).map((q) => [q.id, clonePair(q)]));
            this.drag = { kind: 'move', start: p, orig, moved: e.altKey };
            return;
        }
        this.drag = { kind: 'marquee', start: p, cur: p, additive: e.shiftKey };
        if (!e.shiftKey && sel.size) { sel.clear(); this.host.selectionChanged(); }
    }

    private move(e: PointerEvent) {
        const d = this.drag;
        if (!d) return;
        const p = this.world(e);
        switch (d.kind) {
            case 'pan':
                this.view.x = d.vx - (e.clientX - d.sx) / this.scale;
                this.view.y = d.vy - (e.clientY - d.sy) / this.scale;
                this.applyView();
                return;
            case 'stroke': {
                d.pts.push(p);
                clear(this.gTemp);
                const c = colour(this.host.activeColour)?.base ?? '#fff';
                // Faint raw stroke + the clean curve that will be created (Alt: keep sharp corners).
                this.gTemp.append(s('polyline', { points: d.pts.map((q) => `${q.x},${q.y}`).join(' '), stroke: c, class: 'stroke', opacity: 0.25 }));
                if (d.pts.length > 2) this.gTemp.append(s('polyline', { points: samplePath(fitFreehand(d.pts, 6 / this.scale, e.altKey), 4).map((q) => `${q.x},${q.y}`).join(' '), stroke: c, class: 'stroke' }));
                if (this.pendingA) this.gTemp.append(s('circle', { cx: this.pendingA.x, cy: this.pendingA.y, r: this.host.radiusDefault(), fill: c }));
                return;
            }
            case 'marquee': {
                d.cur = p;
                clear(this.gTemp);
                this.gTemp.append(s('rect', { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), width: Math.abs(p.x - d.start.x), height: Math.abs(p.y - d.start.y), class: 'marquee', 'stroke-width': 1 / this.scale }));
                return;
            }
            case 'move': {
                let dx = p.x - d.start.x, dy = p.y - d.start.y;
                // Snap the first selected pair's dot "a" to other dots.
                const first = [...d.orig.values()][0];
                if (first) {
                    const moving = this.host.level().pairs.filter((q) => d.orig.has(q.id)).flatMap((q) => [q.a, q.b]);
                    const target = this.snap({ x: first.a.x + dx, y: first.a.y + dy }, moving);
                    dx = target.x - first.a.x; dy = target.y - first.a.y;
                }
                for (const q of this.host.level().pairs) {
                    const o = d.orig.get(q.id);
                    if (!o) continue;
                    q.a.x = o.a.x + dx; q.a.y = o.a.y + dy; q.b.x = o.b.x + dx; q.b.y = o.b.y + dy;
                    q.path = translatePath(o.path, dx, dy);
                }
                d.moved ||= dx !== 0 || dy !== 0;
                break;
            }
            case 'dot': {
                const q = this.pair(d.pair)!;
                const sp = this.snap(p, [q[d.end]]);
                q[d.end].x = r1(sp.x); q[d.end].y = r1(sp.y);
                syncEnds(q);
                d.moved = true;
                break;
            }
            case 'anchor': {
                const q = this.pair(d.pair)!;
                const an = q.path[d.idx];
                const sp = this.snap(p, []);
                const dx = sp.x - an.x, dy = sp.y - an.y;
                q.path[d.idx] = translatePath([an], dx, dy)[0];
                d.moved = true;
                break;
            }
            case 'handle': {
                const q = this.pair(d.pair)!;
                const an = q.path[d.idx];
                an[d.side] = { x: r1(p.x), y: r1(p.y) };
                const other = d.side === 'in' ? 'out' : 'in';
                const oh = an[other];
                if (oh && !d.alt && !e.altKey) {
                    // Mirror the angle, keep the other handle's length.
                    const len = dist(an, oh), ang = Math.atan2(an.y - p.y, an.x - p.x);
                    an[other] = { x: r1(an.x + Math.cos(ang) * len), y: r1(an.y + Math.sin(ang) * len) };
                }
                d.moved = true;
                break;
            }
        }
        this.render();
        this.host.live();
    }

    private up(e: PointerEvent) {
        const d = this.drag;
        this.drag = null;
        clear(this.gGuides);
        if (!d) return;
        const sel = this.host.selection;
        switch (d.kind) {
            case 'stroke':
                clear(this.gTemp);
                this.finishStroke(d.pts, this.world(e), e.altKey, d.start);
                return;
            case 'marquee': {
                clear(this.gTemp);
                const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x);
                const y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
                if (x1 - x0 < 2 / this.scale && y1 - y0 < 2 / this.scale) return;
                const inside = (q: Pt) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
                for (const q of this.host.level().pairs) if (inside(q.a) || inside(q.b)) sel.add(q.id);
                this.host.selectionChanged();
                return;
            }
            case 'pan':
                return;
            default:
                this.host.end(d.moved);
        }
    }

    /** Pair tool: drag = freehand line (auto-rounded; Alt keeps sharp corners); two clicks = straight line. */
    private finishStroke(pts: Pt[], endPt: Pt, keepCorners = false, start: Pt = pts[0]) {
        const len = pts.reduce((acc, q, i) => (i ? acc + dist(pts[i - 1], q) : 0), 0);
        let a: Pt, b: Pt, path: Anchor[];
        if (len < 12 / this.scale) {
            const click = this.snap(endPt, []);
            clear(this.gGuides);
            if (!this.pendingA) {
                this.pendingA = click;
                const c = colour(this.host.activeColour)?.base ?? '#fff';
                this.gTemp.append(s('circle', { cx: click.x, cy: click.y, r: this.host.radiusDefault(), fill: c, opacity: 0.7 }));
                return;
            }
            a = this.pendingA; b = click;
            this.pendingA = null;
            clear(this.gTemp);
            if (dist(a, b) < DEFAULT_RADIUS * 2) return;
            path = [{ x: r1(a.x), y: r1(a.y) }, { x: r1(b.x), y: r1(b.y) }];
        } else {
            this.pendingA = null;
            const end = this.snap(pts[pts.length - 1], []);
            clear(this.gGuides);
            // Fit the stroke as drawn, then slide its ends (with their handles) onto the snapped
            // points, so snapping never adds a little hook at the ends.
            path = fitFreehand(pts, 6 / this.scale, keepCorners);
            const moveEnd = (an: Anchor, to: Pt) => {
                const dx = to.x - an.x, dy = to.y - an.y;
                an.x = r1(to.x); an.y = r1(to.y);
                for (const h of [an.in, an.out]) if (h) { h.x = r1(h.x + dx); h.y = r1(h.y + dy); }
            };
            moveEnd(path[0], start);
            moveEnd(path[path.length - 1], end);
            a = path[0]; b = path[path.length - 1];
            if (dist(a, b) < DEFAULT_RADIUS * 2 && path.length < 3) return;
        }
        const level = this.host.level();
        this.host.begin();
        const pair: Pair = { id: nextPairId(level), color: this.host.activeColour, a: { x: r1(a.x), y: r1(a.y), r: this.host.radiusDefault() }, b: { x: r1(b.x), y: r1(b.y), r: this.host.radiusDefault() }, path };
        syncEnds(pair);
        level.pairs.push(pair);
        this.host.selection.clear();
        this.host.selection.add(pair.id);
        this.host.end(true);
    }

    cancelPending() {
        this.pendingA = null;
        clear(this.gTemp);
    }

    private dbl(e: MouseEvent) {
        if (this.host.tool !== 'select') return;
        const t = (e.target as Element).closest('[data-kind]') as SVGElement | null;
        const q = this.pair(t?.dataset.pair);
        if (!q || this.host.selection.size !== 1 || !this.host.selection.has(q.id)) return;
        if (t!.dataset.kind === 'anchor') {
            const i = +t!.dataset.idx!;
            this.host.begin();
            q.path.splice(i, 1);
            this.host.end(true);
        } else if (t!.dataset.kind === 'line') {
            this.host.begin();
            insertAnchor(q, this.world(e));
            this.host.end(true);
        }
    }

    /** Copies the selection (offset in world px) and selects the copies. */
    duplicateSelection(offset: number): Pair[] {
        const level = this.host.level();
        const copies = level.pairs.filter((q) => this.host.selection.has(q.id)).map((q) => {
            const c = clonePair(q);
            c.id = nextPairId(level);
            c.a.x += offset; c.a.y += offset; c.b.x += offset; c.b.y += offset;
            c.path = translatePath(c.path, offset, offset);
            level.pairs.push(c);
            return c;
        });
        this.host.selection.clear();
        for (const c of copies) this.host.selection.add(c.id);
        return copies;
    }

    /** Pair under a world point (for tests / hit checks). */
    pairAt(p: Pt): Pair | undefined {
        return this.host.level().pairs.find((q) => distToPolyline(p, samplePath(q.path, 6)) < 8);
    }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Exact de Casteljau split of the segment nearest to `p`. */
function insertAnchor(q: Pair, p: Pt) {
    let best = { i: 0, t: 0.5, d: Infinity };
    for (let i = 0; i < q.path.length - 1; i++) {
        const a = q.path[i], b = q.path[i + 1];
        const c1 = a.out ?? a, c2 = b.in ?? b;
        for (let k = 1; k < 40; k++) {
            const t = k / 40;
            const pt = bez(a, c1, c2, b, t);
            const d = dist(pt, p);
            if (d < best.d) best = { i, t, d };
        }
    }
    const { i, t } = best;
    const a = q.path[i], b = q.path[i + 1];
    const p1 = a.out ?? a, p2 = b.in ?? b;
    const L = (u: Pt, v: Pt) => ({ x: r1(u.x + (v.x - u.x) * t), y: r1(u.y + (v.y - u.y) * t) });
    const q0 = L(a, p1), q1 = L(p1, p2), q2 = L(p2, b);
    const r0 = L(q0, q1), rr = L(q1, q2), m = L(r0, rr);
    a.out = q0;
    b.in = q2;
    q.path.splice(i + 1, 0, { x: m.x, y: m.y, in: r0, out: rr });
}

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
    const u = 1 - t;
    return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
}
