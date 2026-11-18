// Silhouette levels (levels/chapter-5-silhouettes/): 100 levels drawn on the silhouettes of
// art/silhouettes/. Every level fills the black of its silhouette exactly: the outline is traced
// just inside the edge, a pattern of lines fills the inside, and no line leaves the black.
// The plan (lines, depth, open share, blocks per line, hard / relax rhythm, pattern and dot-size
// rotation) is in tools/silhouette/plan.ts; what was built and measured goes to
// design/silhouette-levels-report.json (python3 tools/export-silhouette-sheet.py makes the sheet).
//
// Run: npm run levels:silhouettes            (all levels)
//      npm run levels:silhouettes -- 12 37   (only those levels)
//      npm run levels:silhouettes -- --plan  (print the plan, build nothing)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { Level, Pair, dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { COLOURS, blocking, colourPairs, fitReport, toPairs } from './silhouette/assemble';
import { Pattern, Style, buildInk, dims } from './silhouette/fill';
import { rng } from './silhouette/geom';
import { anneal, compile, extractLines } from './silhouette/ink';
import { CONSTANTS, HARD_LABEL_FROM, PATTERNS, Row, STYLES, TIERS, plan } from './silhouette/plan';
import { Mask, buildMasks, loadMask } from './silhouette/raster';
import { ART, Shape, buildShape } from './silhouette/shape';

const ROOT = `${process.cwd()}/`;
const CHAPTER = 'chapter-5-silhouettes';
const LV = `${ROOT}levels/${CHAPTER}/`;
const ART_DIR = `${ROOT}art/silhouettes/`;
const CACHE = `${ROOT}node_modules/.cache/dot-line-silhouettes/`;
const COLLECTION = 'Main';
const args = process.argv.slice(2);
const only = args.map(Number).filter(Boolean);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
/** DBG=1: say why a try was thrown away. */
const DBG = !!process.env.DBG;
mkdirSync(LV, { recursive: true });
mkdirSync(CACHE, { recursive: true });

buildMasks(ART_DIR, `${CACHE}masks`);
const arts = readdirSync(ART_DIR).filter((f) => /^\d{3}_.+\.svg$/.test(f)).sort().map((f) => f.replace('.svg', ''));
const masks = new Map<string, Mask>();
const maskOf = (a: string) => { if (!masks.has(a)) masks.set(a, loadMask(`${CACHE}masks/${a}.json`)); return masks.get(a)!; };

/** Width of a line in the game: follows the dot size (src/scenes/Game.ts). */
const lineWidth = (p: Pair) => 7 * Math.min(1, 0.15 + (0.85 * Math.max(p.a.r, p.b.r)) / 16);
const lineWidthOf = (r: number) => 7 * Math.min(1, 0.15 + (0.85 * r) / 16);
/**
 * Moves the points of a line that sit too close to the edge of the black further in (up the distance
 * field), so the whole stroke stays inside. In parts thinner than the stroke it ends up on their middle.
 */
function keepInside(pts: { x: number; y: number }[], sh: Shape, need: number): { x: number; y: number }[] {
    return pts.map((p0) => {
        let p = p0;
        for (let it = 0; it < 6; it++) {
            const d = sh.dFull(p);
            if (d >= need) break;
            const e = 1.2;
            const gx = sh.dFull({ x: p.x + e, y: p.y }) - sh.dFull({ x: p.x - e, y: p.y }), gy = sh.dFull({ x: p.x, y: p.y + e }) - sh.dFull({ x: p.x, y: p.y - e });
            const gl = Math.hypot(gx, gy);
            if (gl < 0.05) break; // on the ridge of a thin part: as far inside as it gets
            const step = Math.min(1.5, need - d);
            p = { x: p.x + (gx / gl) * step, y: p.y + (gy / gl) * step };
        }
        return p;
    });
}

/** World px per art unit for a level with `lines` lines: the board grows with the square root of the lines. */
const scaleFor = (lines: number) => (700 * Math.max(1, Math.min(2.15, Math.sqrt(lines / 24)))) / 340;

