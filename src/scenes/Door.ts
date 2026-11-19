import * as Phaser from 'phaser';
import { theme, themeOf } from '../game/theme';
import { onSettings } from '../game/settings';
import { colour } from '../core/palette';

/**
 * Magic variant (src/game/mode.ts): the double door the level is carved into, the room behind it and the
 * light through the seam. Runs below the Game scene in screen space (it does not zoom with the board).
 * The Game scene drives it through `DoorState`.
 *
 * Art: src/assets/magic/ (game-sized copies of art/magic/, made by `npm run art:magic`;
 * docs/guide/magic-assets.md). A missing picture is drawn here as a stand-in (the orb is left out
 * instead). The room behind the door fills the game screen; the page around it takes the door's colour.
 */

/** How far each leaf has slid out (screen px, 0 = closed), seam glow and opening burst (0..1). */
export interface DoorState {
    off: number;
    glow: number;
    burst: number;
}

/** A leaf fully open: slid off its half of the screen (with room for grooves that overhang the seam). */
export const DOOR_OPEN = 480;
/** The orb's diameter in its texture, as a share of the texture width. */
export const ORB_FILL = 0.88;

const ART = import.meta.glob('../assets/magic/*.{jpg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (name: string) => Object.entries(ART).find(([k]) => /\/([^/]+)\.\w+$/.exec(k)?.[1] === name)?.[1];
const NAMES = ['door', 'door-light', 'backdrop', 'light-ray', 'light-burst', 'sparkle', 'orb'] as const;
const key = (name: string) => `magic-${name}`;
/** Plain panel of door.png (game size 780 x 1688): inside its gold frame, seam at x = 390 (385..395). */
const PANEL = { x0: 58, x1: 722 };

/** Orb texture in a palette colour, made on first use (null while orb.png is not loaded / missing). */
export function orbTexture(scene: Phaser.Scene, name: string): string | null {
    const k = `magic-orb-${name}`;
    if (scene.textures.exists(k)) return k;
    if (!scene.textures.exists('magic-orb')) return null;
    colourOrb(scene, k, colour(name)?.base ?? '#9aa0b4');
    return k;
}

export class Door extends Phaser.Scene {
    private left!: Phaser.GameObjects.Image;
    private right!: Phaser.GameObjects.Image;
    private seam!: Phaser.GameObjects.Graphics;
    private ray!: Phaser.GameObjects.Image;
    private burst!: Phaser.GameObjects.Image;
    private state: DoorState = { off: DOOR_OPEN, glow: 0, burst: 0 };

    constructor() {
        super('Door');
    }

    preload() {
        for (const n of NAMES) { const url = art(n); if (url) this.load.image(n === 'orb' ? 'magic-orb-raw' : `${key(n)}-raw`, url); }
    }

    create() {
        const { width: W, height: H } = this.scale;
        for (const n of NAMES) {
            if (this.textures.exists(`${key(n)}-raw`)) continue;
            STAND_IN[n]?.(this, `${key(n)}-raw`, W, H);
        }
        for (const n of ['light-ray', 'light-burst', 'sparkle'] as const) this.textures.renameTexture(`${key(n)}-raw`, key(n));
        if (this.textures.exists('magic-orb-raw')) keyOutGreen(this, 'magic-orb-raw', 'magic-orb');
        // Door faces in the board colours of the two themes (as in the classic game), with the picture's grain.
        const light = this.textures.exists(`${key('door-light')}-raw`) ? `${key('door-light')}-raw` : `${key('door')}-raw`;
        makeDoor(this, `${key('door')}-raw`, key('door-dark'), themeOf('dark').background);
        makeDoor(this, light, key('door-light'), themeOf('light').background);
        // The room behind the door fills the game screen exactly.
        this.add.image(W / 2, H / 2, `${key('backdrop')}-raw`).setDisplaySize(W, H);
        this.burst = this.add.image(W / 2, H / 2, key('light-burst')).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.left = this.add.image(0, 0, key('door-dark')).setOrigin(0);
        this.right = this.add.image(0, 0, key('door-dark')).setOrigin(0);
        this.seam = this.add.graphics();
        this.ray = this.add.image(W / 2, H / 2, key('light-ray')).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.applyTheme();
        const off = onSettings(() => this.applyTheme());
        this.events.once('shutdown', off);
        this.apply();
    }

    /** Door face of the current theme; the page around the game takes the door's colour. */
    private applyTheme() {
        const k = key(theme().dark ? 'door-dark' : 'door-light');
        const { width: W, height: H } = this.scale;
        const src = this.textures.get(k).getSourceImage() as { width: number; height: number };
        this.left.setTexture(k).setDisplaySize(W, H).setCrop(0, 0, src.width / 2, src.height);
        this.right.setTexture(k).setDisplaySize(W, H).setCrop(src.width / 2, 0, src.width / 2, src.height);
        // (on <html>: a body background would paint over the room layer)
        document.documentElement.style.background = theme().background;
        document.body.style.background = 'transparent';
    }

    /** The Game scene's door (read every frame). */
    bind(state: DoorState) {
        this.state = state;
    }

    /** The leaves slam shut: a shake and a puff of sparkles along the seam. */
    slam() {
        const { width: W, height: H } = this.scale;
        this.cameras.main.shake(170, 0.008);
        const size = 34 / (this.textures.get(key('sparkle')).getSourceImage() as { width: number }).width;
        const fx = this.add.particles(W / 2, 0, key('sparkle'), {
            y: { min: H * 0.15, max: H * 0.85 }, speedX: { min: -260, max: 260 }, speedY: { min: -40, max: 40 },
            lifespan: { min: 300, max: 650 }, scale: { start: size * 1.4, end: 0 }, alpha: { start: 0.9, end: 0 },
            tint: [0xfff1c4, 0xffd36b], blendMode: Phaser.BlendModes.ADD, emitting: false
        });
        fx.explode(36);
        this.time.delayedCall(800, () => fx.destroy());
    }

    update() {
        this.apply();
    }

    private apply() {
        const { width: W, height: H } = this.scale;
        const s = this.state;
        this.left.x = -s.off;
        this.right.x = s.off;
        // No seam while the seal holds: it shows (a dark crack, then light through it) only when the
        // last dot is gone and the door is about to open.
        const crack = Math.min(1, s.glow * 4);
        this.seam.clear();
        if (crack > 0 && s.off < 1) {
            this.seam.fillStyle(0x05070d, 0.85 * crack).fillRect(W / 2 - 2, 0, 4, H);
        }
        const open = Math.min(1, s.off / DOOR_OPEN);
        this.ray.setAlpha(Math.min(1, s.glow) * (1 - open * 0.9));
        const rayW = this.ray.frame.width > 200 ? 300 : 90;
        this.ray.setDisplaySize(rayW + s.off * 2.4 + s.glow * 40, H);
        this.burst.setAlpha(s.burst);
        const b = this.burst.frame.width || 1;
        this.burst.setScale(((0.7 + s.burst * 0.6) * W) / b);
    }
}

/**
 * Door face: only the plain panel of the picture (no gold frame at the sides; the top and bottom
 * ornaments go under the HUD and the booster panel), with the painted seam filled in, recoloured to
 * `bg` (the theme's board colour) keeping only the picture's fine grain.
 */
function makeDoor(scene: Phaser.Scene, from: string, to: string, bg: string) {
    const img = scene.textures.get(from).getSourceImage() as HTMLImageElement;
    const sx = img.width / 780;
    const W = 780, H = 1688;
    const cw = (PANEL.x1 - PANEL.x0) * sx, ch = cw * (H / W);
    const t = scene.textures.createCanvas(to, W, H)!;
    const c = t.getContext();
    c.drawImage(img, PANEL.x0 * sx, (img.height - ch) / 2, cw, ch, 0, 0, W, H);
    // Fill in the painted seam with the panel on either side of it.
    const mid = W / 2, half = 9;
    c.drawImage(t.getSourceImage() as HTMLCanvasElement, mid - half - 24, 0, half, H, mid - half, 0, half, H);
    c.drawImage(t.getSourceImage() as HTMLCanvasElement, mid + 24, 0, half, H, mid, 0, half, H);
    // Board colour + the picture's brightness wobble around its own mean (a faint stone grain).
    const d = c.getImageData(0, 0, W, H);
    const px = d.data;
    let mean = 0;
    for (let i = 0; i < px.length; i += 4) mean += px[i] + px[i + 1] + px[i + 2];
    mean /= (px.length / 4) * 3;
    const col = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    for (let i = 0; i < px.length; i += 4) {
        const grain = ((px[i] + px[i + 1] + px[i + 2]) / 3 - mean) * 0.35;
        for (let k = 0; k < 3; k++) px[i + k] = Math.max(0, Math.min(255, col[k] + grain));
    }
    c.putImageData(d, 0, 0);
    t.refresh();
}

/** Orb picture on a green screen -> a texture with that green made transparent (soft edge, no green fringe). */
function keyOutGreen(scene: Phaser.Scene, from: string, to: string) {
    const img = scene.textures.get(from).getSourceImage() as HTMLImageElement;
    const t = scene.textures.createCanvas(to, img.width, img.height)!;
    const c = t.getContext();
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const green = g - Math.max(r, b);
        if (green > 20) {
            px[i + 3] = Math.round(px[i + 3] * Math.max(0, 1 - (green - 20) / 70));
            px[i + 1] = Math.max(r, b); // no green spill on the edge
        }
    }
    c.putImageData(d, 0, 0);
    t.refresh();
}

