import * as Phaser from 'phaser';
import { Level, Pair, levelBounds } from '../core/level';
import { COMPLETED_LINE, colour, hexToInt } from '../core/palette';
import { Pt, arcLengths, dist, pointAt } from '../core/path';
import { BlockModel, HIT_SCALE, Side } from '../core/solver';
import { levels } from '../game/source';
import { tuning } from '../game/tuning';

// ---- Tunables (GDD 3.2 / 3.6) ----
export const HEARTS = 3;
export const MAX_ZOOM = 3;
export const HINT_ZOOM = 1.5;
export const LINE_WIDTH = 7;
/** Collision sub-step along the line, world px. */
const STEP = 4;
/** Top band reserved for the HUD, in game px (780 x 1688 canvas). */
export const HUD_HEIGHT = 230;

/** Elastic wobble after a bump: decaying squash/stretch along `angle`. */
interface Wobble {
    t: number;
    amp: number;
    angle: number;
}

const TRAIL = 9;

interface Mover {
    side: Side;
    open: boolean;
    pts: Pt[];
    acc: number[];
    s: number;
    returning: boolean;
}

export interface BoardState {
    hearts: number;
    cleared: number;
    total: number;
    name: string;
    number: number;
}

/** Board: lines, dots, taps, collisions, pinch zoom and pan. HUD lives in the Hud scene. */
export class Game extends Phaser.Scene {
    private level!: Level;
    private model!: BlockModel;
    private alive = new Set<string>();
    private movers = new Map<string, Mover>();
    private lines = new Map<string, { a: Pt[]; b: Pt[]; accA: number[]; accB: number[] }>();
    private gfx!: Phaser.GameObjects.Graphics;
    private hearts = HEARTS;
    private over = false;
    private baseZoom = 1;
    private bounds = { x: 0, y: 0, w: 1, h: 1 };
    private nudge: { id: string; side: Side; s: number } | null = null;
    /** Pairs that already bumped once (drawn with white stripes): their next bumps cost no heart. */
    private marked = new Set<string>();
    private wobbles = new Map<string, Wobble>();
    /** 0..1: the finished picture (all lines) fades in once the level is won. */
    private reveal = { a: 0 };
    private trails = new Map<string, Pt[]>();
    private pinch: { d: number; zoom: number; mid: Pt; scroll: Pt } | null = null;
    private dragFrom: { x: number; y: number; scroll: Pt; moved: boolean } | null = null;

    constructor() {
        super('Game');
    }

