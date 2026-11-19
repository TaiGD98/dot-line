// Organiser tab: the game's play order (levels from any chapter, levels/game.json) and the open
// chapter's collections (fixed behaviour from the new-prototype checklist, 6b). Every row shows a
// picture of the level and lets you choose its tutorial.
import type { App } from './main';
import { clear, h } from './dom';
import { Collection, Store, chapterLabel, readGame, writeGame } from './store';
import { Level } from '../core/level';
import { miniature } from './mini';

type Tutorial = NonNullable<Level['tutorial']>;
const TUTORIALS: [string, string][] = [['', 'No tutorial'], ['tap', 'Tap a dot'], ['collision', 'Bumping'], ['zoom', 'Pinch to zoom']];

/** What the centre shows: the game's play order, or one collection of the open chapter. */
type Open = { kind: 'game' } | { kind: 'col'; index: number };

export class Organiser {
    readonly el = h('div', { class: 'organiser' });
    private cols: Collection[] = [];
    private game: string[] | null = null;
    private open: Open = { kind: 'game' };
    /** Name the open collection had when loaded (to rename its folder on Save). */
    private loadedName: string | null = null;
    private copies = new Set<string>();
    private dirty = false;
    /** Levels of every chapter (loaded once per refresh, on demand). */
    private byChapter = new Map<string, Level[]>();
    /** Tutorial changes not saved yet: "<chapter>/<id>" → tutorial ('' = none). */
    private tutorials = new Map<string, string>();

    constructor(private app: App) {}

    async refresh() {
        this.cols = await this.app.store.collections();
        this.game = await readGame(this.app.store.files);
        this.byChapter.clear();
        this.tutorials.clear();
        if (this.open.kind === 'col') this.open.index = Math.min(this.open.index, Math.max(0, this.cols.length - 1));
        if (this.open.kind === 'col' && !this.cols.length) this.open = { kind: 'game' };
        this.loadedName = this.col?.name ?? null;
        this.dirty = false;
        await this.render();
    }

    private get col(): Collection | undefined {
        return this.open.kind === 'col' ? this.cols[this.open.index] : undefined;
    }

    private async chapterLevels(chapter: string): Promise<Level[]> {
        let ls = this.byChapter.get(chapter);
        if (!ls) {
            ls = await new Store(this.app.store.files, chapter).levels(); // straight from the folder: always current
            this.byChapter.set(chapter, ls);
        }
        return ls;
    }

    /** Entries of the open list as {chapter, id}. */
    private entries(): { chapter: string; id: string }[] {
        if (this.open.kind === 'game') return (this.game ?? []).map((e) => { const k = e.indexOf('/'); return { chapter: e.slice(0, k), id: e.slice(k + 1) }; });
        return (this.col?.levels ?? []).map((id) => ({ chapter: this.app.store.chapter, id }));
    }

    private touch() {
        this.dirty = true;
        this.render();
    }