// ---------- what a silhouette needs: measured once, used to give each level a fitting picture
interface Measure {
    art: string;
    /** Strokes a plain stripe fill gives at 2.2 px per unit: how many lines the picture asks for. */
    strokes: number;
    loops: number;
    thin: number;
    tubes: number;
    /** Share of the ink that is centre lines of thin parts: high = a line drawing, little to fill. */
    thinShare: number;
    /** Median half-width of the black at 2.2 px per unit (px): how big the dots may be. */
    half: number;
    /** Separate black parts (outlines that are not holes). Many small parts cannot block each other much. */
    parts: number;
    mtime: number;
    v: number;
}
const MEASURE_V = 4;
const measureFile = `${CACHE}measure.json`;
const measured: Record<string, Measure> = existsSync(measureFile) ? JSON.parse(readFileSync(measureFile, 'utf8')) : {};
for (const a of arts) {
    const mtime = statSync(`${ART_DIR}${a}.svg`).mtimeMs;
    if (measured[a]?.mtime === mtime && measured[a]?.v === MEASURE_V) continue;
    const style = STYLES[0].style;
    const sh = buildShape(maskOf(a), 2.2, dims(style).clear);
    const { strokes } = buildInk(sh, { pattern: { kind: 'stripes', angle: 0 }, style, target: 0, tipShare: 0.2, phase: 9, rand: rng(1), plain: true });
    const len = (role: string) => strokes.filter((x) => x.role === role).reduce((n, x) => n + x.len, 0);
    const widths: number[] = [];
    for (let i = 0; i < sh.sdFull.length; i += 7) if (sh.sdFull[i] > 0) widths.push(sh.sdFull[i]);
    widths.sort((x, y) => x - y);
    // half-width of the part a point belongs to is about twice its distance to the edge, on average
    measured[a] = { art: a, strokes: strokes.length, loops: sh.loops.length, thin: sh.thin.length, tubes: sh.tubes, thinShare: Math.round((len('thin') / Math.max(1, len('thin') + len('contour'))) * 100) / 100, half: Math.round(widths[widths.length >> 1] * 2 * 10) / 10, parts: sh.loops.filter((l) => !l.hole).length, mtime, v: MEASURE_V };
    process.stdout.write(`measure ${a}: ${measured[a].strokes} strokes, thin ${measured[a].thinShare}, half-width ${measured[a].half}\n`);
}
writeFileSync(measureFile, JSON.stringify(measured));
/** A line drawing: mostly thin parts, little area to fill. Such pictures block little: they suit relax levels. */
const lineArt = (a: string) => measured[a].thinShare > 0.3 || measured[a].half < 24;
/** Pictures that give little blocking: line drawings and pictures made of many separate parts. */
const light = (a: string) => lineArt(a) || measured[a].parts >= 6;

// ---------- pictures: the simplest for tutorials and relax levels, the richest for the hardest
function assign(rows: Row[]): void {
    const rand = rng(40418);
    const byNeed = arts.map((a) => ({ a, need: measured[a].strokes + rand() * 0.5 })).sort((x, y) => x.need - y.need).map((x) => x.a);
    const take = (pool: string[], n: number, fromEnd = false) => (fromEnd ? pool.splice(pool.length - n, n) : pool.splice(0, n));
    const pool = byNeed.slice();
    const bySlot = (pred: (r: Row) => boolean) => rows.filter(pred);
    // tutorials: solid, single-outline pictures
    const tut = ['087_heart', '073_star', '100_dog_bone'].filter((a) => pool.includes(a));
    for (const a of tut) pool.splice(pool.indexOf(a), 1);
    bySlot((r) => r.role === 'tutorial').forEach((r, i) => { r.art = tut[i] ?? take(pool, 1)[0]; });
    // relax levels: line drawings first (easy by nature), then the simplest solid pictures
    const relaxSlots = bySlot((r) => r.role === 'relax');
    const drawings = pool.filter((a) => light(a) && measured[a].strokes <= 30).slice(0, relaxSlots.length);
    for (const a of drawings) pool.splice(pool.indexOf(a), 1);
    const relax = [...drawings, ...take(pool, relaxSlots.length - drawings.length)].sort((x, y) => measured[x].strokes - measured[y].strokes);
    const superHard = take(pool, bySlot((r) => r.difficulty === 3).length, true);
    const veryHard = take(pool, bySlot((r) => r.difficulty === 2).length, true);
    const hard = take(pool, bySlot((r) => r.difficulty === 1).length, true);
    const give = (rs: Row[], list: string[]) => {
        // rows by lines, pictures by need
        const order = rs.slice().sort((x, y) => x.lines - y.lines || x.level - y.level);
        order.forEach((r, i) => { r.art = list[i]; });
    };
    give(bySlot((r) => r.difficulty === 3), superHard);
    give(bySlot((r) => r.difficulty === 2), veryHard);
    give(bySlot((r) => r.difficulty === 1), hard);
    give(relaxSlots, relax);
    // normal levels: windows of 6 shuffled, so the need still rises with the level
    const normals = bySlot((r) => r.role === 'normal');
    const list = pool.slice();
    for (let i = 0; i < list.length; i += 6) {
        const w = list.slice(i, i + 6);
        for (let j = w.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [w[j], w[k]] = [w[k], w[j]]; }
        list.splice(i, w.length, ...w);
    }
    normals.forEach((r, i) => { r.art = list[i]; });
    // a line drawing has only so many lines in it: a relax level asks for no more than the picture gives
    for (const r of relaxSlots) if (light(r.art)) { r.lines = Math.max(8, Math.min(r.lines, measured[r.art].strokes)); r.depth = Math.max(3, Math.round(r.lines * 0.22)); }
    // dot size: never bigger than the picture's parts allow
    for (const r of rows) {
        r.picture = lineArt(r.art) ? 'line drawing' : light(r.art) ? 'many parts' : 'solid';
        const half = measured[r.art].half * (scaleFor(r.lines) / 2.2);
        const fits = (name: string) => STYLES.find((x) => x.name === name)!.style.R <= Math.max(13, half * 1.15);
        if (lineArt(r.art)) r.style = 'fine';
        else if (r.style === 'bold' && !fits('bold')) r.style = fits('normal') ? 'normal' : 'fine';
        else if (r.style === 'normal' && !fits('normal')) r.style = 'fine';
    }
}

