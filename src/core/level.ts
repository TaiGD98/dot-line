// Level file format (docs/guide/editor.md, section 1.2). Read directly by the game.
import { colour } from './palette';
import { Anchor, Pt, dist } from './path';

export const LEVEL_SCHEMA = 'dot-line-level';
export const LEVEL_VERSION = '1.0';

export type Status = 'WIP' | 'PROD' | 'ARCHIVE';

export interface Dot extends Pt {
    r: number;
}

export interface Pair {
    id: string;
    color: string;
    a: Dot;
    b: Dot;
    path: Anchor[];
}

export interface Level {
    schema: string;
    version: string;
    id: string;
    name: string;
    status?: Status;
    difficulty?: number | null;
    category?: string;
    /** Save counter, bumped by the editor on each Save. */
    rev?: number;
    source?: { image?: string; pairs?: number; colors?: number };
    pairs: Pair[];
    /** Reserved for future obstacles (always empty for now). */
    obstacles: unknown[];
}

export const DEFAULT_RADIUS = 16;

export function newLevel(id: string, name: string): Level {
    return { schema: LEVEL_SCHEMA, version: LEVEL_VERSION, id, name, status: 'WIP', difficulty: null, category: '', rev: 0, pairs: [], obstacles: [] };
}

/** Accepts anything that parses as JSON and returns a level, or throws with a readable message. */
export function parseLevel(data: unknown): Level {
    const l = data as Partial<Level>;
    if (!l || typeof l !== 'object') throw new Error('Not a JSON object');
    if (l.schema !== LEVEL_SCHEMA) throw new Error(`schema must be "${LEVEL_SCHEMA}"`);
    if (typeof l.id !== 'string' || !l.id) throw new Error('missing id');
    if (!Array.isArray(l.pairs)) throw new Error('missing pairs');
    return {
        ...newLevel(l.id, typeof l.name === 'string' ? l.name : l.id),
        ...l,
        pairs: l.pairs,
        obstacles: Array.isArray(l.obstacles) ? l.obstacles : []
    } as Level;
}

/** Keeps the path's first/last anchor glued to the dots (moving handles with them). */
export function syncEnds(p: Pair): void {
    if (p.path.length < 2) p.path = [{ x: p.a.x, y: p.a.y }, { x: p.b.x, y: p.b.y }];
    glue(p.path[0], p.a);
    glue(p.path[p.path.length - 1], p.b);
}

function glue(an: Anchor, d: Pt) {
    const dx = d.x - an.x, dy = d.y - an.y;
    if (!dx && !dy) return;
    an.x = d.x; an.y = d.y;
    if (an.in) an.in = { x: an.in.x + dx, y: an.in.y + dy };
    if (an.out) an.out = { x: an.out.x + dx, y: an.out.y + dy };
}

export function levelBounds(level: Level, pad = 40) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number, r = 0) => {
        x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r);
        x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r);
    };
    for (const p of level.pairs) {
        add(p.a.x, p.a.y, p.a.r); add(p.b.x, p.b.y, p.b.r);
        for (const an of p.path) add(an.x, an.y);
    }
    if (!isFinite(x0)) return { x: -200, y: -300, w: 400, h: 600 };
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export interface Check {
    level: 'ok' | 'warn' | 'info';
    text: string;
    pairs?: string[];
}

/** Basic data checks (editor spec 1.3). Solvability is added by the solver. */
export function dataChecks(level: Level): Check[] {
    const out: Check[] = [];
    const broken = level.pairs.filter((p) => !p.a || !p.b || p.path.length < 2 || dist(p.path[0], p.a) > 1 || dist(p.path[p.path.length - 1], p.b) > 1);
    out.push(broken.length
        ? { level: 'warn', text: `Line not joined to both dots: ${broken.map((p) => p.id).join(', ')}`, pairs: broken.map((p) => p.id) }
        : { level: 'ok', text: 'Every pair has 2 dots and a joined line' });

    const badColour = level.pairs.filter((p) => !colour(p.color));
    out.push(badColour.length
        ? { level: 'warn', text: `Colour not in palette: ${badColour.map((p) => p.id).join(', ')}`, pairs: badColour.map((p) => p.id) }
        : { level: 'ok', text: 'Colours in palette' });

    const dots = level.pairs.flatMap((p) => [{ id: p.id, d: p.a }, { id: p.id, d: p.b }]);
    const overlap = new Set<string>();
    for (let i = 0; i < dots.length; i++)
        for (let j = i + 1; j < dots.length; j++)
            if (dist(dots[i].d, dots[j].d) < dots[i].d.r + dots[j].d.r) { overlap.add(dots[i].id); overlap.add(dots[j].id); }
    out.push(overlap.size
        ? { level: 'warn', text: `Dots overlap: ${[...overlap].join(', ')}`, pairs: [...overlap] }
        : { level: 'ok', text: 'No overlapping dots' });

    if (!level.pairs.length) out.push({ level: 'warn', text: 'Level has no pairs' });
    return out;
}

export function nextPairId(level: Level): string {
    let n = level.pairs.length + 1;
    const ids = new Set(level.pairs.map((p) => p.id));
    while (ids.has(`p${n}`)) n++;
    return `p${n}`;
}
