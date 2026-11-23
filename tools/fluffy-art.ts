// Fluffy theme art: the pictures in art/fluffy/ (as made) -> game-sized copies in src/assets/fluffy/
// (what the game bundles; src/scenes/fluffy.ts). Run after adding or changing a picture:
//   npm run art:fluffy
//
// - ball.png: cut square round the ball (its fur included), 512 px.
// - faces: face.png holds three faces (surprised top left, ouch top right, happy below) and
//   face-sleep.png one; each is cut out and put in the same 640 x 360 frame, centred on its face, at
//   one common scale (face-sleep is drawn bigger: it is scaled to the others' width). The game places
//   the frame over the ball (FACE_WIDTH, FACE_DROP in src/scenes/fluffy.ts).
// - face-surprised.png / face-ouch.png / face-happy.png in art/fluffy/ are used instead of face.png
//   when they are there. face-awake (the pair has bumped: awake, eyes open) and hand.png (the tutorial
//   hand) can come as one picture, awake-hand.png: the face on the left half, the hand on the right.
// - heart.png, fur.png: cut square round the drawing, 160 / 128 px (the game recolours both).
// - pattern-light.png / pattern-dark.png: made sparser, smaller and fainter, as JPEG. Every face (a patch
//   that is not the background colour) is shrunk to SHRINK of its size and moved to SPREAD times its
//   place, in a tile SPREAD times bigger (so the diagonal rows stay and the tile still repeats), and is
//   faded FADE of the way to the background. The game shows the tile SPREAD times bigger too
//   (patternWorld in src/scenes/fluffy.ts: keep the two in step).
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { Img, bbox, blank, crop, readImage, resize, writeJpeg, writePng } from './rgba';

const ROOT = `${process.cwd()}/`;
const SRC = `${ROOT}art/fluffy/`, OUT = `${ROOT}src/assets/fluffy/`, TMP = `${ROOT}node_modules/.cache/fluffy/`;
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(OUT + f);
const has = (n: string) => existsSync(`${SRC}${n}.png`);
const load = (n: string) => readImage(`${SRC}${n}.png`, TMP);
const log = (name: string, img: Img) => console.log(`src/assets/fluffy/${name} ${img.w}x${img.h}`);

/** Square cut centred on the drawing (with a margin), scaled to `size`. */
function squareOf(img: Img, size: number, margin = 0.02): Img {
    const b = bbox(img)!;
    const side = Math.round(Math.max(b.w, b.h) * (1 + 2 * margin));
    return resize(crop(img, Math.round(b.x + b.w / 2 - side / 2), Math.round(b.y + b.h / 2 - side / 2), side, side), size, size);
}

/**
 * Matte fur, unlit: the picture's own broad lighting is flattened to MATTE of its strength and the fine
 * fur detail made DETAIL times stronger. The game lights the ball itself, as a soft sphere with the
 * light from the top left (ballTexture in src/scenes/fluffy.ts; LIGHT_* in src/game/tuning.ts, live in
 * the dev panel).
 */