const rows = plan();
assign(rows);
if (args.includes('--plan')) {
    for (const r of rows) console.log(`L${String(r.level).padStart(3)} ${r.role.padEnd(8)} d${r.difficulty} ${r.label ? 'HARD' : '    '} lines ${String(r.lines).padStart(3)} depth ${String(r.depth).padStart(2)} ${r.pattern.padEnd(14)} ${r.style.padEnd(6)} ${r.art} (needs ${measured[r.art].strokes}${lineArt(r.art) ? ', line drawing' : light(r.art) ? ', many parts' : ''}, half ${measured[r.art].half})`);
    process.exit(0);
}
const subject = (a: string) => a.replace(/^\d+_/, '');
const title = (a: string) => subject(a).split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const idOf = (r: Row) => `sil-${String(r.level).padStart(3, '0')}-${subject(r.art).replace(/_/g, '-')}`;

// ---------- one level
interface Built {
    level: Level;
    k: number;
    cost: number;
    block: ReturnType<typeof blocking>;
    fit: ReturnType<typeof fitReport>;
    colours: number;
    sameColour: number;
    crossings: number;
    info: ReturnType<typeof buildInk>['info'];
    pitch: number;
    R: number;
    score: number;
    medianLength: number;
    warnings: string[];
}

/** Pattern sizes are given in pitches: turn them into px. */
function sized(p: Pattern, pitch: number): Pattern {
    if (p.kind === 'waves' || p.kind === 'zigzag') return { ...p, amp: p.amp * pitch, wavelength: p.wavelength * pitch };
    return p;
}

