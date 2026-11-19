// Chapter 6 (levels/chapter-6/): every level of the game's play order (levels/game.json) built again
// from its own source picture with today's generator: stroke mode (big dots from drawn circles too)
// and colours by family (palette FAMILIES: lines near each other never share a family, as many
// colours as possible). Each level keeps its name, tutorial and category; its X / T cross lines (the
// tutorials' overlap pattern) are made again in the same numbers.
//
// Run: npm run levels:chapter6
//
// The levels in their own chapters are not touched and levels/game.json is not changed: chapter 6 is
// a new copy. Building it again rewrites chapter 6. When the play order already points at chapter 6,
// its levels are read (with their pictures) before the chapter is cleared; a chapter-6 level that is
// missing is taken from another chapter with the same id (its original).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { Level, dataChecks, newLevel, parseLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { colourPairs, rng, strokeFrame } from '../src/core/generator';
import { crossChecks, generateOverlap, PatternStyle } from '../src/core/overlap';
import { generateStrokes, strokeWorldSize } from '../src/core/strokemode';
import { parseSvg } from '../src/core/svg';
import { traceImage, Stroke } from '../src/core/trace';
import { loadRGBA } from './png';

const ROOT = `${process.cwd()}/`;
const CHAPTER = 'chapter-6';
const LV = `${ROOT}levels/${CHAPTER}/`;
const TMP = `${ROOT}node_modules/.cache/chapter6/`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const r1 = (v: number) => Math.round(v * 10) / 10;

const order: string[] = JSON.parse(readFileSync(`${ROOT}levels/game.json`, 'utf8')).levels;
/** A play-order entry -> its level file (a missing chapter-6 level: the same id in another chapter). */
const levelFile = (entry: string): { chapter: string; id: string } | null => {
    const [chapter, id] = entry.split('/');
    if (existsSync(`${ROOT}levels/${chapter}/${id}.json`)) return { chapter, id };
    if (chapter !== CHAPTER) return null;
    const other = readdirSync(`${ROOT}levels`).filter((c) => c !== CHAPTER && !c.endsWith('-ref') && existsSync(`${ROOT}levels/${c}/${id}.json`));
    return other.length ? { chapter: other[0], id } : null;
};
// Everything read first (chapter 6 may be among the sources), then chapter 6 is cleared.
const sources = order.map((entry) => {
    const f = levelFile(entry);
    if (!f || f.id === '*') return { entry, missing: true as const };
    const raw = JSON.parse(readFileSync(`${ROOT}levels/${f.chapter}/${f.id}.json`, 'utf8'));
    const image: string | undefined = raw.source?.image;
    const imgPath = !image ? '' : image.startsWith('art/') ? `${ROOT}${image}` : `${ROOT}levels/${f.chapter}/${image}`;
    return { entry, missing: false as const, chapter: f.chapter, id: f.id, raw, image, imgPath, bytes: imgPath && existsSync(imgPath) ? readFileSync(imgPath) : null };
});
rmSync(LV, { recursive: true, force: true });
mkdirSync(LV, { recursive: true });
const ids: string[] = [];
const report: unknown[] = [];

