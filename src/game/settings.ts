// Player settings (Settings popup), remembered in this browser.
const KEY = 'dotline.settings';

export type ThemeName = 'light' | 'dark';

interface Settings {
    theme: ThemeName;
}

function load(): Settings {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return { theme: s.theme === 'dark' ? 'dark' : 'light' };
    } catch {
        return { theme: 'light' };
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
