// Chapter 3 (levels/chapter-3/): 100 ORIGINAL levels whose numbers follow the profile of the
// reference data the designer collected (another game of the same genre, first 100 levels of its
// default playlist). Only the numbers are reused: the drawings are ours (tools/art-library.ts) and
// every layout is generated here. No shape, coordinate or level order is copied.
//
// Profile measured from the reference (median, [10%-90%]):
//   rhythm   71% normal, 20% hard, 8% very hard, 1% super hard (the last level). A harder level
//            comes every 1-6 normals (median 3), never two very hard in a row.
//   normal   lines 22 [14-30], growing ~17 -> 25 over the 100 levels; depth 9 [6-15];
//            21% of the lines open at the start [11%-32%]; 1.42 blocks per line; 9-11 colours.
//   hard     lines 61 [52-81]; depth 13 [8-21]; 27% open.
//   v. hard  lines 82 [71-113]; depth 18 [15-35]; 28% open.
//   super    lines 104; depth 45 (we aim lower: 30, the generator's practical limit).
//   style    40% of the lines straight, the rest curves; nearly all dots normal size.
//   levels 1-3: tutorials with 3, 4 and 6 lines (depth 1, 2, 3).
// Run: npm run levels:chapter3   (optional: -- 12 37  to rebuild only those levels)
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { Level, dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { generate, rng, strokeFrame } from '../src/core/generator';
import { generateLayered, layeredSize } from '../src/core/layered';
import { parseSvg } from '../src/core/svg';
import { ART, POOLS } from './art-library';

const ROOT = `${process.cwd()}/`;
const CHAPTER = 'chapter-3';
const LV = `${ROOT}levels/${CHAPTER}/`;
const ART_DIR = `${ROOT}art/${CHAPTER}/`;
const COLLECTION = 'Main';
const only = process.argv.slice(2).map(Number).filter(Boolean);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
mkdirSync(LV, { recursive: true });
mkdirSync(ART_DIR, { recursive: true });

type Tier = 'tutorial' | 'normal' | 'hard' | 'very hard' | 'super hard';
interface Row { level: number; tier: Tier; lines: number; depth: number; open: number; colours: number; art: string; tutorial?: 'tap' | 'collision' | 'zoom' }

/** Gaps between two harder levels in the reference playlist (sampled as they are). */
const GAPS = [6, 4, 5, 1, 4, 2, 6, 2, 3, 1, 5, 1, 4, 4, 1, 1, 3, 2, 4, 1, 4, 1, 5, 10, 3, 1, 5, 1];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function plan(): Row[] {
    const rand = rng(20261118);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const spread = (sd: number, lo: number, hi: number) => clamp(Math.exp(gauss() * sd), lo, hi);
    // Tiers: tutorials, then normals with a harder level every GAPS[k] levels; the last is super hard.
    const tiers: Tier[] = ['tutorial', 'tutorial', 'tutorial'];
    let next = 4 + 6; // first harder level at 10, as in the reference
    let harder = 0;
    for (let l = 4; l <= 100; l++) {
        if (l === 100) tiers.push('super hard');
        else if (l === next) {
            // About 1 in 3 harder levels is very hard (reference: 8 of 28), from level 20 on.
            harder++;
            tiers.push(l > 20 && harder % 3 === 0 ? 'very hard' : 'hard');
            next = l + GAPS[Math.floor(rand() * GAPS.length)];
        } else tiers.push('normal');
    }
    // Drawings: matched by size: the levels with the most lines get the drawings with the most
    // strokes (the outline must leave room for blockers), the tutorials simple ones.
    const strokes = (a: string) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${ART[a].draw().join('')}</svg>`).strokes.length;
    const names = [...POOLS.first, ...POOLS.relax, ...POOLS.normal, ...POOLS.hard];
    const tut = ['heart', 'pear', 'tshirt'];
    const byStrokes = names.filter((a) => !tut.includes(a)).map((a) => ({ a, n: strokes(a) + rand() * 2.5 })).sort((x, y) => y.n - x.n).map((x) => x.a);
    let zoomDone = false;
    const rows = tiers.map((tier, i) => {
        const level = i + 1;
        if (tier === 'tutorial') {
            const [lines, depth] = [[3, 1], [4, 2], [6, 3]][i];
            return { level, tier, lines, depth, open: i ? 0.5 : 1, colours: lines, art: tut[i], tutorial: i === 0 ? 'tap' : i === 1 ? 'collision' : undefined } as Row;
        }
        const t = (level - 4) / 96;
        let lines: number, depth: number, open: number;
        if (tier === 'normal') {
            lines = Math.round(clamp((17 + 8 * t) * spread(0.22, 0.65, 1.38), 12, 34));
            depth = Math.round(clamp(lines * 0.41 * spread(0.22, 0.7, 1.5), 4, 16));
            open = clamp(0.21 + gauss() * 0.05, 0.12, 0.32);
        } else if (tier === 'hard') {
            lines = Math.round(clamp(61 * spread(0.14, 0.85, 1.32), 50, 82));
            depth = Math.round(clamp(13 * spread(0.25, 0.65, 1.6), 8, 21));
            open = clamp(0.27 + gauss() * 0.06, 0.15, 0.4);
        } else if (tier === 'very hard') {
            lines = Math.round(clamp(82 * spread(0.1, 0.87, 1.2), 70, 100));
            depth = Math.round(clamp(18 * spread(0.2, 0.85, 1.4), 15, 26));
            open = clamp(0.28 + gauss() * 0.05, 0.18, 0.38);
        } else {
            lines = 100; depth = 30; open = 0.25;
        }
        const colours = tier === 'normal' ? 9 + Math.floor(rand() * 3) : 11;
        const tutorial = !zoomDone && tier !== 'normal' ? ((zoomDone = true), 'zoom' as const) : undefined;
        return { level, tier, lines, depth, open, colours, art: '', tutorial } as Row;
    });
    [...rows.slice(3)].sort((x, y) => y.lines - x.lines || x.level - y.level).forEach((r, k) => { r.art = byStrokes[k]; });
    return rows;
}

const rows = plan();
const idOf = (r: Row) => `c3-${String(r.level).padStart(3, '0')}-${r.art.replace(/_/g, '-')}`;
const fileOf = (r: Row) => `${String(r.level).padStart(3, '0')}_${r.art}.svg`;

// Drawings of this chapter (kept if they exist: replace them by hand and rebuild that level).
for (const r of rows) {
    const f = ART_DIR + fileOf(r);
    if (!existsSync(f)) writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" fill="none" stroke="#222" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">\n  <!-- Chapter 3 · level ${r.level} · ${ART[r.art].name} · ${r.tier} -->\n${ART[r.art].draw().map((e) => `  ${e}`).join('\n')}\n</svg>\n`);
}
for (const f of readdirSync(ART_DIR)) if (f.endsWith('.svg') && !rows.some((r) => fileOf(r) === f)) unlinkSync(ART_DIR + f);

