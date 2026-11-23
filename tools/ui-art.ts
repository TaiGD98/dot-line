// Balls and UI pictures: art/ball/ and art/ui/ (as made) -> game-sized pieces in src/assets/ui/ (what the
// game bundles; src/scenes/uiart.ts). Run after adding or changing a picture:
//   npm run art:ui
//
// Every sheet is a grid; each piece is cut round its drawing inside its cell (docs/guide/ui-assets.md):
// - art/ball/balls.png, 3 cells: water-fill, water-shell, jelly (grey, recoloured in the game), 256 px.
// - art/ui/icons.png, 5 × 4 cells: the 20 white icons, 128 px.
// - art/ui/ui-kit-2.png (else ui-kit.png), 3 × 2 cells: panel, ribbon, round button, wide button, card, hand.
//   This sheet has a painted checkerboard instead of transparency: the light grey / white background is
//   flood-filled away from the edges of each cell (it stops at the coloured or dark edges of the drawings).
// - art/ui/ui-kit-3.png (palette colours), 4 × 2: panel, ribbon, round, wide, card, tab-on, tab-off, table.
// - art/ui/home-2.png, 3 × 2: tab bar, selected tab, name pill, path, cloud, SOON tag.
// - art/ui/home.png, 3 × 2 cells: level button, hard level button, locked level button, golden ring,
//   path segment, cloud.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { Img, bbox, crop, readImage, resize, writePng } from './rgba';

const ROOT = `${process.cwd()}/`;
const OUT = `${ROOT}src/assets/ui/`, TMP = `${ROOT}node_modules/.cache/ui/`;
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(OUT + f);

const log = (name: string, img: Img) => console.log(`src/assets/ui/${name}.png ${img.w}x${img.h}`);

/** Cut each cell's drawing (with a small margin) out of a cols × rows sheet. */
function cells(img: Img, cols: number, rows: number, spill = 0) {
    const out: Img[] = [];
    const cw = img.w / cols, ch = img.h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // `spill`: the cell reaches this far into its neighbours (a drawing that crosses its border).
        const x0 = Math.max(0, Math.round(c * cw - spill)), y0 = Math.max(0, Math.round(r * ch - spill));
        const region = { x: x0, y: y0, w: Math.min(img.w, Math.round((c + 1) * cw + spill)) - x0, h: Math.min(img.h, Math.round((r + 1) * ch + spill)) - y0 };
        const b = bbox(img, 24, region);
        if (!b) { out.push(crop(img, region.x, region.y, 1, 1)); continue; }
        const m = Math.round(Math.max(b.w, b.h) * 0.02);
        out.push(crop(img, b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m));
    }
    return out;
}

/**
 * The `n` biggest drawings of a sheet (connected solid areas), in reading order (rows top to bottom,
 * left to right in a row), each cut round its own outline: for sheets whose drawings do not sit neatly
 * inside the grid cells.
 */
function pieces(img: Img, n: number, rows: number): Img[] {
    const { w, h, px } = img, label = new Int32Array(w * h).fill(-1);
    const found: { size: number; x0: number; y0: number; x1: number; y1: number; id: number }[] = [];
    for (let s = 0; s < w * h; s++) {
        if (label[s] >= 0 || px[s * 4 + 3] <= 24) continue;
        const id = found.length, stack = [s], b = { size: 0, x0: w, y0: h, x1: 0, y1: 0, id };
        label[s] = id;
        while (stack.length) {
            const i = stack.pop()!, x = i % w, y = (i / w) | 0;
            b.size++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
                if (j >= 0 && label[j] < 0 && px[j * 4 + 3] > 24) { label[j] = id; stack.push(j); }
        }
        found.push(b);
    }
    const big = found.sort((a, b) => b.size - a.size).slice(0, n);
    // Reading order: split into `rows` bands by the centres' y, then left to right.
    big.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const per = Math.ceil(n / rows), ordered: typeof big = [];
    for (let r = 0; r < rows; r++) ordered.push(...big.slice(r * per, (r + 1) * per).sort((a, b) => a.x0 - b.x0));
    return ordered.map((b) => {
        // Only this drawing (other drawings reaching into its box are cleared), with a small margin.
        const m = 3, out = crop(img, b.x0 - m, b.y0 - m, b.x1 - b.x0 + 1 + 2 * m, b.y1 - b.y0 + 1 + 2 * m);
        for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
            const sx = b.x0 - m + x, sy = b.y0 - m + y;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
            const l = label[sy * w + sx];
            if (l >= 0 && l !== b.id) out.px[(y * out.w + x) * 4 + 3] = 0;
        }
        return out;
    });
}

