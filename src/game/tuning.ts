// Live-tunable gameplay values. The dev panel (⚙ speed) can override them in this browser
// (localStorage) and, on the local dev server, write them back into this file with Confirm.

/** Dot travel speed along its line, world px per second. Confirm in the dev panel rewrites this line. */
export const MOVE_SPEED = 750;

const KEY = 'dotline.tuning';

function load(): { moveSpeed?: number } {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
        return {};
    }
}

export const tuning = {
    moveSpeed: load().moveSpeed ?? MOVE_SPEED,
    /** Speed when a bumped dot slides back to its start. */
    get returnSpeed() {
        return Math.round(this.moveSpeed * 1.36);
    }
};

export function setMoveSpeed(v: number, persist = true) {
    tuning.moveSpeed = v;
    try {
        if (persist) localStorage.setItem(KEY, JSON.stringify({ moveSpeed: v }));
        else localStorage.removeItem(KEY);
    } catch {
        /* storage blocked */
    }
}

/** True when the browser value differs from the code default. */
export const overridden = () => tuning.moveSpeed !== MOVE_SPEED;
