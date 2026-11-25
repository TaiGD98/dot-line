// The level being played, remembered in this browser while it is played (Game.saveSession): a game
// closed in the middle of a level goes on from there the next time it opens. On the phone (Unity) the
// same is saved on OnApplicationPause / OnApplicationQuit (docs/gdd/rules.md, 3.11).
const KEY = 'dotline.session';

export interface Session {
    /** Level number (progress) and level id: the session only counts for that level. */
    level: number;
    id: string;
    /** Pairs still on the board, pairs marked (bumped), hearts left. */
    alive: string[];
    marked: string[];
    hearts: number;
    /** Locks whose key was taken (open). */
    opened?: string[];
}

export function readSession(): Session | null {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        return s && Array.isArray(s.alive) && Array.isArray(s.marked) ? s : null;
    } catch {
        return null;
    }
}

export function writeSession(s: Session) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* storage blocked */
    }
}

export function clearSession() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* storage blocked */
    }
}
