import * as Phaser from 'phaser';
import { Level, Pair, levelBounds } from '../core/level';
import { COMPLETED_LINE, colour, hexToInt, themeColours } from '../core/palette';
import { nearPairs } from '../core/generator';
import { Pt, arcLengths, dist, distToPolyline, pointAt } from '../core/path';
import { BlockModel, HIT_SCALE, Side } from '../core/solver';
import { levels } from '../game/source';
import { tuning } from '../game/tuning';
import { onSettings } from '../game/settings';
import { theme } from '../game/theme';
import { FLUFFY, JELLY, MAGIC } from '../game/mode';
import { Face, MINI_FACES, ballFill, hasArt, patternWorld, ballTexture, faceFrame, heartTexture, key as fluffyKey, makeFluffy, preloadFluffy, widthOf } from './fluffy';
import { DOOR_OPEN, Door, DoorState, ORB_FILL, orbTexture } from './Door';

// ---- Tunables (GDD 3.2 / 3.6) ----
export const HEARTS = 3;
export const MAX_ZOOM = 3;
export const HINT_ZOOM = 1.5;
export { LINE_WIDTH } from '../core/level';
import { LINE_WIDTH } from '../core/level';
/** Every line has the same width (designer); only the dots change size. */
export const lineWidth = (_p?: unknown) => LINE_WIDTH;
/** Collision sub-step along the line, world px. */
const STEP = 4;
/** Top band reserved for the HUD, in game px (780 x 1688 canvas). */
export const HUD_HEIGHT = 230;
/** Bottom band with the boosters (drawn over the board, in the background colour). */
export const BOTTOM_HEIGHT = 210;

/** Elastic wobble after a bump: decaying squash/stretch along `angle`. */
interface Wobble {
    t: number;
    amp: number;
    angle: number;
}

/** Trail length in frames (fluffy: a longer trail, with sparkles). */
const TRAIL = FLUFFY ? 24 : 9;

// ---- Jelly variant (src/game/mode.ts) ----
/** Bump wobble: amplitude on the moving / the hit dot, decay per second, frequency (rad/s), length (s). */
const WOBBLE = JELLY ? { mover: 0.5, hit: 0.4, decay: 3.6, freq: 24, life: 1.3 } : { mover: 0.32, hit: 0.22, decay: 7, freq: 38, life: 0.7 };
/**
 * Fluffy: a ball that touches its partner: the two bump (squash and wobble) and stay together, happy,
 * for tuning.hugHold s (HUG_HOLD in src/game/tuning.ts, live in the dev panel), then pop into little
 * hearts and shrink away in HUG_POP s.
 */
/** Fluffy: a bumped pair shows the awake face instead of stripes, once that picture is there. */
const AWAKE = FLUFFY && hasArt('face-awake');
const HUG_POP = 0.2;
const hugHold = () => tuning.hugHold, hugEnd = () => tuning.hugHold + HUG_POP;
/** Fluffy: the background pattern scrolls this fast (world px/s) from the top left to the bottom right. */
const PATTERN_SPEED = 22;

/** Jelly stretch spring (stiffness, damping: well under critical, so it overshoots and wobbles). */
const SPRING = { k: 320, c: 8 };
/** Jelly merge: the two dots press together (s), then the merged blob jiggles (s) and pops. */
const PRESS = 0.16, JIGGLE = 0.4;

/** Jelly stretch of one dot along `angle`: d = 0 round, d > 0 longer along the travel direction. */
interface Stretch {
    d: number;
    v: number;
    target: number;
    angle: number;
}

/** Jelly: a dot that reached its partner, pressing into it and merging (drawn until it pops). */
interface Merge {
    pair: Pair;
    /** The arriving dot, the partner. */
    a: Pt;
    b: Pt;
    ra: number;
    rb: number;
    t: number;
}

/**
 * Magic variant: where the level is in its door cycle. closing: the leaves slide shut; intro: one dot
 * of each pair runs from the other's end to its own; play; opening: the seal is broken.
 */
type Phase = 'closing' | 'intro' | 'play' | 'opening';

/** Keep the parts of a polyline left (or right) of the vertical line x = x0, cut exactly at x0. */
function clipX(pts: Pt[], x0: number, left: boolean): Pt[][] {
    const inside = (p: Pt) => (left ? p.x <= x0 : p.x >= x0);
    const out: Pt[][] = [];
    let cur: Pt[] = [];
    pts.forEach((p, i) => {
        const q = pts[i - 1];
        if (q && inside(q) !== inside(p)) {
            const c = { x: x0, y: q.y + ((p.y - q.y) * (x0 - q.x)) / (p.x - q.x) };
            if (inside(q)) { cur.push(c); out.push(cur); cur = []; } else cur = [c];
        }
        if (inside(p)) cur.push(p);
    });
    if (cur.length > 1) out.push(cur);
    return out;
}

interface Mover {
    side: Side;
    open: boolean;
    pts: Pt[];
    acc: number[];
    s: number;
    returning: boolean;
    /** Seconds since the dot set off (it accelerates). */
    t: number;
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
    private trails = new Map<string, Pt[]>();
    /** Fluffy: the sparkle emitter of each moving ball, and the time since its last sparkle. */
    private sparks = new Map<string, { fx: Phaser.GameObjects.Particles.ParticleEmitter; t: number }>();
    private stretches = new Map<string, Stretch>();
    /** Each pair's colour as the level has it (the shown colour may be swapped for the theme: recolour). */
    private levelColours = new Map<string, string>();
    /** Lines that cross or run near each other (index pairs), for picking the colours shown per theme. */
    private nearLines?: [number, number][];
    private merges: Merge[] = [];
    // ---- Fluffy theme ----
    private bg?: Phaser.GameObjects.TileSprite;
    private bodies: Phaser.GameObjects.Image[] = [];
    private faces: Phaser.GameObjects.Image[] = [];
    /** Pairs that met: the two balls hug, happy, before they pop into hearts. */
    private hugs: { pair: Pair; a: Pt; b: Pt; ra: number; rb: number; t: number }[] = [];
    // ---- Magic variant ----
    /** Door state shared with the Door scene (screen px / 0..1). */
    private door: DoorState = { off: DOOR_OPEN, glow: 0, burst: 0 };
    /** Orb dots (when the orb picture exists): one image per dot drawn, stripes on top. */
    private orbs: Phaser.GameObjects.Image[] = [];
    private overG!: Phaser.GameObjects.Graphics;
    private phase: Phase = 'play';
    /** Intro run per pair: seconds since it started, and how long it takes. */
    private intro = new Map<string, { t: number; dur: number }>();
    /** The glowing map on the left and right leaf (shown when the seal breaks, slides with the leaves). */
    private mapL!: Phaser.GameObjects.Graphics;
    private mapR!: Phaser.GameObjects.Graphics;
    /** How lit the map is (0..1): it lights up first, before the seam. */
    private mapLit = { v: 0 };
    /** World x of the seam and the camera centre at the base zoom. */
    private home = { x: 0, y: 0 };
    private pinch: { d: number; zoom: number; mid: Pt; scroll: Pt } | null = null;
    private dragFrom: { x: number; y: number; scroll: Pt; moved: boolean } | null = null;
    /** Scissors booster armed: the next tap on a line removes that pair. */
    private cutting = false;
    /** The collision tutorial level forgives its first bump (no heart lost). */
    private freeBump = false;