interface Built { level: Level; m: ReturnType<typeof difficulty>; cost: number; open: number; blocks: number; warnings: string[]; size: number }

function build(r: Row): Built | null {
    const svg = parseSvg(readFileSync(ART_DIR + fileOf(r), 'utf8'));
    let best: Built | null = null;
    const consider = (pairs: Level['pairs'], warnings: string[], size: number, open: number, blocks: number) => {
        const L = newLevel(idOf(r), ART[r.art].name);
        L.pairs = pairs;
        const m = difficulty(L);
        if (!m.solvable) return;
        const warn = dataChecks(L).filter((x) => x.level === 'warn').length;
        let cost = 3 * Math.abs(m.pairs - r.lines) + 2 * Math.abs(m.depth - r.depth) + 25 * Math.abs(open - r.open) + 25 * warn;
        if (r.tutorial === 'tap' && m.depth > 1) cost += 100;
        if (!best || cost < best.cost) best = { level: L, m, cost, open, blocks, warnings, size };
    };
    if (r.tier === 'tutorial') {
        for (const c of generate(svg.strokes, { pairs: r.lines, colors: r.colours, difficulty: r.level, seed: r.level * 7919, tries: 40, keep: 40 })) {
            const open = c.sim.openAtStart / Math.max(1, c.pairs.length);
            consider(c.pairs, c.warnings, 700, open, 0);
        }
        if (r.level > 1)
            for (const c of generateLayered(svg.strokes, { pairs: r.lines, colors: r.colours, seed: r.level * 31, tries: 12, depthTarget: r.depth, openTarget: r.open, blockTarget: 1, straightShare: 0.4 }))
                consider(c.pairs, c.warnings, 700, c.stats.openShare, c.stats.avgBlockers);
        return best;
    }
    // Big levels get a bigger world (up to +30%) so every line fits; pinch zoom covers the rest.
    const size = Math.round(layeredSize(r.lines) * (r.lines >= 50 ? 1 + Math.min(0.3, (r.lines - 50) / 160) : 1));
    const rounds = r.lines < 40 ? 3 : 1;
    for (let k = 0; k < rounds; k++) {
        for (const c of generateLayered(svg.strokes, { pairs: r.lines, colors: r.colours, seed: r.level * 7919 + k * 104729, tries: r.lines < 40 ? 4 : 2, depthTarget: r.depth, openTarget: r.open, blockTarget: 1.42, straightShare: 0.4, size }))
            consider(c.pairs, c.warnings, size, c.stats.openShare, c.stats.avgBlockers);
        if (best && (best as Built).cost < 4) break;
    }
    // Fallback (a drawing whose own lines block each other in a loop): generator v2, always solvable.
    if (!best)
        for (const c of generate(svg.strokes, { pairs: r.lines, colors: r.colours, difficulty: 4, seed: r.level * 7919, size, tries: 24, keep: 6, crossBlocks: 0.6 }))
            consider(c.pairs, [...c.warnings, 'Built with generator v2 (fallback)'], size, c.sim.openAtStart / Math.max(1, c.pairs.length), 0);
    return best;
}

