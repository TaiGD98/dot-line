// Where the game gets its levels: bundled sample levels when played on its own, or the level
// editor (postMessage) when opened from the editor's Play button (?editor=1).
import { Level, parseLevel } from '../core/level';
import gameLevels from 'virtual:game-levels';
import { progress, setLevel } from './progress';

// The game plays exactly the levels of its play order (levels/game.json, set in the editor's
// Organiser → "Game · play order"; else src/game/playlist.ts), in that order: the build contains
// those levels and no others (vite.config.ts, gameLevels plugin).
/** Unique key of a bundled level (ids may repeat across chapters). */
const keyOf = (b: { level: Level; chapter: string }) => `${b.chapter}/${b.level.id}`;
const bundled: { level: Level; chapter: string }[] = gameLevels.flatMap((b) => {
    try {
        return [{ chapter: b.chapter, level: parseLevel(b.level) }];
    } catch (e) {
        console.warn(`Skipped ${b.chapter} level`, e);
        return [];
    }
});
/** Dev menu: the play order. */
const menuLevels = bundled;

export const fromEditor = new URLSearchParams(location.search).has('editor');

// Dev: a level or the play order was saved (vite.config.ts, gameLevels): the game reloads with the new
// levels. Opened from the editor's Play button it gets its level from the editor, so it stays as it is.
if (import.meta.hot && !fromEditor) import.meta.hot.on('dotline:levels', () => location.reload());

type Listener = (level: Level) => void;

class LevelSource {
    private listener: Listener | null = null;
    private list: { id: string; name: string }[] = fromEditor ? [] : menuLevels.map((b) => {
        const n = bundled.indexOf(b);
        return { id: keyOf(b), name: `${n + 1}. ${b.chapter ? `${b.chapter} · ` : ''}${b.level.name}` };
    });
    /** The saved level to play next (progress.level; past the end of the play order it wraps round). */
    private start = bundled.length ? bundled[(progress.level - 1) % bundled.length] : undefined;
    private current: Level | null = fromEditor ? null : this.start?.level ?? null;
    /** Key of the current level in `list` (chapter/id when bundled, the id from the editor). */
    private currentKey: string | null = fromEditor ? null : this.start ? keyOf(this.start) : null;
    private menu = document.createElement('select');

    constructor() {
        this.menu.className = 'dev-level';
        this.menu.title = 'Dev: choose a level';
        this.menu.addEventListener('change', () => this.pick(this.menu.value));
        document.body.append(this.menu);
        if (fromEditor) {
            window.addEventListener('message', (e) => {
                const d = e.data as { type?: string; level?: unknown; levels?: { id: string; name: string }[] };
                if (d?.type !== 'dotline-level' || !d.level) return;
                try {
                    this.current = parseLevel(d.level);
                } catch (err) {
                    console.error('Bad level from editor', err);
                    return;
                }
                this.list = d.levels ?? [];
                this.currentKey = this.current.id;
                if (!this.list.some((l) => l.id === this.current!.id)) this.list.unshift({ id: this.current.id, name: this.current.name });
                this.renderMenu();
                this.listener?.(this.current);
            });
            window.parent.postMessage({ type: 'dotline-ready' }, '*');
        }
        this.renderMenu();
    }

    private renderMenu() {
        this.menu.replaceChildren(...this.list.map((l) => {
            const o = document.createElement('option');
            o.value = l.id;
            o.textContent = `dev: ${l.name}`;
            o.selected = l.id === this.currentKey;
            return o;
        }));
        this.menu.hidden = this.list.length === 0;
    }

    private pick(id: string) {
        if (fromEditor) {
            window.parent.postMessage({ type: 'dotline-request', id }, '*');
            return;
        }
        const b = menuLevels.find((x) => keyOf(x) === id);
        if (b) { this.current = b.level; this.currentKey = id; setLevel(bundled.indexOf(b) + 1); this.renderMenu(); this.listener?.(b.level); }
    }

    /** Called with the current level now (if any) and whenever another one is chosen. */
    onLevel(fn: Listener) {
        this.listener = fn;
        if (this.current) fn(this.current);
    }

    level(): Level | null {
        return this.current;
    }

    /** Next level after a win (bundled order; from the editor it replays the same level). */
    next(): Level | null {
        if (fromEditor || !this.current) return this.current;
        // Inside the playlist: the next one (after the last, back to the first). A level picked from
        // outside the playlist goes on with the playlist's first level.
        const n = this.levelNumber();
        const i = bundled.findIndex((b) => keyOf(b) === this.currentKey);
        const b = bundled[(i + 1) % bundled.length];
        this.current = b.level;
        this.currentKey = keyOf(b);
        // Progress counts on past the end of the play order (level 31 plays level 1 again).
        setLevel(n + 1);
        this.renderMenu();
        return this.current;
    }

    /** The level shown as number `n` on the Home map (the play order, wrapping round). */
    at(n: number): Level | null {
        return bundled.length ? bundled[(n - 1) % bundled.length].level : null;
    }

    /** Level number: position in the playlist (from the editor: position in the editor's list). */
    levelNumber(): number {
        if (fromEditor) { const i = this.list.findIndex((l) => l.id === this.currentKey); return i < 0 ? 1 : i + 1; }
        // The saved progress when it points at this level (it may be past the play order's end).
        const i = bundled.findIndex((b) => keyOf(b) === this.currentKey);
        return bundled.length && (progress.level - 1) % bundled.length === i ? progress.level : Math.max(1, i + 1);
    }
}

export const levels = new LevelSource();