    constructor() {
        super('Game');
    }

    preload() {
        if (FLUFFY) preloadFluffy(this);
    }

    create() {
        if (FLUFFY) {
            makeFluffy(this);
            this.bg = this.add.tileSprite(0, 0, 1, 1, fluffyKey('pattern-light')).setDepth(-10);
        }
        this.applyTheme();
        const off = onSettings(() => this.applyTheme());
        this.events.once('shutdown', off);
        this.gfx = this.add.graphics();
        this.mapL = this.add.graphics().setDepth(3).setVisible(false);
        this.mapR = this.add.graphics().setDepth(3).setVisible(false);
        this.overG = this.add.graphics().setDepth(2);
        if (MAGIC) {
            this.scene.launch('Door');
            this.scene.sendToBack('Door');
            (this.scene.get('Door') as Door).bind(this.door);
        }
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

    /** Background colour of the board for the current theme (light / dark). */
    private applyTheme() {
        // Magic: the door (Door scene, below) is the board.
        this.cameras.main.setBackgroundColor(MAGIC ? 'rgba(0,0,0,0)' : theme().background);
        if (!MAGIC) document.body.style.background = theme().background; // magic: the Door scene sets it
        if (this.bg) {
            // Fluffy: the pattern of the theme, one tile covering patternWorld() world px.
            this.bg.setTexture(fluffyKey(theme().dark ? 'pattern-dark' : 'pattern-light'));
            const k = patternWorld() / this.bg.frame.width;
            this.bg.setTileScale(k, k);
        }
        this.recolour();
    }

    /**
     * Colours not kept on the board of the current theme (palette.THEME_COLOURS) are shown as a kept
     * colour that does not clash with the lines crossing or near them (palette.themeColours);
     * switching the theme picks again. The level file keeps its own colours.
     */
    private recolour() {
        if (!this.level) return;
        this.nearLines ??= nearPairs(this.level.pairs);
        const shown = themeColours(this.level.pairs.map((p) => this.levelColours.get(p.id) ?? p.color), this.nearLines, theme().board);
        this.level.pairs.forEach((p, i) => (p.color = shown[i]));
    }

    loadLevel(level: Level) {
        this.level = structuredClone(level);
        this.levelColours = new Map(this.level.pairs.map((p) => [p.id, p.color]));
        this.nearLines = undefined;
        this.recolour();
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
        this.freeBump = this.level.tutorial === 'collision';
        this.wobbles.clear();
        this.trails.clear();
        for (const s of this.sparks.values()) s.fx.destroy();
        this.sparks.clear();
        this.stretches.clear();
        this.merges = [];
        this.hugs = [];
        this.setCutting(false);
        this.cameras.main.panEffect.reset();
        this.cameras.main.zoomEffect.reset();
        this.fit();
        if (MAGIC) this.closeDoor();
        this.emitState();
        this.events.emit('loaded');
    }

    // ---------- magic variant: the door ----------

    /** Busy with the door or the intro run: taps wait. */
    private get doorBusy() {
        return MAGIC && this.phase !== 'play';
    }

    /** New level: the leaves slam shut (if open), then the dots run out along their lines. */
    private closeDoor() {
        this.tweens.killTweensOf(this.door);
        this.door.glow = 0;
        this.door.burst = 0;
        this.tweens.killTweensOf(this.mapLit);
        this.mapLit.v = 0;
        this.intro.clear();
        if (this.door.off <= 0) { this.events.emit('doorClosed'); return this.startIntro(); }
        this.phase = 'closing';
        this.tweens.add({
            targets: this.door, off: 0, duration: 430, ease: 'Quad.easeIn',
            onComplete: () => {
                (this.scene.get('Door') as Door).slam();
                this.events.emit('doorClosed');
                this.cameras.main.shake(170, 0.006);
                this.time.delayedCall(140, () => this.startIntro());
            }
        });
    }

    /** Both dots of a pair start at its first end; one runs along the line to the other end. */
    private startIntro() {
        this.phase = 'intro';
        for (const p of this.level.pairs) {
            const len = this.lines.get(p.id)!.accA.at(-1)!;
            this.intro.set(p.id, { t: 0, dur: Phaser.Math.Clamp(len / 1400, 0.35, 0.85) });
        }
    }

    /** Intro run of a pair: how far its second dot is along the line (0..length), or null when done. */
    private introAt(id: string): number | null {
        const r = this.intro.get(id);
        if (!r) return null;
        const k = Math.min(1, r.t / r.dur);
        return (1 - (1 - k) ** 3) * this.lines.get(id)!.accA.at(-1)!;
    }

    /** All lines cleared: back to the base zoom, light through the seam, the leaves open, then Well Done. */
    private openDoor() {
        this.phase = 'opening';
        const cam = this.cameras.main;
        this.time.delayedCall(250, () => {
            cam.zoomTo(this.baseZoom, 380, 'Sine.easeInOut');
            cam.pan(this.home.x, this.home.y, 380, 'Sine.easeInOut');
        });
        // First the map (lines and dots) lights up, then the seam cracks with light, then the leaves part.
        this.tweens.add({ targets: this.mapLit, v: 1, duration: 450, delay: 250, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.door, glow: 1, duration: 550, delay: 850, ease: 'Sine.easeIn' });
        this.tweens.add({ targets: this.door, off: DOOR_OPEN, duration: 800, delay: 1450, ease: 'Cubic.easeInOut', onStart: () => this.events.emit('doorOpening') });
        this.tweens.add({ targets: this.door, burst: 1, duration: 450, delay: 1450, yoyo: true, hold: 300, ease: 'Sine.easeOut' });
        this.time.delayedCall(2000, () => this.events.emit('win'));
    }

    /**
     * The level's map (every line and dot), glowing like the light in the seam: shown when the seal breaks and
     * cut at the seam onto the two leaves, so it parts with them as the door opens.
     */
    private drawMap() {
        if (!this.mapL) return;
        for (const g of [this.mapL, this.mapR]) g.clear();
        if (!MAGIC || !this.level) return;
        const layers = [
            { col: 0xffb43c, a: 0.22, w: LINE_WIDTH * 5 },
            { col: 0xffcf6b, a: 0.5, w: LINE_WIDTH * 2.6 },
            { col: 0xfff8e2, a: 1, w: LINE_WIDTH * 1.2 }
        ];
        for (const [g, left] of [[this.mapL, true], [this.mapR, false]] as const) {
            for (const L of layers) {
                g.lineStyle(L.w, L.col, L.a);
                g.fillStyle(L.col, L.a);
                for (const p of this.level.pairs) {
                    for (const part of clipX(this.model.line(p.id), this.home.x, left)) {
                        g.beginPath();
                        g.moveTo(part[0].x, part[0].y);
                        for (const q of part.slice(1)) g.lineTo(q.x, q.y);
                        g.strokePath();
                        for (const q of [part[0], part[part.length - 1]]) if (q.x !== this.home.x) g.fillCircle(q.x, q.y, L.w / 2);
                    }
                }
            }
            // The dots, lit the same way, where they started.
            for (const p of this.level.pairs) for (const d of [p.a, p.b]) {
                if ((d.x <= this.home.x) !== left) continue;
                g.fillStyle(0xffb43c, 0.22).fillCircle(d.x, d.y, d.r * 1.9);
                g.fillStyle(0xffcf6b, 0.55).fillCircle(d.x, d.y, d.r * 1.3);
                g.fillStyle(0xfff8e2, 1).fillCircle(d.x, d.y, d.r);
                g.fillStyle(0xffffff, 1).fillCircle(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.3);
            }
        }
    }

    /** Per frame: intro runs; the glowing map rides the leaves. */
    private stepDoor(dt: number) {
        if (this.phase === 'intro') {
            let done = true;
            for (const r of this.intro.values()) { r.t += dt; if (r.t < r.dur) done = false; }
            if (done) { this.intro.clear(); this.phase = 'play'; this.events.emit('introDone'); }
        }
        const dx = this.door.off / this.cameras.main.zoom;
        const glow = this.phase === 'opening' ? this.mapLit.v : 0;
        for (const [g, x] of [[this.mapL, -dx], [this.mapR, dx]] as const) g.setPosition(x, 0).setAlpha(glow).setVisible(glow > 0);
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
        const bottom = BOTTOM_HEIGHT + (this.level.tutorial ? 150 : 20);
        const availH = this.scale.height - HUD_HEIGHT - bottom;
        this.baseZoom = Math.min(this.scale.width / this.bounds.w, availH / this.bounds.h);
        cam.setZoom(this.baseZoom);
        // Centre the level in the area below the HUD.
        const cx = this.bounds.x + this.bounds.w / 2;
        const cy = this.bounds.y + this.bounds.h / 2 - (HUD_HEIGHT - bottom) / 2 / this.baseZoom;
        cam.centerOn(cx, cy);
        this.home = { x: cx, y: cy };
        if (this.bg) {
            // Fluffy: big enough for any pan at the widest zoom (it zooms with the board).
            const span = (Math.max(this.scale.width, this.scale.height) / this.baseZoom) * 3;
            this.bg.setPosition(cx, cy).setSize(span, span);
        }
        this.drawMap();
    }

    private clampCamera() {
        const cam = this.cameras.main;
        const c = cam.midPoint;
        const b = this.bounds;
        const x = Phaser.Math.Clamp(c.x, b.x, b.x + b.w);
        const y = Phaser.Math.Clamp(c.y, b.y - HUD_HEIGHT / cam.zoom, b.y + b.h + BOTTOM_HEIGHT / cam.zoom);
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
        if (this.over || this.doorBusy) return;
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

    /** The HUD bands (top and bottom) belong to the HUD: a touch there is not a tap or a drag on the board. */
    private inHud(p: { y: number }) {
        return p.y < HUD_HEIGHT || p.y > this.scale.height - BOTTOM_HEIGHT;
    }

    private down(p: Phaser.Input.Pointer) {
        const ps = this.activePointers();
        const cam = this.cameras.main;
        if (ps.length < 2 && this.inHud(p)) { this.dragFrom = null; return; }
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
        if (!d || d.moved || this.over || this.doorBusy) return;
        this.tap(this.cameras.main.getWorldPoint(p.x, p.y));
    }

    private pair(id: string): Pair {
        return this.level.pairs.find((p) => p.id === id)!;
    }

    /** Scissors booster: arm / disarm (the HUD shows it). */
    setCutting(on: boolean) {
        if (on && (this.over || !this.alive.size)) return;
        if (this.cutting === on) return;
        this.cutting = on;
        this.events.emit('cutting', on);
    }

    get isCutting() {
        return this.cutting;
    }

    /** Scissors: the line (or dot) of a resting pair nearest to the tap is cut and the pair disappears. */
    private cutAt(w: Pt) {
        const slack = 26 / this.cameras.main.zoom;
        let best: { p: Pair; d: number } | null = null;
        for (const id of this.alive) {
            if (this.movers.has(id)) continue;
            const p = this.pair(id);
            const d = Math.min(distToPolyline(w, this.model.line(id)), dist(w, p.a) - p.a.r, dist(w, p.b) - p.b.r);
            if (d < slack && (!best || d < best.d)) best = { p, d };
        }
        if (!best) return; // missed: stay armed
        const p = best.p;
        this.setCutting(false);
        if (this.nudge?.id === p.id) this.nudge = null;
        // Snip at the tap, then both dots pop.
        const tint = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
        const snip = this.add.particles(w.x, w.y, 'spark', { speed: { min: 60, max: 260 }, lifespan: { min: 200, max: 450 }, scale: { start: 0.7, end: 0 }, tint: [0xffffff, tint], emitting: false });
        snip.explode(18);
        this.time.delayedCall(600, () => snip.destroy());
        this.pop(p.a, p.a.r, tint);
        this.pop(p.b, p.b.r, tint);
        this.removePair(p);
    }

    private tap(w: Pt) {
        if (this.cutting) return this.cutAt(w);
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
        if (!best) { if (FLUFFY) this.ghostBalls(w); return; }
        this.events.emit('tapped');
        const ln = this.lines.get(best.p.id)!;
        this.movers.set(best.p.id, {
            side: best.side,
            open: this.model.isOpen(best.p, best.side, this.alive),
            pts: best.side === 'a' ? ln.a : ln.b,
            acc: best.side === 'a' ? ln.accA : ln.accB,
            s: 0,
            returning: false,
            t: 0
        });
        if (this.nudge?.id === best.p.id) this.nudge = null;
        // Fluffy: a little puff of fur where the ball was tapped.
        if (FLUFFY) this.furPuff(w, best.p[best.side].r, -Math.PI / 2, best.p.color, 180, 0, [11, 15]);
    }

    // ---------- simulation ----------

    /** Current centre of a dot (moving dots follow their line). */
    private dotPos(p: Pair, side: Side): Pt {
        const m = this.movers.get(p.id);
        if (m && m.side === side) return pointAt(m.pts, m.acc, m.s);
        const run = this.introAt(p.id);
        if (run !== null && side === 'b') { const ln = this.lines.get(p.id)!; return pointAt(ln.a, ln.accA, run); }
        if (this.nudge && this.nudge.id === p.id && this.nudge.side === side) {
            const ln = this.lines.get(p.id)!;
            return side === 'a' ? pointAt(ln.a, ln.accA, this.nudge.s) : pointAt(ln.b, ln.accB, this.nudge.s);
        }
        return p[side];
    }

    update(_t: number, dtMs: number) {
        if (!this.level) return;
        const dt = Math.min(dtMs, 50) / 1000;
        if (MAGIC) this.stepDoor(dt);
        for (const [id, m] of [...this.movers]) {
            const p = this.pair(id);
            const total = m.acc[m.acc.length - 1];
            // Jelly: the dot stops where it touches its partner (then they merge).
            const end = JELLY || FLUFFY ? Math.max(0, total - (p.a.r + p.b.r) * (FLUFFY ? 1 : 0.9)) : total;
            if (JELLY) this.stretchTo(`${id}:${m.side}`, m.returning ? tuning.returnSpeed : tuning.startSpeed + tuning.accel * m.t);
            else this.pushTrail(id, pointAt(m.pts, m.acc, m.s));
            if (m.returning) {
                m.s -= tuning.returnSpeed * dt;
                if (m.s <= 0) { this.movers.delete(id); this.trails.delete(id); if (this.hearts <= 0) this.lose(); }
                continue;
            }
            // Advance in small steps so a fast dot can't tunnel through a blocker.
            // Accelerates: start speed, +accel every second (speed at the middle of this frame).
            const speed = tuning.startSpeed + tuning.accel * (m.t + dt / 2);
            m.t += dt;
            let left = speed * dt;
            let hit: { key: string; pos: Pt } | null = null;
            while (left > 0 && m.s < end) {
                const step = Math.min(left, STEP);
                m.s = Math.min(end, m.s + step);
                left -= step;
                if (!m.open && (hit = this.hits(p, m))) break;
            }
            if (hit) {
                m.returning = true;
                const at = pointAt(m.pts, m.acc, m.s);
                const angle = Math.atan2(hit.pos.y - at.y, hit.pos.x - at.x);
                // Elastic bump on both dots.
                this.wobbles.set(`${id}:${m.side}`, { t: 0, amp: WOBBLE.mover, angle });
                this.wobbles.set(hit.key, { t: 0, amp: WOBBLE.hit, angle });
                // Droplets in each dot's colour, splashing away from where they touched.
                const [hid, hside] = hit.key.split(':') as [string, Side];
                const other = this.pair(hid);
                this.splash(at, p[m.side].r, angle + Math.PI, p.color);
                this.splash(hit.pos, other[hside].r, angle, other.color);
                // Marked (striped) pairs bump for free; the first bump costs a heart and marks the pair.
                if (this.freeBump) {
                    // Tutorial: the first bump is free (the HUD says the next one costs a heart).
                    this.freeBump = false;
                    this.events.emit('freebump');
                } else if (!this.marked.has(id)) {
                    this.hearts = Math.max(0, this.hearts - 1);
                    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(30);
                }
                this.marked.add(id);
                this.emitState();
            } else if (m.s >= end) {
                this.trails.delete(id);
                // Reaching the partner splashes too: the arriving dot backwards, the partner forwards.
                const to = m.side === 'a' ? 'b' : 'a';
                const at = pointAt(m.pts, m.acc, m.s), before = pointAt(m.pts, m.acc, Math.max(0, m.s - 8));
                const dir = at.x === before.x && at.y === before.y ? Math.atan2(p[to].y - at.y, p[to].x - at.x) : Math.atan2(at.y - before.y, at.x - before.x);
                if (!FLUFFY) {
                    this.splash(at, p[m.side].r, dir + Math.PI, p.color);
                    this.splash(p[to], p[to].r, dir, p.color);
                }
                if (JELLY) this.merge(p, m);
                else if (FLUFFY) this.hug(p, m);
                else this.clear(p, m.side);
            }
        }
        for (const [k, w] of this.wobbles) { w.t += dt; if (w.t > WOBBLE.life) this.wobbles.delete(k); }
        if (JELLY) this.stepJelly(dt);
        if (FLUFFY) this.stepFluffy(dt);
        this.draw();
    }

    /** Fluffy: the ball touched its partner: the pair leaves the board and the two balls hug, then pop into hearts. */
    private hug(p: Pair, m: Mover) {
        const to = m.side === 'a' ? 'b' : 'a';
        const a = pointAt(m.pts, m.acc, m.s), b = { x: p[to].x, y: p[to].y };
        const hug = { pair: p, a, b, ra: p[m.side].r, rb: p[to].r, t: 0 };
        this.hugs.push(hug);
        // Fur flies where the two touch.
        const r = Math.max(p.a.r, p.b.r), at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.furPuff(at, r, -Math.PI / 2, p.color, 180, 0, [14, 18]);
        this.removePair(p);
    }

    /** Fluffy: hugs run their course (then hearts), moving balls leave sparkles, and the background scrolls diagonally. */
    private stepFluffy(dt: number) {
        this.stepSparks(dt);
        this.scrollPattern(dt);
        for (const h of [...this.hugs]) {
            const was = h.t;
            h.t += dt;
            if (was < hugHold() && h.t >= hugHold()) this.heartsAt(h);
            if (h.t >= hugEnd()) this.hugs.splice(this.hugs.indexOf(h), 1);
        }
    }

    /** Fluffy: little hearts in the pair's colour burst up from where the two balls touched. */
    private heartsAt(h: { pair: Pair; a: Pt; b: Pt; ra: number; rb: number }) {
        const c = { x: (h.a.x + h.b.x) / 2, y: (h.a.y + h.b.y) / 2 }, r = Math.max(h.ra, h.rb);
        const hw = widthOf(this, 'heart');
        const fx = this.add.particles(c.x, c.y, heartTexture(this, h.pair.color), {
            angle: { min: -150, max: -30 }, speed: { min: r * 3, max: r * 8 }, gravityY: -r * 2,
            lifespan: { min: 700, max: 1100 }, scale: { start: (r * 1.4) / hw, end: (r * 0.7) / hw },
            alpha: { start: 1, end: 0 }, rotate: { min: -25, max: 25 }, emitting: false
        });
        fx.setDepth(3);
        fx.explode(Phaser.Math.Between(6, 9));
        this.time.delayedCall(1200, () => fx.destroy());
    }

    /** Fluffy: the background scrolls diagonally. */
    private scrollPattern(dt: number) {
        if (this.bg) {
            const k = this.bg.tileScaleX || 1;
            this.bg.tilePositionX -= (PATTERN_SPEED * dt) / k;
            this.bg.tilePositionY -= (PATTERN_SPEED * dt) / k;
        }
    }

    /** Jelly: the moving dot stretches more the faster it goes (spring target, eased in stepJelly). */
    private stretchTo(key: string, speed: number) {
        const s = this.stretches.get(key) ?? { d: 0, v: 0, target: 0, angle: 0 };
        s.target = Math.min(0.42, 0.1 + speed / 3600);
        this.stretches.set(key, s);
    }

    private stepJelly(dt: number) {
        for (const [key, s] of this.stretches) {
            const [id, side] = key.split(':');
            const m = this.movers.get(id);
            if (!m || m.side !== side) s.target = 0; // stopped: springs back round, wobbling
            const a = SPRING.k * (s.target - s.d) - SPRING.c * s.v;
            s.v += a * dt;
            s.d += s.v * dt;
            if (!this.alive.has(id) || (s.target === 0 && Math.abs(s.d) < 0.003 && Math.abs(s.v) < 0.02)) this.stretches.delete(key);
        }
        for (const mg of [...this.merges]) {
            mg.t += dt;
            if (mg.t >= PRESS + JIGGLE) {
                this.merges.splice(this.merges.indexOf(mg), 1);
                const c = this.mergeCentre(mg);
                this.pop(c, Math.hypot(mg.ra, mg.rb) * 1.15, hexToInt(colour(mg.pair.color)?.base ?? COMPLETED_LINE));
            }
        }
    }

    /** Jelly: the dot touched its partner: the pair leaves the board and the two blobs merge, then pop. */
    private merge(p: Pair, m: Mover) {
        const to = m.side === 'a' ? 'b' : 'a';
        this.merges.push({ pair: p, a: pointAt(m.pts, m.acc, m.s), b: { x: p[to].x, y: p[to].y }, ra: p[m.side].r, rb: p[to].r, t: 0 });
        this.removePair(p);
    }

    /** Where the merged blob sits: between the two dots, nearer the bigger one. */
    private mergeCentre(mg: Merge): Pt {
        const wa = mg.ra * mg.ra, wb = mg.rb * mg.rb;
        return { x: (mg.a.x * wa + mg.b.x * wb) / (wa + wb), y: (mg.a.y * wa + mg.b.y * wb) / (wa + wb) };
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

    /**
     * Bump: a few droplets in the dot's colour fly off its far side (a fan of ±65° around `angle`),
     * fall a little and shrink away. Some are lighter (the colour's highlight) for a wet look.
     */
    private splash(at: Pt, r: number, angle: number, name: string) {
        if (FLUFFY) return this.furPuff(at, r, angle, name);
        const c = colour(name);
        const base = hexToInt(c?.base ?? COMPLETED_LINE), light = hexToInt(c?.gradient ?? '#ffffff');
        const deg = Phaser.Math.RadToDeg(angle);
        const fx = this.add.particles(at.x + Math.cos(angle) * r * 0.7, at.y + Math.sin(angle) * r * 0.7, 'spark', {
            angle: { min: deg - 65, max: deg + 65 },
            speed: { min: r * 7, max: r * 15 },
            lifespan: { min: 280, max: 520 },
            scale: { start: (r * 0.26) / 8, end: (r * 0.06) / 8 },
            gravityY: r * 30,
            tint: [base, base, light],
            emitting: false
        });
        fx.setDepth(1);
        fx.explode(Phaser.Math.Between(6, 9));
        this.time.delayedCall(700, () => fx.destroy());
    }

    /**
     * Fluffy: a few tufts of fur (the ball's colour) fly off and fade. A bump: off its far side (a fan of
     * ±70° round `angle`, from its edge); a tap or two balls meeting: all round (spread 180) from `at`.
     */
    private furPuff(at: Pt, r: number, angle: number, name: string, spread = 70, from = 0.8, count: [number, number] = [10, 14]) {
        const c = colour(name);
        const base = hexToInt(c?.base ?? COMPLETED_LINE); // one colour: the ball's
        const deg = Phaser.Math.RadToDeg(angle);
        const fx = this.add.particles(at.x + Math.cos(angle) * r * from, at.y + Math.sin(angle) * r * from, fluffyKey('fur'), {
            angle: { min: deg - spread, max: deg + spread }, speed: { min: r * 3, max: r * 8 }, gravityY: r * 6,
            lifespan: { min: 500, max: 900 }, scale: { start: (r * 0.75) / widthOf(this, 'fur'), end: (r * 0.35) / widthOf(this, 'fur') },
            alpha: { start: 1, end: 0 }, rotate: { min: -180, max: 180 }, tint: base, emitting: false
        });
        fx.setDepth(3);
        fx.explode(Phaser.Math.Between(count[0], count[1]));
        this.time.delayedCall(1000, () => fx.destroy());
    }

    /**
     * Fluffy: a tap on empty board throws out a few tiny, very faint fluffy balls (every face, the level's
     * colours) that fly up, tumble and fall away.
     */
    private ghostBalls(at: Pt) {
        const r = this.level.pairs.reduce((s, p) => s + p.a.r, 0) / Math.max(1, this.level.pairs.length);
        const tints = [...new Set(this.level.pairs.map((p) => p.color))].map((n) => hexToInt(colour(n)?.base ?? '#ffffff'));
        const k = (r * 1.3) / widthOf(this, 'minis', true);
        const fx = this.add.particles(at.x, at.y, fluffyKey('minis'), {
            frame: MINI_FACES().map(String), angle: { min: -160, max: -20 }, speed: { min: r * 9, max: r * 16 }, gravityY: r * 40,
            lifespan: { min: 900, max: 1300 }, scale: { min: k * 0.7, max: k }, alpha: { start: 0.38, end: 0 },
            rotate: { min: -40, max: 40 }, tint: tints.length ? tints : [0xffffff], emitting: false
        });
        fx.setDepth(0.4);
        fx.explode(Phaser.Math.Between(5, 7));
        this.time.delayedCall(1400, () => fx.destroy());
    }

    /**
     * Fluffy: a moving ball sheds small twinkling sparkles (white and its light colour) along its trail,
     * one every SPARK_EVERY s; they drift, spin and shrink away. One emitter per moving ball.
     */
    private stepSparks(dt: number) {
        const SPARK_EVERY = 0.03;
        for (const [id, m] of this.movers) {
            if (!this.alive.has(id)) continue;
            const p = this.pair(id), r = p[m.side].r, pos = this.dotPos(p, m.side);
            let s = this.sparks.get(id);
            if (!s) {
                const c = colour(p.color), k = (r * 0.5) / widthOf(this, 'sparkle');
                const fx = this.add.particles(0, 0, fluffyKey('sparkle'), {
                    speed: { min: r * 0.3, max: r * 1.4 }, lifespan: { min: 450, max: 800 },
                    scale: { start: k, end: 0 }, alpha: { start: 1, end: 0.2 }, rotate: { start: 0, end: 180 },
                    tint: [0xffffff, 0xffffff, hexToInt(c?.inner ?? '#ffffff'), hexToInt(c?.base ?? '#ffffff')],
                    blendMode: Phaser.BlendModes.ADD, emitting: false
                });
                fx.setDepth(0.5);
                this.sparks.set(id, (s = { fx, t: 0 }));
            }
            s.t += dt;
            for (; s.t >= SPARK_EVERY; s.t -= SPARK_EVERY) {
                const a = Math.random() * Math.PI * 2, d = r * (0.3 + Math.random() * 0.7);
                s.fx.emitParticleAt(pos.x + Math.cos(a) * d, pos.y + Math.sin(a) * d, 1);
            }
        }
        for (const [id, s] of this.sparks) {
            if (this.movers.has(id) && this.alive.has(id)) continue;
            this.sparks.delete(id);
            this.time.delayedCall(900, () => s.fx.destroy());
        }
    }

    /** Splash of sparks where a dot pops (bigger dots, bigger splash). */
    private pop(at: Pt, size: number, tint: number) {
        const fx = this.add.particles(at.x, at.y, 'spark', {
            speed: { min: size * 3, max: size * 11 }, lifespan: { min: 250, max: 600 }, scale: { start: size / 22, end: 0 },
            tint, quantity: Math.round(10 + size), emitting: false
        });
        fx.explode(Math.round(10 + size * 1.2));
        this.time.delayedCall(800, () => fx.destroy());
    }

    private clear(p: Pair, from: Side) {
        const tint = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
        this.pop(p[from === 'a' ? 'b' : 'a'], Math.max(p.a.r, p.b.r), tint);
        this.removePair(p);
    }

    /** A pair leaves the board (reached its partner, or cut); the level is won when none are left. */
    private removePair(p: Pair) {
        this.movers.delete(p.id);
        this.alive.delete(p.id);
        this.trails.delete(p.id);
        if (!this.alive.size) this.setCutting(false);
        this.emitState();
        if (!this.alive.size) {
            this.over = true;
            // The board stays empty (no picture behind the end screen); the end screen comes once the
            // splash has settled.
            if (MAGIC) { this.events.emit('allCleared'); this.openDoor(); }
            else this.time.delayedCall(JELLY ? 500 + (PRESS + JIGGLE) * 1000 : FLUFFY ? 500 + hugEnd() * 1000 + 300 : 500, () => this.events.emit('win'));
        }
    }

    private lose() {
        if (this.over) return;
        this.over = true;
        this.time.delayedCall(350, () => this.events.emit('lose'));
    }

    /**
     * Play on (from the "Out of Hearts!" screen, AD): hearts are refilled and the level goes on from
     * where it stopped: cleared pairs stay cleared, striped pairs stay striped.
     */
    playOn() {
        if (!this.over || !this.alive.size || this.hearts > 0) return;
        this.hearts = HEARTS;
        this.over = false;
        this.dragFrom = null;
        this.emitState();
        this.events.emit('playOn');
    }

    // ---------- drawing ----------

    private draw() {
        const g = this.gfx;
        g.clear();
        // Magic: while the leaves slide in, the board is empty.
        if (MAGIC && this.phase === 'closing') {
            this.overG.clear();
            for (const o of this.orbs) o.setVisible(false);
            return;
        }
        // Lines are drawn in their colour only, with no edge (even a light line on the light board).
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
        for (const id of this.alive) {
            const p = this.pair(id);
            const col = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
            const m = this.movers.get(id);
            if (m) {
                // The line shortens behind the moving dot.
                const rest = [pointAt(m.pts, m.acc, m.s), ...m.pts.filter((_, i) => m.acc[i] > m.s)];
                stroke(rest, col, lineWidth(p), 1);
            } else if (this.introAt(id) !== null) {
                // Magic intro: the line is drawn out behind the running dot.
                const ln = this.lines.get(id)!, s = this.introAt(id)!;
                stroke([...ln.a.filter((_, i) => ln.accA[i] < s), pointAt(ln.a, ln.accA, s)], col, lineWidth(p), 1);
            } else stroke(this.model.line(id), col, lineWidth(p), 1);
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
        const dots: { pos: Pt; draw: Pt; r: number; name: string; sx: number; sy: number; angle: number; striped: boolean; face?: Face }[] = [];
        for (const id of this.alive) {
            const p = this.pair(id);
            const m = this.movers.get(id);
            for (const side of ['a', 'b'] as const) {
                let sx = 1, sy = 1, angle = 0;
                const st = this.stretches.get(`${id}:${side}`);
                if (m && m.side === side) {
                    // Squash and stretch along the travel direction.
                    const a = pointAt(m.pts, m.acc, m.s), b = pointAt(m.pts, m.acc, m.s + (m.returning ? -6 : 6));
                    angle = Math.atan2(b.y - a.y, b.x - a.x);
                    if (st) st.angle = angle;
                    else { sx = 1.16; sy = 0.88; }
                }
                if (st) {
                    // Jelly: stretched along its way, as thin across (same area), with a little ripple while it runs.
                    angle = st.angle;
                    const ripple = m && m.side === side ? 0.045 * Math.sin(this.time.now * 0.028) : 0;
                    const k = Math.max(0.55, 1 + st.d + ripple);
                    sx = k; sy = 1 / k;
                }
                const w = this.wobbles.get(`${id}:${side}`);
                if (w) {
                    const e = w.amp * Math.exp(-w.t * WOBBLE.decay) * Math.cos(w.t * WOBBLE.freq);
                    if (!(m && m.side === side)) angle = w.angle;
                    sx *= 1 - e; sy *= 1 + e;
                }
                const pos = this.dotPos(p, side);
                if (FLUFFY) {
                    // Fluffy: faces show what the ball is doing; asleep it breathes (each in its own rhythm),
                    // running it bounces wide-eyed, bumped it squeezes its eyes shut.
                    const moving = m && m.side === side, now = this.time.now / 1000;
                    const phase = (id.charCodeAt(id.length - 1) * 1.7 + (side === 'b' ? 2.1 : 0)) % (Math.PI * 2);
                    const ouch = (w && w.t < 0.6) || (moving && m!.returning);
                    // A marked pair (it has bumped) is awake: eyes open instead of the stripes (once face-awake.png is there).
                    const awake = AWAKE && this.marked.has(id);
                    const face: Face = ouch ? 'ouch' : moving ? 'surprised' : awake ? 'awake' : 'sleep';
                    let fx = 1, fy = 1, bob = 0;
                    if (moving) { const b = Math.sin(now * 26); fx = 1.06 * (1 - 0.05 * b); fy = 1.06 * (1 + 0.05 * b); }
                    else { const b = Math.sin(now * 2.6 + phase); fx = 1 - 0.025 * b; fy = 1 + 0.045 * b; bob = -p[side].r * 0.07 * b; }
                    if (w) { const e = w.amp * 1.3 * Math.exp(-w.t * WOBBLE.decay) * Math.cos(w.t * WOBBLE.freq); fx *= 1 + e; fy *= 1 - e; }
                    const at = { x: pos.x, y: pos.y + bob };
                    dots.push({ pos, draw: at, r: p[side].r, name: p.color, sx: fx, sy: fy, angle: 0, striped: !AWAKE && this.marked.has(id), face });
                    continue;
                }
                dots.push({ pos, draw: pos, r: p[side].r, name: p.color, sx, sy, angle, striped: this.marked.has(id) });
            }
        }
        for (const mg of this.merges) dots.push(...this.mergeDots(mg));
        for (const h of this.hugs) {
            if (h.t < hugHold()) {
                // First they meet like a bump: knocked a little apart and back, squashing and wobbling
                // (the one that ran more), happy.
                const away = Math.atan2(h.b.y - h.a.y, h.b.x - h.a.x), u = h.t * 16, kick = u * Math.exp(1 - u);
                for (const [pt, r, amp, dir] of [[h.a, h.ra, WOBBLE.mover, -1], [h.b, h.rb, WOBBLE.hit, 1]] as const) {
                    const e = amp * 1.3 * Math.exp(-h.t * WOBBLE.decay) * Math.cos(h.t * WOBBLE.freq), push = r * 0.22 * kick * dir;
                    const q = { x: pt.x + Math.cos(away) * push, y: pt.y + Math.sin(away) * push };
                    dots.push({ pos: q, draw: q, r, name: h.pair.color, sx: 1 + e, sy: 1 - e, angle: 0, striped: false, face: 'happy' });
                }
                continue;
            }
            // Then they vanish as the hearts burst: swell a touch and shrink to nothing.
            const u = Math.min(1, (h.t - hugHold()) / HUG_POP), k = (1 + 0.15 * Math.sin(Math.PI * Math.min(1, u * 2))) * (1 - u * u);
            for (const [pt, r] of [[h.a, h.ra], [h.b, h.rb]] as const)
                if (k > 0.02) dots.push({ pos: pt, draw: pt, r: r * k, name: h.pair.color, sx: 1, sy: 1, angle: 0, striped: false, face: 'happy' });
        }
        for (const d of dots) this.drawShadow(d.pos, d.r, d.sx, d.sy, d.angle);
        this.overG.clear();
        if (MAGIC && orbTexture(this, 'blue')) {
            // Orb dots: the orb picture in the pair's colour (Door.ts, orbTexture).
            dots.forEach((d, i) => {
                const tex = orbTexture(this, d.name)!;
                const o = (this.orbs[i] ??= this.add.image(0, 0, tex).setDepth(1));
                if (o.texture.key !== tex) o.setTexture(tex);
                const k = (2 * d.r) / (o.frame.width * ORB_FILL);
                o.setVisible(true).setPosition(d.draw.x, d.draw.y).setRotation(d.angle).setScale(d.sx * k, d.sy * k);
                if (d.striped) this.drawDot(d.draw, d.r, d.name, d.sx, d.sy, d.angle, true, this.overG);
            });
            for (let i = dots.length; i < this.orbs.length; i++) this.orbs[i].setVisible(false);
        } else if (FLUFFY) {
            // Fluffy balls: the body in the pair's colour, the face over it (same frame), stripes on top.
            dots.forEach((d, i) => {
                const tex = ballTexture(this, d.name);
                const body = (this.bodies[i] ??= this.add.image(0, 0, tex).setDepth(1));
                if (body.texture.key !== tex) body.setTexture(tex);
                const k = (2 * d.r) / (body.frame.width * ballFill());
                body.setVisible(true).setPosition(d.draw.x, d.draw.y).setScale(d.sx * k, d.sy * k);
                const ftex = fluffyKey(`face-${d.face ?? 'sleep'}`);
                const face = (this.faces[i] ??= this.add.image(0, 0, ftex).setDepth(1.5));
                if (face.texture.key !== ftex) face.setTexture(ftex);
                const ff = faceFrame(d.face ?? 'sleep'), kf = (2 * d.r * ff.span) / face.frame.width;
                face.setVisible(true).setPosition(d.draw.x, d.draw.y + d.r * ff.drop * d.sy).setScale(d.sx * kf, d.sy * kf);
                if (d.striped) this.drawDot(d.draw, d.r, d.name, d.sx, d.sy, 0, true, this.overG);
            });
            for (let i = dots.length; i < this.bodies.length; i++) { this.bodies[i].setVisible(false); this.faces[i]?.setVisible(false); }
        } else for (const d of dots) this.drawDot(d.draw, d.r, d.name, d.sx, d.sy, d.angle, d.striped);
    }

    /**
     * Jelly merge frames. Press: the two dots slide into each other, flattening where they touch.
     * Jiggle: one blob (both areas together), first stretched along the meeting line, wobbling round.
     */
    private mergeDots(mg: Merge) {
        const angle = Math.atan2(mg.b.y - mg.a.y, mg.b.x - mg.a.x);
        const c = this.mergeCentre(mg);
        const one = (pos: Pt, r: number, sx: number, sy: number) => ({ pos, draw: pos, r, name: mg.pair.color, sx, sy, angle, striped: false });
        if (mg.t < PRESS) {
            const k = mg.t / PRESS, e = k * k; // speeds up into each other
            const towards = (p: Pt) => ({ x: p.x + (c.x - p.x) * e * 0.75, y: p.y + (c.y - p.y) * e * 0.75 });
            const sq = 1 - 0.32 * e;
            return [one(towards(mg.a), mg.ra, sq, 1 / sq), one(towards(mg.b), mg.rb, sq, 1 / sq)];
        }
        const t = mg.t - PRESS;
        const e = 0.38 * Math.exp(-t * 6) * Math.cos(t * 30);
        // Swells a little just before it pops.
        const grow = 1 + 0.12 * Math.max(0, (t - JIGGLE * 0.6) / (JIGGLE * 0.4));
        const r = Math.hypot(mg.ra, mg.rb) * grow;
        return [one(c, r, 1 + e, 1 / (1 + e))];
    }

    /** Soft drop shadow below-right of a dot (light from the top-left). */
    private drawShadow(pos: Pt, r: number, sx: number, sy: number, angle: number) {
        const g = this.gfx;
        if (FLUFFY) {
            // Fluffy: a soft flat contact shadow on the ground under the ball (the fur would show a disc's edge).
            const th = theme();
            g.fillStyle(th.shadow, th.shadowAlpha[0]);
            g.fillEllipse(pos.x + r * 0.05, pos.y + r * 0.82, r * 1.9 * sx, r * 0.55);
            g.fillStyle(th.shadow, th.shadowAlpha[1]);
            g.fillEllipse(pos.x + r * 0.05, pos.y + r * 0.82, r * 1.5 * sx, r * 0.35);
            return;
        }
        g.save();
        g.translateCanvas(pos.x + r * 0.14, pos.y + r * 0.3);
        g.rotateCanvas(angle);
        g.scaleCanvas(sx, sy);
        const th = theme();
        g.fillStyle(th.shadow, th.shadowAlpha[0]);
        g.fillCircle(0, 0, r * 1.12);
        g.fillStyle(th.shadow, th.shadowAlpha[1]);
        g.fillCircle(0, 0, r * 0.96);
        g.restore();
    }

    /** A glossy dot, optionally squashed (sx, sy along `angle`) and striped (marked pair). */
    private drawDot(pos: Pt, r: number, name: string, sx: number, sy: number, angle: number, striped: boolean, stripesOn?: Phaser.GameObjects.Graphics) {
        // `stripesOn`: only the stripes, on that graphics (over an orb picture).
        const g = stripesOn ?? this.gfx;
        const c = colour(name);
        const base = hexToInt(c?.base ?? COMPLETED_LINE);
        g.save();
        g.translateCanvas(pos.x, pos.y);
        g.rotateCanvas(angle);
        g.scaleCanvas(sx, sy);
        // Lighting stays fixed in world space (light from the top-left): undo the rotation for offsets.
        const local = (x: number, y: number) => ({ x: (x * Math.cos(-angle) - y * Math.sin(-angle)) / sx, y: (x * Math.sin(-angle) + y * Math.cos(-angle)) / sy });
        const at = (fx: number, fy: number) => local(fx * r, fy * r);
        if (stripesOn) {
            drawStripes(g, local, r);
            g.restore();
            return;
        }
        // Body: dark rim, lit body shifted towards the light, soft glow.
        // Rim: the darkest key of the colour's shading ramp (VoxelMaterials _RampKey0).
        g.fillStyle(c ? hexToInt(c.dark) : shade(base, 0.62), 1);
        g.fillCircle(0, 0, r);
        let o = at(-0.08, -0.1);
        g.fillStyle(base, 1);
        g.fillCircle(o.x, o.y, r * 0.87);
        o = at(-0.17, -0.2);
        g.fillStyle(hexToInt(c?.gradient ?? '#ffffff'), 0.4);
        g.fillCircle(o.x, o.y, r * 0.6);
        if (striped) drawStripes(g, local, r);
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

/** White diagonal stripes of a marked dot (chords of the circle at 45 degrees in world space). */
function drawStripes(g: Phaser.GameObjects.Graphics, local: (x: number, y: number) => Pt, r: number) {
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

/** Multiply a 0xRRGGBB colour by f (0..1 darkens). */
function shade(c: number, f: number): number {
    const r = Math.round(((c >> 16) & 255) * f), g = Math.round(((c >> 8) & 255) * f), b = Math.round((c & 255) * f);
    return (r << 16) | (g << 8) | b;
}