/**
 * The grey orb in one colour. Tinting cannot do it for every colour (a fully saturated colour such as
 * magenta comes out flat), so the shading is mapped by hand: the orb's mid grey becomes the colour,
 * darker greys shade it towards black, lighter greys towards white (the highlights stay white).
 */
function colourOrb(scene: Phaser.Scene, to: string, hex: string) {
    const src = scene.textures.get('magic-orb').getSourceImage() as HTMLCanvasElement;
    const t = scene.textures.createCanvas(to, src.width, src.height)!;
    const c = t.getContext();
    c.drawImage(src, 0, 0);
    const d = c.getImageData(0, 0, src.width, src.height);
    const px = d.data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { sum += (px[i] + px[i + 1] + px[i + 2]) / 765; n++; }
    const mid = n ? sum / n : 0.55;
    const col = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const L = (px[i] + px[i + 1] + px[i + 2]) / 765;
        for (let k = 0; k < 3; k++) {
            const v = L < mid ? col[k] * (0.25 + 0.75 * (L / mid)) : col[k] + (1 - col[k]) * ((L - mid) / (1 - mid)) ** 1.4;
            px[i + k] = Math.round(Math.min(1, v) * 255);
        }
    }
    c.putImageData(d, 0, 0);
    t.refresh();
}

