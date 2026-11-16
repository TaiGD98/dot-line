// Organiser tab: order levels into collections (fixed behaviour from the new-prototype checklist, 6b).
import type { App } from './main';
import { clear, h } from './dom';
import { Collection, Store } from './store';
import { Level } from '../core/level';

export class Organiser {
    readonly el = h('div', { class: 'organiser' });
    private cols: Collection[] = [];
    private current = 0;
    /** Name the open collection had when loaded (to rename its folder on Save). */
    private loadedName: string | null = null;
    private copies = new Set<string>();
    private dirty = false;

    constructor(private app: App) {}

    async refresh() {
        this.cols = await this.app.store.collections();
        this.current = Math.min(this.current, Math.max(0, this.cols.length - 1));
        this.loadedName = this.cols[this.current]?.name ?? null;
        this.dirty = false;
        await this.render();
    }

    private get col(): Collection | undefined {
        return this.cols[this.current];
    }

    private level(id: string): Level | undefined {
        return this.app.levels.find((l) => l.id === id);
    }

    private info(id: string) {
        const l = this.level(id);
        if (!l) return h('div', { class: 'muted small warn' }, 'missing level file');
        const colours = new Set(l.pairs.map((p) => p.color)).size;
        return h('div', { class: 'muted small' }, `${l.pairs.length} pairs · ${colours} colours `, h('span', { class: `badge${l.difficulty ? '' : ' none'}` }, l.difficulty ? `difficulty ${l.difficulty}` : 'no difficulty'));
    }

    private touch() {
        this.dirty = true;
        this.render();
    }

