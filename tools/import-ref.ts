// RESEARCH ONLY. Converts the reference levels the designer extracted for study (JSON of "tapes":
// Bezier knots, offset, colour id, endpoint size) 1:1 into this editor's level format, as the
// chapter levels/chapter-2-ref/. That folder is gitignored and skipped by the game build
// (src/game/source.ts ignores levels/*-ref/), so the levels stay on this machine: open them in the
// level editor to study them. Do not ship them: they belong to their original publisher.
//
// Run: npm run levels:import-ref -- <folder with levelNNN.json, LevelConfig.json, LevelSchemes.json>
//      (the folder that holds levels/ and the config files, e.g. .../line_tangle_analysis/data)
//
// Geometry: knot positions + tape offset; tangents rotated by the knot's quaternion; y flipped.
// Scale: their pin blocks a path within ballRadius 0.2 + 0.1 x size; our dots block within
// (rA + rB) x HIT_SCALE. With our dot radius = 0.17 units x size (scale 16 / 0.17 px per unit) the
// two rules match exactly; dots look ~15% smaller than in the original.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { DEFAULT_RADIUS, Level, Pair, newLevel } from '../src/core/level';
import { Anchor } from '../src/core/path';
import { solve } from '../src/core/solver';

const SRC = process.argv[2];
if (!SRC || !existsSync(`${SRC}/levels`)) {
    console.error('Usage: npm run levels:import-ref -- <data folder containing levels/levelNNN.json>');
    process.exit(1);
}
const OUT = `${process.cwd()}/levels/chapter-2-ref/`;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const PX = DEFAULT_RADIUS / 0.17; // px per unit
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Their colour ids -> our palette (closest hue). */
const COLOUR: Record<string, string> = {
    blue1: 'blue', blue2: 'light_blue', red1: 'red', green1: 'green', green2: 'dark_green', orange1: 'orange',
    brown1: 'brown', purple1: 'purple', pink1: 'pink', yellow1: 'yellow', gray1: 'grey'
};
const CATEGORY = ['normal', 'hard', 'very hard', 'super hard'];

type V3 = [number, number, number];
interface Knot { p: V3; tin: V3; tout: V3; rot: [number, number, number, number] }
interface Tape { id: string; fixedColorId: string; endpointSize: [number, number]; offset: V3; knots: Knot[] }
interface RefLevel { level: number; name: string; tutorial?: { tutorialType: number }; tapes: Tape[] }

/** v rotated by quaternion q = (x, y, z, w). */
function qrot(q: Knot['rot'], v: V3): V3 {
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

function toPair(t: Tape, index: number): Pair {
    const [ox, oy] = t.offset;
    const P = (x: number, y: number) => ({ x: r1((x + ox) * PX), y: r1(-(y + oy) * PX) });
    const path: Anchor[] = t.knots.map((k, i) => {
        const a: Anchor = P(k.p[0], k.p[1]);
        if (i > 0) { const d = qrot(k.rot, k.tin); a.in = P(k.p[0] + d[0], k.p[1] + d[1]); }
        if (i < t.knots.length - 1) { const d = qrot(k.rot, k.tout); a.out = P(k.p[0] + d[0], k.p[1] + d[1]); }
        // Drop zero-length handles (straight segments).
        if (a.in && a.in.x === a.x && a.in.y === a.y) delete a.in;
        if (a.out && a.out.x === a.x && a.out.y === a.y) delete a.out;
        return a;
    });
    const ends = [path[0], path[path.length - 1]];
    const r = (s: number) => r1(DEFAULT_RADIUS * (s || 1));
    return { id: `t${String(index + 1).padStart(3, '0')}`, color: COLOUR[t.fixedColorId] ?? 'black', a: { x: ends[0].x, y: ends[0].y, r: r(t.endpointSize[0]) }, b: { x: ends[1].x, y: ends[1].y, r: r(t.endpointSize[1]) }, path };
}

const difficultyOf = new Map<number, number>();
if (existsSync(`${SRC}/LevelConfig.json`))
    for (const r of JSON.parse(readFileSync(`${SRC}/LevelConfig.json`, 'utf8')).resources as { address: string; difficulty: number }[]) difficultyOf.set(+r.address.replace('level', ''), r.difficulty);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const files = readdirSync(`${SRC}/levels`).filter((f) => /^level\d+\.json$/.test(f)).sort();
const idOf = (n: number) => `ref-${String(n).padStart(3, '0')}`;
let unsolvable: number[] = [];
for (const f of files) {
    const src = JSON.parse(readFileSync(`${SRC}/levels/${f}`, 'utf8')) as RefLevel;
    const L: Level = newLevel(idOf(src.level), `Ref ${src.level}`);
    // Draw order: their offset.z (higher = on top); ours = array order.
    const tapes = [...src.tapes].sort((a, b) => a.offset[2] - b.offset[2]);
    L.pairs = tapes.map(toPair);
    const d = difficultyOf.get(src.level) ?? 0;
    L.category = CATEGORY[d] ?? 'normal';
    L.status = 'ARCHIVE';
    const tut = src.tutorial?.tutorialType;
    if (tut === 1) L.tutorial = 'tap';
    if (tut === 2) L.tutorial = 'collision';
    if (!solve(L).solvable) unsolvable.push(src.level);
    writeFileSync(`${OUT}${L.id}.json`, json(L));
}

// Collections: the default playlist first (play order), then every level by number.
const cols: { name: string; version: number; levels: string[] }[] = [];
if (existsSync(`${SRC}/LevelSchemes.json`)) {
    const sch = JSON.parse(readFileSync(`${SRC}/LevelSchemes.json`, 'utf8'));
    const def = sch.schemes.find((s: { id: number }) => s.id === sch.defaultSchemeId) ?? sch.schemes[0];
    cols.push({ name: 'Playlist', version: 1, levels: def.levels.map((l: { address: string }) => idOf(+l.address.replace('level', ''))) });
}
cols.push({ name: 'All', version: 1, levels: files.map((f) => idOf(+f.match(/\d+/)![0])) });
writeFileSync(`${OUT}collections.json`, json({ collections: cols }));
for (const c of cols) {
    mkdirSync(`${OUT}collections/${c.name}`, { recursive: true });
    c.levels.forEach((id, i) => { if (existsSync(`${OUT}${id}.json`)) writeFileSync(`${OUT}collections/${c.name}/${String(i + 1).padStart(3, '0')}_${id}.json`, readFileSync(`${OUT}${id}.json`, 'utf8')); });
}
console.log(`Imported ${files.length} levels to levels/chapter-2-ref/ (gitignored, not in game builds). Collections: ${cols.map((c) => `${c.name} (${c.levels.length})`).join(', ')}.`);
console.log(`Unsolvable with our blocking rule: ${unsolvable.length ? unsolvable.join(', ') : 'none'}`);
