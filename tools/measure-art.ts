// Measures how much blocking structure each drawing can produce: best difficulty score at a
// reference size (20 pairs, 6 colours), sweeping the crossing-block dial. Used to order the
// drawing pools from simple to structured. Run: npm run art:measure
import { readFileSync } from 'fs';
import { ART } from './art-library';
import { newLevel } from '../src/core/level';
import { difficulty } from '../src/core/difficulty';
import { generate } from '../src/core/generator';
import { parseSvg } from '../src/core/svg';
import { POOLS } from './art-library';
import { plan } from './level-plan';

const files = new Map(plan().map((r) => [r.art, r.file]));
const out: Record<string, { lo: number; hi: number }> = {};
for (const key of Object.keys(ART)) {
    const svg = parseSvg(readFileSync(`${process.cwd()}/art/levels/${files.get(key)}`, 'utf8'));
    let lo = 999, hi = 0;
    for (const crossBlocks of [0, 0.5, 1]) for (const c of generate(svg.strokes, { pairs: 20, colors: 6, difficulty: 3, seed: 1, tries: 8, keep: 8, crossBlocks })) {
        const L = newLevel('m', 'm'); L.pairs = c.pairs;
        const m = difficulty(L);
        if (!m.solvable) continue;
        lo = Math.min(lo, m.score); hi = Math.max(hi, m.score);
    }
    out[key] = { lo, hi };
}
for (const pool of ['relax', 'normal', 'hard'] as const) {
    const sorted = [...POOLS[pool]].sort((a, b) => out[a].hi - out[b].hi);
    console.log(`${pool}: ${sorted.map((k) => `${k}(${out[k].lo}-${out[k].hi})`).join(' ')}`);
    console.log(`${pool}_ORDER=${JSON.stringify(sorted)}`);
}