const reportFile = `${ROOT}design/chapter-3-report.json`;
const prev: Record<number, unknown> = existsSync(reportFile) ? Object.fromEntries((JSON.parse(readFileSync(reportFile, "utf8")).levels as ({ level: number } | null)[]).filter((x): x is { level: number } => !!x).map((x) => [x.level, x])) : {};
const report: unknown[] = [];
for (const r of rows) {
    if (only.length && !only.includes(r.level)) { report.push(prev[r.level] ?? null); continue; }
    const t0 = Date.now();
    const b = build(r);
    if (!b) { console.error(`L${r.level} ${r.art}: no solvable layout`); process.exitCode = 1; report.push(null); continue; }
    const L = b.level;
    L.status = 'WIP';
    L.category = r.tier;
    L.difficulty = Math.max(1, Math.min(5, Math.round(b.m.score / 20) + 1));
    if (r.tutorial) L.tutorial = r.tutorial;
    const svg = parseSvg(readFileSync(ART_DIR + fileOf(r), 'utf8'));
    const fr = strokeFrame(svg.strokes, b.size);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    L.source = { image: `art/${CHAPTER}/${fileOf(r)}`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(svg.width * fr.k), h: r1(svg.height * fr.k) }, pairs: r.lines, colors: r.colours };
    writeFileSync(`${LV}${L.id}.json`, json(L));
    report.push({ ...r, id: L.id, built: { lines: b.m.pairs, depth: b.m.depth, open: Math.round(b.open * 100) / 100, blocksPerLine: Math.round(b.blocks * 100) / 100, colours: b.m.colours, score: b.m.score }, warnings: b.warnings });
    console.log(`L${String(r.level).padStart(3)} ${r.tier.padEnd(10)} ${r.art.padEnd(14)} lines ${r.lines}->${b.m.pairs}  depth ${r.depth}->${b.m.depth}  open ${Math.round(r.open * 100)}%->${Math.round(b.open * 100)}%  blocks ${b.blocks.toFixed(2)}  score ${b.m.score}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const ids = rows.map(idOf);
if (!only.length) for (const f of readdirSync(LV)) if (/^c3-\d{3}-.+\.json$/.test(f) && !ids.includes(f.slice(0, -5))) unlinkSync(LV + f);
writeFileSync(`${LV}collections.json`, json({ collections: [{ name: COLLECTION, version: 1, levels: ids }] }));
const colDir = `${LV}collections/${COLLECTION}/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => { const f = `${LV}${id}.json`; if (existsSync(f)) writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(f, 'utf8')); });
writeFileSync(reportFile, json({ generated: new Date().toISOString().slice(0, 10), chapter: CHAPTER, levels: report }));
console.log(`Done: ${ids.length} levels in levels/${CHAPTER}/, design/chapter-3-report.json`);
