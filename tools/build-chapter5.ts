// Chapter 5 (levels/chapter-5/): levels from public-domain OpenClipart line art (art/openclipart/,
// see SOURCES.md), built with generator stroke mode.
// Each PNG is traced exactly like the level editor does it (composited on white, scaled to 600 px
// on the long side, threshold, round details, thinning, chains joined into strokes). Node has no
// canvas, so the PNG is first converted to an uncompressed BMP with macOS `sips`.
//
// Run: npm run levels:chapter5 -- 15-33     (image numbers: "15-33", "15 16 20", ...)
//
// Only the named images are built. The chapter is the designer's: nothing else in it is touched.
// A new level is appended to the end of the "Main" collection (with its numbered copy); a level
// that is already in the collection is rewritten in place.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'fs';
import { dataChecks, newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { strokeFrame } from '../src/core/generator';
import { generateStrokes, strokeTargets, strokeWorldSize } from '../src/core/strokemode';
import { traceImage } from '../src/core/trace';
import { loadRGBA } from './png';

const ROOT = `${process.cwd()}/`;
const CHAPTER = 'chapter-5';
const LV = `${ROOT}levels/${CHAPTER}/`;
const SRC = `${ROOT}art/openclipart/`;
const TMP = `${ROOT}node_modules/.cache/chapter5/`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

// Which images: "15-33" ranges and single numbers.
const wanted = new Set<number>();
for (const a of process.argv.slice(2))
    for (const part of a.split(',')) {
        const m = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const lo = +m[1], hi = m[2] ? +m[2] : lo;
        for (let n = lo; n <= hi; n++) wanted.add(n);
    }
if (!wanted.size) {
    console.error('Name the images to build, e.g.  npm run levels:chapter5 -- 15-33');
    process.exit(1);
}
mkdirSync(LV, { recursive: true });
mkdirSync(TMP, { recursive: true });

// Titles from SOURCES.md (| NN_name | Title | ...).
const titles = new Map<string, string>();
for (const line of readFileSync(`${SRC}SOURCES.md`, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*(\d\d_[\w-]+)\s*\|\s*([^|]+?)\s*\|/);
    if (m) titles.set(m[1], m[2]);
}
const nice = (file: string) => file.slice(3).split('-').map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
const rows = readdirSync(SRC)
    .filter((f) => /^\d\d_[\w-]+\.png$/.test(f))
    .map((f) => f.slice(0, -4))
    .map((file) => ({ file, n: +file.slice(0, 2), name: nice(file), id: `c5-${file.slice(0, 2).padStart(3, '0')}-${file.slice(3)}` }))
    .filter((r) => wanted.has(r.n))
    .sort((a, b) => a.n - b.n);

const reportFile = `${ROOT}design/chapter-5-report.json`;
const report: Record<string, unknown> = existsSync(reportFile) ? Object.fromEntries(((JSON.parse(readFileSync(reportFile, 'utf8')).levels ?? []) as ({ id?: string } | null)[]).filter((x): x is { id: string } => !!x?.id).map((x) => [x.id, x])) : {};
const colFile = `${LV}collections.json`;
const cols = existsSync(colFile) ? JSON.parse(readFileSync(colFile, 'utf8')) as { collections: { name: string; version: number; levels: string[] }[] } : { collections: [] };
let main = cols.collections.find((c) => c.name === 'Main');
if (!main) cols.collections.push((main = { name: 'Main', version: 1, levels: [] }));

for (const r of rows) {
    const png = `${SRC}${r.file}.png`;
    const { rgba, w, h } = loadRGBA(png, TMP);
    const strokes = traceImage(rgba, w, h);
    const traced = strokes.length;
    const hard = traced >= 45;
    const gd = hard ? 4 : 3, colours = hard ? 11 : 10;
    // Same as the editor's Generate: world size from the line density, grown when the strokes need room.
    const size = Math.max(strokeWorldSize(strokes, traced), 22 * 2 * 16);
    const [c] = generateStrokes(strokes, { pairs: traced, colors: colours, difficulty: gd, seed: r.n * 7919, size, tries: 8, keep: 1, fill: false, radius: 16, bigDots: true });
    const L = newLevel(r.id, r.name);
    L.pairs = c.pairs;
    L.status = 'WIP';
    L.category = hard ? 'hard' : 'normal';
    const m = difficulty(L);
    L.difficulty = Math.max(1, Math.min(5, Math.round(m.score / 20) + 1));
    const fr = strokeFrame(strokes, c.stats.size);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    L.source = { image: `${L.id}.png`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(w * fr.k), h: r1(h * fr.k) }, pairs: traced, colors: colours, difficulty: gd, mode: 'strokes', dot: 16, big: true };
    writeFileSync(`${LV}${L.id}.json`, json(L));
    copyFileSync(png, `${LV}${L.id}.png`); // the editor shows it under the level (Image)
    if (!main.levels.includes(L.id)) main.levels.push(L.id);
    const st = c.stats, tg = strokeTargets(gd);
    const warns = dataChecks(L).filter((k) => k.level === 'warn').map((k) => k.text);
    report[L.id] = { level: r.n, id: L.id, name: r.name, title: titles.get(r.file), source: `art/openclipart/${r.file}.png`, tier: L.category, strokes: traced, stats: st, targets: tg, score: m.score, solvable: m.solvable, warnings: [...c.warnings, ...warns] };
    const pc = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
    console.log(`${String(r.n).padStart(2)} ${L.category!.padEnd(6)} ${r.id.padEnd(26)} strokes ${String(traced).padStart(3)} → lines ${String(st.lines).padStart(3)} lost ${String(st.lost).padStart(2)} big ${st.bigDots} board ${st.size} | on line ${pc(st.tDots)} free ${pc(st.freeDots)} | open ${pc(st.openShare)} (${pc(tg.open)}) blocks ${st.blocksPerLine.toFixed(2)} depth ${st.depth} | score ${m.score} ${m.solvable ? '' : 'UNSOLVABLE '}${[...c.warnings, ...warns].join('; ')}`);
}
writeFileSync(colFile, json(cols));
// Numbered copies (collections/Main/NNN_<id>.json) for the levels built now.
const colDir = `${LV}collections/${main.name}/`;
mkdirSync(colDir, { recursive: true });
main.levels.forEach((id, i) => {
    if (!rows.some((r) => r.id === id)) return;
    writeFileSync(`${colDir}${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(`${LV}${id}.json`, 'utf8'));
});
writeFileSync(reportFile, json({ generated: new Date().toISOString().slice(0, 10), chapter: CHAPTER, levels: Object.values(report) }));
console.log(`Done: ${rows.length} level(s) in levels/${CHAPTER}/ (collection "${main.name}" now has ${main.levels.length})`);