/** Only the biggest drawing in the cut (bits of a neighbour reaching into the cell are dropped), cut close. */
function largest(img: Img): Img {
    const { w, h, px } = img, label = new Int32Array(w * h).fill(-1), size: number[] = [];
    for (let s = 0; s < w * h; s++) {
        if (label[s] >= 0 || px[s * 4 + 3] <= 24) continue;
        const id = size.length, stack = [s];
        let n = 0;
        label[s] = id;
        while (stack.length) {
            const i = stack.pop()!, x = i % w, y = (i / w) | 0;
            n++;
            for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
                if (j >= 0 && label[j] < 0 && px[j * 4 + 3] > 24) { label[j] = id; stack.push(j); }
        }
        size.push(n);
    }
    if (!size.length) return img;
    const big = size.indexOf(Math.max(...size));
    // Keep the faint edge pixels round the biggest drawing too (alpha <= 24 next to it).
    for (let i = 0; i < w * h; i++) if (label[i] >= 0 && label[i] !== big) px[i * 4 + 3] = 0;
    const b = bbox(img)!;
    return crop(img, b.x - 2, b.y - 2, b.w + 4, b.h + 4);
}

/**
 * Clear shell of the water ball: drawn as a light grey disc, it would hide the water. Brighter than the
 * shell's own grey becomes white light (the highlights, the bright rim), darker becomes a faint shadow
 * (the outline); the plain grey in between turns fully clear.
 */
function glass(img: Img): Img {
    const { w, h, px } = img, out = { w, h, px: new Uint8ClampedArray(px.length) };
    const Ls: number[] = [];
    for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 240) Ls.push((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765);
    Ls.sort((a, b) => a - b);
    const base = Ls[Math.floor(Ls.length / 2)] ?? 0.9;
    for (let i = 0; i < w * h; i++) {
        const a = px[i * 4 + 3] / 255;
        if (!a) continue;
        const L = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765;
        const light = Math.max(0, (L - base) / Math.max(0.02, 1 - base)), dark = Math.max(0, (base - L) / base);
        const v = light >= dark ? 255 : 90;
        out.px[i * 4] = out.px[i * 4 + 1] = out.px[i * 4 + 2] = v;
        out.px[i * 4 + 3] = Math.round(Math.min(1, light >= dark ? light * 1.3 : dark * 2.2) * a * 255);
    }
    return out;
}

/**
 * The water without its own broad light and shade (only the ripples stay, on an even grey): it rocks
 * to and fro in the game, so any light in it would swing round. The light is in the shell (lightShell).
 */
function flatten(img: Img): Img {
    const { w, h, px } = img, L = new Float32Array(w * h), A = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { A[i] = px[i * 4 + 3] / 255; L[i] = ((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765) * A[i]; }
    const R = Math.round(w * 0.12);
    const blur = (src: Float32Array) => {
        const a = src.slice(), tmp = new Float32Array(w * h);
        for (let pass = 0; pass < 3; pass++) {
            for (let y = 0; y < h; y++) { let t = 0; for (let x = -R; x <= R; x++) t += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = t / (2 * R + 1); t += a[y * w + Math.min(w - 1, x + R + 1)] - a[y * w + Math.max(0, x - R)]; } }
            for (let x = 0; x < w; x++) { let t = 0; for (let y = -R; y <= R; y++) t += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = t / (2 * R + 1); t += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x]; } }
        }
        return a;
    };
    const bl = blur(L), ba = blur(A);
    let sum = 0, n = 0;
    for (let i = 0; i < w * h; i++) if (A[i] > 0.8) { sum += L[i] / A[i]; n++; }
    const mid = sum / n, out = { w, h, px: new Uint8ClampedArray(px) };
    for (let i = 0; i < w * h; i++) {
        if (!A[i]) continue;
        const broad = ba[i] > 0.01 ? bl[i] / ba[i] : mid, v = Math.min(1, Math.max(0, mid + (L[i] / A[i] - broad)));
        out.px[i * 4] = out.px[i * 4 + 1] = out.px[i * 4 + 2] = Math.round(v * 255);
    }
    return out;
}

