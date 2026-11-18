// Chapter 4 (levels/chapter-4/): 10 test levels from drawings made to research/image_requirement.md
// (tools/chapter4-art.ts), built with generator stroke mode: one line per stroke of the drawing.
// Writes art/chapter-4/NNN_<id>.svg (kept if present; -- --force redraws them from the code),
// the levels, the "Main" collection and design/chapter-4-report.json.
// Run: npm run levels:chapter4   (optional: -- 3 7  to rebuild only those levels)
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { strokeFrame } from '../src/core/generator';
import { generateStrokes, strokeTargets } from '../src/core/strokemode';
import { parseSvg } from '../src/core/svg';
import { DRAWINGS } from './chapter4-art';
import { toSvg } from './stroke-art';

const ROOT = `${process.cwd()}/`;
const CHAPTER = 'chapter-4';
const LV = `${ROOT}levels/${CHAPTER}/`;
const ART = `${ROOT}art/${CHAPTER}/`;
const force = process.argv.includes('--force');
const only = process.argv.slice(2).map(Number).filter(Boolean);
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
mkdirSync(LV, { recursive: true });
mkdirSync(ART, { recursive: true });

const rows = DRAWINGS.map((d, i) => ({ level: i + 1, ...d, file: `${String(i + 1).padStart(3, '0')}_${d.id}.svg`, id: `c4-${String(i + 1).padStart(3, '0')}-${d.id}` }));
for (const r of rows) if (force || !existsSync(ART + r.file)) writeFileSync(ART + r.file, toSvg(r.draw(), `Chapter 4 · level ${r.level} · ${r.name}`));

const reportFile = `${ROOT}design/chapter-4-report.json`;
const prev: Record<number, unknown> = existsSync(reportFile) ? Object.fromEntries((JSON.parse(readFileSync(reportFile, 'utf8')).levels as ({ level: number } | null)[]).filter((x): x is { level: number } => !!x).map((x) => [x.level, x])) : {};
const report: unknown[] = [];
for (const r of rows) {
    if (only.length && !only.includes(r.level)) { report.push(prev[r.level] ?? null); continue; }
    const svg = parseSvg(readFileSync(ART + r.file, 'utf8'));
    const lines = svg.strokes.length;
    const gd = r.tier === 'hard' ? 4 : 3;
    const colours = r.tier === 'hard' ? 11 : 10;
    // image_requirement.md: dot diameter ≈ 1/30 of the long side (normal), 1/40 (hard). Dot = 32 px.
    const size = r.tier === 'hard' ? 1350 : 1000;
    const [c] = generateStrokes(svg.strokes, { pairs: lines, colors: colours, difficulty: gd, seed: r.level * 7919, size, tries: 12, keep: 1 });
    const L = newLevel(r.id, r.name);
    L.pairs = c.pairs;
    L.status = 'WIP';
    L.category = r.tier;
    const m = difficulty(L);
    L.difficulty = Math.max(1, Math.min(5, Math.round(m.score / 20) + 1));
    const fr = strokeFrame(svg.strokes, c.stats.size); // the generator may have grown the world
    const r1 = (v: number) => Math.round(v * 10) / 10;
    L.source = { image: `art/${CHAPTER}/${r.file}`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(svg.width * fr.k), h: r1(svg.height * fr.k) }, pairs: lines, colors: colours, difficulty: gd, mode: 'strokes' };
    writeFileSync(`${LV}${L.id}.json`, json(L));
    const st = c.stats, tg = strokeTargets(gd);
    const warns = dataChecks(L).filter((k) => k.level === 'warn').map((k) => k.text);
    report.push({ level: r.level, id: L.id, name: r.name, tier: r.tier, strokes: lines, stats: st, targets: tg, score: m.score, solvable: m.solvable, warnings: [...c.warnings, ...warns] });
    const pc = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
    console.log(`L${String(r.level).padStart(2)} ${r.tier.padEnd(6)} ${r.id.padEnd(22)} lines ${String(st.lines).padStart(2)} | on line ${pc(st.tDots)} free ${pc(st.freeDots)} side ${pc(st.touchingDots)} | open ${pc(st.openShare)} (${pc(tg.open)}) blocks ${st.blocksPerLine.toFixed(2)} (${tg.blocks}) depth ${st.depth} cross ${st.crossingsPerLine.toFixed(2)} | pulled ${st.pulledBack} ext ${st.extended} | score ${m.score} ${m.solvable ? '' : 'UNSOLVABLE'} ${[...c.warnings, ...warns].join('; ')}`);
}
const ids = rows.map((r) => r.id);
if (!only.length) for (const f of readdirSync(LV)) if (/^c4-\d{3}-.+\.json$/.test(f) && !ids.includes(f.slice(0, -5))) unlinkSync(LV + f);
writeFileSync(`${LV}collections.json`, json({ collections: [{ name: 'Main', version: 1, levels: ids }] }));
const colDir = `${LV}collections/Main/`;
mkdirSync(colDir, { recursive: true });
for (const f of readdirSync(colDir)) unlinkSync(colDir + f);
ids.forEach((id, i) => { const f = `${LV}${id}.json`; if (existsSync(f)) writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(f, 'utf8')); });
writeFileSync(reportFile, json({ generated: new Date().toISOString().slice(0, 10), chapter: CHAPTER, levels: report }));
console.log(`Done: ${ids.length} levels in levels/${CHAPTER}/, drawings in art/${CHAPTER}/`);
