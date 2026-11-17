// Builds the 100-level system from art/levels/*.svg and the level plan:
// levels/<id>.json, the "Main" collection (first = played by the game), and
// design/level-report.json (plan + achieved difficulty, read by tools/export-sheet.py).
// Run: npm run levels:build   (optional: -- 12 37  to rebuild only those levels)
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { Level, dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { generate, strokeFrame } from '../src/core/generator';
import { parseSvg } from '../src/core/svg';
import { plan } from './level-plan';

const ROOT = `${process.cwd()}/`;
const COLLECTION = 'Main';
const only = process.argv.slice(2).map(Number).filter(Boolean);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
mkdirSync(`${ROOT}levels`, { recursive: true });
mkdirSync(`${ROOT}design`, { recursive: true });

const reportFile = `${ROOT}design/level-report.json`;
const prev: Record<number, unknown> = existsSync(reportFile) ? Object.fromEntries((JSON.parse(readFileSync(reportFile, "utf8")).levels as ({ level: number } | null)[]).filter((r): r is { level: number } => !!r).map((r) => [r.level, r])) : {};
const report: unknown[] = [];
const ids: string[] = [];

interface Built { level: Level; m: ReturnType<typeof difficulty>; cost: number; warnings: string[]; stats: unknown; strokes: number; bigStrokes: number }

const rows = plan();
const idOf = (l: number) => { const r = rows[l - 1]; return `${String(r.level).padStart(3, '0')}-${r.art.replace(/_/g, '-')}`; };
const scoreOf = new Map<number, number>();
for (const r of Object.values(prev) as { level: number; score: number }[]) scoreOf.set(r.level, r.score);

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
let prevHard = 0;
for (const row of order) {
    const blockNormals = () => rows.filter((r) => r.block === row.block && r.role === 'normal').map((r) => scoreOf.get(r.level) ?? r.target);
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
        if (row.role === 'hard') prevHard = scoreOf.get(row.level) ?? prevHard;
        results.set(row.level, prev[row.level]);
        continue;
    }
    let best = build(row, target, accept, 6);
    if (best && !accept(best.m.score)) best = build(row, target, accept, 20) ?? best;
    if (!best) { console.error(`L${row.level} ${row.art}: no solvable layout`); process.exitCode = 1; continue; }
    const L = best.level;
    L.difficulty = Math.max(1, Math.min(5, Math.round(best.m.score / 20) + 1));
    L.status = 'WIP';
    L.category = row.role;
    if (row.tutorial) L.tutorial = row.tutorial;
    const svg = parseSvg(readFileSync(`${ROOT}art/levels/${row.file}`, 'utf8'));
    const fr = strokeFrame(svg.strokes, 700);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    L.source = { image: `art/levels/${row.file}`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(svg.width * fr.k), h: r1(svg.height * fr.k) }, pairs: row.pairs, colors: row.colours };
    writeFileSync(`${ROOT}levels/${L.id}.json`, json(L));
    scoreOf.set(row.level, best.m.score);
    if (row.role === 'hard') prevHard = best.m.score;
    results.set(row.level, { ...row, plannedPairs: row.pairs, plannedColours: row.colours, bigDotsPlan: row.bigDots, id: L.id, effectiveTarget: target, rulesOk: accept(best.m.score), strokes: best.strokes, bigStrokes: best.bigStrokes, ...best.m, stats: best.stats, warnings: best.warnings });
    console.log(`L${String(row.level).padStart(3)} ${row.role.padEnd(8)} ${row.art.padEnd(16)} target ${String(target).padStart(2)} -> ${String(best.m.score).padStart(2)}${accept(best.m.score) ? '' : ' (RULE MISS)'}  pairs ${row.pairs}->${best.m.pairs}  depth ${best.m.depth}  traps ${best.m.traps}  big ${best.m.bigDots}`);
}
for (const row of rows) { ids.push(idOf(row.level)); report.push(results.get(row.level)); }
// Remove level files of this system that are no longer in the plan (e.g. after reordering art).
for (const f of readdirSync(`${ROOT}levels`)) if (/^\d{3}-.+\.json$/.test(f) && !ids.includes(f.slice(0, -5)) && !only.length) unlinkSync(`${ROOT}levels/${f}`);

// Collections: Main first (the game plays the first collection), keep the others.
const colFile = `${ROOT}collections.json`;
const cols: { name: string; version: number; levels: string[] }[] = existsSync(colFile) ? JSON.parse(readFileSync(colFile, 'utf8')).collections ?? [] : [];
const main = cols.find((c) => c.name === COLLECTION);
writeFileSync(colFile, json({ collections: [{ name: COLLECTION, version: main?.version ?? 1, levels: ids }, ...cols.filter((c) => c.name !== COLLECTION)] }));
const colDir = `${ROOT}collections/${COLLECTION}/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => { const f = `${ROOT}levels/${id}.json`; if (existsSync(f)) writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(f, 'utf8')); });
writeFileSync(reportFile, json({ generated: new Date().toISOString().slice(0, 10), levels: report }));
console.log(`Done: ${ids.length} levels, collection "${COLLECTION}", design/level-report.json`);
