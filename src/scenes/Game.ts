import * as Phaser from 'phaser';
import { KeyObstacle, LOCK_TAGS as LOCK_TAG_HEX, Level, LockObstacle, Pair, levelBounds, mainRadius } from '../core/level';
import { COMPLETED_LINE, colour, hexToInt, themeColours } from '../core/palette';
import { nearPairs } from '../core/generator';
import { Pt, arcLengths, dist, distToPolyline, pointAt } from '../core/path';
import { BlockModel, HIT_SCALE, Side, ropeReach, solve } from '../core/solver';
import { fromEditor, levels } from '../game/source';
import { Session, clearSession, readSession, writeSession } from '../game/session';
import { tuning } from '../game/tuning';
import { onSettings, settings } from '../game/settings';
import { theme } from '../game/theme';
import { FLUFFY, FLUFFY_BG, JELLY, MAGIC, WATER, onLookChange, takeAutoplay } from '../game/mode';
import { paintGloss, paintGlossy, paintWater } from './ballart';
import { WATER_FRAMES, hasUi, hexOf, preloadUi, recolour, uiKey, waterFrames } from './uiart';
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
/** Trail length in frames (the look can change while the game runs, so these are read each time). */
const trailLen = () => (FLUFFY ? 24 : 9);

// ---- Jelly variant (src/game/mode.ts) ----
/** Bump wobble: amplitude on the moving / the hit dot, decay per second, frequency (rad/s), length (s). */
const WOBBLE_JELLY = { mover: 0.5, hit: 0.4, decay: 3.6, freq: 24, life: 1.3 }, WOBBLE_FIRM = { mover: 0.32, hit: 0.22, decay: 7, freq: 38, life: 0.7 };
let WOBBLE = JELLY ? WOBBLE_JELLY : WOBBLE_FIRM;
/**
 * Fluffy: a ball that touches its partner: the two bump (squash and wobble) and stay together, happy,
 * for tuning.hugHold s (HUG_HOLD in src/game/tuning.ts, live in the dev panel), then pop into little
 * hearts and shrink away in HUG_POP s.
 */
/** Fluffy: a bumped pair shows the awake face instead of stripes, once that picture is there. */
let AWAKE = FLUFFY && hasArt('face-awake');
const HUG_POP = 0.2;
const hugHold = () => tuning.hugHold, hugEnd = () => tuning.hugHold + HUG_POP;
/** Fluffy: the background pattern scrolls this fast (world px/s) from the top left to the bottom right. */
const PATTERN_SPEED = 4;

/** Jelly stretch spring (stiffness, damping: well under critical, so it overshoots and wobbles). */
const SPRING = { k: 320, c: 8 };
/** Jelly merge: the two dots press together (s), then the merged blob jiggles (s) and pops. */
/** Jelly: the two balls press into each other (s), then stay merged into one blob (tuning.jellyHold, dev panel) and pop. */
const PRESS = 0.16, jiggle = () => tuning.jellyHold;

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
/** Show the loading screen (Transition.ts) between Home and levels; off for now. */
const LOADING_SCREEN = false;

