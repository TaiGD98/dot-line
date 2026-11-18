// Level file format (docs/guide/editor.md, section 1.2). Read directly by the game.
import { PALETTE, RETIRED_COLOURS, colour } from './palette';
import { Anchor, Pt, dist, samplePath } from './path';

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
    /**
     * Set on lines added by generator part 2 (overlap), absent on base lines:
     * 'x' = crosses other lines, both dots in empty space; 't' = one dot sits on another pair's line.
     */
    cross?: 'x' | 't';
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
    /** Generator input: the source image/SVG file, its world rectangle (for the editor overlay) and settings. */
    source?: { image?: string; rect?: { x: number; y: number; w: number; h: number }; pairs?: number; colors?: number; difficulty?: number; x?: number; t?: number; pattern?: string; mode?: 'strokes' | 'cut'; /** Radius of the normal dots. */ dot?: number; /** Round details become big dots. */ big?: boolean };
    /** Tutorial shown by the game on this level. */
    tutorial?: 'tap' | 'collision' | 'zoom';
    pairs: Pair[];
    /** Reserved for future obstacles (always empty for now). */
    obstacles: unknown[];
}

export const DEFAULT_RADIUS = 16;
/** Smallest dot allowed (designer): the generator's dot size and the editor's sliders stop here. */
export const MIN_RADIUS = 11;
/** A dot at least this many times the level's normal dot is a big dot (a round detail of the drawing). */
export const BIG_DOT = 1.15;

/** The level's normal dot radius: the most common one. */
export function mainRadius(pairs: Pair[]): number {
    const count = new Map<number, number>();
    for (const p of pairs) for (const d of [p.a, p.b]) count.set(d.r, (count.get(d.r) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? DEFAULT_RADIUS;
}
/** Every line has the same width; only the dots change size. */
export const LINE_WIDTH = 5.1;

export function newLevel(id: string, name: string): Level {
    return { schema: LEVEL_SCHEMA, version: LEVEL_VERSION, id, name, status: 'WIP', difficulty: null, category: '', rev: 0, pairs: [], obstacles: [] };
}

/** Accepts anything that parses as JSON and returns a level, or throws with a readable message. */
function parseRaw(data: unknown): Level {
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

/** Accepts anything that parses as JSON and returns a level, or throws with a readable message. Retired colours are replaced. */
export function parseLevel(data: unknown): Level {
    const level = parseRaw(data);
    retireColours(level.pairs);
    return level;
}

/**
 * Gives every pair in a retired colour (white, grey) a palette colour that no line near it uses,
 * preferring colours the level already has (so the number of colours stays the same).
 */
export function retireColours(pairs: Pair[]): void {
    const retired = new Set(RETIRED_COLOURS.map((c) => c.name));
    if (!pairs.some((p) => retired.has(p.color))) return;
    const GAP = 40;
    const lines = pairs.map((p) => samplePath(p.path, 8));
    const box = lines.map((l) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of l) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        return [x0 - GAP, y0 - GAP, x1 + GAP, y1 + GAP];
    });
    const near = (i: number, j: number) => {
        const a = box[i], b = box[j];
        if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) return false;
        for (const p of lines[i]) for (const q of lines[j]) if (Math.abs(p.x - q.x) < GAP + 6 && Math.hypot(p.x - q.x, p.y - q.y) < GAP + 6) return true;
        return false;
    };
    const used = new Map<string, number>();
    for (const p of pairs) if (!retired.has(p.color)) used.set(p.color, (used.get(p.color) ?? 0) + 1);
    pairs.forEach((p, i) => {
        if (!retired.has(p.color)) return;
        const around = new Map<string, number>();
        pairs.forEach((o, j) => { if (j !== i && !retired.has(o.color) && near(i, j)) around.set(o.color, (around.get(o.color) ?? 0) + 1); });
        // Free near this line first, then already in the level, then the least used.
        const pick = PALETTE.map((c) => c.name).sort((a, b) => (around.get(a) ?? 0) - (around.get(b) ?? 0) || (used.has(a) ? 0 : 1) - (used.has(b) ? 0 : 1) || (used.get(a) ?? 0) - (used.get(b) ?? 0))[0];
        p.color = pick;
        used.set(pick, (used.get(pick) ?? 0) + 1);
    });
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

    const tiny = level.pairs.filter((p) => Math.min(p.a.r, p.b.r) < MIN_RADIUS);
    out.push(tiny.length
        ? { level: 'warn', text: `Dots smaller than the minimum (radius ${MIN_RADIUS}): ${tiny.map((p) => p.id).join(', ')}`, pairs: tiny.map((p) => p.id) }
        : { level: 'ok', text: `Dot sizes ≥ ${MIN_RADIUS}` });

    // One dot size per level; only big dots (round details of the drawing) are bigger.
    if (level.pairs.length) {
        const main = mainRadius(level.pairs);
        const big = dots.filter((x) => x.d.r >= main * BIG_DOT).length;
        const odd = level.pairs.filter((p) => [p.a, p.b].some((d) => d.r !== main && d.r < main * BIG_DOT));
        out.push(odd.length
            ? { level: 'info', text: `Dots are not all one size: most have radius ${main}, ${odd.length} pair(s) have other sizes (${odd.slice(0, 12).map((p) => p.id).join(', ')}${odd.length > 12 ? ', …' : ''})`, pairs: odd.map((p) => p.id) }
            : { level: 'ok', text: `One dot size (radius ${main})${big ? ` + ${big} big dot${big > 1 ? 's' : ''}` : ''}` });
    }

    if (!level.pairs.length) out.push({ level: 'warn', text: 'Level has no pairs' });
    return out;
}

export function nextPairId(level: Level): string {
    let n = level.pairs.length + 1;
    const ids = new Set(level.pairs.map((p) => p.id));
    while (ids.has(`p${n}`)) n++;
    return `p${n}`;
}
