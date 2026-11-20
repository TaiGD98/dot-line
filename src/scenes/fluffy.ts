import * as Phaser from 'phaser';
import { BOARDS, colour } from '../core/palette';
import { tuning } from '../game/tuning';

/**
 * Fluffy theme (src/game/mode.ts): every dot is a fluffy ball with a face; the board is a pattern of
 * fluffy faces scrolling diagonally. The pictures come from src/assets/fluffy/<name>.png
 * (docs/guide/fluffy-assets.md); every missing one is drawn here as a stand-in, so the art can be
 * added one file at a time.
 *
 *   ball            the body, neutral grey, recoloured per palette colour (ballTexture)
 *   face-<face>     sleep / surprised / ouch / happy, drawn over the body, same frame as the ball
 *   fur, heart      particles: a tuft of fur on a bump, small hearts when a pair meets
 *   pattern-light / pattern-dark   seamless background tiles for the two themes
 */

/** sleep (idle), surprised (running), ouch (bumped), happy (meeting its partner), awake (idle, its pair has bumped before). */
export const FACES = ['sleep', 'surprised', 'ouch', 'happy', 'awake'] as const;
export type Face = (typeof FACES)[number];
/** Faces drawn in code while their picture is missing. awake and the tutorial hand have none: until
 * face-awake.png / hand.png are there, a bumped pair keeps its stripes and the tutorial keeps 👆. */
const STAND_IN_FACES: Face[] = ['sleep', 'surprised', 'ouch', 'happy'];
/** Is the picture there (src/assets/fluffy)? */
export const hasArt = (name: string) => !!art(name);
/** The round body's diameter in the ball frame, as a share of the frame width (stand-in / real picture). */
const STAND_IN_FILL = 0.8;
export const ballFill = () => (art('ball') ? 0.9 : STAND_IN_FILL);
/**
 * Where the face frame sits on the ball: its width as a share of the ball's diameter, and how far its
 * centre is below the ball's centre (share of the radius). The real faces come in a 640 x 360 frame
 * with the face about 90% of its width (tools/fluffy-art.ts); the stand-ins share the ball's frame.
 */
export const faceFrame = (f: Face = 'sleep') => (art(`face-${f}`) ? { span: 0.68 / 0.9, drop: 0.1 } : { span: 1 / STAND_IN_FILL, drop: 0 });
/** One background tile covers this many world px (the camera zooms it with the board). */
export const PATTERN_WORLD = 512;
/** The real pattern tile is SPREAD (2) times its picture (tools/fluffy-art.ts), so it covers that much more. */
export const patternWorld = () => (art('pattern-light') ? PATTERN_WORLD * 2 : PATTERN_WORLD);