/** The shell with the ball's light under its highlights: lighter at the top, darker at the bottom (fixed: the shell does not rock). */
function lightShell(img: Img): Img {
    const { w, h, px } = img, cx = w / 2, cy = h / 2, R = w / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / R, rr = dx * dx + dy * dy;
        if (rr > 0.97) continue;
        const i = (y * w + x) * 4;
        // Light from the top (a touch to the left), shade at the bottom; strongest towards the edge.
        const t = -(dy * 0.9 + dx * 0.3), edge = 0.45 + 0.55 * rr;
        const g = t > 0 ? { v: 255, a: Math.min(0.3, t * 0.32) * edge } : { v: 0, a: Math.min(0.32, -t * 0.36) * edge };
        // The shell's own pixel goes over this light.
        const sa = px[i + 3] / 255, oa = sa + g.a * (1 - sa);
        if (!oa) continue;
        for (let k = 0; k < 3; k++) px[i + k] = Math.round((px[i + k] * sa + g.v * g.a * (1 - sa)) / oa);
        px[i + 3] = Math.round(oa * 255);
    }
    return img;
}

/** Scale so the longer side is `size` (keeping the shape). */
function fit(img: Img, size: number) {
    const k = size / Math.max(img.w, img.h);
    return resize(img, Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)));
}

/** Square cut centred on the drawing, scaled to `size`. */
function square(img: Img, size: number) {
    const b = bbox(img)!, side = Math.max(b.w, b.h);
    return resize(crop(img, Math.round(b.x + b.w / 2 - side / 2), Math.round(b.y + b.h / 2 - side / 2), side, side), size, size);
}

/** Painted checkerboard -> transparency: flood-fill light, colourless pixels from the edges of each cell. */
function unchecker(img: Img, cols: number, rows: number) {
    const { w, h, px } = img;
    const bgLike = (i: number) => {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        return Math.min(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 26;
    };
    const seen = new Uint8Array(w * h), stack: number[] = [];
    const cw = w / cols, ch = h / rows;
    // Seeds: every cell's border (the gaps between drawings).
    for (let r = 0; r <= rows; r++) { const y = Math.min(h - 1, Math.round(r * ch)); for (let x = 0; x < w; x++) stack.push(y * w + x); }
    for (let c = 0; c <= cols; c++) { const x = Math.min(w - 1, Math.round(c * cw)); for (let y = 0; y < h; y++) stack.push(y * w + x); }
    while (stack.length) {
        const i = stack.pop()!;
        if (seen[i] || !bgLike(i)) continue;
        seen[i] = 1;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < w - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - w);
        if (y < h - 1) stack.push(i + w);
    }
    for (let i = 0; i < w * h; i++) if (seen[i]) px[i * 4 + 3] = 0;
    // Soften the cut: a background-coloured pixel next to the cleared area gets half alpha.
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (seen[i] || !bgLike(i)) continue;
        if (seen[i - 1] || seen[i + 1] || seen[i - w] || seen[i + w]) px[i * 4 + 3] = 128;
    }
}

const has = (f: string) => existsSync(`${ROOT}art/${f}`);
const load = (f: string) => readImage(`${ROOT}art/${f}`, TMP);
const save = (name: string, img: Img) => { writePng(`${OUT}${name}.png`, img); log(name, img); };