export class Game extends Phaser.Scene {
    private level!: Level;
    private model!: BlockModel;
    private alive = new Set<string>();
    /** Pair ids in the order their lines are drawn: those cleared later in the solution first, so lines of pairs cleared earlier lie on top. */
    private drawOrder: string[] = [];
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
    /** Ropes shivering after a ball ran into them: time since, and where it hit. */
    private ropeShakes = new Map<string, { t: number; at: Pt }>();
    /** Locks whose key has been taken: open (GDD 3.13). */
    private opened = new Set<string>();
    /** Lock and key pictures on the board, by lock id; locks shaking after a bump (time since). */
    private lockPics = new Map<string, Phaser.GameObjects.Container>();
    private keyPics = new Map<string, Phaser.GameObjects.Container>();
    private lockShakes = new Map<string, number>();
    /** Where a lock / key point falls along each line (from dot a), worked out once. */
    private alongCache = new Map<string, number>();
    /** Graphics the lines are drawn on, bottom up (a rope picture goes between two of them). */
    private lineLayers: Phaser.GameObjects.Graphics[] = [];
    /** Rope pictures (texture repeated along the line), per pair. */
    private ropePics = new Map<string, Phaser.GameObjects.Rope>();
    private trails = new Map<string, Pt[]>();
    /** Fluffy: the sparkle emitter of each moving ball, and the time since its last sparkle. */
    private sparks = new Map<string, { fx: Phaser.GameObjects.Particles.ParticleEmitter; t: number }>();
    /** Jelly: the trail emitter of each running ball, the way it is going (backwards) and where it was. */
    private drips = new Map<string, { fx: Phaser.GameObjects.Particles.ParticleEmitter; t: number; dir: number; at: Pt }>();
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
    /** Jelly / Water ball pictures (the water inside, and the clear shell over it). */
    private balls: Phaser.GameObjects.Image[] = [];
    private shells: Phaser.GameObjects.Image[] = [];
    private overG!: Phaser.GameObjects.Graphics;
    private phase: Phase = 'play';
    /** Intro run per pair: seconds since it started, and how long it takes. */
    private intro = new Map<string, { t: number; dur: number }>();
    /** The intro run waits (new-look pop-ups first). */
    private introHeld = false;
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
        performance.mark('dotline:preload');
        // Always: the Theme screen and the new-look pop-ups show the fluffy ball and background.
        preloadFluffy(this);
        preloadUi(this);
    }

    create() {
        performance.mark('dotline:create');
        // (Also after a look change: the scene restarts with the new look; drop what the old one made.)
        WOBBLE = JELLY ? WOBBLE_JELLY : WOBBLE_FIRM;
        AWAKE = FLUFFY && hasArt('face-awake');
        this.bg = undefined;
        this.bodies = []; this.faces = []; this.orbs = []; this.balls = []; this.shells = [];
        for (const s of [...this.sparks.values(), ...this.drips.values()]) s.fx.destroy();
        this.sparks.clear();
        this.drips.clear();
        onLookChange(() => this.rebuildLook());
        makeFluffy(this);
        // Background: the fluffy faces pattern (chosen apart from the balls), else the plain board colour.
        if (FLUFFY_BG) this.bg = this.add.tileSprite(0, 0, 1, 1, fluffyKey('pattern-light')).setDepth(-10);
        this.applyTheme();
        const off = onSettings(() => this.applyTheme());
        this.events.once('shutdown', off);
        this.gfx = this.add.graphics();
        // A restart (new look) destroyed the old line layers and rope pictures.
        this.lineLayers = [];
        this.ropePics = new Map();
        this.lockPics = new Map();
        this.keyPics = new Map();
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
        // The game opens on the Home screen (not when played from the editor).
        // (After a new look was applied from the pop-up after a win, the game goes straight into the level.)
        // A level left in the middle (the game was closed while playing): it goes on where it stopped,
        // with no Home screen. Otherwise the game opens on Home (unless a new look was just applied).
        // (Read before the level loads: loading it saves a fresh session.)
        const saved = fromEditor ? null : readSession();
        levels.onLevel((l) => this.loadLevel(l));
        if (saved && this.level && saved.level === levels.levelNumber() && saved.id === this.level.id) this.resumeSession(saved);
        else if (!fromEditor && !takeAutoplay()) this.time.delayedCall(0, () => this.showHome());
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

    /**
     * Start a level. `holdIntro`: the level is on screen but its dots wait at the start of their lines
     * until releaseIntro() (the new-look pop-ups after a win come first, then the intro run).
     */
    loadLevel(level: Level, holdIntro = false) {
        this.level = structuredClone(level);
        this.levelColours = new Map(this.level.pairs.map((p) => [p.id, p.color]));
        this.nearLines = undefined;
        this.recolour();
        this.model = new BlockModel(this.level.pairs, this.level.obstacles);
        this.opened.clear();
        this.alive = new Set(this.level.pairs.map((p) => p.id));
        const sol = solve(this.level);
        this.drawOrder = [...sol.stuck, ...[...sol.order].reverse()];
        this.movers.clear();
        this.lines.clear();
        for (const p of this.level.pairs) {
            const a = this.model.line(p.id);
            const b = [...a].reverse();
            this.lines.set(p.id, { a, b, accA: arcLengths(a), accB: arcLengths(b) });
        }
        this.makeObstaclePics();
        this.hearts = HEARTS;
        this.over = false;
        this.nudge = null;
        this.marked.clear();
        this.freeBump = this.level.tutorial === 'collision';
        this.wobbles.clear();
        this.ropeShakes.clear();
        for (const r of this.ropePics.values()) r.destroy();
        this.ropePics.clear();
        this.trails.clear();
        for (const s of [...this.sparks.values(), ...this.drips.values()]) s.fx.destroy();
        this.sparks.clear();
        this.drips.clear();
        this.stretches.clear();
        this.merges = [];
        this.hugs = [];
        this.setCutting(false);
        this.cameras.main.panEffect.reset();
        this.cameras.main.zoomEffect.reset();
        this.fit();
        // Every level starts with its dots running out along their lines (Magic: once the door has shut).
        if (MAGIC) this.closeDoor();
        else { this.intro.clear(); this.startIntro(); }
        this.introHeld = holdIntro && !MAGIC;
        this.emitState();
        this.events.emit('loaded');
    }

    // ---------- magic variant: the door ----------

    /** Busy with the door (Magic) or the intro run: taps wait. */
    private get doorBusy() {
        return MAGIC ? this.phase !== 'play' : this.phase === 'intro';
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

    /** Per frame: the intro runs (every mode); when all are done, play starts. */
    private stepIntro(dt: number) {
        if (this.phase !== 'intro' || this.introHeld) return;
        let done = true;
        for (const r of this.intro.values()) { r.t += dt; if (r.t < r.dur) done = false; }
        if (done) { this.intro.clear(); this.phase = 'play'; this.events.emit('introDone'); }
    }

    /** Per frame (Magic): the glowing map rides the leaves. */
    private stepDoor() {
        const dx = this.door.off / this.cameras.main.zoom;
        const glow = this.phase === 'opening' ? this.mapLit.v : 0;
        for (const [g, x] of [[this.mapL, -dx], [this.mapR, dx]] as const) g.setPosition(x, 0).setAlpha(glow).setVisible(glow > 0);
    }

    /**
     * A ball / background was picked (mode.chooseLook): rebuild the game, the HUD and the Home screen in the
     * new look, without reloading the page. Home reopens where the player was (or the level starts,
     * after a pop-up's APPLY).
     */
    private rebuildLook() {
        this.scene.stop('Home');
        this.scene.stop('Hud');
        // The HUD's listeners on this scene's events go with it (it adds them again when it starts).
        for (const e of ['allCleared', 'cutting', 'doorClosed', 'doorOpening', 'freebump', 'introDone', 'loaded', 'lose', 'playOn', 'state', 'tapped', 'win', 'zoomed']) this.events.removeAllListeners(e);
        this.scene.restart();
    }

    /** Home screen over the paused game (and the HUD put to sleep). */
    showHome() {
        clearSession();
        this.scene.pause();
        this.scene.sleep('Hud');
        if (MAGIC) this.scene.sleep('Door');
        if (this.scene.isSleeping('Home') || this.scene.isPaused('Home')) this.scene.wake('Home');
        else this.scene.launch('Home');
        this.scene.bringToTop('Home');
        this.scene.bringToTop('Transition');
    }

    /**
     * The loading screen (Transition.ts; off while LOADING_SCREEN is false): it slides in, `covered` switches what is under it, its loading
     * runs to 100%, and the new screen slides in; then `done`. `toLevel`: from the right, else from the left.
     */
    transition(covered: () => void, done: () => void = () => undefined, toLevel = true) {
        // The loading screen is off for now: switch at once. Set LOADING_SCREEN to true to bring it back.
        if (!LOADING_SCREEN) { covered(); done(); return; }
        // Into a level: the loading screen and then the play screen come from the right; back Home: from the left.
        const reveal = toLevel ? (MAGIC ? ['Door', 'Game', 'Hud'] : ['Game', 'Hud']) : ['Home'];
        this.scene.launch('Transition', { covered, done, dir: toLevel ? 1 : -1, reveal });
        this.scene.bringToTop('Transition');
    }

    /** Home's PLAY: through the loading screen into the level; its intro runs once the screen has gone. */
    goPlay() {
        this.transition(() => this.playFromHome(true), () => this.releaseIntro());
    }

    /** From a level back Home (Settings' HOME), through the loading screen. */
    goHome() {
        this.transition(() => this.showHome(), undefined, false);
    }

    playFromHome(hold = false) {
        // hold: the level waits (empty) until releaseIntro (the transition screen still covers it).
        this.scene.stop('Home');
        this.scene.wake('Hud');
        if (MAGIC) this.scene.wake('Door');
        this.scene.resume();
        const l = levels.level();
        if (l) this.loadLevel(l, hold);
    }

    /** Let a held intro run (loadLevel with holdIntro). */
    releaseIntro() {
        this.introHeld = false;
    }

    restart() {
        const l = levels.level();
        if (l) this.loadLevel(l);
    }

    /** Dot the tutorial hand points at: an open dot ('tap'), a dot that will bump ('collision'), a dot a rope holds back ('rope'). */
    tutorialTarget(kind: 'tap' | 'collision' | 'rope' | 'lock'): Pt | null {
        const pairs = [...this.alive].map((id) => this.pair(id)).filter((p) => !this.movers.has(p.id));
        if (kind === 'lock') {
            // A ball that can go and has a key on its way.
            for (const p of pairs) if ([...this.keyPics.keys()].some((id) => !this.opened.has(id) && this.model.takersOfKey(id).includes(p.id))) { const side = this.model.openSide(p, this.alive, this.opened); if (side) return p[side]; }
            // No key holder can go yet: show a key still on the board.
            for (const [id, c] of this.keyPics) if (!this.opened.has(id) && c.visible) return { x: c.x, y: c.y };
        } else if (kind === 'rope') {
            for (const p of pairs) for (const side of ['a', 'b'] as const)
                if (this.model.blockers(p, side, this.alive, this.opened).some((id) => this.level.pairs.find((q) => q.id === id)?.rope)) return p[side];
        } else if (kind === 'tap') {
            for (const p of pairs) { const side = this.model.openSide(p, this.alive, this.opened); if (side) return p[side]; }
        } else {
            for (const p of pairs) if (!this.model.isOpen(p, 'a', this.alive, this.opened)) return p.a;
            for (const p of pairs) if (!this.model.isOpen(p, 'b', this.alive, this.opened)) return p.b;
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
        this.saveSession();
    }

    /**
     * Remember the level being played (which pairs are left, which are marked, the hearts), so a game
     * closed in the middle of a level goes on from there next time (readSession, resumeSession). Kept
     * only while playing: a win, a loss or going Home forgets it (Home then PLAY starts the level over).
     */
    private saveSession() {
        if (fromEditor || MAGIC || !this.level || this.over) return;
        writeSession({ level: levels.levelNumber(), id: this.level.id, alive: [...this.alive], marked: [...this.marked], hearts: this.hearts, opened: [...this.opened] });
    }

    /** Go on with a level left in the middle: the cleared pairs are gone (no effects), marks and hearts as they were. */
    private resumeSession(s: Session) {
        const keep = new Set(s.alive);
        for (const id of [...this.alive]) if (!keep.has(id)) this.alive.delete(id);
        this.marked = new Set(s.marked.filter((id) => keep.has(id)));
        this.hearts = Math.max(1, Math.min(HEARTS, s.hearts));
        // Keys taken: their locks are open (no lock, no key on the board); locks and keys of cleared pairs are gone.
        for (const id of s.opened ?? []) this.opened.add(id);
        for (const [id, c] of this.lockPics) if (this.opened.has(id) || !this.model.pairsOfLock(id).some((q) => this.alive.has(q))) { c.destroy(); this.lockPics.delete(id); }
        for (const [id, c] of this.keyPics) if (this.opened.has(id) || !this.lockPics.has(id)) { c.destroy(); this.keyPics.delete(id); }
        this.emitState();
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
        const open = [...this.alive].filter((id) => !this.movers.has(id)).map((id) => this.pair(id)).map((p) => ({ p, side: this.model.openSide(p, this.alive, this.opened) })).filter((x) => x.side);
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
        if (!best) { if (FLUFFY) this.ghostBalls(w); else if (JELLY) this.jellyGhosts(w); return; }
        this.events.emit('tapped');
        const ln = this.lines.get(best.p.id)!;
        this.movers.set(best.p.id, {
            side: best.side,
            open: this.model.isOpen(best.p, best.side, this.alive, this.opened),
            pts: best.side === 'a' ? ln.a : ln.b,
            acc: best.side === 'a' ? ln.accA : ln.accB,
            s: 0,
            returning: false,
            t: 0
        });
        if (this.nudge?.id === best.p.id) this.nudge = null;
        // Fluffy: a little puff of fur where the ball was tapped.
        if (FLUFFY) this.furPuff(w, best.p[best.side].r, -Math.PI / 2, best.p.color, 180, 0, [11, 15]);
        // Jelly: a few blobs of jelly pop off the tapped ball.
        if (JELLY) { const d = best.p[best.side]; this.jellyBits(d, d.r, best.p.color, { n: [6, 8], speed: [4, 9] }); }
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
        this.stepIntro(dt);
        if (MAGIC) this.stepDoor();
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
            let hit: { key: string; pos: Pt; r: number } | null = null;
            while (left > 0 && m.s < end) {
                const step = Math.min(left, STEP);
                m.s = Math.min(end, m.s + step);
                left -= step;
                this.pickKeys(p, m);
                if (!m.open && (hit = this.hits(p, m))) break;
            }
            if (hit) {
                m.returning = true;
                const at = pointAt(m.pts, m.acc, m.s);
                const angle = Math.atan2(hit.pos.y - at.y, hit.pos.x - at.x);
                // Elastic bump on both dots (and a short buzz, if vibration is on and the device has it).
                if (settings.vibrate) navigator.vibrate?.(35);
                this.wobbles.set(`${id}:${m.side}`, { t: 0, amp: WOBBLE.mover, angle });
                // Droplets in each one's colour, splashing away from where they touched; a rope shivers there.
                const [hid, hside, hlock] = hit.key.split(':');
                const other = this.pair(hid);
                if (hside === 'rope') this.ropeShakes.set(hid, { t: 0, at: hit.pos });
                else if (hside === 'lock') this.lockShakes.set(hlock, 0);
                else this.wobbles.set(hit.key, { t: 0, amp: WOBBLE.hit, angle });
                this.splash(at, p[m.side].r, angle + Math.PI, p.color);
                this.splash(hit.pos, hit.r, angle, other.color);
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
                if (JELLY) {
                    // Jelly: a big burst of blobs from both balls as they meet.
                    this.jellyBits(at, p[m.side].r, p.color, { n: [14, 18], speed: [6, 14] });
                    this.jellyBits(p[to], p[to].r, p.color, { n: [10, 14], speed: [6, 14] });
                } else if (!FLUFFY) {
                    this.splash(at, p[m.side].r, dir + Math.PI, p.color);
                    this.splash(p[to], p[to].r, dir, p.color);
                }
                if (JELLY) this.merge(p, m);
                else if (FLUFFY) this.hug(p, m);
                else this.clear(p, m.side);
            }
        }
        for (const [k, w] of this.wobbles) { w.t += dt; if (w.t > WOBBLE.life) this.wobbles.delete(k); }
        for (const [k, s] of this.ropeShakes) { s.t += dt; if (s.t > 0.6) this.ropeShakes.delete(k); }
        for (const [k, t] of this.lockShakes) { if (t + dt > 0.5) this.lockShakes.delete(k); else this.lockShakes.set(k, t + dt); }
        if (JELLY) this.stepJelly(dt);
        if (FLUFFY) this.stepFluffy(dt);
        else if (FLUFFY_BG) this.scrollPattern(dt);
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
        this.stepDrips(dt);
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
            if (mg.t >= PRESS + jiggle()) {
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
        if (t.length > trailLen()) t.shift();
        this.trails.set(id, t);
    }

    /** Blocked movers collide with any dot that has a hitbox (open pairs in motion have none). */
    private hits(p: Pair, m: Mover): { key: string; pos: Pt; r: number } | null {
        const pos = pointAt(m.pts, m.acc, m.s);
        const r = p[m.side].r;
        // A closed lock on its own line stops the ball.
        for (const l of this.model.locksOn(p.id)) {
            if (this.opened.has(l.id)) continue;
            if (m.s >= this.alongFrom(p.id, l, m.side) - (r * HIT_SCALE + this.obstacleSize() * 0.5)) return { key: `${p.id}:lock:${l.id}`, pos: { x: l.x, y: l.y }, r: 4 };
        }
        for (const id of this.alive) {
            if (id === p.id) continue;
            const o = this.pair(id);
            const om = this.movers.get(id);
            if (om && om.open) continue;
            for (const side of ['a', 'b'] as const) {
                const q = this.dotPos(o, side);
                if (dist(pos, q) < (r + o[side].r) * HIT_SCALE) return { key: `${o.id}:${side}`, pos: q, r: o[side].r };
            }
            // A rope (what is left of it while its own ball runs) blocks any other ball.
            if (o.rope) {
                const near = nearestOn(this.ropeLine(o), pos);
                if (near.d < ropeReach(r)) return { key: `${o.id}:rope`, pos: near.p, r: 4 };
            }
        }
        return null;
    }

    /**
     * A rope drawn with its picture (src/assets/ui/rope.png, grey, recoloured to the pair's colour): the
     * texture repeats along the line, one repeat every ROPE_TILE px, ROPE_W px wide. `shake`: it shivers there.
     */
    private ropePicture(id: string, pts: Pt[], name: string, depth: number, shake?: { t: number; at: Pt }) {
        // Shiver: points near the hit swing sideways, fading out along the rope and in time.
        let line = pts;
        if (shake) {
            const amp = 5 * Math.exp(-shake.t * 7) * Math.sin(shake.t * 45);
            line = pts.map((q, i) => {
                const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
                const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = amp * Math.exp(-dist(q, shake.at) / 40);
                return { x: q.x - ((b.y - a.y) / l) * k, y: q.y + ((b.x - a.x) / l) * k };
            });
        }
        // No two points on top of each other (the rope's edges come from the direction between points).
        const clean: Pt[] = [];
        for (const q of line) if (!clean.length || dist(clean[clean.length - 1], q) > 0.5) clean.push(q);
        let r = this.ropePics.get(id);
        if (clean.length < 2) { r?.setVisible(false); return; }
        const key = this.ropeTexture(colour(name)?.base ?? COMPLETED_LINE);
        // The picture is 64 px high; the rope object is scaled so it is ROPE_W wide on the board.
        const k = ROPE_W / 64, acc = arcLengths(clean);
        if (!r || r.texture.key !== key) {
            r?.destroy();
            r = this.add.rope(0, 0, key, undefined, clean.map((q) => ({ x: q.x / k, y: q.y / k })) as Phaser.Math.Vector2[]).setScale(k);
            this.ropePics.set(id, r);
        }
        const rope = r;
        // Repeat the texture along the line (u grows with the length) instead of stretching it once.
        rope.updateUVs = function (this: Phaser.GameObjects.Rope) {
            const uv = this.uv;
            for (let i = 0; i < this.points.length; i++) {
                const u = (acc[i] ?? 0) / ROPE_TILE;
                uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
            }
            return this;
        };
        rope.setPoints(clean.map((q) => ({ x: q.x / k, y: q.y / k })) as Phaser.Math.Vector2[]);
        rope.updateVertices();
        rope.setDepth(depth).setVisible(true);
    }

    /** The rope picture in a colour, made once; its texture repeats sideways. */
    private ropeTexture(hex: string): string {
        const key = recolour(this, 'rope', hex, 0.6);
        this.textures.get(key).source[0].setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.CLAMP_TO_EDGE);
        return key;
    }

    // ---------- locks and keys (GDD 3.13) ----------

    private lockOf(id: string): LockObstacle | undefined {
        return this.level.obstacles.find((o): o is LockObstacle => o.type === 'lock' && o.id === id);
    }

    private keyOf(lockId: string): KeyObstacle | undefined {
        return this.level.obstacles.find((o): o is KeyObstacle => o.type === 'key' && o.lock === lockId);
    }

    /** Distance along a pair's line, from its dot `a`, to the point of the line nearest to `q`. */
    private alongA(id: string, q: Pt): number {
        const k = `${id}@${q.x},${q.y}`;
        let s = this.alongCache.get(k);
        if (s === undefined) {
            const ln = this.lines.get(id)!;
            let best = Infinity;
            s = 0;
            for (let i = 1; i < ln.a.length; i++) {
                const a = ln.a[i - 1], b = ln.a[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
                const t = l2 ? Phaser.Math.Clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0, 1) : 0;
                const d = Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y);
                if (d < best) { best = d; s = ln.accA[i - 1] + Math.sqrt(l2) * t; }
            }
            this.alongCache.set(k, s);
        }
        return s;
    }

    /** The same, from the dot a ball starts at. */
    private alongFrom(id: string, q: Pt, side: Side): number {
        const s = this.alongA(id, q);
        return side === 'a' ? s : this.lines.get(id)!.accA.at(-1)! - s;
    }

    /** Size of a lock / key badge: a bit bigger than a normal dot. */
    private obstacleSize(): number {
        return mainRadius(this.level.pairs) * 2.8;
    }

    /** A lock and its key share a tag colour (the lock's place in the level's list). */
    private tagColour(lockId: string): number {
        const i = this.level.obstacles.filter((o) => o.type === 'lock').findIndex((o) => (o as LockObstacle).id === lockId);
        return LOCK_TAGS[Math.max(0, i) % LOCK_TAGS.length];
    }

    /** The lock and key badges of the level (keys keyed by their lock's id). */
    private makeObstaclePics() {
        for (const c of [...this.lockPics.values(), ...this.keyPics.values()]) c.destroy();
        this.lockPics.clear();
        this.keyPics.clear();
        this.lockShakes.clear();
        this.alongCache.clear();
        const size = this.obstacleSize();
        for (const o of this.level.obstacles) {
            const lock = o.type === 'lock' ? o.id : o.lock;
            const g = this.add.graphics(), col = this.tagColour(lock), parts: Phaser.GameObjects.GameObject[] = [g];
            // The picture (src/assets/ui/lock.png, key.png: grey, recoloured to the tag colour), on its own
            // (no badge); without it, a lock / key drawn in code on a round badge.
            if (hasUi(o.type) && this.textures.exists(uiKey(o.type))) {
                parts.push(this.add.image(0, 0, recolour(this, o.type, hexOf(col))).setDisplaySize(size * 0.9, size * 0.9));
            } else if (o.type === 'lock') drawLockBadge(g, size, col);
            else drawKeyBadge(g, size, col);
            const c = this.add.container(o.x, o.y, parts).setDepth(0.9).setVisible(false);
            (o.type === 'lock' ? this.lockPics : this.keyPics).set(lock, c);
        }
    }

    /** Shown once the intro has drawn a line through it (or no line is drawing); hidden while the board is empty. */
    private obstacleShown(q: Pt, pairs: string[]): boolean {
        if ((MAGIC && this.phase === 'closing') || this.introHeld) return false;
        if (!pairs.length) return [...this.alive].every((id) => this.introAt(id) === null);
        return pairs.some((id) => { const run = this.introAt(id); return run === null || run >= this.alongA(id, q); });
    }

    /** Badges follow the intro, locks shake after a bump, keys bob. */
    private drawObstacles(time: number) {
        for (const [id, c] of this.lockPics) {
            const l = this.lockOf(id);
            if (!l) continue;
            const sh = this.lockShakes.get(id);
            c.setVisible(this.obstacleShown(l, this.model.pairsOfLock(id))).setPosition(l.x + (sh !== undefined ? Math.sin(sh * 50) * 5 * Math.exp(-sh * 7) : 0), l.y);
        }
        let i = 0;
        for (const [id, c] of this.keyPics) {
            i++;
            if (c.getData('flying')) continue;
            const k = this.keyOf(id);
            if (!k) continue;
            c.setVisible(this.obstacleShown(k, this.model.takersOfKey(id))).setPosition(k.x, k.y + Math.sin(time * 3 + i) * 2.5).setAngle(Math.sin(time * 2 + i) * 8);
        }
    }

    /** Any running ball takes a key it passes over. */
    private pickKeys(p: Pair, m: Mover) {
        if (!this.keyPics.size) return;
        const at = pointAt(m.pts, m.acc, m.s), r = p[m.side].r;
        for (const [id, c] of this.keyPics) {
            if (this.opened.has(id) || c.getData('flying')) continue;
            const k = this.keyOf(id);
            if (k && dist(at, k) < r) this.takeKey(k);
        }
    }

    /** The key is taken: its lock is open at once; the key flies over to it in an arc, spinning, and the lock springs open. */
    private takeKey(k: KeyObstacle) {
        this.opened.add(k.lock);
        this.emitState();
        const key = this.keyPics.get(k.lock), lock = this.lockPics.get(k.lock);
        if (!key) return;
        const col = this.tagColour(k.lock);
        this.burst(key.x, key.y, col, 10);
        if (!lock) { this.keyPics.delete(k.lock); this.fadeOut(key); return; }
        key.setData('flying', true).setDepth(3).setVisible(true);
        const from = { x: key.x, y: key.y }, to = { x: lock.x, y: lock.y };
        const lift = Math.max(60, dist(from, to) * 0.35), f = { t: 0 };
        this.tweens.add({
            targets: f, t: 1, duration: 560, ease: 'Sine.easeInOut',
            onUpdate: () => {
                const t = f.t;
                key.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift);
                key.setAngle(360 * t).setScale(1 + 0.35 * Math.sin(Math.PI * t));
            },
            onComplete: () => { key.destroy(); this.keyPics.delete(k.lock); this.openLock(k.lock); }
        });
    }

    /** The lock springs open: a burst in its colour, it swells and fades away. */
    private openLock(id: string) {
        const lock = this.lockPics.get(id);
        if (!lock) return;
        this.lockPics.delete(id);
        this.burst(lock.x, lock.y, this.tagColour(id), 16);
        if (settings.vibrate) navigator.vibrate?.(20);
        this.tweens.add({ targets: lock, scale: 1.6, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => lock.destroy() });
    }

    /**
     * A pair leaves (cleared or cut): it takes the keys on its line (its ball ran over them, or nothing
     * else could); a lock goes once every pair it sits on has left, and its key with it.
     */
    private obstaclesOnRemove(p: Pair) {
        for (const [id, c] of this.keyPics) {
            if (this.opened.has(id) || c.getData('flying')) continue;
            const k = this.keyOf(id);
            if (k && this.model.takersOfKey(id).includes(p.id)) this.takeKey(k);
        }
        this.dropLeftLocks();
    }

    /** Locks whose pairs have all left the board go (fading), and their keys if not taken. */
    private dropLeftLocks() {
        for (const [id, c] of this.lockPics) {
            const on = this.model.pairsOfLock(id);
            if (!on.length || on.some((q) => this.alive.has(q))) continue;
            this.lockPics.delete(id);
            this.fadeOut(c);
            const k = this.keyPics.get(id);
            if (k && !k.getData('flying')) { this.keyPics.delete(id); this.fadeOut(k); }
        }
    }

    private fadeOut(c: Phaser.GameObjects.Container) {
        this.tweens.add({ targets: c, alpha: 0, scale: 0.6, duration: 250, onComplete: () => c.destroy() });
    }

    private burst(x: number, y: number, col: number, n: number) {
        const fx = this.add.particles(x, y, 'spark', { speed: { min: 50, max: 200 }, lifespan: { min: 200, max: 420 }, scale: { start: 0.6, end: 0 }, tint: [0xffffff, col], emitting: false }).setDepth(3);
        fx.explode(n);
        this.time.delayedCall(500, () => fx.destroy());
    }

    /** A rope's line as it is now: shortened behind its own running ball. */
    private ropeLine(o: Pair): Pt[] {
        const m = this.movers.get(o.id);
        return m ? [pointAt(m.pts, m.acc, m.s), ...m.pts.filter((_, i) => m.acc[i] > m.s)] : this.model.line(o.id);
    }

    /**
     * Bump: a few droplets in the dot's colour fly off its far side (a fan of ±65° around `angle`),
     * fall a little and shrink away. Some are lighter (the colour's highlight) for a wet look.
     */
    private splash(at: Pt, r: number, angle: number, name: string) {
        if (FLUFFY) return this.furPuff(at, r, angle, name);
        // Jelly: more blobs than a tap, off the far side of the ball.
        if (JELLY && this.jellyKey(name)) return this.jellyBits(at, r, name, { n: [10, 14], angle, spread: 70, from: 0.7, speed: [6, 13] });
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

    /** Jelly: the picture of a blob of jelly in a colour (the Jelly ball recoloured, made once per colour), if there is one. */
    private jellyKey(name: string): string | null {
        if (!hasUi('ball-jelly') || !this.textures.exists(uiKey('ball-jelly'))) return null;
        return recolour(this, 'ball-jelly', colour(name)?.base ?? COMPLETED_LINE, 1);
    }

    /**
     * Jelly: little blobs of jelly in the ball's colour fly off, fall, tumble and shrink away. `angle` and
     * `spread`: a fan (degrees either side; 180 = all round); `from`: start this far out (× r); `speed` × r.
     */
    private jellyBits(at: Pt, r: number, name: string, o: { n: [number, number]; angle?: number; spread?: number; from?: number; speed?: [number, number]; size?: number; alpha?: number; depth?: number }) {
        const key = this.jellyKey(name);
        if (!key) return;
        const angle = o.angle ?? -Math.PI / 2, deg = Phaser.Math.RadToDeg(angle), spread = o.spread ?? 180, from = o.from ?? 0;
        const k = (r * (o.size ?? 0.55)) / (this.textures.get(key).getSourceImage() as HTMLCanvasElement).width;
        const [s0, s1] = o.speed ?? [5, 11];
        const fx = this.add.particles(at.x + Math.cos(angle) * r * from, at.y + Math.sin(angle) * r * from, key, {
            angle: { min: deg - spread, max: deg + spread }, speed: { min: r * s0, max: r * s1 }, gravityY: r * 32,
            lifespan: { min: 450, max: 850 }, ...blobOps(k, 0.2, r), alpha: { start: o.alpha ?? 1, end: 0.3 }, emitting: false
        });
        fx.setDepth(o.depth ?? 1.3);
        fx.explode(Phaser.Math.Between(o.n[0], o.n[1]));
        this.time.delayedCall(950, () => fx.destroy());
    }

    /** Jelly: a tap on empty board throws up a few blobs of jelly in the level's colours, which fall away. */
    private jellyGhosts(at: Pt) {
        const names = [...new Set(this.level.pairs.map((p) => p.color))];
        if (!names.length) return;
        // The same size on screen whatever the zoom (GHOST_R screen px).
        const r = GHOST_R / this.cameras.main.zoom;
        for (let i = Phaser.Math.Between(5, 7); i > 0; i--)
            this.jellyBits(at, r, names[Phaser.Math.Between(0, names.length - 1)], { n: [1, 1], spread: 70, speed: [9, 16], size: 0.7, alpha: 0.85, depth: 0.4 });
    }

    /**
     * Jelly: a running ball flings small blobs of jelly behind it (a trail), one every DRIP_EVERY s: thrown
     * backwards and up, they fall in an arc, stretched along their way. None on the way back after a bump.
     * One emitter per moving ball.
     */
    private stepDrips(dt: number) {
        const DRIP_EVERY = 0.05;
        for (const [id, m] of this.movers) {
            if (!this.alive.has(id)) continue;
            const p = this.pair(id), r = p[m.side].r, pos = this.dotPos(p, m.side);
            let s = this.drips.get(id);
            if (!s) {
                const key = this.jellyKey(p.color);
                if (!key) return;
                const k = (r * 0.6) / (this.textures.get(key).getSourceImage() as HTMLCanvasElement).width;
                const st = { fx: null as unknown as Phaser.GameObjects.Particles.ParticleEmitter, t: 0, dir: 0, at: pos };
                st.fx = this.add.particles(0, 0, key, {
                    // Backwards from the way the ball runs, up to 60° either side.
                    angle: { onEmit: () => Phaser.Math.RadToDeg(st.dir) + Phaser.Math.Between(-60, 60) },
                    speed: { min: r * 2.5, max: r * 6 }, gravityY: r * 38, lifespan: { min: 450, max: 750 },
                    ...blobOps(k, 0.2, r), alpha: { start: 1, end: 0.25 }, emitting: false
                });
                st.fx.setDepth(0.95);
                this.drips.set(id, (s = st));
            }
            if (dist(pos, s.at) > 0.5) s.dir = Math.atan2(s.at.y - pos.y, s.at.x - pos.x);
            s.at = pos;
            s.t += dt;
            if (m.returning) { s.t = 0; continue; }
            for (; s.t >= DRIP_EVERY; s.t -= DRIP_EVERY) {
                const a = Math.random() * Math.PI * 2, d = r * Math.random() * 0.4;
                s.fx.emitParticleAt(pos.x + Math.cos(a) * d, pos.y + Math.sin(a) * d, 1);
            }
        }
        for (const [id, s] of this.drips) {
            if (this.movers.has(id) && this.alive.has(id)) continue;
            this.drips.delete(id);
            this.time.delayedCall(800, () => s.fx.destroy());
        }
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
        this.obstaclesOnRemove(p);
        if (!this.alive.size) this.setCutting(false);
        this.emitState();
        if (!this.alive.size) {
            this.over = true;
            clearSession();
            // The board stays empty (no picture behind the end screen); the end screen comes once the
            // splash has settled.
            if (MAGIC) { this.events.emit('allCleared'); this.openDoor(); }
            else this.time.delayedCall(JELLY ? 500 + (PRESS + jiggle()) * 1000 : FLUFFY ? 500 + hugEnd() * 1000 + 300 : 500, () => this.events.emit('win'));
        }
    }

    /** Dev cheat (dev panel, "Win level"): every pair still on the board leaves at once, so the level is won the usual way. */
    cheatWin() {
        if (this.over || !this.level || this.scene.isPaused()) return;
        this.movers.clear();
        for (const id of [...this.alive]) this.removePair(this.pair(id));
    }

    private lose() {
        if (this.over) return;
        this.over = true;
        clearSession();
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
        this.drawObstacles(this.time.now / 1000);
        // Magic: while the leaves slide in, the board is empty. Any look: while the intro waits for the
        // new-look pop-ups, the board is empty too (the balls show once the pop-ups are closed).
        if ((MAGIC && this.phase === 'closing') || this.introHeld) {
            this.overG.clear();
            for (const l of this.lineLayers) l.clear();
            for (const o of [...this.orbs, ...this.balls, ...this.shells, ...this.bodies, ...this.faces, ...this.ropePics.values()]) o.setVisible(false);
            return;
        }
        // Lines are drawn in their colour only, with no edge (even a light line on the light board).
        const stroke = (gg: Phaser.GameObjects.Graphics, pts: Pt[], col: number, w = LINE_WIDTH, alpha = 1) => {
            if (pts.length < 2) return;
            gg.lineStyle(w, col, alpha);
            gg.beginPath();
            gg.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) gg.lineTo(pts[i].x, pts[i].y);
            gg.strokePath();
            gg.fillStyle(col, alpha);
            gg.fillCircle(pts[0].x, pts[0].y, w / 2);
            gg.fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, w / 2);
        };
        // Lines of pairs cleared earlier in the solution lie on top of those cleared later. Lines go on
        // layers under the dots; a rope picture sits between the layer below it and a new layer above it.
        for (const l of this.lineLayers) l.clear();
        let layer = 0;
        const layerG = (i: number) => (this.lineLayers[i] ??= this.add.graphics().setDepth(LINE_DEPTH + i * 0.002));
        let gg = layerG(0);
        const shown = new Set<string>();
        for (const id of this.drawOrder) {
            if (!this.alive.has(id)) continue;
            const p = this.pair(id);
            const col = hexToInt(colour(p.color)?.base ?? COMPLETED_LINE);
            const m = this.movers.get(id);
            if (p.rope) {
                // The rope as it is: drawn out in the intro, shortened behind its own running ball.
                const run = this.introAt(id);
                const ln = this.lines.get(id)!;
                const pts = run !== null ? [...ln.a.filter((_, i) => ln.accA[i] < run), pointAt(ln.a, ln.accA, run)] : this.ropeLine(p);
                if (hasUi('rope') && this.textures.exists(uiKey('rope'))) {
                    this.ropePicture(id, pts, p.color, LINE_DEPTH + (layer * 2 + 1) * 0.001, this.ropeShakes.get(id));
                    shown.add(id);
                    gg = layerG(++layer);
                } else drawRope(gg, pts, col, this.ropeShakes.get(id));
            } else if (m) {
                // The line shortens behind the moving dot.
                const rest = [pointAt(m.pts, m.acc, m.s), ...m.pts.filter((_, i) => m.acc[i] > m.s)];
                stroke(gg, rest, col, lineWidth(p), 1);
            } else if (this.introAt(id) !== null) {
                // Intro: the line is drawn out behind the running dot.
                const ln = this.lines.get(id)!, s = this.introAt(id)!;
                stroke(gg, [...ln.a.filter((_, i) => ln.accA[i] < s), pointAt(ln.a, ln.accA, s)], col, lineWidth(p), 1);
            } else stroke(gg, this.model.line(id), col, lineWidth(p), 1);
        }
        for (const [id, r] of this.ropePics) if (!shown.has(id)) r.setVisible(false);
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
                    // The intro run counts as running (wide eyes, bouncing).
                    const moving = (m && m.side === side) || (side === 'b' && this.introAt(id) !== null), now = this.time.now / 1000;
                    const phase = (id.charCodeAt(id.length - 1) * 1.7 + (side === 'b' ? 2.1 : 0)) % (Math.PI * 2);
                    const ouch = (w && w.t < 0.6) || (!!m && m.side === side && m.returning);
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
        } else if (!FLUFFY && !MAGIC && hasUi(WATER ? 'ball-water-fill' : 'ball-jelly')) {
            // Ball pictures (art/ball/balls.png) in the pair's colour. Jelly: the glossy ball. Water: the
            // water, rocking to and fro inside (its light ripples move: it sloshes), under the clear shell.
            const now = this.time.now / 1000;
            dots.forEach((d, i) => {
                const hex = colour(d.name)?.base ?? COMPLETED_LINE;
                const tex = WATER ? waterFrames(this, hex) : recolour(this, 'ball-jelly', hex, 1);
                const b = (this.balls[i] ??= this.add.image(0, 0, tex).setDepth(1));
                if (WATER) {
                    // The water sloshes: its loop of waves plays (faster while the ball runs or wobbles),
                    // each ball at its own point of the loop; the ball itself does not turn.
                    const phase = (d.pos.x * 0.37 + d.pos.y * 0.23) % 7, moving = d.sx !== 1 || d.sy !== 1;
                    const f = Math.floor(now * (moving ? 16 : 7) + phase * 3) % WATER_FRAMES;
                    if (b.texture.key !== tex || b.frame.name !== String(f)) b.setTexture(tex, String(f));
                    const k = (2 * d.r) / b.frame.width;
                    b.setVisible(true).setPosition(d.draw.x, d.draw.y).setRotation(d.angle).setScale(d.sx * k * 0.96, d.sy * k * 0.96);
                    const s = (this.shells[i] ??= this.add.image(0, 0, uiKey('ball-water-shell')).setDepth(1.2));
                    const ks = (2 * d.r) / s.frame.width; // the shell picture has its own size
                    s.setVisible(true).setPosition(d.draw.x, d.draw.y).setRotation(d.angle).setScale(d.sx * ks, d.sy * ks);
                } else {
                    if (b.texture.key !== tex) b.setTexture(tex);
                    const k = (2 * d.r) / b.frame.width;
                    b.setVisible(true).setPosition(d.draw.x, d.draw.y).setRotation(d.angle).setScale(d.sx * k, d.sy * k);
                }
                if (d.striped) this.drawDot(d.draw, d.r, d.name, d.sx, d.sy, d.angle, true, this.overG);
            });
            for (let i = dots.length; i < this.balls.length; i++) this.balls[i].setVisible(false);
            for (let i = WATER ? dots.length : 0; i < this.shells.length; i++) this.shells[i].setVisible(false);
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
        } else for (const d of dots) this.drawDot(d.draw, d.r, d.name, d.sx, d.sy, d.angle, d.striped, undefined, { phase: (d.pos.x * 0.37 + d.pos.y * 0.23) % 7, amount: d.sx !== 1 || d.sy !== 1 ? 1.8 : 1 });
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
        const grow = 1 + 0.12 * Math.max(0, (t - jiggle() * 0.6) / (jiggle() * 0.4));
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
    private drawDot(pos: Pt, r: number, name: string, sx: number, sy: number, angle: number, striped: boolean, stripesOn?: Phaser.GameObjects.Graphics, slosh?: { phase: number; amount: number }) {
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
        const pc = c ?? { name, base: COMPLETED_LINE, dark: '#' + shade(base, 0.62).toString(16).padStart(6, '0'), gradient: '#ffffff', inner: '#ffffff' };
        if (WATER) {
            // Water balloon: the water sloshes inside (more while it runs), each ball in its own rhythm.
            paintWater(g, at, r, pc, this.time.now / 1000 + (slosh?.phase ?? 0), slosh?.amount ?? 1);
            if (striped) drawStripes(g, local, r);
        } else {
            // Jelly: glossy candy ball (no idle movement).
            paintGlossy(g, at, r, pc);
            if (striped) drawStripes(g, local, r);
            paintGloss(g, at, r, pc);
        }
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

/** The point of a polyline nearest to `q`, and how far it is. */
function nearestOn(pts: Pt[], q: Pt): { p: Pt; d: number } {
    let best = { p: pts[0] ?? q, d: pts[0] ? dist(pts[0], q) : Infinity };
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 ? Phaser.Math.Clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0, 1) : 0;
        const p = { x: a.x + dx * t, y: a.y + dy * t }, d = dist(p, q);
        if (d < best.d) best = { p, d };
    }
    return best;
}