function build(r: Row, quick: boolean): Built | null {
    const def = PATTERNS.find((p) => p.name === r.pattern)!;
    const base = STYLES.find((s) => s.name === r.style)!.style;
    const mask = maskOf(r.art);
    const D0 = dims(base);
    const tutorial = r.role === 'tutorial';
    let best: Built | null = null;
    const k0 = scaleFor(r.lines);
    const shapes = new Map<number, Shape>();
    const shapeAt = (k: number) => { const key = Math.round(k * 100); if (!shapes.has(key)) shapes.set(key, buildShape(mask, key / 100, D0.clear)); return shapes.get(key)!; };

    // scale and pitch: the pattern alone should give 55-80% of the lines (splits and rungs add the rest)
    let k = k0, pitch = base.pitch * (def.pitch ?? 1);
    if (tutorial) pitch = r.level === 1 ? 86 : r.level === 2 ? 80 : 62;
    const baseCount = (kk: number, pp: number) => buildInk(shapeAt(kk), { pattern: sized(def.pattern, pp), style: { ...base, pitch: pp }, target: 0, tipShare: def.tipShare, phase: 11, rand: rng(r.level), plain: true }).strokes.length;
    if (!tutorial) {
        // too many strokes: widen the pattern (never shrink the picture: its parts must stay bigger than the dots);
        // too few: a slightly bigger board
        for (let step = 0; step < 4; step++) {
            const n0 = baseCount(k, pitch);
            if (n0 > r.lines * 0.82) {
                const want = Math.min(pitch * Math.min(1.5, n0 / (r.lines * 0.7)), base.pitch * 1.9);
                if (want > pitch * 1.04) pitch = want; else break;
            } else if (n0 < r.lines * 0.4 && k < k0 * 1.2) k = Math.min(k0 * 1.2, k * 1.12);
            else break;
        }
    }
    const sh = shapeAt(k);
    const style: Style = { ...base, pitch };
    const D = dims(style);
    const attempts = quick ? 2 : r.lines > 70 ? 3 : 5;
    for (let at = 0; at < attempts; at++) {
        const rand = rng(r.level * 7919 + at * 104729);
        const tipShare = tutorial ? 0.5 : Math.max(0.04, def.tipShare + [0, -0.08, 0.06, -0.14, 0.1][at % 5]);
        const { strokes, info } = buildInk(sh, { pattern: sized(def.pattern, pitch), style, target: r.lines, tipShare, phase: 5 + at * 13.7, rand, maxBase: Math.round(r.lines * 0.86), loopsCutOnly: r.level === 1 });
        let g;
        try { g = compile(strokes, style.R); } catch (e) { if (DBG) console.log(`  try ${at}: ${(e as Error).message}`); continue; }
        const lines0 = g.dots.length / 2;
        const maxLen = Math.max(620, 340 * k * 1.15);
        const res = anneal(g, { depth: r.depth, open: r.open, blocks: r.blocks, maxLen, minLen: 2 * style.R + 18 }, rand, quick ? 8000 : lines0 > 70 ? 14000 : 20000, quick ? 1 : lines0 > 70 ? 2 : 3);
        if (!res.ev.valid) { if (DBG) console.log(`  try ${at}: no valid layout (broken ${res.ev.broken}, stuck ${res.ev.stuck}) ${JSON.stringify(info)}`); continue; }
        const lines = extractLines(g, res.state, res.ev);
        for (const ln of lines) ln.pts = keepInside(ln.pts, sh, lineWidthOf(ln.r) / 2 + 0.6);
        const pairs = toPairs(lines, (l) => l.r);
        const block = blocking(pairs);
        if (!block.solvable) { if (DBG) console.log(`  try ${at}: solvable in the model, not in the game (stuck ${block.stuck})`); continue; }
        const col = colourPairs(pairs, r.lines <= 8 ? COLOURS.slice(0, Math.max(3, pairs.length)) : pairs.length < 20 ? COLOURS.slice(0, 9) : COLOURS, pitch * 1.25, rand);
        const L = newLevel(idOf(r), title(r.art));
        L.pairs = pairs;
        const warn = dataChecks(L).filter((x) => x.level === 'warn');
        const open = block.open / block.lines;
        const cost = 30 * Math.abs(block.lines - r.lines) / r.lines + 10 * Math.abs(block.depth - r.depth) / Math.max(3, r.depth)
            + 60 * Math.max(0, Math.abs(open - r.open) - 0.05) + 30 * Math.max(0, Math.abs(block.blocksPerLine - r.blocks) - 0.1) + 10 * warn.length + 2 * col.same;
        if (best && cost >= best.cost) continue;
        const fit = fitReport(pairs, mask, sh.sdFull, k, lineWidth, pitch * 0.8);
        const lens = lines.map((l) => { let s = 0; for (let i = 1; i < l.pts.length; i++) s += Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y); return s; }).sort((a, b) => a - b);
        best = { level: L, k, cost, block, fit, colours: new Set(pairs.map((p) => p.color)).size, sameColour: col.same, crossings: col.crossings, info, pitch, R: style.R, score: difficulty(L).score, medianLength: Math.round(lens[lens.length >> 1]), warnings: warn.map((w) => w.text) };
        if (cost < 1.5) break;
    }
    return best;
}

