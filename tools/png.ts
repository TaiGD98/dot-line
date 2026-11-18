// PNG -> RGBA pixels for the build tools (Node has no canvas): the PNG is converted to an
// uncompressed BMP with macOS `sips`, composited on white and scaled like the level editor does.
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';

/** Decodes a 24/32-bit BMP (as written by sips) into RGBA composited on white, scaled to `max` px. */
export function loadRGBA(png: string, tmp: string, max = 600): { rgba: Uint8ClampedArray; w: number; h: number } {
    mkdirSync(tmp, { recursive: true });
    const bmp = `${tmp}${png.split('/').pop()!.replace('.png', '.bmp')}`;
    execFileSync('sips', ['-s', 'format', 'bmp', png, '--out', bmp], { stdio: 'ignore' });
    const b = readFileSync(bmp);
    const off = b.readUInt32LE(10), W = b.readInt32LE(18), Hs = b.readInt32LE(22), bpp = b.readUInt16LE(28);
    const H = Math.abs(Hs), row = Math.ceil((bpp * W) / 32) * 4, n = bpp / 8;
    const src = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) {
        const r = Hs < 0 ? y : H - 1 - y;
        for (let x = 0; x < W; x++) {
            const i = off + r * row + x * n, a = n === 4 ? b[i + 3] / 255 : 1;
            const o = (y * W + x) * 3;
            src[o] = b[i + 2] * a + 255 * (1 - a); src[o + 1] = b[i + 1] * a + 255 * (1 - a); src[o + 2] = b[i] * a + 255 * (1 - a);
        }
    }
    const k = Math.min(1, max / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Box filter (what a canvas does when it shrinks an image).
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const x0 = Math.floor(x / k), x1 = Math.max(x0 + 1, Math.floor((x + 1) / k)), y0 = Math.floor(y / k), y1 = Math.max(y0 + 1, Math.floor((y + 1) / k));
            let r = 0, g = 0, bl = 0, c = 0;
            for (let yy = y0; yy < Math.min(H, y1); yy++) for (let xx = x0; xx < Math.min(W, x1); xx++) { const o = (yy * W + xx) * 3; r += src[o]; g += src[o + 1]; bl += src[o + 2]; c++; }
            const o = (y * w + x) * 4;
            rgba[o] = r / c; rgba[o + 1] = g / c; rgba[o + 2] = bl / c; rgba[o + 3] = 255;
        }
    return { rgba, w, h };
}

