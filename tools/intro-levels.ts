// Builds the original intro levels (levels/<id>.json + the "Intro" collection) from simple vector drawings, using the
// same generator as the editor. Run: npm run levels:intro
// Drawings are made of strokes in a 0..400 box; a stroke that ends exactly on another stroke
// becomes a T-junction (its dot sits on that line and blocks it).
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { generate } from '../src/core/generator';
import { Level, Pair, dataChecks, newLevel } from '../src/core/level';
import { fitPath, Pt } from '../src/core/path';
import { solve } from '../src/core/solver';
import type { Stroke } from '../src/core/trace';

// Same layout as the level editor's folder storage (choose the project folder in the editor).
const ROOT = `${process.cwd()}/`; // run from the project root (npm run levels:intro)
const OUT = `${ROOT}levels/`;
const COLLECTION = 'Intro';
type P = [number, number];
const pt = ([x, y]: P): Pt => ({ x, y });
const line = (...ps: P[]): Stroke => ({ pts: densify(ps.map(pt)), closed: false });
const loop = (...ps: P[]): Stroke => ({ pts: densify([...ps, ps[0]].map(pt)), closed: true });
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48): Stroke => ({
    pts: Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; }),
    closed: false
});
const ellipse = (cx: number, cy: number, rx: number, ry: number): Stroke => ({ ...arc(cx, cy, rx, ry, 0, 360, 72), closed: true });
const wave = (x0: number, x1: number, y: number, amp: number, waves: number): Stroke => ({
    pts: Array.from({ length: 61 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 60, y: y + Math.sin((i / 60) * waves * Math.PI * 2) * amp })), closed: false
});
function densify(ps: Pt[]): Pt[] {
    const out: Pt[] = [ps[0]];
    for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1], b = ps[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
        for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    return out;
}

/** Hand-placed pair (tutorial levels). */
const pair = (id: string, color: string, pts: P[], ra = 18, rb = 18): Pair => {
    const path = fitPath(pts.length === 2 ? pts.map(pt) : densify(pts.map(pt)), 0.5);
    return { id, color, a: { ...pt(pts[0]), r: ra }, b: { ...pt(pts[pts.length - 1]), r: rb }, path: pts.length === 2 ? pts.map(pt) : path };
};

/** Hand-placed pair along a dense smooth curve. */
const curve = (id: string, color: string, pts: Pt[], ra = 18, rb = 18): Pair => {
    const path = fitPath(pts, 0.5);
    return { id, color, a: { x: path[0].x, y: path[0].y, r: ra }, b: { x: path[path.length - 1].x, y: path[path.length - 1].y, r: rb }, path };
};

interface Spec {
    file: string; name: string; difficulty: number; tutorial?: Level['tutorial'];
    pairs?: Pair[]; strokes?: Stroke[]; n?: number; colors?: number; seed?: number;
}

