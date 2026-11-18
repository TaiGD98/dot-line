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
    /** Palette colours too close to the background get a lighter stand-in. */
    lineOverride: Record<string, string>;
}

const THEMES: Record<'light' | 'dark', Theme> = {
    light: {
        background: '#fbfaf3', shadow: 0x3a2f20, shadowAlpha: [0.07, 0.12], progressTrack: 0xe5e2da, progressFill: 0xf6a26b,
        caption: '#8a5a2b', version: '#b5b0a5', lineOverride: {}
    },
    dark: {
        background: '#171a24', shadow: 0x000000, shadowAlpha: [0.22, 0.38], progressTrack: 0x2c3142, progressFill: 0xf6a26b,
        caption: '#f3c98b', version: '#5c6275', lineOverride: { black: '#7B83AA' }
    }
};

export const theme = (): Theme => THEMES[settings.theme];