const MATTE = 0, DETAIL = 2;
function matte(img: Img): Img {
    const { w, h, px } = img, L = new Float32Array(w * h), A = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { A[i] = px[i * 4 + 3] / 255; L[i] = ((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765) * A[i]; }
    // Broad lighting: an alpha-weighted box blur (three passes, about 6% of the width).
    const blur = (src: Float32Array) => {
        let a = src.slice();
        const R = Math.round(w * 0.06), tmp = new Float32Array(w * h);
        for (let pass = 0; pass < 3; pass++) {
            for (let y = 0; y < h; y++) { let s = 0; for (let x = -R; x <= R; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * R + 1); s += a[y * w + Math.min(w - 1, x + R + 1)] - a[y * w + Math.max(0, x - R)]; } }
            for (let x = 0; x < w; x++) { let s = 0; for (let y = -R; y <= R; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * R + 1); s += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x]; } }
        }
        return a;
    };
    const bl = blur(L), ba = blur(A);
    let sum = 0, n = 0;
    for (let i = 0; i < w * h; i++) if (A[i] > 0.8) { sum += L[i] / A[i]; n++; }
    const mid = sum / n, out = blank(w, h);
    for (let i = 0; i < w * h; i++) {
        out.px[i * 4 + 3] = px[i * 4 + 3];
        if (!A[i]) continue;
        const broad = ba[i] > 0.01 ? bl[i] / ba[i] : mid, l = L[i] / A[i];
        const v = mid + (broad - mid) * MATTE + (l - broad) * DETAIL;
        out.px[i * 4] = out.px[i * 4 + 1] = out.px[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
    return out;
}

if (has('ball')) { const b = matte(squareOf(load('ball'), 512, 0)); writePng(`${OUT}ball.png`, b); log('ball.png', b); }
for (const [n, size] of [['heart', 160], ['fur', 128]] as const) if (has(n)) { const i = squareOf(load(n), size); writePng(`${OUT}${n}.png`, i); log(`${n}.png`, i); }

// Faces: each cut round its own drawing, all at one scale, in one frame size.
const FRAME = { w: 640, h: 360 };
const faces: { name: string; img: Img; box: { x: number; y: number; w: number; h: number } }[] = [];
if (has('face')) {
    const sheet = load('face'), H = sheet.h / 2, W = sheet.w / 2;
    const regions = { surprised: { x: 0, y: 0, w: W, h: H }, ouch: { x: W, y: 0, w: sheet.w - W, h: H }, happy: { x: 0, y: H, w: sheet.w, h: sheet.h - H } };
    for (const [name, r] of Object.entries(regions)) {
        if (has(`face-${name}`)) continue;
        const box = bbox(sheet, 24, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
        if (box) faces.push({ name, img: sheet, box });
    }
}
for (const name of ['sleep', 'surprised', 'ouch', 'happy', 'awake']) if (has(`face-${name}`)) { const img = load(`face-${name}`); faces.push({ name, img, box: bbox(img)! }); }
// awake.png: the awake face on its own (same as face-awake.png).
if (has('awake') && !has('face-awake')) { const img = load('awake'); faces.push({ name: 'awake', img, box: bbox(img)! }); }
// awake-hand.png: two pictures made at once, the awake face on the left half, the tutorial hand on the
// right half (face-awake.png / hand.png on their own are used instead when they are there).
let handImg: Img | null = has('hand') ? load('hand') : null;
if (has('awake-hand')) {
    const sheet = load('awake-hand'), W = Math.round(sheet.w / 2);
    const left = bbox(sheet, 24, { x: 0, y: 0, w: W, h: sheet.h }), right = bbox(sheet, 24, { x: W, y: 0, w: sheet.w - W, h: sheet.h });
    if (left && !has('face-awake')) faces.push({ name: 'awake', img: sheet, box: left });
    if (right && !handImg) handImg = crop(sheet, right.x, right.y, right.w, right.h);
}
if (handImg) {
    // The paw cut round its drawing (a small margin), 256 px tall; the game finds the fingertip itself.
    const b = bbox(handImg)!, m = Math.round(Math.max(b.w, b.h) * 0.03);
    const cut = crop(handImg, b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m), h = 256, w = Math.round((cut.w / cut.h) * h);
    const out = resize(cut, w, h);
    writePng(`${OUT}hand.png`, out);
    log('hand.png', out);
}
if (faces.length) {
    // The sheet's faces set the scale; a face from its own picture is brought to their average width.
    const fromSheet = (f: { name: string }) => ['surprised', 'ouch', 'happy'].includes(f.name) && !has(`face-${f.name}`);
    const sheetW = faces.filter(fromSheet).map((f) => f.box.w);
    const target = sheetW.length ? sheetW.reduce((a, b) => a + b, 0) / sheetW.length : Math.max(...faces.map((f) => f.box.w));
    const scale = Math.min(FRAME.w * 0.9 / target, 1);
    for (const f of faces) {
        const own = !sheetW.length || !fromSheet(f) ? target / f.box.w : 1;
        const k = own * scale;
        // Cut a frame-sized window (in the source's pixels) centred on the face, then scale it to the frame.
        const sw = Math.round(FRAME.w / k), sh = Math.round(FRAME.h / k);
        const cut = crop(f.img, Math.round(f.box.x + f.box.w / 2 - sw / 2), Math.round(f.box.y + f.box.h / 2 - sh / 2), sw, sh);
        const out = resize(cut, FRAME.w, FRAME.h);
        writePng(`${OUT}face-${f.name}.png`, out);
        log(`face-${f.name}.png`, out);
    }
}
const SPREAD = 2, SHRINK = 0.5, FADE = 0.45;

/** The pattern with its faces SPREAD times further apart and faded towards the background. */
function sparse(img: Img): Img {
    const { w, h, px } = img;
    // Background: the most common colour (in steps of 4).
    const count = new Map<number, number>();
    for (let i = 0; i < px.length; i += 16) { const q = ((px[i] >> 2) << 12) | ((px[i + 1] >> 2) << 6) | (px[i + 2] >> 2); count.set(q, (count.get(q) ?? 0) + 1); }
    const q = [...count].sort((a, b) => b[1] - a[1])[0][0];
    const bg = [((q >> 12) & 63) * 4 + 2, ((q >> 6) & 63) * 4 + 2, (q & 63) * 4 + 2];
    // Face pixels, grown by a few px so a face's eyes and outline make one patch.
    const R = 10, mask = new Uint8Array(w * h), grown = new Uint8Array(w * h), tmp = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = Math.abs(px[i * 4] - bg[0]) + Math.abs(px[i * 4 + 1] - bg[1]) + Math.abs(px[i * 4 + 2] - bg[2]) > 24 ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let d = -R; d <= R && !m; d++) m = mask[y * w + Math.min(w - 1, Math.max(0, x + d))]; tmp[y * w + x] = m; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let d = -R; d <= R && !m; d++) m = tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]; grown[y * w + x] = m; }
    // Patches (flood fill), each with its box.
    const seen = new Uint8Array(w * h), boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let s = 0; s < w * h; s++) {
        if (!grown[s] || seen[s]) continue;
        const b = { x0: w, y0: h, x1: 0, y1: 0 }, stack = [s];
        seen[s] = 1;
        while (stack.length) {
            const i = stack.pop()!, x = i % w, y = (i / w) | 0;
            b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && grown[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
        if ((b.x1 - b.x0) * (b.y1 - b.y0) > 400) boxes.push(b);
    }
    // New tile: background, then every patch at SPREAD times its centre (wrapping round the edges), faded.
    const W = Math.round(w * SPREAD), H = Math.round(h * SPREAD), out = blank(W, H);
    for (let i = 0; i < W * H; i++) { out.px.set(bg, i * 4); out.px[i * 4 + 3] = 255; }
    for (const b of boxes) {
        // The face alone (its patch, faded), shrunk, then laid over the background at its new place.
        const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, face = blank(bw, bh);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const i = (b.y0 + y) * w + b.x0 + x, d = (y * bw + x) * 4;
            for (let k = 0; k < 3; k++) face.px[d + k] = bg[k] + (px[i * 4 + k] - bg[k]) * (1 - FADE);
            face.px[d + 3] = grown[i] ? 255 : 0;
        }
        const sw = Math.max(1, Math.round(bw * SHRINK)), sh = Math.max(1, Math.round(bh * SHRINK)), small = resize(face, sw, sh);
        const cx = ((b.x0 + b.x1) / 2) * SPREAD, cy = ((b.y0 + b.y1) / 2) * SPREAD;
        const ox = Math.round(cx - sw / 2), oy = Math.round(cy - sh / 2);
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
            const s = (y * sw + x) * 4, a = small.px[s + 3] / 255;
            if (!a) continue;
            const d = ((((oy + y) % H) + H) % H * W + (((ox + x) % W) + W) % W) * 4;
            for (let k = 0; k < 3; k++) out.px[d + k] = out.px[d + k] * (1 - a) + small.px[s + k] * a;
        }
    }
    console.log(`  ${boxes.length} faces, background rgb(${bg.join(', ')})`);
    return out;
}

for (const t of ['light', 'dark']) if (has(`pattern-${t}`)) {
    const p = sparse(load(`pattern-${t}`));
    writeJpeg(`${OUT}pattern-${t}.jpg`, p, TMP, 88);
    log(`pattern-${t}.jpg`, p);
}
