// Game looks ("themes" for the player; skins here, apart from the light / dark board theme), all
// playing the same levels:
// - jelly (default): glossy jelly balls; they deform while they move and a dot that reaches its partner
//   presses into it and merges before popping;
// - water: water balloons, full of coloured water that sloshes inside (the old "classic" look's rules);
// - fluffy: fluffy balls with faces on a scrolling pattern (src/scenes/fluffy.ts);
// - magic (/magic/ only, not in the theme picker): the level is a seal on a double door (src/scenes/Door.ts).
// The player picks jelly / water / fluffy on the Home screen's Theme tab once unlocked (SKINS); the choice
// is remembered and the game reloads in it. ?mode=... (locally) and window.__DOTLINE_MODE__ (set by the
// site build in each variant folder, scripts/build-site.sh) choose the look directly.
const SKIN_KEY = 'dotline.skin';
const injected = (window as unknown as { __DOTLINE_MODE__?: string }).__DOTLINE_MODE__;
const query = new URLSearchParams(location.search).get('mode');
function stored(): string | null {
    try {
        return localStorage.getItem(SKIN_KEY);
    } catch {
        return null;
    }
}
const raw = query ?? injected ?? stored() ?? 'jelly';
// The look flags are live bindings (`let`): a look picked on the Theme screen changes them in place and
// the scenes are rebuilt (setLook), with no page reload.
/** classic is the old name of water. */
export let MODE = raw === 'classic' ? 'water' : raw;
export let JELLY = MODE === 'jelly';
export let MAGIC = MODE === 'magic';
export let FLUFFY = MODE === 'fluffy';
export let WATER = !JELLY && !MAGIC && !FLUFFY;

export type SkinId = 'jelly' | 'water' | 'fluffy';
export type BackgroundId = 'classic' | 'fluffy';
export interface Look<T> { id: T; name: string; unlock: number }
/** The balls in the theme picker, in unlock order: `unlock` is the level to win to open it (0: open from the start). */
export const SKINS: Look<SkinId>[] = [
    { id: 'jelly', name: 'Jelly', unlock: 0 },
    { id: 'water', name: 'Water', unlock: 5 },
    { id: 'fluffy', name: 'Fluffy', unlock: 10 }
];
/** The board backgrounds: Classic (the plain board colour) and Fluffy (the fluffy faces pattern). */
export const BACKGROUNDS: Look<BackgroundId>[] = [
    { id: 'classic', name: 'Classic', unlock: 0 },
    { id: 'fluffy', name: 'Fluffy', unlock: 10 }
];
export let SKIN: SkinId = FLUFFY ? 'fluffy' : JELLY ? 'jelly' : 'water';

const BG_KEY = 'dotline.bg';
function storedBg(): string | null {
    try {
        return localStorage.getItem(BG_KEY);
    } catch {
        return null;
    }
}
/** The background in use: ?bg= (locally), else the /fluffy/ variant's own, else the player's choice, else Classic. */
const bgRaw = new URLSearchParams(location.search).get('bg') ?? (query === 'fluffy' || injected === 'fluffy' ? storedBg() ?? 'fluffy' : storedBg());
export let BACKGROUND: BackgroundId = bgRaw === 'fluffy' ? 'fluffy' : 'classic';
/** The fluffy faces pattern scrolls behind the board. */
export let FLUFFY_BG = BACKGROUND === 'fluffy' && !MAGIC;

/** Switch the flags to another ball / background (in place; the caller rebuilds the scenes). */
function setFlags(look: { ball?: SkinId; bg?: BackgroundId }) {
    if (look.ball) {
        MODE = look.ball;
        JELLY = MODE === 'jelly'; MAGIC = false; FLUFFY = MODE === 'fluffy'; WATER = MODE === 'water';
        SKIN = look.ball;
    }
    if (look.bg) BACKGROUND = look.bg;
    FLUFFY_BG = BACKGROUND === 'fluffy' && !MAGIC;
}

/** The game's rebuild of its scenes after a look change (set by the Game scene); without it the page reloads. */
let rebuild: (() => void) | null = null;
export function onLookChange(fn: () => void) {
    rebuild = fn;
}

const AUTOPLAY_KEY = 'dotline.autoplay';
/** After the reload, the Home screen opens where the player chose the look (e.g. 'theme:ball'). */
const REOPEN_KEY = 'dotline.reopen';

/** Where the Home screen should open after a look was picked there (asks once), or null. */
export function takeReopen(): string | null {
    try {
        const v = sessionStorage.getItem(REOPEN_KEY);
        sessionStorage.removeItem(REOPEN_KEY);
        return v;
    } catch {
        return null;
    }
}
/**
 * Use another ball and / or background: remembered, then the game switches to it (rebuilding its
 * scenes; the page reloads only when the game has not registered a rebuild), keeping ?mode= in step. `play`: after the reload go straight into the level instead of the Home screen
 * (a new look applied from the pop-up after a win). `reopen`: where the Home screen opens after the reload.
 */
export function chooseLook(look: { ball?: SkinId; bg?: BackgroundId }, play = false, reopen?: string) {
    try {
        if (look.ball) localStorage.setItem(SKIN_KEY, look.ball);
        if (look.bg) localStorage.setItem(BG_KEY, look.bg);
        if (play) sessionStorage.setItem(AUTOPLAY_KEY, '1');
        if (reopen) sessionStorage.setItem(REOPEN_KEY, reopen);
    } catch {
        /* storage blocked: only the URL carries it */
    }
    const url = new URL(location.href);
    if (look.ball && (query || injected)) url.searchParams.set('mode', look.ball);
    if (look.bg && url.searchParams.has('bg')) url.searchParams.set('bg', look.bg);
    if (rebuild && !MAGIC) {
        // In place: new flags, the URL kept in step, the scenes rebuilt (no reload).
        setFlags(look);
        history.replaceState(null, '', url.toString());
        rebuild();
        return;
    }
    location.href = url.toString();
}

/** Was the game reloaded to go straight into the level (chooseLook with play)? Asks once. */
export function takeAutoplay(): boolean {
    try {
        const v = sessionStorage.getItem(AUTOPLAY_KEY) === '1';
        sessionStorage.removeItem(AUTOPLAY_KEY);
        return v;
    } catch {
        return false;
    }
}
