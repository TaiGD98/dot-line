// Where the game gets its levels: bundled sample levels when played on its own, or the level
// editor (postMessage) when opened from the editor's Play button (?editor=1).
import { Level, parseLevel } from '../core/level';
import { PLAYLIST } from './playlist';

// Levels live in <project>/levels/<chapter>/ (the level editor's folder layout). Play order: the
// chapters in folder-name order; inside a chapter, its first collection (levels/<chapter>/
// collections.json, the editor's Organiser), then any other level of the chapter by id.
// Older projects with levels directly in levels/ (and collections.json at the root) still work.
// levels/*-ref/ holds research-only reference levels: never bundled into the game.
const files = import.meta.glob(['/levels/*.json', '/levels/*/*.json', '!/levels/*-ref/**'], { eager: true, import: 'default' }) as Record<string, unknown>;
const rootCollections = import.meta.glob('/collections.json', { eager: true, import: 'default' }) as Record<string, unknown>;
type Collections = { collections?: { levels: string[] }[] } | undefined;

/** Chapter of a level file path ("" for levels/<id>.json). */
const chapterOf = (path: string) => { const parts = path.split('/'); return parts.length > 3 ? parts[2] : ''; };
const chapters = [...new Set(Object.keys(files).map(chapterOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/** Every level with its chapter, chapters in folder order. */
const everything: { level: Level; chapter: string }[] = chapters.flatMap((chapter) => {
    const colFile = (chapter ? files[`/levels/${chapter}/collections.json`] : Object.values(rootCollections)[0]) as Collections;
    const all = Object.entries(files)
        .filter(([path]) => chapterOf(path) === chapter && !path.endsWith('/collections.json'))
        .flatMap(([, v]) => { try { return [parseLevel(v)]; } catch { return []; } });
    const order = colFile?.collections?.[0]?.levels ?? [];
    return [
        ...order.map((id) => all.find((l) => l.id === id)).filter((l): l is Level => !!l),
        ...all.filter((l) => !order.includes(l.id)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    ].map((level) => ({ level, chapter }));
});
/** Unique key of a bundled level (ids may repeat across chapters). */
const keyOf = (b: { level: Level; chapter: string }) => `${b.chapter}/${b.level.id}`;

/** The levels the game plays, in order (src/game/playlist.ts); every level when the list is empty. */
const bundled: { level: Level; chapter: string }[] = !PLAYLIST.length ? everything : PLAYLIST.flatMap((entry) => {
    const [chapter, id] = entry.split('/');
    const found = everything.filter((b) => b.chapter === chapter && (id === '*' || b.level.id === id));
    if (!found.length) console.warn(`Playlist: nothing found for "${entry}"`);
    return found;
}).filter((b, i, all) => all.findIndex((o) => keyOf(o) === keyOf(b)) === i);
/** Dev menu: the playlist first, then every other level (to try it). */
const menuLevels = [...bundled, ...everything.filter((b) => !bundled.some((o) => keyOf(o) === keyOf(b)))];

export const fromEditor = new URLSearchParams(location.search).has('editor');

type Listener = (level: Level) => void;

class LevelSource {
    private listener: Listener | null = null;
    private list: { id: string; name: string }[] = fromEditor ? [] : menuLevels.map((b) => {
        const n = bundled.indexOf(b);
        return { id: keyOf(b), name: `${n >= 0 ? `${n + 1}. ` : '(not in playlist) '}${b.chapter ? `${b.chapter} · ` : ''}${b.level.name}` };
    });
    private current: Level | null = fromEditor ? null : bundled[0]?.level ?? null;
    /** Key of the current level in `list` (chapter/id when bundled, the id from the editor). */
    private currentKey: string | null = fromEditor ? null : bundled[0] ? keyOf(bundled[0]) : null;
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
        if (b) { this.current = b.level; this.currentKey = id; this.renderMenu(); this.listener?.(b.level); }
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
        const i = bundled.findIndex((b) => keyOf(b) === this.currentKey);
        const b = bundled[(i + 1) % bundled.length];
        this.current = b.level;
        this.currentKey = keyOf(b);
        this.renderMenu();
        return this.current;
    }

    /** Level number: position in the playlist (from the editor: position in the editor's list). */
    levelNumber(): number {
        if (fromEditor) { const i = this.list.findIndex((l) => l.id === this.currentKey); return i < 0 ? 1 : i + 1; }
        const i = bundled.findIndex((b) => keyOf(b) === this.currentKey);
        if (i >= 0) return i + 1;
        // Outside the playlist (dev menu): number inside its chapter.
        const cur = everything.find((b) => keyOf(b) === this.currentKey);
        return Math.max(1, everything.filter((b) => b.chapter === cur?.chapter).findIndex((b) => keyOf(b) === this.currentKey) + 1);
    }
}

export const levels = new LevelSource();
