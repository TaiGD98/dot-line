// Light and dark look of the game (Settings → THEME).
import { settings } from './settings';

export interface Theme {
    background: string;
    /** Drop shadow under dots. */
    shadow: number;
    shadowAlpha: [number, number];
    progressTrack: number;
    progressFill: number;
    caption: string;
    version: string;
    /** Light board: low-contrast lines get an edge in their ramp's dark key; dark board: in its light key. */
    dark: boolean;
}

// Boards chosen for the Voxel palette: a soft warm grey-white and a deep blue-grey. Neither is pure
// white or black, so the light and the dark colours keep some contrast; the lines that still sink
// get a thin edge (Game.lineEdge).
const THEMES: Record<'light' | 'dark', Theme> = {
    light: {
        background: '#F2EEE6', shadow: 0x3a2f20, shadowAlpha: [0.08, 0.14], progressTrack: 0xe0dbd0, progressFill: 0xf6a26b,
        caption: '#8a5a2b', version: '#aaa395', dark: false
    },
    dark: {
        background: '#1F2335', shadow: 0x000000, shadowAlpha: [0.24, 0.4], progressTrack: 0x323850, progressFill: 0xf6a26b,
        caption: '#f3c98b', version: '#5c6275', dark: true
    }
};

export const theme = (): Theme => THEMES[settings.theme];
