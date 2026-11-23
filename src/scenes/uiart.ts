import * as Phaser from 'phaser';

/**
 * Ball and UI pictures from src/assets/ui/ (made by `npm run art:ui` from art/ball/ and art/ui/;
 * docs/guide/ui-assets.md): the Jelly and Water balls, the icons, the pop-up panel, ribbon, buttons,
 * the tutorial hand and the Home map pieces. Each is optional: what is missing is drawn in code.
 */
const ART = import.meta.glob('../assets/ui/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string) => Object.entries(ART).find(([k]) => /\/([^/]+)\.png$/.exec(k)?.[1] === name)?.[1];

export const uiKey = (name: string) => `ui-${name}`;
/** Is the picture there? */
export const hasUi = (name: string) => !!url(name);

export function preloadUi(scene: Phaser.Scene) {
    for (const k of Object.keys(ART)) {
        const name = /\/([^/]+)\.png$/.exec(k)![1];
        if (!scene.textures.exists(uiKey(name))) scene.load.image(uiKey(name), ART[k]);
    }
}

/**
 * A picture in another colour, made on first use: its middle grey becomes `hex`, darker greys shade it,
 * lighter ones lighten it towards white (as the orb and the fluffy ball). For grey pictures (the balls)
 * and coloured ones alike (a blue button made red): only brightness is kept.
 */
export function recolour(scene: Phaser.Scene, name: string, hex: string, lift = 1): string {
    const k = `${uiKey(name)}-${hex}`;
    if (scene.textures.exists(k)) return k;
    const src = scene.textures.get(uiKey(name)).getSourceImage() as HTMLImageElement;
    const t = scene.textures.createCanvas(k, src.width, src.height)!;
    const c = t.getContext();
    c.drawImage(src, 0, 0);
    const d = c.getImageData(0, 0, src.width, src.height), px = d.data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { sum += (px[i] + px[i + 1] + px[i + 2]) / 765; n++; }
    const mid = n ? sum / n : 0.55;
    const col = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const L = (px[i] + px[i + 1] + px[i + 2]) / 765;
        for (let q = 0; q < 3; q++) {
            const v = L < mid ? col[q] * (0.28 + 0.72 * (L / mid)) : col[q] + (1 - col[q]) * ((L - mid) / (1 - mid)) ** 1.3 * lift;
            px[i + q] = Math.round(Math.min(1, v) * 255);
        }
    }
    c.putImageData(d, 0, 0);
    t.refresh();
    return k;
}

/** Hex string of a 0xRRGGBB colour. */
export const hexOf = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Frames of the water's slosh loop (waterFrames). */
export const WATER_FRAMES = 12;

/**
 * The water of the Water ball sloshing, as a loop of WATER_FRAMES frames (one texture, frames '0'..):
 * the recoloured water picture with waves running through it (each pixel takes its colour from a
 * point pushed to and fro by two crossing sine waves; the round outline stays put). Made once per colour.
 */
export function waterFrames(scene: Phaser.Scene, hex: string): string {
    const k = `${uiKey('water')}-${hex}`;
    if (scene.textures.exists(k)) return k;
    const srcKey = recolour(scene, 'ball-water-fill', hex, 0.7);
    const src = scene.textures.get(srcKey).getSourceImage() as HTMLCanvasElement;
    // 160 px is plenty (a ball is at most about 100 px on screen) and 2.5 times quicker to make than 256.
    const S = Math.min(160, src.width), N = WATER_FRAMES;
    const small = document.createElement('canvas');
    small.width = small.height = S;
    const sc = small.getContext('2d')!;
    sc.drawImage(src, 0, 0, S, S);
    const sp = sc.getImageData(0, 0, S, S).data;
    const t = scene.textures.createCanvas(k, S * N, S)!;
    const c = t.getContext();
    const out = c.createImageData(S * N, S), op = out.data;
    const R = S / 2, A = S * 0.035, L1 = S * 0.42, L2 = S * 0.3;
    for (let f = 0; f < N; f++) {
        const ph = (2 * Math.PI * f) / N;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const si = (y * S + x) * 4;
            if (!sp[si + 3]) continue;
            // Two waves: one rocks the water sideways (rows swing left and right), one rolls it up and down.
            let sx = x + A * Math.sin((2 * Math.PI * y) / L1 + ph) + A * 0.6 * Math.sin((2 * Math.PI * (x + y)) / L2 + 2 * ph);
            let sy = y + A * 0.8 * Math.cos((2 * Math.PI * x) / L1 - ph);
            // Keep the sample inside the ball.
            const dx = sx - R, dy = sy - R, d = Math.hypot(dx, dy);
            if (d > R - 2) { sx = R + (dx / d) * (R - 2); sy = R + (dy / d) * (R - 2); }
            const j = ((Math.round(sy) * S) + Math.round(sx)) * 4, o = (y * S * N + f * S + x) * 4;
            op[o] = sp[j]; op[o + 1] = sp[j + 1]; op[o + 2] = sp[j + 2]; op[o + 3] = sp[si + 3];
        }
        t.add(String(f), 0, f * S, 0, S, S);
    }
    c.putImageData(out, 0, 0);
    t.refresh();
    return k;
}
