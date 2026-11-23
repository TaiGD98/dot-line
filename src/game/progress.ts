// Player progress, remembered in this browser: the level to play next (its number in the play order)
// and the highest level reached, which unlocks the looks (mode.SKINS).
import { BACKGROUNDS, Look, SKINS } from './mode';

const KEY = 'dotline.progress';
interface Progress { level: number; reached: number }

function load(): Progress {
    try {
        const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        const level = Math.max(1, Math.floor(Number(p.level) || 1));
        return { level, reached: Math.max(level, Math.floor(Number(p.reached) || 1)) };
    } catch {
        return { level: 1, reached: 1 };
    }
}

export const progress: Progress = load();

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
        /* storage blocked: progress lasts for this session */
    }
}

/** The level to play next is `n` (after a win, or picked from the dev menu). */
export function setLevel(n: number) {
    progress.level = n;
    progress.reached = Math.max(progress.reached, n);
    save();
}

/** Levels won so far (the highest level reached is the one after them). */
export const won = () => progress.reached - 1;
/** Is this ball / background open (the player has won its level)? */
export const isOpen = (look: { unlock: number }) => won() >= look.unlock;

export interface Unlock { kind: 'ball' | 'background'; look: Look<string> }
/**
 * Balls, then backgrounds, that open between two moments of progress (`from`, `to`: the level reached
 * before and after a win), i.e. whose level was won in between: a new ball comes before a new background.
 */
export function unlocksBetween(from: number, to: number): Unlock[] {
    const inRange = (l: { unlock: number }) => l.unlock > from - 1 && l.unlock <= to - 1;
    return [...SKINS.filter(inRange).map((look) => ({ kind: 'ball' as const, look })), ...BACKGROUNDS.filter(inRange).map((look) => ({ kind: 'background' as const, look }))];
}

/** The next level to win that opens something, and what it opens (for the Well Done bar), or null. */
export function nextUnlock(): { level: number; items: Unlock[] } | null {
    const levels = [...SKINS, ...BACKGROUNDS].map((l) => l.unlock).filter((u) => u > won());
    if (!levels.length) return null;
    const level = Math.min(...levels);
    return { level, items: unlocksBetween(level, level + 1) };
}