const ART = import.meta.glob('../assets/fluffy/*.{png,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (name: string) => Object.entries(ART).find(([k]) => /\/([^/]+)\.\w+$/.exec(k)?.[1] === name)?.[1];
const NAMES = ['ball', ...FACES.map((f) => `face-${f}`), 'fur', 'heart', 'hand', 'pattern-light', 'pattern-dark'];
export const key = (name: string) => `fluffy-${name}`;

export function preloadFluffy(scene: Phaser.Scene) {
    for (const n of NAMES) { const url = art(n); if (url) scene.load.image(key(n), url); }
}

/** Stand-ins for the pictures that are not there yet. */
export function makeFluffy(scene: Phaser.Scene) {
    const T = (n: string, w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
        if (scene.textures.exists(key(n))) return;
        const t = scene.textures.createCanvas(key(n), w, h)!;
        paint(t.getContext(), w, h);
        t.refresh();
    };
    T('ball', 256, 256, drawBall);
    for (const f of STAND_IN_FACES) T(`face-${f}`, 256, 256, (c, w) => drawFace(c, w, f));
    T('fur', 64, 64, drawFur);
    T('heart', 64, 64, drawHeart);
    T('sparkle', 48, 48, drawSparkle);
    makeMinis(scene);
    T('pattern-light', 1024, 1024, (c, w) => drawPattern(c, w, BOARDS.light.bg, '#E6DFD0', '#D3C9B5'));
    T('pattern-dark', 1024, 1024, (c, w) => drawPattern(c, w, BOARDS.dark.bg, '#272C42', '#343B57'));
}

/**
 * The body in one palette colour, made on first use, lit as a soft sphere: the picture is unlit fur
 * (tools/fluffy-art.ts); the light (LIGHT_* in src/game/tuning.ts, live in the dev panel) shades it,
 * brighter towards the light, darker away from it, with a soft sheen and no glossy spot. Then the grey's
 * middle becomes the colour, darker greys shade it, lighter ones lighten it. A light change makes new
 * textures (the version is in the key) and drops the old ones.
 */
export function ballTexture(scene: Phaser.Scene, name: string): string {
    const k = key(`ball-${name}-${tuning.lightVersion}`);
    if (scene.textures.exists(k)) return k;
    for (let v = tuning.lightVersion - 1; v >= 0 && v >= tuning.lightVersion - 50; v--) { const old = key(`ball-${name}-${v}`); if (scene.textures.exists(old)) { scene.textures.remove(old); break; } }
    const src = scene.textures.get(key('ball')).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const t = scene.textures.createCanvas(k, src.width, src.height)!;
    const c = t.getContext();
    c.drawImage(src, 0, 0);
    const d = c.getImageData(0, 0, src.width, src.height), px = d.data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { sum += (px[i] + px[i + 1] + px[i + 2]) / 765; n++; }
    const mid = n ? sum / n : 0.55;
    const hex = colour(name)?.base ?? '#9aa0b4';
    const col = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    // The sphere: centre and radius from the solid part; the light's direction from angle and height.
    const W = src.width, H = src.height;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { const x = (i / 4) % W, y = (i / 4 / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2 || W / 2;
    const a = (tuning.lightAngle * Math.PI) / 180, hz = Math.min(1, Math.max(0, tuning.lightHeight)), flat = Math.sqrt(1 - hz * hz);
    const lx = Math.cos(a) * flat, ly = Math.sin(a) * flat, lz = hz;
    for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const grey = (px[i] + px[i + 1] + px[i + 2]) / 765;
        let nx = ((i / 4) % W - cx) / R, ny = (((i / 4 / W) | 0) - cy) / R;
        const rr = nx * nx + ny * ny;
        if (rr > 1) { const s = 1 / Math.sqrt(rr); nx *= s; ny *= s; }
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lit = Math.max(0, nx * lx + ny * ly + nz * lz), shade = tuning.lightAmbient + tuning.lightDiffuse * lit;
        const L = Math.min(1, Math.max(0, mid * shade + tuning.lightSheen * lit ** 4 + (grey - mid) * (0.6 + 0.4 * shade)));
        for (let q = 0; q < 3; q++) {
            const v = L < mid ? col[q] * (0.3 + 0.7 * (L / mid)) : col[q] + (1 - col[q]) * ((L - mid) / (1 - mid)) ** 1.4 * 0.55;
            px[i + q] = Math.round(Math.min(1, v) * 255);
        }
    }
    c.putImageData(d, 0, 0);
    t.refresh();
    return k;
}

/**
 * The heart in one palette colour, made on first use: its brightness (max channel) shades the colour,
 * its unsaturated parts (the highlight) stay white-ish, so a red heart becomes a heart of that colour.
 */
export function heartTexture(scene: Phaser.Scene, name: string): string {
    const k = key(`heart-${name}`);
    if (scene.textures.exists(k)) return k;
    const src = scene.textures.get(key('heart')).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const t = scene.textures.createCanvas(k, src.width, src.height)!;
    const c = t.getContext();
    c.drawImage(src, 0, 0);
    const d = c.getImageData(0, 0, src.width, src.height), px = d.data;
    const hex = colour(name)?.base ?? '#ff5a7a';
    const col = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const mx = Math.max(px[i], px[i + 1], px[i + 2]) / 255, mn = Math.min(px[i], px[i + 1], px[i + 2]) / 255;
        const white = Math.max(0, (1 - (mx ? (mx - mn) / mx : 0)) - 0.25) / 0.75;
        for (let q = 0; q < 3; q++) {
            const v = col[q] * Math.min(1, mx * 1.08);
            px[i + q] = Math.round((v + (1 - v) * white * mx) * 255);
        }
    }
    c.putImageData(d, 0, 0);
    t.refresh();
    return k;
}

/** Width in px of a loaded picture (particle scales are set in screen terms). */
export const widthOf = (scene: Phaser.Scene, name: string, frame = false) =>
    frame ? scene.textures.get(key(name)).get(FACES[0]).width : scene.textures.get(key(name)).getSourceImage().width;

/** The faces the tiny balls can wear: every face that has a picture or a stand-in. */
export const MINI_FACES = () => FACES.filter((f) => STAND_IN_FACES.includes(f) || art(`face-${f}`));

/** Tiny whole balls (body + face, one frame per face, named after it): particles for a tap on empty board. */
function makeMinis(scene: Phaser.Scene) {
    const S = 96, k = key('minis');
    if (scene.textures.exists(k)) return;
    const faces = MINI_FACES();
    const t = scene.textures.createCanvas(k, S * faces.length, S)!, c = t.getContext();
    const body = scene.textures.get(key('ball')).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const fill = ballFill(), d = S * 0.9; // body diameter in the frame
    faces.forEach((f, i) => {
        const bw = d / fill;
        c.drawImage(body, i * S + (S - bw) / 2, (S - bw) / 2, bw, bw);
        const face = scene.textures.get(key(`face-${f}`)).getSourceImage() as CanvasImageSource & { width: number; height: number };
        const ff = faceFrame(f), fw = d * ff.span, fh = (fw * face.height) / face.width;
        c.drawImage(face, i * S + (S - fw) / 2, S / 2 + (d / 2) * ff.drop - fh / 2, fw, fh);
        t.add(f, 0, i * S, 0, S, S);
    });
    t.refresh();
}

/** A four-point twinkle star with a soft glow, white (tinted per particle); always drawn here. */
function drawSparkle(c: CanvasRenderingContext2D, w: number) {
    const m = w / 2;
    const glow = c.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, 'rgba(255,255,255,0.9)');
    glow.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, w);
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? m * 0.16 : m * 0.95;
        c[i ? 'lineTo' : 'moveTo'](m + Math.cos(a) * rr, m + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
}

