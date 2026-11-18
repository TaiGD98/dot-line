// Raster helpers for the silhouette levels: the black area of a silhouette as a mask,
// distance fields and iso-contours. Everything here works in mask pixels; shape.ts converts to world px.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import type { Pt } from '../../src/core/path';

export interface Mask {
    n: number;
    /** 1 = black (part of the silhouette). */
    data: Uint8Array;
}

/** Mask resolution: pixels per side for the 400 x 400 art canvas. */
export const MASK_RES = 1600;

/**
 * Rasterises every NNN_name.svg of `svgDir` with headless Chrome (exactly what a browser shows:
 * fills, strokes, masks, transforms) and caches run-length masks in `cacheDir`.
 * Only files that are missing or older than their SVG are redone.
 */
export function buildMasks(svgDir: string, cacheDir: string, res = MASK_RES): void {
    mkdirSync(cacheDir, { recursive: true });
    const files = readdirSync(svgDir).filter((f) => /^\d{3}_.+\.svg$/.test(f)).sort();
    const stale = files.filter((f) => {
        const out = `${cacheDir}/${f.replace('.svg', '.json')}`;
        return !existsSync(out) || statSync(out).mtimeMs < statSync(`${svgDir}/${f}`).mtimeMs;
    });
    if (!stale.length) return;
    const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}. Set CHROME=<path to a Chrome/Chromium binary> to rasterise the silhouettes.`);
    const BATCH = 10;
    for (let b = 0; b < stale.length; b += BATCH) {
        const part = stale.slice(b, b + BATCH);
        const imgs = part.map((f) => 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(`${svgDir}/${f}`, 'utf8').replace(/width="400" height="400"/, `width="${res}" height="${res}"`)).toString('base64'));
        const html = `<!doctype html><body><pre id="out">PENDING</pre><script>
const RES=${res}, srcs=${JSON.stringify(imgs)};
(async()=>{
  const all=[];
  for(const s of srcs){
    const im=new Image(); im.src=s; await im.decode();
    const c=document.createElement('canvas'); c.width=c.height=RES; const g=c.getContext('2d',{willReadFrequently:true});
    g.fillStyle='#fff'; g.fillRect(0,0,RES,RES); g.drawImage(im,0,0,RES,RES);
    const d=g.getImageData(0,0,RES,RES).data; const rows=[];
    for(let y=0;y<RES;y++){ const r=[]; let x=0; while(x<RES){ while(x<RES && d[(y*RES+x)*4]>127) x++; if(x>=RES) break; const x0=x; while(x<RES && d[(y*RES+x)*4]<=127) x++; r.push(x0,x); } rows.push(r); }
    all.push(rows);
  }
  document.getElementById('out').textContent='DONE'+JSON.stringify(all);
})();
</script>`;
        const page = `${tmpdir()}/dot-line-mask-${process.pid}.html`;
        writeFileSync(page, html);
        const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', `--user-data-dir=${tmpdir()}/dot-line-mask-chrome`, '--virtual-time-budget=60000', '--dump-dom', `file://${page}`], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const m = dom.match(/DONE(\[.*\])<\/pre>/s);
        if (!m) throw new Error('Chrome returned no mask data');
        const all = JSON.parse(m[1]) as number[][][];
        part.forEach((f, i) => writeFileSync(`${cacheDir}/${f.replace('.svg', '.json')}`, JSON.stringify({ res, rows: all[i] })));
    }
}

export function loadMask(file: string): Mask {
    const { res, rows } = JSON.parse(readFileSync(file, 'utf8')) as { res: number; rows: number[][] };
    const data = new Uint8Array(res * res);
    rows.forEach((r, y) => { for (let i = 0; i < r.length; i += 2) data.fill(1, y * res + r[i], y * res + r[i + 1]); });
    return { n: res, data };
}

/** Half-resolution copy (a pixel is black when at least 2 of its 4 source pixels are). */
export function halve(m: Mask): Mask {
    const n = m.n >> 1, data = new Uint8Array(n * n);
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
            const i = 2 * y * m.n + 2 * x;
            data[y * n + x] = m.data[i] + m.data[i + 1] + m.data[i + m.n] + m.data[i + m.n + 1] >= 2 ? 1 : 0;
        }
    return { n, data };
}

