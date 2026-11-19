// Colour palette of the game (GDD 3.7): dots and lines.

export interface PaletteColour {
    name: string;
    /** Dot and line colour. */
    base: string;
    /** Darkest key of the colour's shading ramp: the dot's rim (and the line's edge on a light board). */
    dark: string;
    /** Lit body of the dot. */
    gradient: string;
    /** Lightest key: highlight (and the line's edge on a dark board). */
    inner: string;
}

/**
 * Dot colours: the "Voxel_*" materials of the Cube Blast game (VoxelMaterials.json): _BaseColor and
 * the _RampKey shading ramp. White and Black are not used (they sink into the board).
 */
export const PALETTE: PaletteColour[] = [
    { name: 'blue', base: '#1020EB', dark: '#270B73', gradient: '#765DFF', inner: '#AC9BFF' },
    { name: 'brown', base: '#93592F', dark: '#5B2600', gradient: '#8E4E2C', inner: '#E7A379' },
    { name: 'cyan', base: '#2AC5F2', dark: '#1575BE', gradient: '#2DD1FF', inner: '#DAF7FF' },
    { name: 'dark_blue', base: '#0C3E7D', dark: '#042857', gradient: '#1E65BE', inner: '#69ABFF' },
    { name: 'dark_green', base: '#0A4414', dark: '#003508', gradient: '#0C821F', inner: '#34B94A' },
    { name: 'green', base: '#109616', dark: '#006314', gradient: '#1FA125', inner: '#3EDE45' },
    { name: 'lavender', base: '#B671F3', dark: '#6F18B9', gradient: '#DF99FF', inner: '#ECD5FF' },
    { name: 'light_green', base: '#B4F484', dark: '#357109', gradient: '#9FF85F', inner: '#C3FF96' },
    { name: 'light_orange', base: '#FFA461', dark: '#E26C2E', gradient: '#FFB88D', inner: '#FFD1B1' },
    { name: 'light_pink', base: '#FF97AF', dark: '#B02E4C', gradient: '#FFB3A7', inner: '#FFF5F2' },
    { name: 'light_yellow', base: '#FDE372', dark: '#A89314', gradient: '#EDE12C', inner: '#FFFDC6' },
    { name: 'lime', base: '#60E414', dark: '#2B6F00', gradient: '#50EE1C', inner: '#ACF79B' },
    { name: 'magenta', base: '#F00DE7', dark: '#B20398', gradient: '#FF36F7', inner: '#FFB3F6' },
    { name: 'maroon', base: '#73080A', dark: '#4B0002', gradient: '#891518', inner: '#D44548' },
    { name: 'navy', base: '#0C1465', dark: '#001276', gradient: '#197DFF', inner: '#C4EFFF' },
    { name: 'olive', base: '#936908', dark: '#6C4D00', gradient: '#C8A930', inner: '#FFE99E' },
    { name: 'olive_green', base: '#63A729', dark: '#2B3C00', gradient: '#6EA814', inner: '#C0EE98' },
    { name: 'orange', base: '#EC8C0F', dark: '#C88F25', gradient: '#FFD896', inner: '#FFF0C9' },
    { name: 'orange_red', base: '#F35021', dark: '#B04009', gradient: '#FF9B14', inner: '#FFF0A2' },
    { name: 'pink', base: '#FC547B', dark: '#892655', gradient: '#FFA5C9', inner: '#FFEDF4' },
    { name: 'purple', base: '#820EE8', dark: '#450080', gradient: '#811ED4', inner: '#E094FF' },
    { name: 'red', base: '#E5171B', dark: '#840005', gradient: '#FF4063', inner: '#FF8F95' },
    { name: 'sky_blue', base: '#0E6FE8', dark: '#0036B9', gradient: '#008BFF', inner: '#AEE2FF' },
    { name: 'spring_green', base: '#17E482', dark: '#006F4A', gradient: '#69FFB8', inner: '#CBFFE7' },
    { name: 'teal', base: '#04778E', dark: '#004F5E', gradient: '#10A2C3', inner: '#86F1FF' },
    { name: 'turquoise', base: '#13EDDB', dark: '#01707B', gradient: '#00FFF2', inner: '#94FFF8' },
    { name: 'yellow', base: '#FDD201', dark: '#E98E3F', gradient: '#FFED3D', inner: '#FFF9BF' },
    { name: 'yellow_green', base: '#A3F408', dark: '#527D00', gradient: '#C8F72D', inner: '#E8FF70' },
];

/** Line colour once a pair is cleared. */
export const COMPLETED_LINE = '#6977C2';

/**
 * Colours no longer used: they sink into the background. Levels that still have them (or any other
 * name that is not in the palette, e.g. from the old palette) get another colour when they are
 * loaded (retireColours in level.ts).
 */
export const RETIRED_COLOURS: PaletteColour[] = [
    { name: 'grey', base: '#888888', dark: '#555555', gradient: '#CFC9BC', inner: '#E4E0D9' },
    { name: 'black', base: '#000000', dark: '#1A1A1A', gradient: '#494949', inner: '#959595' },
    { name: 'white', base: '#FDFDFD', dark: '#87B7B9', gradient: '#FFFFFF', inner: '#FFFFFF' },
];

const byName = new Map([...PALETTE, ...RETIRED_COLOURS].map((c) => [c.name, c]));