if (has('ball/balls.png')) {
    const [fill, shell, jelly] = cells(load('ball/balls.png'), 3, 1);
    // The water and its shell must match: both cut to the same square (the shell's, which is the outer one).
    save('ball-jelly', square(jelly, 256));
    // art/ball/water.png (2 cells: water, shell), when there, replaces the water ball of this sheet.
    const [wf, ws] = has('ball/water.png') ? cells(load('ball/water.png'), 2, 1) : [fill, shell];
    save('ball-water-fill', flatten(square(wf, 256)));
    // The old sheet's shell had no top light, so one was added; water.png's shell has its own.
    save('ball-water-shell', has('ball/water.png') ? glass(square(ws, 256)) : lightShell(glass(square(ws, 256))));
}
if (has('ui/icons.png')) {
    const names = ['settings', 'pause', 'play', 'restart', 'close', 'sound', 'sound-off', 'music', 'music-off', 'lock', 'vibrate', 'vibrate-off', 'sun', 'moon', 'heart', 'home', 'shop', 'theme', 'hint', 'cut'];
    cells(load('ui/icons.png'), 5, 4).forEach((c, i) => save(`icon-${names[i]}`, square(c, 128)));
}
// The newest kit wins (ui-kit-2.png, then ui-kit.png). A sheet without real transparency (a painted
// checkerboard) is cleaned first; one with transparency is cut as it is.
// ui-kit-3.png (palette colours, 4 × 2): panel, ribbon, round, wide, card, tab-on, tab-off, table.
if (has('ui/ui-kit-3.png')) {
    const names = ['panel', 'ribbon', 'round', 'wide', 'card', 'tab-on', 'tab-off', 'table'];
    pieces(load('ui/ui-kit-3.png'), 8, 2).forEach((p, i) => save(names[i], names[i] === 'round' ? square(p, 192) : fit(p, names[i] === 'ribbon' ? 640 : 512)));
}
const kit = has('ui/ui-kit-3.png') ? undefined : ['ui/ui-kit-2.png', 'ui/ui-kit.png'].find(has);
if (has('ui/ui-kit-3.png') && ['ui/ui-kit-2.png', 'ui/ui-kit.png'].some(has)) {
    // The hand still comes from the older kit.
    const old = load(['ui/ui-kit-2.png', 'ui/ui-kit.png'].find(has)!);
    save('hand', fit(pieces(old, 6, 2)[5], 256));
}
if (kit) {
    const sheet = load(kit);
    let clear = 0;
    for (let i = 3; i < sheet.px.length; i += 4) if (sheet.px[i] < 10) clear++;
    if (clear < sheet.w * sheet.h * 0.05) unchecker(sheet, 3, 2);
    const [panel, ribbon, round, wide, card, hand] = pieces(sheet, 6, 2);
    save('card', fit(largest(card), 256));
    save('panel', fit(largest(panel), 512));
    save('ribbon', fit(largest(ribbon), 640));
    save('round', square(largest(round), 192));
    save('wide', fit(largest(wide), 512));
    save('hand', fit(largest(hand), 256));
}
// popup.png: the pop-up frame with a header band for the title (replaces the kit's panel).
const popupFile = ['ui/popup.png', 'ui/pop up.png'].find(has);
if (popupFile) {
    const pop = fit(largest(load(popupFile)), 640);
    save('popup', pop);
    // Where the header band ends, down the middle column (the first row that is no longer orange).
    let y = Math.round(pop.h * 0.03);
    const orange = (yy: number) => { const i = (yy * pop.w + (pop.w >> 1)) * 4; return pop.px[i] - pop.px[i + 2] > 90; };
    while (y < pop.h && !orange(y)) y++;
    while (y < pop.h && orange(y)) y++;
    console.log(`  popup header band ends at ${y} of ${pop.h} px (${(y / pop.h).toFixed(3)})`);
}
// home-2.png (3 × 2): tab bar, selected tab, name pill, path (seamless), cloud, SOON tag.
if (has('ui/home-2.png')) {
    const names = ['tabbar', 'tab-selected', 'pill', 'path', 'cloud', 'tag'];
    pieces(load('ui/home-2.png'), 6, 2).forEach((p, i) => save(names[i], fit(p, names[i] === 'tabbar' ? 780 : 256)));
}
if (has('ui/home.png') && !has('ui/home-2.png')) {
    const [node, hard, locked, ring, path, cloud] = pieces(load('ui/home.png'), 6, 2);
    save('node', fit(node, 256));
    save('node-hard', fit(hard, 256));
    save('node-locked', fit(locked, 256));
    save('ring', fit(ring, 320));
    save('path', fit(path, 160));
    save('cloud', fit(cloud, 256));
}