// ---------- stand-in drawings ----------

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** A grey pom-pom: soft shaded core, short tufts all round, fine fur strokes, a highlight top left. */
function drawBall(c: CanvasRenderingContext2D, W: number) {
    seed = 3;
    const cx = W / 2, cy = W / 2, R = (W * STAND_IN_FILL) / 2;
    // Tufts round the edge (behind the core).
    for (let i = 0; i < 140; i++) {
        const a = rnd() * Math.PI * 2, l = R * (0.08 + rnd() * 0.12);
        const g = 150 + Math.round(rnd() * 60);
        c.strokeStyle = `rgb(${g},${g},${g})`;
        c.lineWidth = W * (0.012 + rnd() * 0.012);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85);
        c.quadraticCurveTo(cx + Math.cos(a + 0.06) * (R + l * 0.6), cy + Math.sin(a + 0.06) * (R + l * 0.6), cx + Math.cos(a + 0.1) * (R + l), cy + Math.sin(a + 0.1) * (R + l));
        c.stroke();
    }
    // Core, lit from the top left.
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
    g.addColorStop(0, '#e9e9e9');
    g.addColorStop(0.55, '#b4b4b4');
    g.addColorStop(1, '#7d7d7d');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    // Fur texture: short strokes, a little lighter or darker than where they sit.
    for (let i = 0; i < 900; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.98;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, dir = a + (rnd() - 0.5) * 1.2;
        const lit = 1 - ((x - (cx - R)) + (y - (cy - R))) / (4 * R);
        const v = Math.round(110 + 120 * lit + (rnd() - 0.5) * 50);
        c.strokeStyle = `rgba(${v},${v},${v},0.55)`;
        c.lineWidth = W * 0.008;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(dir) * W * 0.03, y + Math.sin(dir) * W * 0.03);
        c.stroke();
    }
    const h = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 0, cx - R * 0.4, cy - R * 0.45, R * 0.55);
    h.addColorStop(0, 'rgba(255,255,255,0.45)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h;
    c.fillRect(0, 0, W, W);
}

