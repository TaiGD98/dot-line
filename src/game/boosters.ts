// Boosters and coins (GDD 3.14): the hint and the scissors open on reaching a level (pop-up, 3 free),
// each use spends one, and when none are left they can be bought with coins or one at a time by
// watching an ad. Coins also buy Play On. Kept in this browser (localStorage).

export type BoosterId = 'hint' | 'cut';

export const BOOSTERS: Record<BoosterId, { name: string; unlock: number; text: string }> = {
    hint: { name: 'Hint', unlock: 4, text: 'Shows a dot you can send home right now.' },
    cut: { name: 'Cut', unlock: 8, text: 'Cut any line: its pair leaves the board.' }
};

/** Boosters given when one opens, and in a coin pack. */
export const BOOSTER_PACK = 3;
/** Coins for a pack of BOOSTER_PACK boosters, and for a Play On. */
export const BOOSTER_PRICE = 300;
export const PLAY_ON_PRICE = 900;
/** Coins for winning a level (twice that after an ad on the Well Done screen). */
export const WIN_COINS = 20;
/** Coins a new player starts with. */
export const START_COINS = 1000;

const KEY = 'dotline.boosters', COINS = 'dotline.coins';

interface Saved { unlocked: Partial<Record<BoosterId, boolean>>; count: Partial<Record<BoosterId, number>> }

function load(): Saved {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        if (s && typeof s === 'object') return { unlocked: s.unlocked ?? {}, count: s.count ?? {} };
    } catch {
        /* storage blocked */
    }
    return { unlocked: {}, count: {} };
}

const state = load();
let coins = (() => {
    try {
        const v = localStorage.getItem(COINS);
        return v === null ? START_COINS : Math.max(0, Math.round(+v) || 0);
    } catch {
        return START_COINS;
    }
})();

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
        localStorage.setItem(COINS, String(coins));
    } catch {
        /* storage blocked */
    }
}

export const isUnlocked = (id: BoosterId) => !!state.unlocked[id];
export const boosterCount = (id: BoosterId) => state.count[id] ?? 0;
export const coinCount = () => coins;

/** Open a booster (its pop-up was claimed): BOOSTER_PACK of it. */
export function unlockBooster(id: BoosterId) {
    state.unlocked[id] = true;
    state.count[id] = boosterCount(id) + BOOSTER_PACK;
    save();
}

export function addBoosters(id: BoosterId, n: number) {
    state.count[id] = boosterCount(id) + n;
    save();
}

/** Spend one; false when there is none. */
export function useBooster(id: BoosterId): boolean {
    if (boosterCount(id) <= 0) return false;
    state.count[id] = boosterCount(id) - 1;
    save();
    return true;
}

/** Pay coins; false (nothing paid) when there are not enough. */
export function spendCoins(n: number): boolean {
    if (coins < n) return false;
    coins -= n;
    save();
    return true;
}

export function addCoins(n: number) {
    coins += n;
    save();
}

/** The booster that opens on this level, if it has not been claimed yet. */
export function boosterToUnlock(level: number): BoosterId | null {
    for (const id of Object.keys(BOOSTERS) as BoosterId[]) if (!isUnlocked(id) && level >= BOOSTERS[id].unlock) return id;
    return null;
}