// ---------- build, write, report
const reportFile = `${ROOT}design/silhouette-levels-report.json`;
const prev: Record<number, unknown> = existsSync(reportFile) ? Object.fromEntries((JSON.parse(readFileSync(reportFile, 'utf8')).levels as ({ level: number } | null)[]).filter((x): x is { level: number } => !!x).map((x) => [x.level, x])) : {};
const report: unknown[] = [];
const quick = args.includes('--quick');
for (const r of rows) {
    if (only.length && !only.includes(r.level)) { report.push(prev[r.level] ?? null); continue; }
    const t0 = Date.now();
    const b = build(r, quick);
    if (!b) { console.error(`L${r.level} ${r.art}: no solvable layout`); process.exitCode = 1; report.push({ ...r, id: idOf(r), built: null }); continue; }
    const L = b.level;
    L.status = 'WIP';
    L.category = r.role === 'hard' ? (r.label ? 'hard' : 'hard (no label)') : r.role;
    L.difficulty = Math.max(1, Math.min(5, Math.round(b.score / 20) + 1));
    if (r.tutorial) L.tutorial = r.tutorial;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    L.source = { image: `art/silhouettes/${r.art}.svg`, rect: { x: r1((-ART / 2) * b.k), y: r1((-ART / 2) * b.k), w: r1(ART * b.k), h: r1(ART * b.k) }, pairs: r.lines, colors: b.colours, pattern: r.pattern };
    writeFileSync(`${LV}${L.id}.json`, json(L));
    const pct = (v: number) => Math.round(v * 1000) / 10;
    report.push({
        ...r, id: L.id, name: L.name,
        built: {
            lines: b.block.lines, depth: b.block.depth, open: Math.round((b.block.open / b.block.lines) * 1000) / 1000, blocksPerLine: Math.round(b.block.blocksPerLine * 100) / 100,
            blockedBy: b.block.hist, colours: b.colours, sameColourNeighbours: b.sameColour, crossingsPerLine: Math.round((b.crossings / b.block.lines) * 100) / 100,
            score: b.score, dotRadius: b.R, pitch: Math.round(b.pitch), board: Math.round(340 * b.k), medianLength: b.medianLength,
            parts: { pattern: b.info.base, thin: b.info.thin, splits: b.info.splits, rungs: b.info.rungs, spurs: b.info.spurs, pulled: b.info.pulled, outlineCuts: b.info.loopCuts, edgeSplits: b.info.edgeSplits, skipped: b.info.dropped }
        },
        fit: { overflowPct: pct(b.fit.overflowShare), overflowMaxPx: Math.round(b.fit.overflowMax * 10) / 10, edgeFlushPct: pct(b.fit.edgeFlush), edgeNearPct: pct(b.fit.edgeNear), filledPct: pct(b.fit.filled), dotsOutsidePct: pct(b.fit.dotsOutside) },
        warnings: b.warnings
    });
    console.log(`L${String(r.level).padStart(3)} ${r.role.padEnd(8)} d${r.difficulty} ${r.art.padEnd(22)} ${r.pattern.padEnd(14)} ${r.style.padEnd(6)} lines ${String(r.lines).padStart(3)}->${String(b.block.lines).padStart(3)} depth ${String(r.depth).padStart(2)}->${String(b.block.depth).padStart(2)} open ${String(Math.round((b.block.open / b.block.lines) * 100)).padStart(2)}% b/l ${b.block.blocksPerLine.toFixed(2)} | over ${pct(b.fit.overflowShare)}% edge ${pct(b.fit.edgeFlush)}/${pct(b.fit.edgeNear)}% fill ${pct(b.fit.filled)}% | cost ${b.cost.toFixed(1)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const ids = rows.map(idOf);
if (!only.length) for (const f of readdirSync(LV)) if (/^sil-\d{3}-.+\.json$/.test(f) && !ids.includes(f.slice(0, -5))) unlinkSync(LV + f);
writeFileSync(`${LV}collections.json`, json({ collections: [{ name: COLLECTION, version: 1, levels: ids.filter((id) => existsSync(`${LV}${id}.json`)) }] }));
const colDir = `${LV}collections/${COLLECTION}/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => { const f = `${LV}${id}.json`; if (existsSync(f)) writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(f, 'utf8')); });
writeFileSync(reportFile, json({
    generated: new Date().toISOString().slice(0, 10), chapter: CHAPTER,
    rules: { tiers: TIERS, constants: CONSTANTS, hardLabelFrom: HARD_LABEL_FROM, patterns: PATTERNS.map((p) => ({ name: p.name, describe: p.describe, simple: !!p.simple })), styles: STYLES.map((s) => ({ name: s.name, dotRadius: s.style.R, pitch: s.style.pitch })), colours: COLOURS },
    levels: report
}));
console.log(`Done: levels/${CHAPTER}/, design/silhouette-levels-report.json`);