// ---------- stand-in art (until art/magic/ has the real pictures) ----------

type Draw = (scene: Phaser.Scene, key: string, w: number, h: number) => void;

function canvas(scene: Phaser.Scene, k: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
    const t = scene.textures.createCanvas(k, w, h)!;
    paint(t.getContext());
    t.refresh();
}

const GOLD = '#c9a24a';

const STAND_IN: Partial<Record<(typeof NAMES)[number], Draw>> = {
    door: (scene, k, W, H) => canvas(scene, k, W, H, (c) => {
        // Calm slate-blue stone, darker carved borders with gold lines, a straight seam in the middle.
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#34425f');
        g.addColorStop(1, '#232d45');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.02})`; c.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3); }
        c.fillStyle = '#1b2338';
        c.fillRect(0, 0, W, 250);
        c.fillRect(0, H - 200, W, 200);
        c.fillRect(0, 0, 46, H);
        c.fillRect(W - 46, 0, 46, H);
        c.strokeStyle = GOLD;
        c.lineWidth = 4;
        for (const half of [0, 1]) {
            const x0 = half ? W / 2 + 18 : 60, x1 = half ? W - 60 : W / 2 - 18;
            c.beginPath();
            c.roundRect(x0, 270, x1 - x0, H - 270 - 220, 22);
            c.stroke();
        }
        // Arch at the top, band at the bottom, rivets down the outer edges.
        c.lineWidth = 6;
        c.beginPath();
        c.ellipse(W / 2, 250, W / 2 - 40, 170, 0, Math.PI, 0);
        c.stroke();
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(30, H - 150);
        c.lineTo(W - 30, H - 150);
        c.stroke();
        c.fillStyle = GOLD;
        for (let y = 300; y < H - 220; y += 70) for (const x of [23, W - 23]) { c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); }
        c.font = '28px serif';
        c.textAlign = 'center';
        const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
        for (let i = 0; i < 13; i++) {
            const a = Math.PI + (Math.PI * (i + 0.5)) / 13;
            c.fillText(runes[i % runes.length], W / 2 + Math.cos(a) * (W / 2 - 80), 262 + Math.sin(a) * 130);
        }
        // Seam: a dark hairline with a faint warm edge.
        c.fillStyle = '#0b0f1a';
        c.fillRect(W / 2 - 2, 0, 4, H);
        c.fillStyle = 'rgba(255,205,120,0.35)';
        c.fillRect(W / 2 - 0.5, 0, 1, H);
    }),
    backdrop: (scene, k, W, H) => canvas(scene, k, W, H, (c) => {
        const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.62);
        g.addColorStop(0, '#fff6d8');
        g.addColorStop(0.18, '#ffd47a');
        g.addColorStop(0.45, '#8a4fb0');
        g.addColorStop(1, '#170d2c');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
        let seed = 3;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 140; i++) {
            c.fillStyle = `rgba(255,236,180,${0.2 + rnd() * 0.6})`;
            c.beginPath();
            c.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, Math.PI * 2);
            c.fill();
        }
    }),
    'light-ray': (scene, k, _W, H) => canvas(scene, k, 128, H, (c) => {
        const g = c.createLinearGradient(0, 0, 128, 0);
        g.addColorStop(0, 'rgba(255,190,90,0)');
        g.addColorStop(0.4, 'rgba(255,200,110,0.35)');
        g.addColorStop(0.5, 'rgba(255,255,240,1)');
        g.addColorStop(0.6, 'rgba(255,200,110,0.35)');
        g.addColorStop(1, 'rgba(255,190,90,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, H);
    }),
    'light-burst': (scene, k) => canvas(scene, k, 512, 512, (c) => {
        c.translate(256, 256);
        for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2, len = 150 + ((i * 53) % 100), w = 0.05 + ((i * 7) % 5) / 100;
            const g = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
            g.addColorStop(0, 'rgba(255,240,200,0.8)');
            g.addColorStop(1, 'rgba(255,200,100,0)');
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len);
            c.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len);
            c.fill();
        }
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 140);
        g.addColorStop(0, 'rgba(255,255,240,1)');
        g.addColorStop(1, 'rgba(255,210,120,0)');
        c.fillStyle = g;
        c.fillRect(-256, -256, 512, 512);
    }),
    sparkle: (scene, k) => canvas(scene, k, 64, 64, (c) => {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 18);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(32, 2); c.lineTo(36, 28); c.lineTo(62, 32); c.lineTo(36, 36); c.lineTo(32, 62); c.lineTo(28, 36); c.lineTo(2, 32); c.lineTo(28, 28);
        c.closePath();
        c.fill();
    })
};