const INF = 1e12;

/** Exact Euclidean distance (pixels) from every pixel to the nearest pixel where `src` is 0. */
export function edt(src: Uint8Array, n: number): Float32Array {
    const out = new Float32Array(n * n);
    const g = new Float64Array(n * n);
    const f = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), t = new Float64Array(n);
    const pass = (len: number) => {
        let k = 0;
        v[0] = 0; z[0] = -INF; z[1] = INF;
        for (let q = 1; q < len; q++) {
            let p = v[k];
            let s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
            while (s <= z[k]) {
                k--;
                p = v[k];
                s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
            }
            k++; v[k] = q; z[k] = s; z[k + 1] = INF;
        }
        k = 0;
        for (let q = 0; q < len; q++) {
            while (z[k + 1] < q) k++;
            const p = v[k];
            t[q] = (q - p) * (q - p) + f[p];
        }
    };
    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) f[y] = src[y * n + x] ? INF : 0;
        pass(n);
        for (let y = 0; y < n; y++) g[y * n + x] = t[y];
    }
    for (let y = 0; y < n; y++) {
        const o = y * n;
        for (let x = 0; x < n; x++) f[x] = g[o + x];
        pass(n);
        for (let x = 0; x < n; x++) out[o + x] = Math.sqrt(t[x]);
    }
    return out;
}

/**
 * Signed distance to the mask's edge in pixels: positive inside the black, negative outside.
 * The edge is taken half a pixel beyond the last black pixel centre.
 */
export function signedDistance(m: Mask): Float32Array {
    const { n, data } = m;
    const inside = edt(data, n);
    const inv = new Uint8Array(n * n);
    for (let i = 0; i < inv.length; i++) inv[i] = data[i] ? 0 : 1;
    const outside = edt(inv, n);
    const sd = new Float32Array(n * n);
    for (let i = 0; i < sd.length; i++) sd[i] = data[i] ? inside[i] - 0.5 : 0.5 - outside[i];
    return sd;
}

export interface Component { id: number; area: number; x0: number; y0: number; x1: number; y1: number; border: boolean }

/** 4-connected components of the pixels equal to `val`. labels: 0 = other pixels. */
export function components(data: Uint8Array, n: number, val = 1): { labels: Int32Array; comps: Component[] } {
    const labels = new Int32Array(n * n), comps: Component[] = [];
    const stack: number[] = [];
    for (let i = 0; i < n * n; i++) {
        if (data[i] !== val || labels[i]) continue;
        const c: Component = { id: comps.length + 1, area: 0, x0: n, y0: n, x1: 0, y1: 0, border: false };
        labels[i] = c.id; stack.push(i);
        while (stack.length) {
            const j = stack.pop()!;
            const x = j % n, y = (j / n) | 0;
            c.area++;
            if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
            if (x === 0 || y === 0 || x === n - 1 || y === n - 1) c.border = true;
            if (x > 0 && data[j - 1] === val && !labels[j - 1]) { labels[j - 1] = c.id; stack.push(j - 1); }
            if (x < n - 1 && data[j + 1] === val && !labels[j + 1]) { labels[j + 1] = c.id; stack.push(j + 1); }
            if (y > 0 && data[j - n] === val && !labels[j - n]) { labels[j - n] = c.id; stack.push(j - n); }
            if (y < n - 1 && data[j + n] === val && !labels[j + n]) { labels[j + n] = c.id; stack.push(j + n); }
        }
        comps.push(c);
    }
    return { labels, comps };
}

/** Bilinear sample of a field at pixel coordinates (pixel centres at integers). */
export function sample(f: Float32Array, n: number, x: number, y: number): number {
    if (x < 0) x = 0; else if (x > n - 1) x = n - 1;
    if (y < 0) y = 0; else if (y > n - 1) y = n - 1;
    const x0 = Math.min(n - 2, Math.floor(x)), y0 = Math.min(n - 2, Math.floor(y));
    const fx = x - x0, fy = y - y0, i = y0 * n + x0;
    return (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + n] * (1 - fx) + f[i + n + 1] * fx) * fy;
}