export function colour(name: string): PaletteColour | undefined {
    return byName.get(name);
}

export function hexToInt(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}

/**
 * Colour families ("tông"): palette colours of the same hue, light or dark. Two lines near each other
 * never get colours of one family, and a level uses every family before it repeats one. Every family
 * has a colour that reads on the light board and one that reads on the dark board, so the game can
 * swap a sinking colour within its family (readableColours).
 */
export const FAMILIES: Record<string, string[]> = {
    red: ['red', 'maroon'],
    orange: ['orange_red', 'orange', 'light_orange', 'brown'],
    yellow: ['yellow', 'light_yellow', 'olive'],
    lime: ['lime', 'yellow_green', 'light_green', 'olive_green'],
    green: ['green', 'dark_green', 'spring_green'],
    cyan: ['turquoise', 'cyan', 'teal'],
    blue: ['blue', 'sky_blue', 'dark_blue', 'navy'],
    purple: ['purple', 'lavender'],
    magenta: ['magenta'],
    pink: ['pink', 'light_pink']
};
const FAMILY_OF = new Map(Object.entries(FAMILIES).flatMap(([f, names]) => names.map((n) => [n, f] as const)));
/** Family of a palette colour (a colour outside the palette is a family of its own). */
export const familyOf = (name: string) => FAMILY_OF.get(name) ?? name;

/** WCAG contrast ratio of two #RRGGBB colours (1 = same brightness, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
    const lum = (hex: string) => {
        const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const [r, g, bl] = [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255));
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Hue (0..360), saturation and lightness (0..1) of a #RRGGBB colour. */
function hsl(hex: string): [number, number, number] {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
}


/** The two boards (themes): colour and the least contrast a colour needs on it to be shown as it is. */
export const BOARDS = {
    light: { bg: '#F2EEE6', min: 1.8 },
    // Higher on the dark board: deep colours (brown, olive, teal, purple) look muddy on it.
    dark: { bg: '#1F2335', min: 3.2 }
} as const;
export type Board = keyof typeof BOARDS;

/**
 * Colours that sink into the board `bg` (contrast below `min`) -> the readable colour of the same family
 * with the nearest hue: what the game shows instead (the level file keeps its colours). Always the same
 * stand-in for a colour (not depending on the level), so the generator knows exactly what will be seen
 * on each board (shownColour) and can keep near lines apart there too.
 */
export function readableColours(names: string[], bg: string, min: number): Map<string, string> {
    const out = new Map<string, string>();
    const candidates = PALETTE.filter((c) => contrastRatio(c.base, bg) >= min);
    for (const n of new Set(names)) {
        const c = colour(n);
        if (!c || contrastRatio(c.base, bg) >= min) continue;
        const [h, s, l] = hsl(c.base);
        const dist = (o: PaletteColour) => {
            const [h2, s2, l2] = hsl(o.base);
            return (Math.min(Math.abs(h - h2), 360 - Math.abs(h - h2)) / 180) * 2 + Math.abs(s - s2) * 0.5 + Math.abs(l - l2) * 0.5;
        };
        const own = candidates.filter((o) => familyOf(o.name) === familyOf(n));
        out.set(n, [...(own.length ? own : candidates)].sort((a, b) => dist(a) - dist(b))[0].name);
    }
    return out;
}

const shownMemo = new Map<string, string>();
/** The colour seen on a board for palette colour `name` (itself, or its stand-in). */
export function shownColour(name: string, board: Board): string {
    const k = `${board}|${name}`;
    let v = shownMemo.get(k);
    if (!v) { v = readableColours([name], BOARDS[board].bg, BOARDS[board].min).get(name) ?? name; shownMemo.set(k, v); }
    return v;
}

/** CIELAB of a #RRGGBB colour (D65). */
function lab(hex: string): [number, number, number] {
    const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255));
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
}

/** How different two colours look (CIEDE2000; about 2 = just noticeable, 20+ = clearly different colours). */
export function colourDifference(h1: string, h2: string): number {
    const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const ang = (a: number, b: number) => { const v = (Math.atan2(b, a) * 180) / Math.PI; return v < 0 ? v + 360 : v; };
    const h1p = ang(a1p, b1), h2p = ang(a2p, b2);
    const dL = L2 - L1, dC = C2p - C1p;
    let dh = h2p - h1p;
    if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * Math.PI) / 360);
    const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hb = h1p + h2p;
    if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hb += h1p + h2p < 360 ? 360 : -360; hb /= 2; }
    const rad = Math.PI / 180;
    const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
    const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)), RT = -Math.sin(2 * dTh * rad) * RC;
    return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** Two lines near each other must look at least this different on both boards (colourDifference). */
export const MIN_NEAR_DIFFERENCE = 25;
const apartMemo = new Map<string, boolean>();
/**
 * May these two colours be on lines near each other? Not the same family, and clearly different as
 * shown on the light board and on the dark board (after the theme swaps).
 */
export function farApart(a: string, b: string): boolean {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let v = apartMemo.get(k);
    if (v === undefined) {
        v = familyOf(a) !== familyOf(b) && (['light', 'dark'] as const).every((t) => {
            const x = colour(shownColour(a, t)), y = colour(shownColour(b, t));
            return !x || !y || colourDifference(x.base, y.base) >= MIN_NEAR_DIFFERENCE;
        });
        apartMemo.set(k, v);
    }
    return v;
}
