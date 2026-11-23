// Colours of the pop-ups, buttons and Home screen, drawn in code until the UI pictures are there
// (docs/guide/ui-assets.md), and the colour the UI pictures are recoloured to (src/scenes/uikit.ts). One
// set for every ball and background: the looks change only the balls and the board background, never the UI.

export interface SkinUI {
    /** Pop-up card, its border and the inset box inside it. */
    panel: number; border: number; inset: number;
    /** Title ribbon (and its folded ends). */
    ribbon: number; ribbonDark: number;
    /** Round buttons, their 3D bottom edge; the main wide button (Resume, Play) and its edge. */
    button: number; buttonEdge: number; main: number; mainEdge: number;
    /** Dark text on the card. */
    ink: string;
    /** Home screen: background, its faint decoration, path, level button, hard level, locked level. */
    home: number; homeDeco: number; path: number; node: number; nodeEdge: number; hard: number; hardEdge: number; locked: number; lockedEdge: number;
}

/**
 * Taken from the play screen (the "action phase"): the cream board, the light pink boosters, the peach
 * progress bar, the purple Hard label, the brown caption and the navy text outline.
 */
export const PALETTE = {
    cream: 0xf2eee6, paper: 0xfff9f0, sand: 0xf5eadb, tan: 0xe7b48e,
    peach: 0xf6a26b, peachEdge: 0xd27a45, pink: 0xf7b6c8, pinkEdge: 0xd98aa2,
    purple: 0xb57cf0, purpleEdge: 0x8452c4, grey: 0xb9b1a6, greyEdge: 0x958c80, red: 0xe8536b, redEdge: 0xb53a4f,
    brown: '#8a5a2b', navy: '#26346e'
} as const;

const P = PALETTE;
const UI: SkinUI = {
    panel: P.paper, border: P.tan, inset: P.sand, ribbon: P.peach, ribbonDark: P.peachEdge,
    button: P.pink, buttonEdge: P.pinkEdge, main: P.peach, mainEdge: P.peachEdge, ink: P.brown,
    home: P.cream, homeDeco: 0xe6dfd0, path: 0xffffff, node: P.pink, nodeEdge: P.pinkEdge, hard: P.purple, hardEdge: P.purpleEdge, locked: 0xddd6ca, lockedEdge: 0xbfb6a8
};

export const ui = (): SkinUI => UI;