// Marching squares. Corner bits: 1 = (x,y), 2 = (x+1,y), 4 = (x+1,y+1), 8 = (x,y+1).
// Cell edges: 0 = top, 1 = right, 2 = bottom, 3 = left. Segments are directed with the inside on the left
// (image coordinates), so every crossing has exactly one outgoing segment and loops chain up on their own.
const SEG: number[][] = (() => {
    const mid = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
    const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
    // Undirected segments per case and, for each, the corner whose side decides the direction:
    // two adjacent edges cut off the corner between them; opposite edges use the top-left corner.
    const und: number[][][] = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];
    const cutOff = (a: number, b: number) => ((a + 1) % 4 === b ? b : (b + 1) % 4 === a ? a : 0);
    return und.map((segs, c) => segs.flatMap(([a, b]) => {
        const k = cutOff(a, b);
        const ax = mid[a][0], ay = mid[a][1], bx = mid[b][0], by = mid[b][1];
        const cr = (bx - ax) * (corner[k][1] - ay) - (by - ay) * (corner[k][0] - ax);
        const inside = ((c >> k) & 1) === 1;
        // keep a->b when the inside lies where cross < 0
        return (cr < 0) === inside ? [a, b] : [b, a];
    }));
})();

/** Closed iso-contours of `f` at `level` (pixel coordinates), inside = f > level. */
export function isoLoops(f: Float32Array, n: number, level: number): Pt[][] {
    // edge id: horizontal edge from (x,y) to (x+1,y) = 2*(y*n+x); vertical from (x,y) to (x,y+1) = 2*(y*n+x)+1
    const next = new Map<number, number>();
    const edgeId = (x: number, y: number, e: number) => (e === 0 ? 2 * (y * n + x) : e === 1 ? 2 * (y * n + x + 1) + 1 : e === 2 ? 2 * ((y + 1) * n + x) : 2 * (y * n + x) + 1);
    for (let y = 0; y < n - 1; y++) {
        for (let x = 0; x < n - 1; x++) {
            const i = y * n + x;
            const a = f[i] > level ? 1 : 0, b = f[i + 1] > level ? 2 : 0, c = f[i + n + 1] > level ? 4 : 0, d = f[i + n] > level ? 8 : 0;
            let cs = a | b | c | d;
            if (cs === 0 || cs === 15) continue;
            let segs = SEG[cs];
            if (cs === 5 || cs === 10) {
                const centre = (f[i] + f[i + 1] + f[i + n] + f[i + n + 1]) / 4 > level;
                // joined through the centre: use the segments of the complementary case, reversed
                if (centre) { const o = SEG[cs === 5 ? 10 : 5]; segs = [o[1], o[0], o[3], o[2]]; }
            }
            for (let k = 0; k < segs.length; k += 2) next.set(edgeId(x, y, segs[k]), edgeId(x, y, segs[k + 1]));
        }
    }
    const point = (id: number): Pt => {
        const cell = id >> 1, x = cell % n, y = (cell / n) | 0;
        if (id & 1) { const v0 = f[cell], v1 = f[cell + n]; return { x, y: y + (level - v0) / (v1 - v0) }; }
        const v0 = f[cell], v1 = f[cell + 1];
        return { x: x + (level - v0) / (v1 - v0), y };
    };
    const loops: Pt[][] = [];
    const seen = new Set<number>();
    for (const start of next.keys()) {
        if (seen.has(start)) continue;
        const loop: Pt[] = [];
        let cur = start, ok = false;
        for (let guard = 0; guard < 4 * n * n; guard++) {
            seen.add(cur);
            loop.push(point(cur));
            const nx = next.get(cur);
            if (nx === undefined) break;
            if (nx === start) { ok = true; break; }
            if (seen.has(nx)) break;
            cur = nx;
        }
        if (ok && loop.length > 3) loops.push(loop);
    }
    return loops;
}
