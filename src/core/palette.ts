// Colour palette from the DotPaint concept sheet (GDD 3.7).
// base = dot and line colour; gradient / inner = dot shading.

export interface PaletteColour {
    name: string;
    base: string;
    gradient: string;
    inner: string;
}

export const PALETTE: PaletteColour[] = [
    { name: 'crimson', base: '#DA0561', gradient: '#FF3B3B', inner: '#FF6738' },
    { name: 'blue', base: '#484EF6', gradient: '#4F93FF', inner: '#56B0FF' },
    { name: 'magenta', base: '#E221CA', gradient: '#FF77A7', inner: '#FF9CCE' },
    { name: 'light_blue', base: '#43C0FF', gradient: '#8CFFF2', inner: '#EEF7FF' },
    { name: 'green', base: '#6BD234', gradient: '#E2F016', inner: '#CCFFE6' },
    { name: 'yellow', base: '#FFC430', gradient: '#E2F016', inner: '#F9F3A1' },
    { name: 'purple', base: '#9F54FA', gradient: '#FB82EF', inner: '#FCA7F5' },
    { name: 'orange', base: '#FF772D', gradient: '#FFA754', inner: '#FFC079' },
    { name: 'pink', base: '#FF80C4', gradient: '#FFACAC', inner: '#FFC0C0' },
    { name: 'brown', base: '#AC6F6D', gradient: '#E67775', inner: '#FF8C8A' },
    { name: 'grey', base: '#888888', gradient: '#CFC9BC', inner: '#E4E0D9' },
    { name: 'dark_green', base: '#008D7F', gradient: '#00D2BD', inner: '#00F3D7' },
    { name: 'red', base: '#FA3E3E', gradient: '#FA692B', inner: '#FB904D' },
    { name: 'gold', base: '#D3BB7F', gradient: '#FFEC83', inner: '#FFF7AF' },
    { name: 'white', base: '#D6E6E9', gradient: '#FFFFFF', inner: '#FFFFFF' },
    { name: 'black', base: '#494E68', gradient: '#5C658F', inner: '#7B83AA' }
];

/** Line colour once a pair is cleared. */
export const COMPLETED_LINE = '#6977C2';

const byName = new Map(PALETTE.map((c) => [c.name, c]));

export function colour(name: string): PaletteColour | undefined {
    return byName.get(name);
}

export function hexToInt(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
