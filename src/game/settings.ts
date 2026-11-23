// Player settings (Settings popup), remembered in this browser.
const KEY = 'dotline.settings';

export type ThemeName = 'light' | 'dark';

interface Settings {
    theme: ThemeName;
    /** Sound effects, background music, vibration (Settings toggles; on by default). The game has no
     * sounds yet; vibration buzzes on a bump where the device supports it. */
    sfx: boolean;
    bgm: boolean;
    vibrate: boolean;
}

function load(): Settings {
    const on = (v: unknown) => v !== false;
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return { theme: s.theme === 'dark' ? 'dark' : 'light', sfx: on(s.sfx), bgm: on(s.bgm), vibrate: on(s.vibrate) };
    } catch {
        return { theme: 'light', sfx: true, bgm: true, vibrate: true };
    }
}

export const settings: Settings = load();
const listeners = new Set<() => void>();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings[key] = value;
    try {
        localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
        /* storage blocked: the setting lasts for this session */
    }
    listeners.forEach((fn) => fn());
}

/** Called whenever a setting changes; returns an unsubscribe function. */
export function onSettings(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