/** Rope look: drawn width, and the gap between the twists of its braid (drawn in code, no picture). */
const ROPE_W = 13, ROPE_TWIST = 9;
/** Rope picture: board length of one repeat of the texture (256 × 64 px shown ROPE_W wide). */
const ROPE_TILE = 256 * (ROPE_W / 64);
/** Depth of the lines (under the dots, which are at 1, and the board's drawing at 0). */
const LINE_DEPTH = -0.5;

/**
 * A rope (obstacle, Pair.rope): a thick braided line in the pair's colour: a dark edge, the colour,
 * and dark slanted twists along it. `shake`: a ball ran into it there, it shivers a moment.
 */
function drawRope(g: Phaser.GameObjects.Graphics, pts: Pt[], col: number, shake?: { t: number; at: Pt }) {
    if (pts.length < 2) return;
    const acc = arcLengths(pts), len = acc[acc.length - 1];
    // Shiver: points near the hit swing sideways, fading out along the rope and in time.
    let line = pts;
    if (shake) {
        const amp = 5 * Math.exp(-shake.t * 7) * Math.sin(shake.t * 45);
        line = pts.map((q, i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = amp * Math.exp(-dist(q, shake.at) / 40);
            return { x: q.x - ((b.y - a.y) / l) * k, y: q.y + ((b.x - a.x) / l) * k };
        });
    }
    const dark = shade(col, 0.62);
    const path = (w: number, c: number) => {
        g.lineStyle(w, c, 1);
        g.beginPath();
        g.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) g.lineTo(line[i].x, line[i].y);
        g.strokePath();
        g.fillStyle(c, 1);
        g.fillCircle(line[0].x, line[0].y, w / 2);
        g.fillCircle(line[line.length - 1].x, line[line.length - 1].y, w / 2);
    };
    path(ROPE_W + 3, dark);
    path(ROPE_W, col);
    // The braid: short dark strokes slanted across the rope, one every ROPE_TWIST px.
    g.lineStyle(2.6, dark, 1);
    const sh = shake ? line : pts, half = ROPE_W / 2 - 1;
    for (let s = ROPE_TWIST / 2; s < len; s += ROPE_TWIST) {
        const c = pointAt(sh, acc, s), n = pointAt(sh, acc, Math.min(len, s + 1));
        let tx = n.x - c.x, ty = n.y - c.y;
        const l = Math.hypot(tx, ty) || 1;
        tx /= l; ty /= l;
        // Across the rope (normal), leaning forward along it.
        const ax = -ty * half + tx * half * 0.7, ay = tx * half + ty * half * 0.7;
        g.lineBetween(c.x - ax, c.y - ay, c.x + ax, c.y + ay);
    }
    // A soft light line along the top for roundness.
    g.lineStyle(2, 0xffffff, 0.35);
    g.beginPath();
    g.moveTo(line[0].x, line[0].y - ROPE_W * 0.22);
    for (let i = 1; i < line.length; i++) g.lineTo(line[i].x, line[i].y - ROPE_W * 0.22);
    g.strokePath();
}

