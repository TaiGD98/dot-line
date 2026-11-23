import * as Phaser from 'phaser';
import { BOARDS, colour } from '../core/palette';
import type { BackgroundId, SkinId } from '../game/mode';
import { paintGloss, paintGlossy, paintWater } from './ballart';
import { ballFill, ballTexture, faceFrame, key as fluffyKey } from './fluffy';
import { WATER_FRAMES, hasUi, recolour, uiKey, waterFrames } from './uiart';

/**
 * Live thumbnails of the looks (Theme screen, new-look pop-ups): a red ball of each kind with its idle
 * animation (Water: the water sloshing, Fluffy: breathing; Jelly stays still), and a tile of each
 * background. Fluffy needs the fluffy pictures loaded (preloadFluffy + makeFluffy).
 */
export function ballThumb(scene: Phaser.Scene, into: Phaser.GameObjects.Container, id: SkinId, x: number, y: number, r: number) {
    const red = colour('red')!;
    if (id === 'fluffy') {
        const body = scene.add.image(x, y, ballTexture(scene, 'red'));
        const face = scene.add.image(x, y, fluffyKey('face-sleep'));
        into.add([body, face]);
        return (t: number) => {
            const b = Math.sin(t * 2.6), kb = (2 * r) / (body.frame.width * ballFill());
            body.setPosition(x, y - r * 0.07 * b).setScale(kb * (1 - 0.025 * b), kb * (1 + 0.045 * b));
            const ff = faceFrame('sleep'), kf = (2 * r * ff.span) / face.frame.width;
            face.setPosition(x, y - r * 0.07 * b + r * ff.drop).setScale(kf * (1 - 0.025 * b), kf * (1 + 0.045 * b));
        };
    }
    if (hasUi(id === 'water' ? 'ball-water-fill' : 'ball-jelly')) {
        // The ball pictures (as in the game): Jelly wobbles softly, Water's water rocks inside its shell.
        const ball = id === 'water' ? scene.add.image(x, y, waterFrames(scene, red.base), '0') : scene.add.image(x, y, recolour(scene, 'ball-jelly', red.base, 1));
        const k = (2 * r) / ball.width;
        into.add(ball);
        const shell = id === 'water' ? scene.add.image(x, y, uiKey('ball-water-shell')) : null;
        shell?.setScale((2 * r) / shell.width);
        if (shell) into.add(shell);
        return (t: number) => {
            if (id === 'water') ball.setFrame(String(Math.floor(t * 7) % WATER_FRAMES)).setScale(k * 0.96);
            else ball.setScale(k); // Jelly: still (no idle animation)
        };
    }
    const g = scene.add.graphics();
    into.add(g);
    return (t: number) => {
        g.clear();
        const wob = id === 'jelly' ? Math.sin(t * 3.2) * 0.04 : 0;
        g.save();
        g.translateCanvas(x, y);
        g.scaleCanvas(1 + wob, 1 - wob);
        const at = (fx: number, fy: number) => ({ x: fx * r, y: fy * r });
        if (id === 'water') paintWater(g, at, r, red, t, 1.3);
        else { paintGlossy(g, at, r, red); paintGloss(g, at, r, red); }
        g.restore();
    };
}

/**
 * A w × h tile of the background (light board) with rounded corners: plain cream (Classic), or one big
 * still face of the fluffy pattern in the middle, a touch darker (so it plainly differs from Classic).
 * Drawn once into its own texture (the round corners clip it); `framed` adds a white card and a thin
 * border round it (as the Theme grid's cells), for a tile shown on its own (the new-background pop-up).
 */
export function bgThumb(scene: Phaser.Scene, into: Phaser.GameObjects.Container, id: BackgroundId, x: number, y: number, w: number, h: number, framed = false) {
    const W = Math.round(w), H = Math.round(h), R = Math.round(Math.min(W, H) * 0.14);
    const key = `thumb-bg-${id}-${W}x${H}`;
    if (!scene.textures.exists(key)) {
        const t = scene.textures.createCanvas(key, W, H)!, c = t.getContext();
        c.beginPath();
        c.roundRect(0, 0, W, H, R);
        c.clip();
        c.fillStyle = BOARDS.light.bg;
        c.fillRect(0, 0, W, H);
        if (id === 'fluffy') {
            const src = scene.textures.get(fluffyKey('pattern-light')).getSourceImage() as CanvasImageSource & { width: number };
            const f = patternFace(scene), k = (W * 0.55) / f.size;
            c.drawImage(src, f.x - W / 2 / k, f.y - H / 2 / k, W / k, H / k, 0, 0, W, H);
            c.globalCompositeOperation = 'multiply';
            c.fillStyle = '#e9dfcf';
            c.fillRect(0, 0, W, H);
        }
        t.refresh();
    }
    if (framed) {
        const pad = 12, g = scene.add.graphics();
        g.fillStyle(0xffffff, 1).fillRoundedRect(x - w / 2 - pad, y - h / 2 - pad, w + 2 * pad, h + 2 * pad, R + pad);
        g.lineStyle(4, 0xe7b48e, 1).strokeRoundedRect(x - w / 2 - pad, y - h / 2 - pad, w + 2 * pad, h + 2 * pad, R + pad);
        into.add(g);
    }
    into.add(scene.add.image(x, y, key));
    return () => undefined;
}

let face: { x: number; y: number; size: number } | null = null;
/** One face of the light fluffy pattern (centre and size, in the picture's px): the biggest patch darker than its background. */
function patternFace(scene: Phaser.Scene) {
    if (face) return face;
    const src = scene.textures.get(fluffyKey('pattern-light')).getSourceImage() as HTMLImageElement;
    const D = 8, W = Math.ceil(src.width / D), H = Math.ceil(src.height / D);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    c.drawImage(src, 0, 0, W, H);
    const px = c.getImageData(0, 0, W, H).data;
    const L = (i: number) => px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2];
    const counts = new Map<number, number>();
    for (let i = 0; i < W * H; i++) counts.set(L(i) >> 3, (counts.get(L(i) >> 3) ?? 0) + 1);
    const bg = ([...counts].sort((a, b) => b[1] - a[1])[0][0] << 3) + 4;
    const seen = new Uint8Array(W * H);
    let best = { n: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    for (let s = 0; s < W * H; s++) {
        if (seen[s] || L(s) > bg - 12) continue;
        const b = { n: 0, x0: W, y0: H, x1: 0, y1: 0 }, stack = [s];
        seen[s] = 1;
        while (stack.length) {
            const i = stack.pop()!, xx = i % W, yy = (i / W) | 0;
            b.n++; b.x0 = Math.min(b.x0, xx); b.x1 = Math.max(b.x1, xx); b.y0 = Math.min(b.y0, yy); b.y1 = Math.max(b.y1, yy);
            for (const j of [xx > 0 ? i - 1 : -1, xx < W - 1 ? i + 1 : -1, yy > 0 ? i - W : -1, yy < H - 1 ? i + W : -1])
                if (j >= 0 && !seen[j] && L(j) <= bg - 12) { seen[j] = 1; stack.push(j); }
        }
        if (b.n > best.n) best = b;
    }
    face = best.n ? { x: ((best.x0 + best.x1) / 2) * D, y: ((best.y0 + best.y1) / 2) * D, size: Math.max(best.x1 - best.x0, best.y1 - best.y0, 4) * D } : { x: src.width / 2, y: src.height / 2, size: src.width / 8 };
    return face;
}