const specs: Spec[] = [
    {
        file: '001_ripples', name: 'Ripples', difficulty: 1, tutorial: 'tap',
        pairs: [
            curve('p1', 'light_blue', wave(-130, 130, -120, 18, 1.5).pts),
            curve('p2', 'blue', wave(-130, 130, 0, 18, 1.5).pts),
            curve('p3', 'magenta', wave(-130, 130, 120, 18, 1.5).pts)
        ]
    },
    {
        // Flag: the pole is blocked by the flag's dot sitting on it.
        file: '002_flag', name: 'Flag', difficulty: 1, tutorial: 'collision',
        pairs: [
            pair('p1', 'brown', [[-60, -220], [-60, 220]], 20, 20),
            curve('p2', 'red', wave(-60, 190, -85, 25, 1.25).pts, 18, 18),
            curve('p3', 'green', wave(-200, 120, 290, 14, 2).pts, 16, 16)
        ]
    },
    {
        file: '003_kite', name: 'Kite', difficulty: 2, tutorial: 'zoom', n: 9, colors: 5, seed: 11,
        strokes: [loop([200, 20], [320, 170], [200, 320], [80, 170]), line([200, 20], [200, 320]), line([80, 170], [320, 170]),
            line([200, 320], [210, 350], [190, 380], [210, 400])]
    },
    {
        file: '004_house', name: 'House', difficulty: 2, n: 12, colors: 6, seed: 21,
        strokes: [loop([80, 180], [320, 180], [320, 380], [80, 380]), line([60, 190], [200, 60], [340, 190]),
            line([170, 380], [170, 290], [230, 290], [230, 380]), loop([240, 210], [300, 210], [300, 260], [240, 260]), line([270, 210], [270, 260]),
            line([250, 100], [250, 60], [280, 60], [280, 128])]
    },
    {
        file: '005_fish', name: 'Fish', difficulty: 2, n: 14, colors: 6, seed: 31,
        strokes: [ellipse(180, 200, 140, 90), line([320, 200], [390, 140], [390, 260], [320, 200]), ellipse(100, 180, 14, 14),
            arc(150, 200, 30, 70, -70, 70), line([190, 110], [230, 60], [260, 115]), line([200, 290], [230, 330], [255, 287]),
            arc(240, 200, 25, 50, -60, 60)]
    },
    {
        file: '006_sailboat', name: 'Sailboat', difficulty: 3, n: 18, colors: 7, seed: 41,
        strokes: [line([60, 300], [340, 300], [300, 350], [100, 350], [60, 300]), line([200, 300], [200, 40]),
            line([200, 50], [320, 270], [200, 270]), line([200, 80], [90, 270], [200, 270]), line([200, 40], [240, 50], [200, 62]),
            wave(20, 380, 375, 8, 4), wave(40, 360, 395, 6, 5), line([120, 300], [120, 270]), line([280, 300], [280, 270])]
    },
    {
        file: '007_umbrella', name: 'Umbrella', difficulty: 3, n: 20, colors: 7, seed: 51,
        strokes: [arc(200, 180, 170, 140, 180, 360), wave(30, 370, 180, 10, 4), line([200, 40], [200, 330]), arc(220, 330, 20, 20, 180, 360),
            arc(200, 180, 85, 140, 180, 270), arc(200, 180, 85, 140, 270, 360), line([200, 40], [200, 20])]
    },
    {
        file: '008_rocket', name: 'Rocket', difficulty: 3, n: 22, colors: 8, seed: 61,
        strokes: [line([150, 320], [150, 140], [200, 30], [250, 140], [250, 320]), line([150, 320], [250, 320]), ellipse(200, 170, 26, 26),
            line([150, 250], [100, 320], [100, 360], [150, 320]), line([250, 250], [300, 320], [300, 360], [250, 320]),
            line([170, 320], [185, 370], [200, 340], [215, 370], [230, 320]), line([150, 230], [250, 230]), line([150, 280], [250, 280]),
            line([200, 230], [200, 280])]
    },
    {
        file: '009_tree', name: 'Tree', difficulty: 4, n: 28, colors: 9, seed: 71,
        strokes: [line([180, 380], [180, 220]), line([220, 380], [220, 220]), line([140, 380], [260, 380]), ellipse(200, 140, 150, 110), ellipse(130, 120, 50, 40),
            ellipse(270, 120, 50, 40), ellipse(200, 80, 45, 35), line([180, 280], [130, 240]), line([220, 260], [275, 225]), ellipse(150, 190, 12, 12), ellipse(250, 180, 12, 12),
            ellipse(200, 160, 12, 12), line([200, 220], [200, 250])]
    },
    {
        // Walls do not share edges: overlapping lines would block each other.
        file: '010_castle', name: 'Castle', difficulty: 5, n: 36, colors: 11, seed: 81,
        strokes: [loop([135, 170], [265, 170], [265, 370], [135, 370]), loop([45, 120], [115, 120], [115, 370], [45, 370]), loop([285, 120], [355, 120], [355, 370], [285, 370]),
            line([45, 120], [80, 70], [115, 120]), line([285, 120], [320, 70], [355, 120]), line([80, 70], [80, 30], [110, 42], [80, 54]), line([320, 70], [320, 30], [350, 42], [320, 54]),
            line([135, 170], [135, 150], [165, 150], [165, 170]), line([235, 170], [235, 150], [265, 150], [265, 170]),
            line([170, 370], [170, 300], [200, 270], [230, 300], [230, 370]), line([200, 270], [200, 370]), line([170, 330], [230, 330]),
            loop([65, 190], [95, 190], [95, 240], [65, 240]), loop([305, 190], [335, 190], [335, 240], [305, 240]), ellipse(200, 215, 24, 24),
            line([200, 191], [200, 239]), line([20, 390], [380, 390]), line([45, 290], [115, 290]), line([285, 290], [355, 290])]
    }
];

mkdirSync(OUT, { recursive: true });
const ids: string[] = [];
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
for (const sp of specs) {
    const L = newLevel(sp.file.replace(/^\d+_/, ''), sp.name);
    L.difficulty = sp.difficulty;
    L.category = 'Intro';
    if (sp.tutorial) L.tutorial = sp.tutorial;
    if (sp.pairs) L.pairs = sp.pairs;
    else {
        const [best] = generate(sp.strokes!, { pairs: sp.n!, colors: sp.colors!, difficulty: sp.difficulty, seed: sp.seed, tries: 40, keep: 1, size: 700 });
        L.pairs = best.pairs;
        L.source = { pairs: sp.n, colors: sp.colors, difficulty: sp.difficulty };
        if (best.warnings.length) console.log('   ', sp.file, best.warnings.join('; '));
    }
    const res = solve(L);
    const warn = dataChecks(L).filter((c) => c.level !== 'ok');
    writeFileSync(`${OUT}${L.id}.json`, json(L));
    ids.push(L.id);
    console.log(sp.file.padEnd(14), `${L.pairs.length} pairs`.padEnd(9), `solvable=${res.solvable}`, `open=${res.openAtStart}`, `rounds=${res.rounds}`, warn.map((w) => w.text).join('; '));
    if (!res.solvable) process.exitCode = 1;
}

// Play order: the "Intro" collection (as the editor's Organiser saves it), keeping other collections.
const colFile = `${ROOT}collections.json`;
const cols: { name: string; version: number; levels: string[] }[] = existsSync(colFile) ? JSON.parse(readFileSync(colFile, 'utf8')).collections ?? [] : [];
const others = cols.filter((c) => c.name !== COLLECTION);
const prev = cols.find((c) => c.name === COLLECTION);
writeFileSync(colFile, json({ collections: [{ name: COLLECTION, version: prev?.version ?? 1, levels: ids }, ...others] }));
const colDir = `${ROOT}collections/${COLLECTION}/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, json(JSON.parse(readFileSync(`${OUT}${id}.json`, 'utf8')))));
console.log(`Wrote ${ids.length} levels to levels/ and the "${COLLECTION}" collection.`);
