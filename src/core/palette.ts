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

/** A colour whose contrast with the board is below this sinks into it (the game swaps it, see readableColours). */
export const MIN_BOARD_CONTRAST = 1.8;

/**
 * Colours that sink into the board `bg` -> a readable palette colour of the nearest hue: what the game
 * shows instead (the level file keeps its colours). Each sinking colour gets one stand-in; colours the
 * level does not use yet are preferred when they are about as close in hue.
 */
export function readableColours(names: string[], bg: string): Map<string, string> {
    const readable = (n: string) => { const c = colour(n); return !c || contrastRatio(c.base, bg) >= MIN_BOARD_CONTRAST; };
    const used = new Set(names.filter(readable));
    const out = new Map<string, string>();
    const candidates = PALETTE.filter((c) => contrastRatio(c.base, bg) >= MIN_BOARD_CONTRAST);
    for (const n of new Set(names)) {
        if (readable(n)) continue;
        const [h, s, l] = hsl(colour(n)!.base);
        const dist = (c: PaletteColour) => {
            const [h2, s2, l2] = hsl(c.base);
            const dh = Math.min(Math.abs(h - h2), 360 - Math.abs(h - h2)) / 180;
            return dh * 2 + Math.abs(s - s2) * 0.5 + Math.abs(l - l2) * 0.5;
        };
        // Nearest hue first; a colour the level already uses counts as a little further away (about 30°
        // of hue), so a close colour is reused rather than jumping to a far one.
        const score = (c: PaletteColour) => dist(c) + (used.has(c.name) ? 0.35 : 0);
        const to = [...candidates].sort((a, b) => score(a) - score(b))[0];
        out.set(n, to.name);
        used.add(to.name);
    }
    return out;
}