    private async render() {
        clear(this.el);
        const c = this.col;
        this.copies = c ? await this.app.store.copyStatus(c) : new Set();

        const list = h('aside', { class: 'panel left' },
            h('div', { class: 'panel-head' }, h('b', {}, 'Collections'), h('button', { class: 'icon', title: 'New collection', onclick: () => this.add() }, '+')),
            h('div', { class: 'list' }, this.cols.map((col, i) =>
                h('div', { class: `item${i === this.current ? ' on' : ''}`, onclick: () => this.select(i) },
                    h('span', { class: 'num' }, `v${col.version}`),
                    h('div', { class: 'grow' }, h('div', { class: 'name' }, col.name, i === this.current && this.dirty ? ' •' : ''), h('div', { class: 'muted small' }, `${col.levels.length} levels`)),
                    h('button', { class: 'icon small danger', title: 'Remove from the list (the folder on disk is kept)', onclick: (e: Event) => { e.stopPropagation(); this.removeCol(i); } }, '🗑')))),
            !this.cols.length ? h('div', { class: 'muted small pad' }, 'No collections yet. Press + to create one.') : null);

        const center = h('div', { class: 'center org-center' });
        if (c) {
            center.append(h('div', { class: 'org-head' }, h('b', {}, c.name), h('span', { class: 'pill' }, `${c.levels.length} levels`)));
            const rows = h('div', { class: 'org-rows' });
            c.levels.forEach((id, i) => {
                const copied = this.copies.has(Store.copyName(i, id)) && !this.dirty;
                const row = h('div', { class: 'org-row', draggable: true },
                    h('span', { class: 'drag', title: 'Drag to reorder' }, '⠿'),
                    h('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
                    h('div', { class: 'grow' }, h('div', { class: 'name' }, this.level(id)?.name ?? id), h('div', { class: 'row gap' }, this.info(id), h('span', { class: `small ${copied ? 'muted' : 'warn'}` }, copied ? 'copy in folder' : 'not copied yet: Save'))),
                    h('button', { class: 'icon', disabled: i === 0, title: 'Move up', onclick: () => this.move(i, i - 1) }, '↑'),
                    h('button', { class: 'icon', disabled: i === c.levels.length - 1, title: 'Move down', onclick: () => this.move(i, i + 1) }, '↓'),
                    h('button', { class: 'icon danger', title: 'Remove from collection', onclick: () => { c.levels.splice(i, 1); this.touch(); } }, '×'));
                row.addEventListener('dragstart', (e) => { e.dataTransfer!.setData('text/plain', String(i)); row.classList.add('dragging'); });
                row.addEventListener('dragend', () => row.classList.remove('dragging'));
                row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
                row.addEventListener('dragleave', () => row.classList.remove('drop'));
                row.addEventListener('drop', (e) => { e.preventDefault(); this.move(+e.dataTransfer!.getData('text/plain'), i); });
                rows.append(row);
            });
            if (!c.levels.length) rows.append(h('div', { class: 'muted pad' }, 'No levels yet. Use + Add levels.'));
            center.append(rows);
        } else center.append(h('div', { class: 'muted pad' }, 'Create a collection to order levels for play.'));

        const settings = h('aside', { class: 'panel right' }, h('div', { class: 'panel-head' }, h('b', {}, 'Settings')));
        if (c) {
            settings.append(h('div', { class: 'settings' },
                h('label', { class: 'field' }, h('span', {}, 'Name'), h('input', { value: c.name, onchange: (e: Event) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (!v || /[\\/:*?"<>|]/.test(v) || this.cols.some((o, k) => k !== this.current && o.name === v)) { this.app.setStatus('Name must be unique and folder-name safe'); return this.render(); }
                    c.name = v; this.touch();
                } })),
                h('label', { class: 'field' }, h('span', {}, 'Version'), h('input', { type: 'number', min: 1, value: c.version, onchange: (e: Event) => { c.version = Math.max(1, +(e.target as HTMLInputElement).value || 1); this.touch(); } })),
                h('button', { onclick: () => this.addDialog() }, '+ Add levels'),
                h('button', { class: 'primary', onclick: () => this.save() }, 'Save collection'),
                h('p', { class: 'muted small' }, `Save writes collections.json and numbered copies in collections/${c.name}/. Changes are only written when you press Save.`)));
        }
        this.el.append(h('div', { class: 'org-grid' }, list, center, settings));
    }

    private async select(i: number) {
        if (this.dirty && !confirm('Discard unsaved changes to this collection?')) return;
        await this.refresh();
        this.current = i;
        this.loadedName = this.cols[i]?.name ?? null;
        await this.render();
    }

    private add() {
        let n = this.cols.length + 1;
        while (this.cols.some((c) => c.name === `Collection ${n}`)) n++;
        this.cols.push({ name: `Collection ${n}`, version: 1, levels: [] });
        this.current = this.cols.length - 1;
        this.loadedName = null;
        this.touch();
    }

    private async removeCol(i: number) {
        if (!confirm(`Remove "${this.cols[i].name}" from the collection list? Its folder on disk is kept.`)) return;
        this.cols.splice(i, 1);
        await this.app.store.writeCollections(this.cols);
        this.current = 0;
        await this.refresh();
        this.app.setStatus('Collection removed from the list');
    }

    private move(from: number, to: number) {
        const c = this.col;
        if (!c || from === to || to < 0 || to >= c.levels.length) return;
        const [id] = c.levels.splice(from, 1);
        c.levels.splice(to, 0, id);
        this.touch();
    }

    private async save() {
        const c = this.col;
        if (!c) return;
        const missing = c.levels.filter((id) => !this.level(id));
        const copied = await this.app.store.saveCollection(this.cols, c, this.loadedName);
        this.loadedName = c.name;
        this.dirty = false;
        await this.render();
        this.app.setStatus(`Saved ${c.name}: ${copied} copied${missing.length ? `, ${missing.length} missing (${missing.join(', ')})` : ''}`);
    }

    /** Add levels dialog (fixed behaviour, 6b). */
    private addDialog() {
        const c = this.col;
        if (!c) return;
        const candidates = this.app.levels.filter((l) => !c.levels.includes(l.id));
        const ticked = new Set<string>();
        const search = h('input', { placeholder: 'Search by level name' }) as HTMLInputElement;
        const list = h('div', { class: 'dlg-list' });
        const count = h('span', { class: 'muted grow' });
        const addSel = h('button', { class: 'primary' }, 'Add selected levels') as HTMLButtonElement;
        const visible = () => candidates.filter((l) => l.name.toLowerCase().includes(search.value.trim().toLowerCase()));
        const close = () => modal.remove();
        const addAll = (ids: string[]) => { c.levels.push(...ids); close(); this.touch(); };
        const draw = () => {
            clear(list);
            for (const l of visible()) {
                const colours = new Set(l.pairs.map((p) => p.color)).size;
                list.append(h('label', { class: 'dlg-row' },
                    h('input', { type: 'checkbox', checked: ticked.has(l.id), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? ticked.add(l.id) : ticked.delete(l.id); draw(); } }),
                    h('div', { class: 'grow' }, h('b', {}, l.name), ` · ${l.pairs.length} pairs · ${colours} colours`),
                    h('span', { class: `badge${l.difficulty ? '' : ' none'}` }, l.difficulty ? String(l.difficulty) : 'no difficulty')));
            }
            if (!visible().length) list.append(h('div', { class: 'muted pad' }, 'No level matches.'));
            count.textContent = `${ticked.size} of ${candidates.length} selected`;
            addSel.disabled = ticked.size === 0;
        };
        search.addEventListener('input', draw);
        addSel.onclick = () => addAll(candidates.filter((l) => ticked.has(l.id)).map((l) => l.id));
        const body = candidates.length
            ? [search, list, h('div', { class: 'row gap' }, count, h('button', { onclick: () => addAll(visible().map((l) => l.id)) }, 'Add all levels'), addSel)]
            : [h('p', {}, 'All levels are already in this collection.')];
        const modal = h('div', { class: 'modal', onclick: (e: Event) => { if (e.target === modal) close(); } },
            h('div', { class: 'dialog' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, `Add levels to ${c.name}`), h('button', { class: 'icon', title: 'Close', onclick: close }, '✕')), ...body));
        document.body.append(modal);
        if (candidates.length) { draw(); search.focus(); }
    }
}