/** Tag colours of locks and their keys (core/level.ts LOCK_TAGS) as numbers. */
const LOCK_TAGS = LOCK_TAG_HEX.map((c) => parseInt(c.slice(1), 16));

/** Round white badge with a ring in the tag colour (locks and keys sit on lines, over them). */
function badge(g: Phaser.GameObjects.Graphics, size: number, col: number) {
    g.fillStyle(0x000000, 0.12).fillCircle(0, size * 0.06, size * 0.52);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, size * 0.5);
    g.lineStyle(size * 0.07, col, 1).strokeCircle(0, 0, size * 0.45);
}

/** A padlock in the tag colour: grey shackle, coloured body, dark keyhole. */
function drawLockBadge(g: Phaser.GameObjects.Graphics, size: number, col: number) {
    badge(g, size, col);
    const w = size * 0.46, h = size * 0.34, top = -size * 0.02;
    g.lineStyle(size * 0.07, 0x8d93a3, 1);
    g.beginPath();
    g.arc(0, top, w * 0.3, Math.PI, 0, false);
    g.strokePath();
    g.lineBetween(-w * 0.3, top, -w * 0.3, top + h * 0.2);
    g.lineBetween(w * 0.3, top, w * 0.3, top + h * 0.2);
    g.fillStyle(col, 1).fillRoundedRect(-w / 2, top, w, h, size * 0.06);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(-w / 2 + size * 0.03, top + size * 0.03, w - size * 0.06, h * 0.25, size * 0.03);
    g.fillStyle(shade(col, 0.45), 1).fillCircle(0, top + h * 0.42, size * 0.045);
    g.fillRect(-size * 0.018, top + h * 0.42, size * 0.036, h * 0.32);
}

