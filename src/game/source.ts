// Where the game gets its levels: bundled sample levels when played on its own, or the level
// editor (postMessage) when opened from the editor's Play button (?editor=1).
import { Level, parseLevel } from '../core/level';

// Levels live in <project>/levels/ (the level editor's folder layout). Play order: the first
// collection in collections.json (the editor's Organiser), then any other level by id.
const files = import.meta.glob('/levels/*.json', { eager: true, import: 'default' });
const colFile = Object.values(import.meta.glob('/collections.json', { eager: true, import: 'default' }))[0] as
    | { collections?: { levels: string[] }[] }
    | undefined;
const all = Object.values(files).flatMap((v) => {
    try {
        return [parseLevel(v)];
    } catch {
        return [];
    }
});
const order = colFile?.collections?.[0]?.levels ?? [];
const bundled = [
    ...order.map((id) => all.find((l) => l.id === id)).filter((l): l is Level => !!l),
    ...all.filter((l) => !order.includes(l.id)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
];

export const fromEditor = new URLSearchParams(location.search).has('editor');

type Listener = (level: Level) => void;

class LevelSource {
    private listener: Listener | null = null;
    private list: { id: string; name: string }[] = fromEditor ? [] : bundled.map((l) => ({ id: l.id, name: l.name }));
    private current: Level | null = fromEditor ? null : bundled[0] ?? null;
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
            o.selected = l.id === this.current?.id;
            return o;
        }));
        this.menu.hidden = this.list.length === 0;
    }

    private pick(id: string) {
        if (fromEditor) {
            window.parent.postMessage({ type: 'dotline-request', id }, '*');
            return;
        }
        const l = bundled.find((x) => x.id === id);
        if (l) { this.current = l; this.renderMenu(); this.listener?.(l); }
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
        const i = bundled.findIndex((l) => l.id === this.current!.id);
        this.current = bundled[(i + 1) % bundled.length];
        this.renderMenu();
        return this.current;
    }

    levelNumber(): number {
        const i = this.list.findIndex((l) => l.id === this.current?.id);
        return i < 0 ? 1 : i + 1;
    }
}

export const levels = new LevelSource();
