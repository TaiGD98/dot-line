// RGBA images for the build tools (Node has no canvas): read any picture macOS `sips` can open (as a
// 32-bit BMP, alpha kept), crop / scale / recolour in plain arrays, write PNG (zlib) or JPEG (sips).
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { crc32, deflateSync } from 'zlib';

export interface Img { w: number; h: number; px: Uint8ClampedArray }

export function readImage(file: string, tmp: string): Img {
    mkdirSync(tmp, { recursive: true });
    const bmp = `${tmp}${file.split('/').pop()}.bmp`;
    execFileSync('sips', ['-s', 'format', 'bmp', file, '--out', bmp], { stdio: 'ignore' });
    const b = readFileSync(bmp);
    rmSync(bmp, { force: true });
    const off = b.readUInt32LE(10), W = b.readInt32LE(18), Hs = b.readInt32LE(22), bpp = b.readUInt16LE(28);
    const H = Math.abs(Hs), row = Math.ceil((bpp * W) / 32) * 4, n = bpp / 8;
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        const r = Hs < 0 ? y : H - 1 - y;
        for (let x = 0; x < W; x++) {
            const i = off + r * row + x * n, o = (y * W + x) * 4;
            px[o] = b[i + 2]; px[o + 1] = b[i + 1]; px[o + 2] = b[i]; px[o + 3] = n === 4 ? b[i + 3] : 255;
        }
    }
    return { w: W, h: H, px };
}

export const blank = (w: number, h: number): Img => ({ w, h, px: new Uint8ClampedArray(w * h * 4) });

export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
    const out = blank(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const sx = x + i, sy = y + j;
        if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
        const s = (sy * img.w + sx) * 4, d = (j * w + i) * 4;
        for (let k = 0; k < 4; k++) out.px[d + k] = img.px[s + k];
    }
    return out;
}

/** Area-averaged resize (premultiplied, so transparent edges do not darken). */
export function resize(img: Img, w: number, h: number): Img {
    const out = blank(w, h), fx = img.w / w, fy = img.h / h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x0 = i * fx, x1 = (i + 1) * fx, y0 = j * fy, y1 = (j + 1) * fy;
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
            if (x >= img.w || y >= img.h) continue;
            const s = (y * img.w + x) * 4, al = img.px[s + 3] / 255;
            r += img.px[s] * al; g += img.px[s + 1] * al; b += img.px[s + 2] * al; a += al; n++;
        }
        const d = (j * w + i) * 4;
        if (a > 0) { out.px[d] = r / a; out.px[d + 1] = g / a; out.px[d + 2] = b / a; }
        out.px[d + 3] = n ? (a / n) * 255 : 0;
    }
    return out;
}

/** Bounding box of the pixels with alpha above `min` inside the region (default: the whole image). */
export function bbox(img: Img, min = 24, region = { x: 0, y: 0, w: img.w, h: img.h }) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++)
        if (img.px[(y * img.w + x) * 4 + 3] > min) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function writePng(file: string, img: Img) {
    const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
    for (let y = 0; y < img.h; y++) {
        raw[y * (img.w * 4 + 1)] = 0;
        Buffer.from(img.px.buffer, img.px.byteOffset + y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
    }
    const chunk = (type: string, data: Buffer) => {
        const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
        return Buffer.concat([len, t, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/** JPEG (opaque pictures) through a temporary PNG and sips. */
export function writeJpeg(file: string, img: Img, tmp: string, quality = 85) {
    mkdirSync(tmp, { recursive: true });
    const png = `${tmp}${file.split('/').pop()}.png`;
    writePng(png, img);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), png, '--out', file], { stdio: 'ignore' });
    rmSync(png, { force: true });
}

/**
 * Animated PNG (APNG: plays in browsers, Finder and Preview; a plain viewer shows the first frame) of
 * same-sized frames, `delayMs` each, looping forever.
 */
export function writeApng(file: string, frames: Img[], delayMs: number) {
    const w = frames[0].w, h = frames[0].h;
    const chunk = (type: string, data: Buffer) => {
        const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
        return Buffer.concat([len, t, data, crc]);
    };
    const raw = (img: Img) => {
        const r = Buffer.alloc((w * 4 + 1) * h);
        for (let y = 0; y < h; y++) Buffer.from(img.px.buffer, img.px.byteOffset + y * w * 4, w * 4).copy(r, y * (w * 4 + 1) + 1);
        return deflateSync(r, { level: 9 });
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4);
    const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('acTL', actl)];
    let seq = 0;
    frames.forEach((f, i) => {
        const fc = Buffer.alloc(26);
        fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8); fc.writeUInt32BE(0, 12); fc.writeUInt32BE(0, 16);
        fc.writeUInt16BE(delayMs, 20); fc.writeUInt16BE(1000, 22); fc[24] = 0; fc[25] = 0;
        parts.push(chunk('fcTL', fc));
        const data = raw(f);
        if (i === 0) parts.push(chunk('IDAT', data));
        else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++, 0); parts.push(chunk('fdAT', Buffer.concat([s, data]))); }
    });
    parts.push(chunk('IEND', Buffer.alloc(0)));
    writeFileSync(file, Buffer.concat(parts));
}