/** A key in the tag colour: round bow, shaft and two teeth, leaning. */
function drawKeyBadge(g: Phaser.GameObjects.Graphics, size: number, col: number) {
    badge(g, size, col);
    const k = size, dark = shade(col, 0.7);
    const ang = -Math.PI / 5, ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (x: number, y: number) => ({ x: (x * ca - y * sa) * k, y: (x * sa + y * ca) * k });
    const bow = P(-0.17, 0);
    g.lineStyle(k * 0.075, col, 1).strokeCircle(bow.x, bow.y, k * 0.1);
    const s0 = P(-0.07, 0), s1 = P(0.24, 0);
    g.lineStyle(k * 0.07, col, 1).lineBetween(s0.x, s0.y, s1.x, s1.y);
    for (const x of [0.13, 0.21]) { const a = P(x, 0), b = P(x, 0.09); g.lineStyle(k * 0.06, col, 1).lineBetween(a.x, a.y, b.x, b.y); }
    g.fillStyle(dark, 1).fillCircle(bow.x, bow.y, k * 0.035);
}

/** Jelly: size on screen (game px) of the blobs thrown up by a tap on empty board, whatever the zoom. */
const GHOST_R = 18;

/**
 * Emitter settings for a blob of jelly: it shrinks from k to k × end over its life, and stretches a little
 * along the way it flies (more when faster), turned to face it.
 */
function blobOps(k: number, end: number, r: number) {
    type P = Phaser.GameObjects.Particles.Particle;
    const size = (t: number) => k + (k * end - k) * t;
    const stretch = (p: P) => Math.min(0.25, Math.hypot(p.velocityX, p.velocityY) / (r * 40));
    return {
        scaleX: { onEmit: () => k, onUpdate: (p: P, _key: string, t: number) => size(t) * (1 + stretch(p)) },
        scaleY: { onEmit: () => k, onUpdate: (p: P, _key: string, t: number) => size(t) * (1 - stretch(p) * 0.4) },
        rotate: { onEmit: () => 0, onUpdate: (p: P) => Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) }
    };
}