    create() {
        this.cameras.main.setBackgroundColor('#fbfaf3');
        this.gfx = this.add.graphics();
        const g = this.make.graphics({}, false);
        g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
        g.generateTexture('spark', 16, 16);
        g.destroy();
        this.input.addPointer(1);
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveP(p));
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
        this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(this.cameras.main.zoom * Math.exp(-dy * 0.0015), p));
        this.scale.on('resize', () => this.fit());
        this.scene.launch('Hud');
        levels.onLevel((l) => this.loadLevel(l));
    }

    loadLevel(level: Level) {
        this.level = structuredClone(level);
        this.model = new BlockModel(this.level.pairs);
        this.alive = new Set(this.level.pairs.map((p) => p.id));
        this.movers.clear();
        this.lines.clear();
        for (const p of this.level.pairs) {
            const a = this.model.line(p.id);
            const b = [...a].reverse();
            this.lines.set(p.id, { a, b, accA: arcLengths(a), accB: arcLengths(b) });
        }
        this.hearts = HEARTS;
        this.over = false;
        this.nudge = null;
        this.marked.clear();
        this.wobbles.clear();
        this.tweens.killTweensOf(this.reveal);
        this.reveal.a = 0;
        this.trails.clear();
        this.fit();
        this.emitState();
        this.events.emit('loaded');
    }

    restart() {
        const l = levels.level();
        if (l) this.loadLevel(l);
    }

    /** Dot the tutorial hand points at: an open dot ('tap') or a dot that will bump ('collision'). */
    tutorialTarget(kind: 'tap' | 'collision'): Pt | null {
        const pairs = [...this.alive].map((id) => this.pair(id)).filter((p) => !this.movers.has(p.id));
        if (kind === 'tap') {
            for (const p of pairs) { const side = this.model.openSide(p, this.alive); if (side) return p[side]; }
        } else {
            for (const p of pairs) if (!this.model.isOpen(p, 'a', this.alive)) return p.a;
            for (const p of pairs) if (!this.model.isOpen(p, 'b', this.alive)) return p.b;
        }
        return null;
    }

    /** World point -> game-canvas point (for HUD overlays). */
    toScreen(p: Pt): Pt {
        const cam = this.cameras.main;
        return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom };
    }

    get current(): Level {
        return this.level;
    }

    state(): BoardState {
        return { hearts: this.hearts, cleared: this.level.pairs.length - this.alive.size, total: this.level.pairs.length, name: this.level.name, number: levels.levelNumber() };
    }

    private emitState() {
        this.events.emit('state', this.state());
    }

    // ---------- camera ----------

    private fit() {
        if (!this.level) return;
        const cam = this.cameras.main;
        this.bounds = levelBounds(this.level, 50);
        // Tutorial levels keep the bottom free for the caption.
        const bottom = this.level.tutorial ? 300 : 40;
        const availH = this.scale.height - HUD_HEIGHT - bottom;
        this.baseZoom = Math.min(this.scale.width / this.bounds.w, availH / this.bounds.h);
        cam.setZoom(this.baseZoom);
        // Centre the level in the area below the HUD.
        const cx = this.bounds.x + this.bounds.w / 2;
        const cy = this.bounds.y + this.bounds.h / 2 - (HUD_HEIGHT - bottom) / 2 / this.baseZoom;
        cam.centerOn(cx, cy);
    }

    private clampCamera() {
        const cam = this.cameras.main;
        const c = cam.midPoint;
        const b = this.bounds;
        const x = Phaser.Math.Clamp(c.x, b.x, b.x + b.w);
        const y = Phaser.Math.Clamp(c.y, b.y - HUD_HEIGHT / cam.zoom, b.y + b.h);
        if (x !== c.x || y !== c.y) cam.centerOn(x, y);
    }

    private zoomAt(z: number, screen: { x: number; y: number }) {
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(screen.x, screen.y);
        cam.setZoom(Phaser.Math.Clamp(z, this.baseZoom, this.baseZoom * MAX_ZOOM));
        if (Math.abs(cam.zoom - this.baseZoom) > 0.05 * this.baseZoom) this.events.emit('zoomed');
        cam.preRender();
        const after = cam.getWorldPoint(screen.x, screen.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
        this.clampCamera();
    }

    /** Hint: random open pair, zoom to 1.5x on its dot, then nudge it along its line. */
    hint() {
        if (this.over) return;
        const open = [...this.alive].filter((id) => !this.movers.has(id)).map((id) => this.pair(id)).map((p) => ({ p, side: this.model.openSide(p, this.alive) })).filter((x) => x.side);
        if (!open.length) return;
        const { p, side } = open[Math.floor(Math.random() * open.length)];
        const dot = p[side!];
        const cam = this.cameras.main;
        cam.zoomTo(this.baseZoom * HINT_ZOOM, 450, 'Sine.easeInOut');
        cam.pan(dot.x, dot.y, 450, 'Sine.easeInOut');
        const nudge = { id: p.id, side: side!, s: 0 };
        this.nudge = nudge;
        this.tweens.add({ targets: nudge, s: 34, duration: 260, yoyo: true, repeat: 2, delay: 450, ease: 'Sine.easeInOut', onComplete: () => { if (this.nudge === nudge) this.nudge = null; } });
    }

    // ---------- input ----------

    private activePointers() {
        return this.input.manager.pointers.filter((p) => p.isDown);
    }

    private down(p: Phaser.Input.Pointer) {
        const ps = this.activePointers();
        const cam = this.cameras.main;
        if (ps.length >= 2) {
            const [a, b] = ps;
            this.pinch = { d: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: cam.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scroll: { x: cam.scrollX, y: cam.scrollY } };
            this.dragFrom = null;
            return;
        }
        this.dragFrom = { x: p.x, y: p.y, scroll: { x: cam.scrollX, y: cam.scrollY }, moved: false };
    }

    private moveP(p: Phaser.Input.Pointer) {
        const cam = this.cameras.main;
        if (this.pinch) {
            const ps = this.activePointers();
            if (ps.length < 2) return;
            const [a, b] = ps;
            const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            this.zoomAt(this.pinch.zoom * (d / this.pinch.d), mid);
            cam.scrollX -= (mid.x - this.pinch.mid.x) / cam.zoom;
            cam.scrollY -= (mid.y - this.pinch.mid.y) / cam.zoom;
            this.pinch.mid = mid;
            this.clampCamera();
            return;
        }
        const d = this.dragFrom;
        if (!d || !p.isDown) return;
        if (!d.moved && Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y) < 14) return;
        d.moved = true;
        if (cam.zoom <= this.baseZoom * 1.001) return; // pan only when zoomed in
        cam.scrollX = d.scroll.x - (p.x - d.x) / cam.zoom;
        cam.scrollY = d.scroll.y - (p.y - d.y) / cam.zoom;
        this.clampCamera();
    }

    private up(p: Phaser.Input.Pointer) {
        if (this.pinch) {
            if (this.activePointers().length < 2) this.pinch = null;
            this.dragFrom = null;
            return;
        }
        const d = this.dragFrom;
        this.dragFrom = null;
        if (!d || d.moved || this.over) return;
        this.tap(this.cameras.main.getWorldPoint(p.x, p.y));
    }

    private pair(id: string): Pair {
        return this.level.pairs.find((p) => p.id === id)!;
    }

    private tap(w: Pt) {
        let best: { p: Pair; side: Side; d: number } | null = null;
        const slack = 14 / this.cameras.main.zoom;
        for (const id of this.alive) {
            if (this.movers.has(id)) continue; // a running pair: its other dot can't be tapped
            const p = this.pair(id);
            for (const side of ['a', 'b'] as const) {
                const dd = dist(p[side], w);
                if (dd < p[side].r + slack && (!best || dd < best.d)) best = { p, side, d: dd };
            }
        }
        if (!best) return;
        this.events.emit('tapped');
        const ln = this.lines.get(best.p.id)!;
        this.movers.set(best.p.id, {
            side: best.side,
            open: this.model.isOpen(best.p, best.side, this.alive),
            pts: best.side === 'a' ? ln.a : ln.b,
            acc: best.side === 'a' ? ln.accA : ln.accB,
            s: 0,
            returning: false
        });
        if (this.nudge?.id === best.p.id) this.nudge = null;
    }

    // ---------- simulation ----------

    /** Current centre of a dot (moving dots follow their line). */
    private dotPos(p: Pair, side: Side): Pt {
        const m = this.movers.get(p.id);
        if (m && m.side === side) return pointAt(m.pts, m.acc, m.s);
        if (this.nudge && this.nudge.id === p.id && this.nudge.side === side) {
            const ln = this.lines.get(p.id)!;
            return side === 'a' ? pointAt(ln.a, ln.accA, this.nudge.s) : pointAt(ln.b, ln.accB, this.nudge.s);
        }
        return p[side];
    }

    update(_t: number, dtMs: number) {
        if (!this.level) return;
        const dt = Math.min(dtMs, 50) / 1000;
        for (const [id, m] of [...this.movers]) {
            const p = this.pair(id);
            const total = m.acc[m.acc.length - 1];
            this.pushTrail(id, pointAt(m.pts, m.acc, m.s));
            if (m.returning) {
                m.s -= tuning.returnSpeed * dt;
                if (m.s <= 0) { this.movers.delete(id); this.trails.delete(id); if (this.hearts <= 0) this.lose(); }
                continue;
            }
            // Advance in small steps so a fast dot can't tunnel through a blocker.
            let left = tuning.moveSpeed * dt;
            let hit: { key: string; pos: Pt } | null = null;
            while (left > 0 && m.s < total) {
                const step = Math.min(left, STEP);
                m.s = Math.min(total, m.s + step);
                left -= step;
                if (!m.open && (hit = this.hits(p, m))) break;
            }
            if (hit) {
                m.returning = true;
                const at = pointAt(m.pts, m.acc, m.s);
                const angle = Math.atan2(hit.pos.y - at.y, hit.pos.x - at.x);
                // Elastic bump on both dots.
                this.wobbles.set(`${id}:${m.side}`, { t: 0, amp: 0.32, angle });
                this.wobbles.set(hit.key, { t: 0, amp: 0.22, angle });
                // Marked (striped) pairs bump for free; the first bump costs a heart and marks the pair.
                if (!this.marked.has(id)) {
                    this.hearts = Math.max(0, this.hearts - 1);
                    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(30);
                }
                this.marked.add(id);
                this.emitState();
            } else if (m.s >= total) { this.trails.delete(id); this.clear(p, m.side); }
        }
        for (const [k, w] of this.wobbles) { w.t += dt; if (w.t > 0.7) this.wobbles.delete(k); }
        this.draw();
    }

    private pushTrail(id: string, p: Pt) {
        const t = this.trails.get(id) ?? [];
        t.push({ x: p.x, y: p.y });
        if (t.length > TRAIL) t.shift();
        this.trails.set(id, t);
    }

    /** Blocked movers collide with any dot that has a hitbox (open pairs in motion have none). */
    private hits(p: Pair, m: Mover): { key: string; pos: Pt } | null {
        const pos = pointAt(m.pts, m.acc, m.s);
        const r = p[m.side].r;
        for (const id of this.alive) {
            if (id === p.id) continue;
            const o = this.pair(id);
            const om = this.movers.get(id);
            if (om && om.open) continue;
            for (const side of ['a', 'b'] as const) {
                const q = this.dotPos(o, side);
                if (dist(pos, q) < (r + o[side].r) * HIT_SCALE) return { key: `${o.id}:${side}`, pos: q };
            }
        }
        return null;
    }

    private clear(p: Pair, from: Side) {
        this.movers.delete(p.id);
        this.alive.delete(p.id);
        const c = colour(p.color);
        const tint = hexToInt(c?.base ?? COMPLETED_LINE);
        const at = p[from === 'a' ? 'b' : 'a'];
        const size = Math.max(p.a.r, p.b.r);
        // Bigger dots, bigger splash.
        const fx = this.add.particles(at.x, at.y, 'spark', {
            speed: { min: size * 3, max: size * 11 }, lifespan: { min: 250, max: 600 }, scale: { start: size / 22, end: 0 },
            tint, quantity: Math.round(10 + size), emitting: false
        });
        fx.explode(Math.round(10 + size * 1.2));
        this.time.delayedCall(800, () => fx.destroy());
        this.emitState();
        if (!this.alive.size) {
            this.over = true;
            // Cleared lines are gone during play; the whole picture comes back once the level is won.
            this.tweens.add({ targets: this.reveal, a: 1, duration: 700, delay: 250, ease: 'Sine.easeOut' });
            this.time.delayedCall(1100, () => this.events.emit('win'));
        }
    }

    private lose() {
        if (this.over) return;
        this.over = true;
        this.time.delayedCall(350, () => this.events.emit('lose'));
    }

    // ---------- drawing ----------

    private draw() {
        const g = this.gfx;
        g.clear();
        const stroke = (pts: Pt[], col: number, w = LINE_WIDTH, alpha = 1) => {
            if (pts.length < 2) return;
            g.lineStyle(w, col, alpha);
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.strokePath();
            g.fillStyle(col, alpha);
            g.fillCircle(pts[0].x, pts[0].y, w / 2);
            g.fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, w / 2);
        };
        const done = hexToInt(COMPLETED_LINE);
        if (this.reveal.a > 0) for (const p of this.level.pairs) if (!this.alive.has(p.id)) stroke(this.model.line(p.id), done, LINE_WIDTH, this.reveal.a);
        for (const id of this.alive) {
            const p = this.pair(id);
            const col = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
            const m = this.movers.get(id);
            if (m) {
                // The line shortens behind the moving dot.
                const rest = [pointAt(m.pts, m.acc, m.s), ...m.pts.filter((_, i) => m.acc[i] > m.s)];
                stroke(rest, col);
            } else stroke(this.model.line(id), col);
        }
        // Trails behind moving dots.
        for (const [id, t] of this.trails) {
            if (!this.alive.has(id)) continue;
            const p = this.pair(id), m = this.movers.get(id);
            const r = m ? p[m.side].r : p.a.r;
            const col = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
            t.forEach((q, i) => {
                const k = (i + 1) / (t.length + 1);
                g.fillStyle(col, 0.28 * k);
                g.fillCircle(q.x, q.y, r * (0.35 + 0.55 * k));
            });
        }
        // Dots: soft drop shadows first (so they sit under every dot), then the glossy dots.
        const dots: { pos: Pt; r: number; name: string; sx: number; sy: number; angle: number; striped: boolean }[] = [];
        for (const id of this.alive) {
            const p = this.pair(id);
            const m = this.movers.get(id);
            for (const side of ['a', 'b'] as const) {
                let sx = 1, sy = 1, angle = 0;
                if (m && m.side === side) {
                    // Squash and stretch along the travel direction.
                    const a = pointAt(m.pts, m.acc, m.s), b = pointAt(m.pts, m.acc, m.s + (m.returning ? -6 : 6));
                    angle = Math.atan2(b.y - a.y, b.x - a.x);
                    sx = 1.16; sy = 0.88;
                }
                const w = this.wobbles.get(`${id}:${side}`);
                if (w) {
                    const e = w.amp * Math.exp(-w.t * 7) * Math.cos(w.t * 38);
                    if (!(m && m.side === side)) angle = w.angle;
                    sx *= 1 - e; sy *= 1 + e;
                }
                dots.push({ pos: this.dotPos(p, side), r: p[side].r, name: p.color, sx, sy, angle, striped: this.marked.has(id) });
            }
        }
        for (const d of dots) this.drawShadow(d.pos, d.r, d.sx, d.sy, d.angle);
        for (const d of dots) this.drawDot(d.pos, d.r, d.name, d.sx, d.sy, d.angle, d.striped);
    }

    /** Soft drop shadow below-right of a dot (light from the top-left). */
    private drawShadow(pos: Pt, r: number, sx: number, sy: number, angle: number) {
        const g = this.gfx;
        g.save();
        g.translateCanvas(pos.x + r * 0.14, pos.y + r * 0.3);
        g.rotateCanvas(angle);
        g.scaleCanvas(sx, sy);
        g.fillStyle(0x3a2f20, 0.07);
        g.fillCircle(0, 0, r * 1.12);
        g.fillStyle(0x3a2f20, 0.12);
        g.fillCircle(0, 0, r * 0.96);
        g.restore();
    }

    /** A glossy dot, optionally squashed (sx, sy along `angle`) and striped (marked pair). */
    private drawDot(pos: Pt, r: number, name: string, sx: number, sy: number, angle: number, striped: boolean) {
        const g = this.gfx;
        const c = colour(name);
        const base = hexToInt(c?.base ?? COMPLETED_LINE);
        g.save();
        g.translateCanvas(pos.x, pos.y);
        g.rotateCanvas(angle);
        g.scaleCanvas(sx, sy);
        // Lighting stays fixed in world space (light from the top-left): undo the rotation for offsets.
        const local = (x: number, y: number) => ({ x: (x * Math.cos(-angle) - y * Math.sin(-angle)) / sx, y: (x * Math.sin(-angle) + y * Math.cos(-angle)) / sy });
        const at = (fx: number, fy: number) => local(fx * r, fy * r);
        // Body: dark rim, lit body shifted towards the light, soft glow.
        g.fillStyle(shade(base, 0.62), 1);
        g.fillCircle(0, 0, r);
        let o = at(-0.08, -0.1);
        g.fillStyle(base, 1);
        g.fillCircle(o.x, o.y, r * 0.87);
        o = at(-0.17, -0.2);
        g.fillStyle(hexToInt(c?.gradient ?? '#ffffff'), 0.4);
        g.fillCircle(o.x, o.y, r * 0.6);
        if (striped) {
            // White diagonal stripes (chords of the circle at 45 degrees in world space).
            g.lineStyle(Math.max(2, r * 0.2), 0xffffff, 0.9);
            const d = local(Math.SQRT1_2, Math.SQRT1_2), n = local(-Math.SQRT1_2, Math.SQRT1_2);
            const dl = Math.hypot(d.x, d.y) || 1, nl = Math.hypot(n.x, n.y) || 1;
            for (const k of [-0.55, 0, 0.55]) {
                const h = Math.sqrt(1 - k * k) * r * 0.9;
                const cx = (n.x / nl) * k * r, cy = (n.y / nl) * k * r;
                g.beginPath();
                g.moveTo(cx - (d.x / dl) * h, cy - (d.y / dl) * h);
                g.lineTo(cx + (d.x / dl) * h, cy + (d.y / dl) * h);
                g.strokePath();
            }
        }
        // Gloss: broad soft highlight, sharp specular spot, and a faint bounce light at the bottom.
        o = at(-0.3, -0.34);
        g.fillStyle(hexToInt(c?.inner ?? '#ffffff'), 0.45);
        g.fillCircle(o.x, o.y, r * 0.38);
        g.fillStyle(0xffffff, 0.55);
        g.fillCircle(o.x, o.y, r * 0.24);
        o = at(-0.36, -0.4);
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(o.x, o.y, r * 0.12);
        o = at(0.36, 0.42);
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(o.x, o.y, r * 0.16);
        g.restore();
    }
}

/** Multiply a 0xRRGGBB colour by f (0..1 darkens). */
function shade(c: number, f: number): number {
    const r = Math.round(((c >> 16) & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round((c & 255) * f);
    return (r << 16) | (g << 8) | b;
}