/** A face only (eyes, mouth, blush), placed for the ball frame: centred, a little above the middle. */
function drawFace(c: CanvasRenderingContext2D, W: number, f: Face) {
    const ink = '#2a1a1c', ex = W * 0.13, ey = W * 0.43, cx = W / 2, my = W * 0.56;
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.lineWidth = W * 0.035;
    // Blush.
    c.fillStyle = `rgba(255,120,150,${f === 'happy' || f === 'sleep' ? 0.55 : 0.4})`;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * W * 0.21, W * 0.53, W * 0.06, W * 0.035, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = ink;
    for (const s of [-1, 1]) {
        const x = cx + s * ex;
        c.beginPath();
        if (f === 'sleep') {
            c.arc(x, ey - W * 0.01, W * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); // closed eye: a smile-shaped curve
            c.stroke();
        } else if (f === 'surprised') {
            c.arc(x, ey, W * 0.065, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#ffffff';
            c.beginPath(); c.arc(x - W * 0.02, ey - W * 0.025, W * 0.022, 0, Math.PI * 2); c.fill();
            c.fillStyle = ink;
        } else if (f === 'ouch') {
            const d = W * 0.045;
            // Left eye ">" , right eye "<".
            c.moveTo(x - s * d, ey - d); c.lineTo(x + s * d, ey); c.lineTo(x - s * d, ey + d);
            c.stroke();
        } else {
            c.arc(x, ey + W * 0.02, W * 0.05, 1.15 * Math.PI, 1.85 * Math.PI); // "^"
            c.stroke();
        }
    }
    c.beginPath();
    if (f === 'sleep') { c.arc(cx, my - W * 0.02, W * 0.03, 0.2 * Math.PI, 0.8 * Math.PI); c.lineWidth = W * 0.025; c.stroke(); }
    else if (f === 'surprised') { c.lineWidth = W * 0.025; c.ellipse(cx, my + W * 0.005, W * 0.025, W * 0.032, 0, 0, Math.PI * 2); c.stroke(); }
    else if (f === 'ouch') {
        c.lineWidth = W * 0.025;
        c.moveTo(cx - W * 0.05, my);
        for (let k = 1; k <= 4; k++) c.lineTo(cx - W * 0.05 + k * W * 0.025, my + (k % 2 ? -1 : 1) * W * 0.012);
        c.stroke();
    } else {
        c.moveTo(cx - W * 0.055, my - W * 0.015);
        c.quadraticCurveTo(cx, my + W * 0.07, cx + W * 0.055, my - W * 0.015);
        c.closePath();
        c.fill();
        c.fillStyle = '#ff7a93';
        c.beginPath(); c.ellipse(cx, my + W * 0.025, W * 0.025, W * 0.014, 0, 0, Math.PI * 2); c.fill();
    }
}

/** Where the fingertip is on the hand picture (its topmost solid pixel), as an origin (0..1). */
export function handTip(scene: Phaser.Scene): { x: number; y: number } {
    const src = scene.textures.get(key('hand')).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const c = cv.getContext('2d')!;
    c.drawImage(src, 0, 0);
    const px = c.getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) {
        let x0 = -1, x1 = -1;
        for (let x = 0; x < cv.width; x++) if (px[(y * cv.width + x) * 4 + 3] > 128) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 >= 0) return { x: (x0 + x1) / 2 / cv.width, y: y / cv.height };
    }
    return { x: 0.5, y: 0 };
}