sources.forEach((S, i) => {
    const entry = S.entry;
    if (S.missing) { console.log(`skip ${entry}: no level file`); return; }
    const id = S.id;
    const old = parseLevel(S.raw);
    const src = (old.source ?? {}) as { image?: string; pairs?: number; difficulty?: number; dot?: number; big?: boolean; x?: number; t?: number; pattern?: string };
    if (!S.image) { console.log(`skip ${entry}: no source picture`); return; }
    if (!S.bytes) { console.log(`skip ${entry}: ${S.imgPath} missing`); return; }
    // The picture -> strokes, as the editor reads it (a PNG goes through a temporary copy for sips).
    const svg = S.imgPath.endsWith('.svg');
    let strokes: Stroke[], w: number, h: number;
    if (svg) {
        const d = parseSvg(S.bytes.toString('utf8'));
        strokes = d.strokes; w = d.width; h = d.height;
    } else {
        mkdirSync(TMP, { recursive: true });
        const tmp = `${TMP}${id}.png`;
        writeFileSync(tmp, S.bytes);
        const p = loadRGBA(tmp, TMP);
        strokes = traceImage(p.rgba, p.w, p.h); w = p.w; h = p.h;
    }
    const base = svg ? src.pairs ?? strokes.length : strokes.length;
    const x = src.x ?? 0, t = src.t ?? 0, gd = src.difficulty ?? 3;
    const size = Math.max(strokeWorldSize(strokes, base), 22 * 2 * 16);
    const seed = (i + 1) * 7919;
    const cands = generateStrokes(strokes, { pairs: base, colors: 28, difficulty: gd, seed, size, tries: 8, keep: 3, fill: false, radius: src.dot ?? 16, bigDots: src.big ?? true });
    let best: { L: Level; cost: number; warns: string[]; c: (typeof cands)[number]; m: ReturnType<typeof difficulty> } | null = null;
    cands.forEach((c, ci) => {
        let pairs = structuredClone(c.pairs);
        if (x + t > 0) {
            const [o] = generateOverlap(pairs, { x, t, difficulty: gd, style: (src.pattern ?? 'auto') as PatternStyle, seed: seed + ci * 977, tries: 5, keep: 1 });
            if (o) pairs = [...pairs, ...o.pairs];
        }
        colourPairs(pairs, 28, rng(seed + ci));
        const L = newLevel(id, old.name);
        L.pairs = pairs;
        if (old.tutorial) L.tutorial = old.tutorial;
        if (old.category) L.category = old.category;
        L.status = 'WIP';
        const m = difficulty(L);
        const warns = [...dataChecks(L), ...crossChecks(L.pairs)].filter((k) => k.level === 'warn').map((k) => k.text);
        let cost = (m.solvable ? 0 : 1000) + 100 * warns.length + 10 * c.stats.lost + c.score;
        // Tutorials: tapping wants every dot free; bumping wants at least one dot that is blocked.
        if (old.tutorial === 'tap' && m.depth > 1) cost += 500;
        if (old.tutorial === 'collision' && m.depth < 2) cost += 500;
        if (!best || cost < best.cost) best = { L, cost, warns, c, m };
    });
    if (!best) { console.log(`skip ${entry}: no layout`); return; }
    const { L, warns, c, m } = best as NonNullable<typeof best>;
    L.difficulty = Math.max(1, Math.min(5, Math.round(m.score / 20) + 1));
    const ext = svg ? 'svg' : 'png';
    const fr = strokeFrame(strokes, c.stats.size);
    L.source = {
        image: `${id}.${ext}`, rect: { x: r1(-fr.cx * fr.k), y: r1(-fr.cy * fr.k), w: r1(w * fr.k), h: r1(h * fr.k) },
        pairs: base, colors: 28, difficulty: gd, mode: 'strokes', dot: src.dot ?? 16, big: src.big ?? true,
        ...(x + t > 0 ? { x, t, pattern: src.pattern ?? 'auto' } : {})
    } as Level['source'];
    writeFileSync(`${LV}${id}.json`, json(L));
    writeFileSync(`${LV}${id}.${ext}`, S.bytes);
    ids.push(id);
    const colours = new Set(L.pairs.map((p) => p.color)).size;
    report.push({ n: ids.length, from: entry, id, pairs: L.pairs.length, colours, big: c.stats.bigDots, lost: c.stats.lost, solvable: m.solvable, difficulty: L.difficulty, warnings: [...c.warnings, ...warns] });
    console.log(`${String(ids.length).padStart(2)} ${entry.padEnd(34)} → ${String(L.pairs.length).padStart(3)} lines, ${String(colours).padStart(2)} colours, ${c.stats.bigDots} big, lost ${c.stats.lost}${m.solvable ? '' : ' UNSOLVABLE'}${warns.length ? ` WARN ${warns.join('; ')}` : ''}`);
});

// Collection "Main" in the play order, with its numbered copies.
writeFileSync(`${LV}collections.json`, json({ collections: [{ name: 'Main', version: 1, levels: ids }] }));
const colDir = `${LV}collections/Main/`;
mkdirSync(colDir, { recursive: true });
ids.forEach((id, k) => writeFileSync(`${colDir}${String(k + 1).padStart(3, '0')}_${id}.json`, readFileSync(`${LV}${id}.json`, 'utf8')));
writeFileSync(`${ROOT}node_modules/.cache/chapter6-report.json`, json({ generated: new Date().toISOString().slice(0, 10), levels: report }));
console.log(`Done: ${ids.length} level(s) in levels/${CHAPTER}/ (collection "Main")`);
