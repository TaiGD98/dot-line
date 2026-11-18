// Builds the 100-level system from art/levels/*.svg and the level plan:
// levels/<id>.json, the "Main" collection (first = played by the game), and
// design/level-report.json (plan + achieved difficulty, read by tools/export-sheet.py).
// Run: npm run levels:build   (optional: -- 12 37  to rebuild only those levels)
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { Level, dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { generate, strokeFrame, worldSize } from '../src/core/generator';
import { crossCounts, generateOverlap } from '../src/core/overlap';
import { generateStrokes, strokeWorldSize } from '../src/core/strokemode';
import { generateLayered } from '../src/core/layered';
import { parseSvg } from '../src/core/svg';
import { plan } from './level-plan';

const ROOT = `${process.cwd()}/`;
/** Chapter folder these levels belong to (the editor shows each folder under levels/ as a chapter). */
const LV = `${ROOT}levels/chapter-1/`;
const COLLECTION = 'Main';
const only = process.argv.slice(2).map(Number).filter(Boolean);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
mkdirSync(`${LV}`, { recursive: true });
mkdirSync(`${ROOT}design`, { recursive: true });

const reportFile = `${ROOT}design/level-report.json`;
const prev: Record<number, unknown> = existsSync(reportFile) ? Object.fromEntries((JSON.parse(readFileSync(reportFile, "utf8")).levels as ({ level: number } | null)[]).filter((r): r is { level: number } => !!r).map((r) => [r.level, r])) : {};
const report: unknown[] = [];
const ids: string[] = [];

interface Built { level: Level; m: ReturnType<typeof difficulty>; cost: number; warnings: string[]; stats: unknown; strokes: number; bigStrokes: number; size?: number; pattern?: string }

const rows = plan();
/** Plan columns of the report (the measured values are added next to them). */
const planned = (row: (typeof rows)[number]) => ({ ...row, plannedPairs: row.pairs, plannedBase: row.base, plannedX: row.x, plannedT: row.t, plannedColours: row.colours, plannedDepth: row.depth, bigDotsPlan: row.bigDots, generator: generatorOf(row.level) });
const idOf = (l: number) => { const r = rows[l - 1]; return `${String(r.level).padStart(3, '0')}-${r.art.replace(/_/g, '-')}`; };
const scoreOf = new Map<number, number>();
for (const r of Object.values(prev) as { level: number; score: number }[]) scoreOf.set(r.level, r.score);

/**
 * Levels 1..TWO_PART_TO are built with the 2-part generator: part 1 fills the drawing's lines
 * (base), part 2 adds the overlap pattern (X and T cross lines). Later levels keep their old
 * layout (v3 for 11-21, v2 after) until they are rebuilt the same way.
 */
export const TWO_PART_TO = 10;
export const V3_FROM = 11, V3_TO = 21;
/** Block rules compare a level only with levels of its own group (small 1-4 / same generator). */
const group = (level: number) => (level <= 4 ? 'small' : level <= TWO_PART_TO ? '2-part' : level <= V3_TO ? 'v3' : 'v2');
const generatorOf = (level: number) => (level <= TWO_PART_TO ? '2-part' : level <= V3_TO ? 'v3 (old)' : 'v2 (old)');

/** Share of base dots without a mirror image (0 = cuts are symmetric). */
function dotAsymmetry(pairs: Level['pairs']): number {
    const dots = pairs.flatMap((p) => [p.a, p.b]);
    const xs = pairs.flatMap((p) => p.path.map((a) => a.x));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    return dots.filter((d) => !dots.some((e) => Math.hypot(2 * cx - d.x - e.x, d.y - e.y) < 24)).length / Math.max(1, dots.length);
}

/**
 * 2-part build. Part 1 = stroke mode: one line per stroke of the drawing (the drawing decides how
 * many). Part 2 = the overlap pattern: the rest of the planned lines, keeping the planned X / T
 * split. The world grows if the pattern has no room.
 */
function buildTwoPart(row: (typeof rows)[number], accept: (score: number) => boolean): Built | null {
    const svg = parseSvg(readFileSync(`${ROOT}art/levels/${row.file}`, 'utf8'));
    const tShare = row.x + row.t > 0 ? row.t / (row.x + row.t) : 0.5;
    let best: Built | null = null;
    for (const grow of [1, 1.12, 1.25, 1.4]) {
        const size = Math.round(strokeWorldSize(svg.strokes, row.pairs) * grow);
        for (let r = 0; r < 3; r++) {
            const bases = generateStrokes(svg.strokes, { pairs: row.base, colors: row.colours, difficulty: row.genDifficulty, seed: row.level * 7919 + r * 104729, size, tries: 6, keep: 3, fill: false, grow: false });
            for (const b of bases) {
                const rest = Math.max(0, row.pairs - b.pairs.length);
                const t = Math.round(rest * tShare), x = rest - t;
                const overlaps = rest > 0 ? generateOverlap(b.pairs, { x, t, difficulty: row.genDifficulty, style: row.pattern, seed: row.level * 31 + r * 977, tries: 5, keep: 3 }) : [null];
                for (const o of overlaps) {
                    const L = newLevel(idOf(row.level), row.name);
                    L.pairs = [...structuredClone(b.pairs), ...(o?.pairs ?? [])];
                    const m = difficulty(L);
                    if (!m.solvable) continue;
                    const cc = crossCounts(L.pairs);
                    const missing = Math.abs(cc.x - x) + Math.abs(cc.t - t) + Math.abs(L.pairs.length - row.pairs);
                    const warn = dataChecks(L).filter((k) => k.level === 'warn').length;
                    let cost = 30 * missing + 5 * Math.abs(m.depth - row.depth) + 50 * Math.abs(m.traps - row.t / row.pairs) + 25 * warn + (accept(m.score) ? 0 : 40) + (o && !o.symmetric ? 4 : 0);
                    if (row.tutorial === 'tap' && m.depth > 1) cost += 50;
                    if (row.tutorial === 'collision' && m.depth < 2) cost += 50;
                    if (!best || cost < best.cost)
                        best = { level: L, m, cost, warnings: [...b.warnings, ...(o?.warnings ?? [])], stats: { ...b.stats, pattern: o?.style ?? '-', symmetric: o?.symmetric ?? true, stacked: o?.stacked ?? 0, world: size, split: { base: cc.base, x: cc.x, t: cc.t } }, strokes: svg.strokes.length, bigStrokes: svg.strokes.filter((k) => k.big).length, size, pattern: o?.style };
                }
            }
        }
        if (best && best.cost < 30) break; // every planned line is placed
    }
    return best;
}

/** v3 blocking depth target: normal 5 (level 5) -> 8 (level 21); relax -1, early hard +1.5, hard from 19 +2. */
const depthTarget = (row: (typeof rows)[number]) => {
    const d = 5 + (3 * (row.level - V3_FROM)) / (V3_TO - V3_FROM);
    return row.role === 'relax' ? d - 1 : row.role === 'hard' ? d + (row.level >= 19 ? 2 : 1.5) : d;
};

/** v3: aims at the planned pair count and the fixed blocking targets (~1.4 blockers per pair, ~1/3 open). */
function buildLayered(row: (typeof rows)[number], accept: (score: number) => boolean, rounds: number): Built | null {
    const svg = parseSvg(readFileSync(`${ROOT}art/levels/${row.file}`, 'utf8'));
    let best: Built | null = null;
    for (let r = 0; r < rounds; r++) {
        for (const c of generateLayered(svg.strokes, { pairs: row.pairs, colors: row.colours, seed: row.level * 7919 + r * 104729, tries: 3 })) {
            const L = newLevel(idOf(row.level), row.name);
            L.pairs = c.pairs;
            const m = difficulty(L);
            if (!m.solvable) continue;
            const overlaps = dataChecks(L).filter((x) => x.level === 'warn').length;
            const cost = 4 * Math.abs(m.depth - depthTarget(row)) + 20 * Math.abs(c.stats.avgBlockers - 1.4) + 30 * Math.abs(c.stats.openShare - 1 / 3) + 2 * Math.abs(m.pairs - row.pairs) + 25 * overlaps + (accept(m.score) ? 0 : 40);
            if (!best || cost < best.cost) best = { level: L, m, cost, warnings: c.warnings, stats: c.stats, strokes: svg.strokes.length, bigStrokes: svg.strokes.filter((s) => s.big).length };
        }
        if (best && accept(best.m.score) && best.cost < 6) break;
    }
    return best;
}

/** Builds one level aiming at `target`; `accept` says whether a score satisfies the block rules. */
function build(row: (typeof rows)[number], target: number, accept: (score: number) => boolean, tries: number): Built | null {
    const svg = parseSvg(readFileSync(`${ROOT}art/levels/${row.file}`, 'utf8'));
    const genDifficulty = Math.max(1, Math.min(5, Math.round(target / 20) + 1));
    let best: Built | null = null;
    // Sweep the crossing-block dial and the pair count (+-25% around the plan).
    const sweep = [0, 0.3, 0.6, 1].flatMap((crossBlocks) => [0.8, 1, 1.25].map((f) => ({ crossBlocks, pairs: Math.max(3, Math.round(row.pairs * f)) })));
    for (const [k, { crossBlocks, pairs }] of sweep.entries()) {
        for (const c of generate(svg.strokes, { pairs, colors: row.colours, difficulty: genDifficulty, seed: row.level * 7919 + k * 104729 + tries, tries, keep: tries, crossBlocks })) {
            const L = newLevel(idOf(row.level), row.name);
            L.pairs = c.pairs;
            const m = difficulty(L);
            if (!m.solvable) continue;
            const overlaps = dataChecks(L).filter((x) => x.level === 'warn').length;
            const dropped = c.warnings.some((w) => w.startsWith('Dropped')) ? 1 : 0; // lines missing from the drawing
            let cost = Math.abs(m.score - target) + 0.6 * Math.abs(m.pairs - row.pairs) + 25 * overlaps + 60 * dropped + (accept(m.score) ? 0 : 40);
            if (row.tutorial === 'tap' && m.depth > 1) cost += 50; // everything open on the tap tutorial
            if (row.tutorial === 'collision' && m.depth < 2) cost += 50; // at least one block to bump into
            if (!best || cost < best.cost) best = { level: L, m, cost, warnings: c.warnings, stats: c.stats, strokes: svg.strokes.length, bigStrokes: svg.strokes.filter((s) => s.big).length };
        }
    }
    return best;
}

// Order: tutorial + normals first, then relax and hard levels, which are placed relative to
// the normals of their block (relax easier, hard harder; hard also above the previous hard).
const order = [...rows.filter((r) => r.role === 'normal' || r.role === 'tutorial'), ...rows.filter((r) => r.role === 'relax'), ...rows.filter((r) => r.role === 'hard')];
const results = new Map<number, unknown>();
const prevHardOf = new Map<string, number>();
for (const row of order) {
    const prevHard = prevHardOf.get(group(row.level)) ?? 0;
    // Levels 1-4 are small on purpose, and old levels use another generator: compare within a group.
    const blockNormals = () => rows.filter((r) => r.block === row.block && r.role === 'normal' && group(r.level) === group(row.level)).map((r) => scoreOf.get(r.level) ?? r.target);
    let target = row.target;
    let accept = (_: number) => true;
    if (row.role === 'relax' && row.tutorial !== 'collision') {
        const ceiling = Math.min(...blockNormals()) - 1;
        target = Math.min(target, ceiling);
        accept = (s) => s <= ceiling;
    }
    if (row.role === 'hard') {
        const floor = Math.max(Math.max(...blockNormals()) + 1, prevHard + 1);
        target = Math.max(target, floor + 1);
        accept = (s) => s >= floor;
    }
    if (only.length && !only.includes(row.level)) {
        // Kept level: re-score it (the difficulty formula may have changed).
        const f = `${LV}${idOf(row.level)}.json`;
        const old = prev[row.level] as Record<string, unknown> | undefined;
        if (existsSync(f) && old) {
            const m = difficulty(JSON.parse(readFileSync(f, 'utf8')));
            scoreOf.set(row.level, m.score);
            results.set(row.level, { ...old, ...planned(row), ...m, lines: m.pairs, baseLines: m.pairs, xLines: 0, tLines: 0, effectiveTarget: target, rulesOk: accept(m.score) });
        } else results.set(row.level, old);
        if (row.role === 'hard') prevHardOf.set(group(row.level), scoreOf.get(row.level) ?? prevHard);
        continue;
    }
    const v3 = row.level >= V3_FROM && row.level <= V3_TO;
    const twoPart = row.level <= TWO_PART_TO;
    let best = twoPart ? buildTwoPart(row, accept) : v3 ? buildLayered(row, accept, 4) : build(row, target, accept, 6);
    if (!twoPart && !v3 && best && !accept(best.m.score)) best = build(row, target, accept, 20) ?? best;
    if (!best) { console.error(`L${row.level} ${row.art}: no solvable layout`); process.exitCode = 1; continue; }
    const L = best.level;
    L.difficulty = Math.max(1, Math.min(5, Math.round(best.m.score / 20) + 1));
    L.status = 'WIP';
    L.category = row.role;
    if (row.tutorial) L.tutorial = row.tutorial;
    const svg = parseSvg(readFileSync(`${ROOT}art/levels/${row.file}`, 'utf8'));
    const fr = strokeFrame(svg.strokes, best.size ?? 700);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const cc0 = crossCounts(L.pairs);
    L.source = { image: `art/levels/${row.file}`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(svg.width * fr.k), h: r1(svg.height * fr.k) }, pairs: twoPart ? cc0.base : row.pairs, colors: row.colours, ...(twoPart ? { difficulty: row.genDifficulty, x: cc0.x, t: cc0.t, pattern: row.pattern, mode: 'strokes' as const } : {}) };
    writeFileSync(`${LV}${L.id}.json`, json(L));
    scoreOf.set(row.level, best.m.score);
    if (row.role === 'hard') prevHardOf.set(group(row.level), best.m.score);
    const cc = crossCounts(L.pairs);
    const split = twoPart ? { plannedBase: cc.base, plannedX: cc.x, plannedT: cc.t } : {};
    results.set(row.level, { ...planned(row), ...split, id: L.id, lines: best.m.pairs, baseLines: cc.base, xLines: cc.x, tLines: cc.t, effectiveTarget: target, rulesOk: accept(best.m.score), strokes: best.strokes, bigStrokes: best.bigStrokes, ...best.m, stats: best.stats, warnings: best.warnings });
    console.log(`L${String(row.level).padStart(3)} ${row.role.padEnd(8)} ${row.art.padEnd(16)} target ${String(target).padStart(2)} -> ${String(best.m.score).padStart(2)}${accept(best.m.score) ? '' : ' (RULE MISS)'}  ${twoPart ? `base ${row.base}->${cc.base} x ${row.x}->${cc.x} t ${row.t}->${cc.t} [${best.pattern ?? '-'}] ` : ''}pairs ${row.pairs}->${best.m.pairs}  depth ${best.m.depth}  traps ${best.m.traps}  big ${best.m.bigDots}`);
}
for (const row of rows) { ids.push(idOf(row.level)); report.push(results.get(row.level)); }
// Remove level files of this system that are no longer in the plan (e.g. after reordering art).
for (const f of readdirSync(`${LV}`)) if (/^\d{3}-.+\.json$/.test(f) && !ids.includes(f.slice(0, -5)) && !only.length) unlinkSync(`${LV}${f}`);

// Collections: Main first (the game plays the first collection), keep the others.
const colFile = `${LV}collections.json`;
const cols: { name: string; version: number; levels: string[] }[] = existsSync(colFile) ? JSON.parse(readFileSync(colFile, 'utf8')).collections ?? [] : [];
const main = cols.find((c) => c.name === COLLECTION);
writeFileSync(colFile, json({ collections: [{ name: COLLECTION, version: main?.version ?? 1, levels: ids }, ...cols.filter((c) => c.name !== COLLECTION)] }));
const colDir = `${LV}collections/${COLLECTION}/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => { const f = `${LV}${id}.json`; if (existsSync(f)) writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(f, 'utf8')); });
writeFileSync(reportFile, json({ generated: new Date().toISOString().slice(0, 10), levels: report }));
console.log(`Done: ${ids.length} levels, collection "${COLLECTION}", design/level-report.json`);
