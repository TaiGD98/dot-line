// Light and dark look of the game (Settings → THEME).
import { settings } from './settings';
import { BOARDS, Board } from '../core/palette';

export interface Theme {
    background: string;
    /** Drop shadow under dots. */
    shadow: number;
    shadowAlpha: [number, number];
    progressTrack: number;
    progressFill: number;
    caption: string;
    version: string;
    /** Dark board (the light theme is false). */
    dark: boolean;
    /** Board of the palette: which colours are shown as they are (palette.THEME_COLOURS, themeColours). */
    board: Board;
}

// Boards chosen for the Voxel palette: a soft warm grey-white and a deep blue-grey. Neither is pure
// white or black, so the light and the dark colours keep some contrast. Lines have no edge.
const THEMES: Record<'light' | 'dark', Theme> = {
    light: {
        background: BOARDS.light.bg, shadow: 0x3a2f20, shadowAlpha: [0.08, 0.14], progressTrack: 0xe0dbd0, progressFill: 0xf6a26b,
        caption: '#8a5a2b', version: '#aaa395', dark: false, board: 'light'
    },
    dark: {
        background: BOARDS.dark.bg, shadow: 0x000000, shadowAlpha: [0.24, 0.4], progressTrack: 0x323850, progressFill: 0xf6a26b,
        caption: '#f3c98b', version: '#5c6275', dark: true, board: 'dark'
    }
};

export const theme = (): Theme => THEMES[settings.theme];
export const themeOf = (name: 'light' | 'dark'): Theme => THEMES[name];
