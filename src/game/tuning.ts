// Live-tunable gameplay values. The dev panel (⚙ speed / ⚙ tuning) can override them in this browser
// (localStorage) and, on the local dev server, write them back into this file with Confirm.

/** A tapped dot starts at this speed (world px per second)... */
export const START_SPEED = 500;
/** ...and reaches this speed after 1 second, then keeps the same acceleration to the end of its line. Confirm in the dev panel rewrites this line. */
export const MOVE_SPEED = 750;
/** Fluffy: seconds a pair stays together after touching, before the hearts. Confirm in the dev panel rewrites this line. */
export const HUG_HOLD = 0.2;
/** Jelly: seconds the two balls of a pair stay merged into one blob, after touching, before it pops. Confirm in the dev panel rewrites this line. */
export const JELLY_HOLD = 0.2;
/**
 * Fluffy: the light on the balls (src/scenes/fluffy.ts, ballTexture). LIGHT_ANGLE: where the light comes
 * from, in degrees round the ball on screen (0 right, 90 below, 180 left, 270 above; 225 = top left).
 * LIGHT_HEIGHT: how high it stands in front of the ball (0 grazing the side, 1 straight in front).
 * LIGHT_AMBIENT: brightness of the side away from the light; LIGHT_DIFFUSE: how much brighter the lit
 * side gets; LIGHT_SHEEN: soft extra glow where the light hits most. Confirm in the dev panel rewrites these lines.
 */
export const LIGHT_ANGLE = 230;
export const LIGHT_HEIGHT = 0.52;
export const LIGHT_AMBIENT = 1.15;
export const LIGHT_DIFFUSE = 0.21;
export const LIGHT_SHEEN = 0.1;

const KEY = 'dotline.tuning';

/** The values the dev panel can change: name in this browser, its constant in this file. */
export const TUNABLE = {
    moveSpeed: 'MOVE_SPEED', hugHold: 'HUG_HOLD', jellyHold: 'JELLY_HOLD',
    lightAngle: 'LIGHT_ANGLE', lightHeight: 'LIGHT_HEIGHT', lightAmbient: 'LIGHT_AMBIENT', lightDiffuse: 'LIGHT_DIFFUSE', lightSheen: 'LIGHT_SHEEN'
} as const;
export type Tunable = keyof typeof TUNABLE;
const CODE: Record<Tunable, number> = {
    moveSpeed: MOVE_SPEED, hugHold: HUG_HOLD, jellyHold: JELLY_HOLD,
    lightAngle: LIGHT_ANGLE, lightHeight: LIGHT_HEIGHT, lightAmbient: LIGHT_AMBIENT, lightDiffuse: LIGHT_DIFFUSE, lightSheen: LIGHT_SHEEN
};
/** The value in the code (what Reset goes back to). */
export const codeValue = (k: Tunable) => CODE[k];

type Saved = Partial<Record<Tunable, number>>;

function load(): Saved {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
        return {};
    }
}

export const tuning = {
    moveSpeed: load().moveSpeed ?? MOVE_SPEED,
    startSpeed: START_SPEED,
    hugHold: load().hugHold ?? HUG_HOLD,
    jellyHold: load().jellyHold ?? JELLY_HOLD,
    lightAngle: load().lightAngle ?? LIGHT_ANGLE,
    lightHeight: load().lightHeight ?? LIGHT_HEIGHT,
    lightAmbient: load().lightAmbient ?? LIGHT_AMBIENT,
    lightDiffuse: load().lightDiffuse ?? LIGHT_DIFFUSE,
    lightSheen: load().lightSheen ?? LIGHT_SHEEN,
    /** Goes up on every light change, so the balls are lit again (fluffy.ballTexture). */
    lightVersion: 0,
    /** Constant acceleration (px/s²): from the start speed to moveSpeed in 1 second. */
    get accel() {
        return this.moveSpeed - this.startSpeed;
    },
    /** Speed when a bumped dot slides back to its start. */
    get returnSpeed() {
        return Math.round(this.moveSpeed * 1.36);
    }
};

/** Keep in this browser the values that differ from the code (nothing stored when all match). */
function save() {
    const s: Saved = {};
    for (const k of Object.keys(TUNABLE) as Tunable[]) if (tuning[k] !== CODE[k]) s[k] = tuning[k];
    try {
        if (Object.keys(s).length) localStorage.setItem(KEY, JSON.stringify(s));
        else localStorage.removeItem(KEY);
    } catch {
        /* storage blocked */
    }
}

/** Any tunable value (the light ones also re-light the balls). */
export function setTunable(k: Tunable, v: number) {
    tuning[k] = v;
    if (k.startsWith('light')) tuning.lightVersion++;
    save();
}

/** Does this value differ from the code? */
export const changed = (k: Tunable) => tuning[k] !== CODE[k];

/** Forget this browser's values (after Confirm wrote them into the code, which then reloads). */
export function forgetSaved() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* storage blocked */
    }
}