/** A white tuft of fur (tinted in code). */
function drawFur(c: CanvasRenderingContext2D, W: number) {
    seed = 9;
    c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
        c.strokeStyle = `rgba(255,255,255,${0.6 + rnd() * 0.4})`;
        c.lineWidth = W * (0.05 + rnd() * 0.04);
        c.beginPath();
        c.moveTo(W / 2, W * 0.75);
        c.quadraticCurveTo(W / 2 + Math.cos(a) * W * 0.2 + (rnd() - 0.5) * W * 0.2, W * 0.75 + Math.sin(a) * W * 0.2, W / 2 + Math.cos(a) * W * 0.42, W * 0.75 + Math.sin(a) * W * 0.55);
        c.stroke();
    }
}

/** A small puffy pink heart. */
function drawHeart(c: CanvasRenderingContext2D, W: number) {
    const path = () => {
        c.beginPath();
        c.moveTo(W / 2, W * 0.85);
        c.bezierCurveTo(W * 0.05, W * 0.55, W * 0.1, W * 0.12, W / 2, W * 0.3);
        c.bezierCurveTo(W * 0.9, W * 0.12, W * 0.95, W * 0.55, W / 2, W * 0.85);
        c.closePath();
    };
    const g = c.createLinearGradient(0, 0, W, W);
    g.addColorStop(0, '#ff8fb0');
    g.addColorStop(1, '#ea3b6b');
    c.fillStyle = g;
    path();
    c.fill();
    c.strokeStyle = '#c92557';
    c.lineWidth = W * 0.04;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.ellipse(W * 0.33, W * 0.36, W * 0.08, W * 0.05, -0.6, 0, Math.PI * 2); c.fill();
}

const flatFaces = new Map<string, HTMLCanvasElement>();
/** A face drawn in one flat colour (for the pattern), cached. */
function flatFace(f: Face, ink: string): HTMLCanvasElement {
    const k = `${f}|${ink}`;
    let t = flatFaces.get(k);
    if (!t) {
        t = document.createElement('canvas');
        t.width = t.height = 256;
        const c = t.getContext('2d')!;
        drawFace(c, 256, f);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = ink;
        c.fillRect(0, 0, 256, 256);
        flatFaces.set(k, t);
    }
    return t;
}

/**
 * Seamless tile: 16 flat fluffy faces with the four expressions, in diagonal rows, low contrast on the
 * board colour. Every face is also drawn across the edges it overlaps, so the tile repeats without seams.
 */
function drawPattern(c: CanvasRenderingContext2D, W: number, bg: string, shape: string, ink: string) {
    seed = 21;
    c.fillStyle = bg;
    c.fillRect(0, 0, W, W);
    const n = 4, step = W / n, r = step * 0.22;
    for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++) {
            const x = (col * step + row * (step / 2)) % W + step / 4, y = row * step + step / 2;
            const face = FACES[(row + col) % 4], turn = (rnd() - 0.5) * 0.6;
            for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) {
                const px = x + dx, py = y + dy;
                if (px < -r * 1.4 || px > W + r * 1.4 || py < -r * 1.4 || py > W + r * 1.4) continue;
                c.save();
                c.translate(px, py);
                c.rotate(turn);
                // Body: a soft round blob with a scalloped (furry) edge.
                c.fillStyle = shape;
                c.beginPath();
                for (let k = 0; k <= 24; k++) {
                    const a = (k / 24) * Math.PI * 2, rr = r * (1 + 0.06 * Math.sin(k * 3));
                    if (k) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                }
                c.fill();
                // The face, flat, in the darker ink (same frame as the ball: body radius = 0.4 x frame).
                const k = r / (128 * STAND_IN_FILL);
                c.drawImage(flatFace(face, ink), -128 * k, -128 * k, 256 * k, 256 * k);
                c.restore();
            }
        }
}