    private async render() {
        clear(this.el);
        const c = this.col, isGame = this.open.kind === 'game';
        this.copies = c ? await this.app.store.copyStatus(c) : new Set();
        const entries = this.entries();
        for (const ch of new Set(entries.map((e) => e.chapter))) await this.chapterLevels(ch);
        const find = (e: { chapter: string; id: string }) => this.byChapter.get(e.chapter)?.find((l) => l.id === e.id);

        const gameItem = h('div', { class: `item${isGame ? ' on' : ''}`, onclick: () => this.select({ kind: 'game' }) },
            h('span', { class: 'num' }, '▶'),
            h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Game · play order', isGame && this.dirty ? ' •' : ''), h('div', { class: 'muted small' }, this.game ? `${this.game.length} levels, any chapter` : 'not set up yet')));
        const list = h('aside', { class: 'panel left' },
            h('div', { class: 'panel-head' }, h('b', {}, 'Collections'), h('button', { class: 'icon', title: 'New collection (in this chapter)', onclick: () => this.add() }, '+')),
            h('div', { class: 'list' }, gameItem,
                h('div', { class: 'muted small pad' }, `Chapter ${chapterLabel(this.app.store.chapter)}`),
                this.cols.map((col, i) =>
                    h('div', { class: `item${!isGame && this.open.kind === 'col' && this.open.index === i ? ' on' : ''}`, onclick: () => this.select({ kind: 'col', index: i }) },
                        h('span', { class: 'num' }, `v${col.version}`),
                        h('div', { class: 'grow' }, h('div', { class: 'name' }, col.name, !isGame && this.open.kind === 'col' && this.open.index === i && this.dirty ? ' •' : ''), h('div', { class: 'muted small' }, `${col.levels.length} levels`)),
                        h('button', { class: 'icon small danger', title: 'Remove from the list (the folder on disk is kept)', onclick: (e: Event) => { e.stopPropagation(); this.removeCol(i); } }, '🗑')))),
            !this.cols.length ? h('div', { class: 'muted small pad' }, 'No collections in this chapter. Press + to create one.') : null);

        const center = h('div', { class: 'center org-center' });
        const title = isGame ? 'Game · play order' : c?.name;
        if (isGame || c) {
            center.append(h('div', { class: 'org-head' }, h('b', {}, title ?? ''), h('span', { class: 'pill' }, `${entries.length} levels`)));
            if (isGame) center.append(h('div', { class: 'muted small' }, 'The levels the game plays, in this order (LEVEL 1, 2, …). Levels can come from any chapter. Saved in levels/game.json.'));
            const rows = h('div', { class: 'org-rows' });
            entries.forEach((e, i) => {
                const l = find(e), key = `${e.chapter}/${e.id}`;
                const copied = !isGame && this.copies.has(Store.copyName(i, e.id)) && !this.dirty;
                const tut = this.tutorials.get(key) ?? l?.tutorial ?? '';
                const info = l
                    ? h('div', { class: 'muted small' }, `${l.pairs.length} pairs · ${new Set(l.pairs.map((p) => p.color)).size} colours`, isGame ? ` · ${chapterLabel(e.chapter)}` : '')
                    : h('div', { class: 'muted small warn' }, `missing level file (${key})`);
                const row = h('div', { class: 'org-row', draggable: true },
                    h('span', { class: 'drag', title: 'Drag to reorder' }, '⠿'),
                    h('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
                    l ? miniature(l, 'mini org-mini') : h('div', { class: 'org-mini empty' }),
                    h('div', { class: 'grow' }, h('div', { class: 'name' }, l?.name ?? e.id, h('span', { class: 'muted small' }, `  ${e.id}`)), h('div', { class: 'row gap' }, info,
                        isGame ? null : h('span', { class: `small ${copied ? 'muted' : 'warn'}` }, copied ? 'copy in folder' : 'not copied yet: Save'))),
                    l ? h('label', { class: 'field org-tut', title: 'Tutorial shown when this level starts (saved in the level file)' }, h('span', {}, 'Tutorial'),
                        h('select', { onchange: (ev: Event) => { this.tutorials.set(key, (ev.target as HTMLSelectElement).value); this.touch(); } },
                            TUTORIALS.map(([v, label]) => h('option', { value: v, selected: v === tut }, label)))) : null,
                    h('button', { class: 'icon', disabled: i === 0, title: 'Move up', onclick: () => this.move(i, i - 1) }, '↑'),
                    h('button', { class: 'icon', disabled: i === entries.length - 1, title: 'Move down', onclick: () => this.move(i, i + 1) }, '↓'),
                    h('button', { class: 'icon danger', title: isGame ? 'Remove from the game' : 'Remove from collection', onclick: () => { this.list().splice(i, 1); this.touch(); } }, '×'));
                row.addEventListener('dragstart', (ev) => { ev.dataTransfer!.setData('text/plain', String(i)); row.classList.add('dragging'); });
                row.addEventListener('dragend', () => row.classList.remove('dragging'));
                row.addEventListener('dragover', (ev) => { ev.preventDefault(); row.classList.add('drop'); });
                row.addEventListener('dragleave', () => row.classList.remove('drop'));
                row.addEventListener('drop', (ev) => { ev.preventDefault(); this.move(+ev.dataTransfer!.getData('text/plain'), i); });
                rows.append(row);
            });
            if (!entries.length) rows.append(h('div', { class: 'muted pad' }, 'No levels yet. Use + Add levels.'));
            center.append(rows);
        } else center.append(h('div', { class: 'muted pad' }, 'Create a collection to order levels for play.'));

        const settings = h('aside', { class: 'panel right' }, h('div', { class: 'panel-head' }, h('b', {}, 'Settings')));
        if (isGame) {
            settings.append(h('div', { class: 'settings' },
                h('button', { onclick: () => this.addDialog() }, '+ Add levels'),
                h('button', { class: 'primary', onclick: () => this.save() }, 'Save play order'),
                h('p', { class: 'muted small' }, 'Save writes levels/game.json (the game plays this list) and the tutorials you changed into their level files. The web game shows it after npm run publish:levels.')));
        } else if (c) {
            settings.append(h('div', { class: 'settings' },
                h('label', { class: 'field' }, h('span', {}, 'Name'), h('input', { value: c.name, onchange: (ev: Event) => {
                    const v = (ev.target as HTMLInputElement).value.trim();
                    if (!v || /[\\/:*?"<>|]/.test(v) || this.cols.some((o) => o !== c && o.name === v)) { this.app.setStatus('Name must be unique and folder-name safe'); return this.render(); }
                    c.name = v; this.touch();
                } })),
                h('label', { class: 'field' }, h('span', {}, 'Version'), h('input', { type: 'number', min: 1, value: c.version, onchange: (ev: Event) => { c.version = Math.max(1, +(ev.target as HTMLInputElement).value || 1); this.touch(); } })),
                h('button', { onclick: () => this.addDialog() }, '+ Add levels'),
                h('button', { class: 'primary', onclick: () => this.save() }, 'Save collection'),
                h('p', { class: 'muted small' }, `Save writes collections.json, numbered copies in collections/${c.name}/ and the tutorials you changed. Changes are only written when you press Save.`)));
        }
        this.el.append(h('div', { class: 'org-grid' }, list, center, settings));
    }

    /** The open list's entries as stored ("<chapter>/<id>" for the game, ids for a collection). */
    private list(): string[] {
        if (this.open.kind === 'game') return (this.game ??= []);
        return this.col?.levels ?? [];
    }

    private async select(open: Open) {
        if (this.dirty && !confirm('Discard unsaved changes?')) return;
        this.open = open;
        await this.refresh();
    }

    private add() {
        let n = this.cols.length + 1;
        while (this.cols.some((c) => c.name === `Collection ${n}`)) n++;
        this.cols.push({ name: `Collection ${n}`, version: 1, levels: [] });
        this.open = { kind: 'col', index: this.cols.length - 1 };
        this.loadedName = null;
        this.touch();
    }

    private async removeCol(i: number) {
        if (!confirm(`Remove "${this.cols[i].name}" from the collection list? Its folder on disk is kept.`)) return;
        this.cols.splice(i, 1);
        await this.app.store.writeCollections(this.cols);
        this.open = { kind: 'game' };
        await this.refresh();
        this.app.setStatus('Collection removed from the list');
    }

    private move(from: number, to: number) {
        const ls = this.list();
        if (from === to || to < 0 || to >= ls.length) return;
        const [x] = ls.splice(from, 1);
        ls.splice(to, 0, x);
        this.touch();
    }

    /** Writes the changed tutorials into their level files. Returns how many. */
    private async saveTutorials(): Promise<number> {
        let n = 0;
        for (const [key, tut] of this.tutorials) {
            const k = key.indexOf('/'), chapter = key.slice(0, k), id = key.slice(k + 1);
            const store = new Store(this.app.store.files, chapter);
            const l = (await store.levels()).find((x) => x.id === id);
            if (!l || (l.tutorial ?? '') === tut) continue;
            if (tut) l.tutorial = tut as Tutorial; else delete l.tutorial;
            await store.save(l, id);
            n++;
        }
        this.tutorials.clear();
        return n;
    }

    private async save() {
        const tut = await this.saveTutorials();
        if (this.open.kind === 'game') {
            await writeGame(this.app.store.files, this.game ?? []);
            this.dirty = false;
            await this.app.reload(); // the open chapter's levels may have new tutorials
            this.app.setStatus(`Saved the play order: ${this.game?.length ?? 0} levels${tut ? `, ${tut} tutorial(s) changed` : ''}`);
            return;
        }
        const c = this.col;
        if (!c) return;
        const missing = c.levels.filter((id) => !this.app.levels.some((l) => l.id === id));
        const copied = await this.app.store.saveCollection(this.cols, c, this.loadedName);
        this.loadedName = c.name;
        this.dirty = false;
        await this.app.reload();
        this.app.setStatus(`Saved ${c.name}: ${copied} copied${tut ? `, ${tut} tutorial(s) changed` : ''}${missing.length ? `, ${missing.length} missing (${missing.join(', ')})` : ''}`);
    }

    /** Add levels dialog (fixed behaviour, 6b). The game's play order can take levels from any chapter. */
    private async addDialog() {
        const isGame = this.open.kind === 'game';
        if (!isGame && !this.col) return;
        const target = this.list();
        const chapters = isGame ? await Store.chapters(this.app.store.files) : [this.app.store.chapter];
        let chapter = chapters.includes(this.app.store.chapter) ? this.app.store.chapter : chapters[0] ?? '';
        const ticked = new Set<string>();
        const search = h('input', { placeholder: 'Search by level name or id' }) as HTMLInputElement;
        const list = h('div', { class: 'dlg-list' });
        const count = h('span', { class: 'muted grow' });
        const addSel = h('button', { class: 'primary' }, 'Add selected levels') as HTMLButtonElement;
        const entry = (l: Level) => (isGame ? `${chapter}/${l.id}` : l.id);
        let candidates: Level[] = [];
        const visible = () => candidates.filter((l) => `${l.name} ${l.id}`.toLowerCase().includes(search.value.trim().toLowerCase()));
        const close = () => { modal.remove(); document.body.classList.remove('modal-open'); };
        const addAll = (ls: Level[]) => { target.push(...ls.map(entry)); close(); this.touch(); };
        const draw = () => {
            clear(list);
            for (const l of visible()) {
                const key = entry(l);
                list.append(h('label', { class: 'dlg-row' },
                    h('input', { type: 'checkbox', checked: ticked.has(key), onchange: (ev: Event) => { (ev.target as HTMLInputElement).checked ? ticked.add(key) : ticked.delete(key); draw(); } }),
                    miniature(l, 'mini dlg-mini'),
                    h('div', { class: 'grow' }, h('b', {}, l.name), ` · ${l.pairs.length} pairs · ${new Set(l.pairs.map((p) => p.color)).size} colours`, h('div', { class: 'muted small' }, l.id)),
                    h('span', { class: `badge${l.difficulty ? '' : ' none'}` }, l.difficulty ? String(l.difficulty) : 'no difficulty')));
            }
            if (!visible().length) list.append(h('div', { class: 'muted pad' }, candidates.length ? 'No level matches.' : 'All levels of this chapter are already in the list.'));
            count.textContent = `${ticked.size} selected`;
            addSel.disabled = ticked.size === 0;
        };
        const load = async () => {
            candidates = (await this.chapterLevels(chapter)).filter((l) => !target.includes(entry(l)));
            draw();
        };
        search.addEventListener('input', draw);
        addSel.onclick = () => { target.push(...[...ticked].filter((k) => !target.includes(k))); close(); this.touch(); };
        const chapterSel = isGame
            ? h('label', { class: 'field' }, h('span', {}, 'Chapter'), h('select', { onchange: async (ev: Event) => { chapter = (ev.target as HTMLSelectElement).value; await load(); } }, chapters.map((ch) => h('option', { value: ch, selected: ch === chapter }, chapterLabel(ch)))))
            : null;
        // While the dialog is open only its level list scrolls: the page behind it stays put.
        const modal = h('div', { class: 'modal', onclick: (ev: Event) => { if (ev.target === modal) close(); },
            onwheel: (ev: Event) => { if (!list.contains(ev.target as Node)) ev.preventDefault(); } },
            h('div', { class: 'dialog' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, `Add levels to ${isGame ? 'the game' : this.col!.name}`), h('button', { class: 'icon', title: 'Close', onclick: close }, '✕')),
                chapterSel, search, list, h('div', { class: 'row gap' }, count, h('button', { onclick: () => addAll(visible()) }, 'Add all levels'), addSel)));
        document.body.append(modal);
        document.body.classList.add('modal-open');
        await load();
        search.focus();
    }
}
