// Dot Line level editor: app shell, Editor tab (levels, details, canvas, generator, inspector),
// storage choice, undo/redo, drafts and keyboard shortcuts. Organiser and Play live in their own files.
import './editor.css';
import { Candidate, generate, strokeFrame, suggest } from '../core/generator';
import { Check, DEFAULT_RADIUS, Level, Pair, dataChecks, newLevel, nextPairId, parseLevel } from '../core/level';
import { PALETTE } from '../core/palette';
import { smoothPath, translatePath } from '../core/path';
import { SolveResult, solve } from '../core/solver';
import { Canvas, CanvasHost, Tool } from './canvas';
import { clear, debounce, h, logo, pref, setPref } from './dom';
import { Organiser } from './organiser';
import { openPlay } from './play';
import { BrowserFiles, FolderFiles, Store, folderSupported } from './store';
import { isSvg, strokesFrom } from './sources';
import { s as svgEl } from './dom';
import { COMPLETED_LINE, colour } from '../core/palette';

const GEN_SIZE = 700;

class App {
    store!: Store;
    levels: Level[] = [];
    level: Level = newLevel('level-1', 'Level 1');
    savedId: string | null = null;
    dirty = false;
    selection = new Set<string>();
    tool: Tool = 'select';
    activeColour = PALETTE[0].name;
    image: { blob: Blob; url: string; w: number; h: number; pending: boolean } | null = null;
    showImage = pref('showImage', true);
    showOrder = false;
    sim: SolveResult | null = null;
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private pendingSnapshot: string | null = null;
    private clipboard: Pair[] = [];
    private tab: 'editor' | 'organiser' = pref('tab', 'editor');
    private status = h('div', { class: 'statusbar' });
    private saveState = h('span', { class: 'muted' });
    private storageLabel = h('span', { class: 'pill' });
    private undoBtn = h('button', { class: 'icon', title: 'Undo (Ctrl/Cmd+Z)', onclick: () => this.undo() }, '↶');
    private redoBtn = h('button', { class: 'icon', title: 'Redo (Shift+Ctrl/Cmd+Z)', onclick: () => this.redo() }, '↷');
    private levelList = h('div', { class: 'list' });
    private search = h('input', { placeholder: 'Search name or id', oninput: () => this.renderLevels() });
    private details = h('div', { class: 'details' });
    private inspector = h('div', { class: 'inspector-body' });
    private toolbar = h('div', { class: 'tools' });
    private genPanel = h('div', { class: 'gen' });
    private body = h('div', { class: 'body' });
    private organiser!: Organiser;
    canvas = new Canvas({
        level: () => this.level,
        selection: this.selection,
        get tool() { return app.tool; },
        get activeColour() { return app.activeColour; },
        begin: () => this.begin(),
        end: (changed) => this.end(changed),
        live: () => this.renderInspector(),
        selectionChanged: () => { this.canvas.render(); this.renderInspector(); },
        overlay: () => this.overlay()
    });

    async start() {
        document.documentElement.dataset.theme = pref('theme', 'dark');
        document.body.append(this.shell());
        const choice = pref<'folder' | 'browser' | null>('storage', null);
        if (choice === 'browser') return this.useFiles(new BrowserFiles());
        if (choice === 'folder' && folderSupported()) {
            const rem = await FolderFiles.remembered();
            if (rem && !rem.needsPermission) return this.useFiles(rem.files);
            if (rem) return this.welcome(rem.files);
        }
        this.welcome(null);
    }

    // ---------- storage ----------

    private welcome(reconnect: FolderFiles | null) {
        const box = h('div', { class: 'welcome' },
            h('div', { class: 'card' },
                h('div', { class: 'brand' }, logo(), h('b', {}, 'Dot Line Editor')),
                h('p', {}, 'Where should levels be saved?'),
                reconnect ? h('button', { class: 'primary', onclick: async () => { if (await reconnect.reconnect()) { box.remove(); this.useFiles(reconnect); } } }, `Reconnect "${reconnect.label}"`) : null,
                folderSupported()
                    ? h('button', { class: reconnect ? '' : 'primary', onclick: () => this.pickFolder(box) }, 'Choose levels folder')
                    : h('p', { class: 'muted' }, 'Folders need Chrome or Edge.'),
                h('button', { onclick: () => { box.remove(); setPref('storage', 'browser'); this.useFiles(new BrowserFiles()); } }, 'Use browser storage'),
                h('p', { class: 'muted small' }, 'Browser storage keeps levels in this browser only. A folder keeps plain JSON files you can commit or share.')));
        document.body.append(box);
    }

    private async pickFolder(box?: HTMLElement) {
        try {
            const f = await FolderFiles.pick();
            box?.remove();
            setPref('storage', 'folder');
            await this.useFiles(f);
        } catch {
            /* picker cancelled */
        }
    }

    private async useFiles(files: BrowserFiles | FolderFiles) {
        this.store = new Store(files);
        this.storageLabel.textContent = files.kind === 'folder' ? files.label : 'Browser storage';
        this.storageLabel.title = files.kind === 'folder' ? 'Levels folder' : 'Saved in this browser only';
        this.organiser = new Organiser(this);
        await this.reload();
        const draft = await this.store.draft();
        if (draft?.level) {
            this.level = parseLevel(draft.level);
            this.savedId = draft.savedId;
            this.dirty = true;
            await this.loadImage(this.savedId);
            const pending = await this.store.draftImage();
            if (pending) await this.setImage(pending, true);
        } else if (this.levels.length) {
            await this.open(this.levels[0], true);
        } else {
            this.level = newLevel('level-1', 'Level 1');
        }
        this.afterLoad();
        this.setStatus(draft?.level ? `Restored unsaved draft of ${this.level.name}` : `Opened ${files.kind === 'folder' ? `folder "${files.label}"` : 'browser storage'}`);
    }

    async reload() {
        this.levels = await this.store.levels();
        this.renderLevels();
        if (this.tab === 'organiser') await this.organiser.refresh();
    }

    // ---------- shell ----------

    private shell() {
        const tabBtn = (id: 'editor' | 'organiser', label: string) =>
            h('button', { class: `tab${this.tab === id ? ' on' : ''}`, 'data-tab': id, onclick: () => this.switchTab(id) }, label);
        const header = h('header', {},
            h('div', { class: 'brand' }, logo(), h('span', { class: 'sep' }), h('b', {}, 'Dot Line Editor')),
            h('div', { class: 'tabs' }, tabBtn('editor', 'Editor'), tabBtn('organiser', 'Organiser')),
            h('div', { class: 'grow' }),
            this.storageLabel,
            h('button', { class: 'icon', title: 'Reload from storage (files changed outside the editor)', onclick: () => this.reload() }, '⟳'),
            h('button', { title: 'Switch between a folder and browser storage', onclick: () => this.changeStorage() }, 'Change storage'),
            this.saveState, this.undoBtn, this.redoBtn,
            h('button', { title: 'Save (Ctrl/Cmd+S)', onclick: () => this.save() }, 'Save'),
            h('button', { onclick: () => this.toggleTheme() }, 'Theme'),
            h('button', { class: 'primary', title: 'Play the open level', onclick: () => this.play() }, '▶ Play'));
        this.renderBody();
        window.addEventListener('keydown', (e) => this.key(e));
        window.addEventListener('beforeunload', (e) => { if (this.dirty) e.preventDefault(); });
        return h('div', { class: 'app' }, header, this.body, this.status);
    }

    private switchTab(id: 'editor' | 'organiser') {
        this.tab = id;
        setPref('tab', id);
        document.querySelectorAll('.tabs .tab').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === id));
        this.renderBody();
        if (id === 'organiser' && this.store) this.organiser.refresh();
        else this.afterLoad();
    }

    private renderBody() {
        clear(this.body);
        if (this.tab === 'organiser') {
            if (this.organiser) this.body.append(this.organiser.el);
            return;
        }
        const left = panel('left', h('div', { class: 'panel-head' }, h('b', {}, 'Levels')),
            h('div', { class: 'row gap' },
                h('button', { class: 'icon', title: 'New level', onclick: () => this.newLevel() }, '+'),
                h('button', { class: 'icon', title: 'Duplicate open level', onclick: () => this.duplicateLevel() }, '⧉'),
                h('button', { class: 'icon', title: 'Import level JSON files', onclick: () => this.importFiles(false) }, '⇩'),
                h('button', { class: 'icon', title: 'Import a folder of level files', onclick: () => this.importFiles(true) }, '▤'),
                h('span', { class: 'grow' }),
                h('button', { class: 'icon danger', title: 'Delete open level (history is kept)', onclick: () => this.deleteLevel() }, '🗑')),
            this.search, this.levelList);
        const right = panel('right', h('div', { class: 'panel-head' }, h('b', {}, 'Inspector')), this.inspector);
        this.renderToolbar();
        const center = h('div', { class: 'center' }, this.details,
            h('div', { class: 'stage' }, this.toolbar, h('div', { class: 'canvas-wrap' }, this.canvas.el,
                h('div', { class: 'canvas-tools' },
                    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: this.showImage, onchange: (e: Event) => { this.showImage = (e.target as HTMLInputElement).checked; setPref('showImage', this.showImage); this.canvas.render(); } }), 'Image'),
                    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: this.showOrder, onchange: (e: Event) => { this.showOrder = (e.target as HTMLInputElement).checked; this.canvas.render(); } }), 'Solve order'),
                    h('button', { onclick: () => this.canvas.fit() }, 'Fit view')),
                h('div', { class: 'hint' }, 'Drag: move · Shift: multi-select · Alt-drag: copy · Double-click line: add point · Space-drag / right-drag: pan · Wheel: zoom'))),
            this.genPanel);
        const grid = h('div', { class: 'editor-grid' }, left, resizer('left'), center, resizer('right'), right);
        this.body.append(grid);
        applyPanelState(grid);
        this.renderGenerator();
    }

    private renderToolbar() {
        clear(this.toolbar);
        const tools: [Tool, string, string][] = [['select', '↖', 'Select / move (V)'], ['pair', '⊕', 'New pair: drag to draw the line, or click start then end (P)'], ['pan', '✋', 'Pan (H)']];
        for (const [t, icon, title] of tools)
            this.toolbar.append(h('button', { class: `icon tool${this.tool === t ? ' on' : ''}`, title, onclick: () => this.setTool(t) }, icon));
    }

    setTool(t: Tool) {
        this.tool = t;
        this.canvas.cancelPending();
        this.canvas.el.dataset.tool = t;
        this.renderToolbar();
    }

    private afterLoad() {
        this.renderLevels();
        this.renderDetails();
        this.runSim();
        this.canvas.render();
        this.renderInspector();
        this.renderSaveState();
        this.renderGenerator();
        requestAnimationFrame(() => this.canvas.fit());
    }

    // ---------- levels panel ----------

    private renderLevels() {
        clear(this.levelList);
        const q = this.search.value.trim().toLowerCase();
        const shown = this.levels.filter((l) => !q || l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q));
        shown.forEach((l, i) => {
            const open = l.id === this.savedId;
            const colours = new Set(l.pairs.map((p) => p.color)).size;
            const item = h('div', { class: `item${open ? ' on' : ''}`, onclick: () => this.open(l) },
                h('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
                h('div', { class: 'grow' },
                    h('div', { class: 'name' }, l.name, open && this.dirty ? ' •' : ''),
                    h('div', { class: 'muted small' }, `${l.pairs.length} pairs · ${colours} colours`),
                    h('span', { class: `badge${l.difficulty ? '' : ' none'}` }, l.difficulty ? `difficulty ${l.difficulty}` : 'no difficulty'),
                    l.status && l.status !== 'WIP' ? h('span', { class: 'badge' }, l.status) : null),
                open ? h('button', { class: 'icon small', title: 'Older versions', onclick: (e: Event) => { e.stopPropagation(); this.showVersions(item, l.id); } }, '🕘') : null);
            this.levelList.append(item);
        });
        if (!this.savedId && this.store) this.levelList.prepend(h('div', { class: 'item on' }, h('span', { class: 'num' }, '··'), h('div', { class: 'grow' }, h('div', { class: 'name' }, this.level.name, ' •'), h('div', { class: 'muted small' }, 'not saved yet'))));
        if (!shown.length && this.savedId) this.levelList.append(h('div', { class: 'muted small pad' }, 'No match'));
    }

    private async showVersions(anchor: HTMLElement, id: string) {
        document.querySelector('.versions')?.remove();
        const vs = await this.store.versions(id);
        const pop = h('div', { class: 'versions' },
            h('div', { class: 'muted small' }, vs.length ? 'Load an older version (opens unsaved; Save to keep it)' : 'No older versions yet'),
            vs.map((v) => h('button', { onclick: () => { pop.remove(); this.begin(); this.level = { ...v, id: this.level.id, rev: this.level.rev }; this.end(true); this.renderDetails(); this.setStatus(`Loaded version ${v.rev} of ${v.name} (unsaved)`); } }, `Version ${v.rev ?? 0} · ${v.pairs.length} pairs`)),
            h('button', { onclick: () => pop.remove() }, 'Close'));
        anchor.after(pop);
    }

    private async confirmDiscard() {
        return !this.dirty || confirm(`Discard unsaved changes to "${this.level.name}"?`);
    }

    async open(l: Level, force = false) {
        if (!force && l.id === this.savedId) return;
        if (!force && !(await this.confirmDiscard())) return;
        this.level = structuredClone(l);
        this.savedId = l.id;
        this.dirty = false;
        this.selection.clear();
        this.undoStack = []; this.redoStack = [];
        await this.loadImage(l.id);
        await this.store.writeDraft(null);
        if (!force) this.afterLoad();
    }

    private async loadImage(id: string | null) {
        if (this.image) URL.revokeObjectURL(this.image.url);
        this.image = null;
        if (!id) return;
        const blob = await this.store.image(id);
        if (blob) await this.setImage(blob, false);
    }

    private async setImage(blob: Blob, pending: boolean) {
        if (this.image) URL.revokeObjectURL(this.image.url);
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        try { await img.decode(); } catch { /* size falls back below */ }
        this.image = { blob, url, w: img.naturalWidth || 1000, h: img.naturalHeight || 1000, pending };
    }

    private overlay() {
        const out: ReturnType<CanvasHost['overlay']> = {};
        const rect = this.level.source?.rect;
        if (this.image && this.showImage && rect) {
            out.image = { url: this.image.url, ...rect, opacity: 0.3 };
        } else if (this.image && this.showImage) {
            const k = GEN_SIZE / Math.max(this.image.w, this.image.h);
            const w = this.image.w * k, hh = this.image.h * k;
            out.image = { url: this.image.url, x: -w / 2, y: -hh / 2, w, h: hh, opacity: document.documentElement.dataset.theme === 'light' ? 0.3 : 0.3 };
        }
        if (this.showOrder && this.sim) out.order = new Map(this.sim.order.map((id, i) => [id, i + 1]));
        if (this.sim && !this.sim.solvable) out.stuck = new Set(this.sim.stuck);
        return out;
    }

    private async newLevel() {
        if (!(await this.confirmDiscard())) return;
        const id = await this.store.uniqueId(`level-${this.levels.length + 1}`);
        this.level = newLevel(id, `Level ${this.levels.length + 1}`);
        this.savedId = null;
        this.dirty = true;
        this.selection.clear();
        this.undoStack = []; this.redoStack = [];
        await this.loadImage(null);
        this.afterLoad();
        this.saveDraft();
    }

    private async duplicateLevel() {
        if (!(await this.confirmDiscard())) return;
        const copy = structuredClone(this.level);
        copy.id = await this.store.uniqueId(`${this.level.id}-copy`);
        copy.name = `${this.level.name} copy`;
        copy.rev = 0;
        const img = this.image?.blob;
        this.level = copy;
        this.savedId = null;
        this.dirty = true;
        if (img) await this.setImage(img, true);
        this.afterLoad();
        this.setStatus(`Duplicated as ${copy.id} (unsaved)`);
    }

    private importFiles(folder: boolean) {
        const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true }) as HTMLInputElement;
        if (folder) input.setAttribute('webkitdirectory', '');
        input.onchange = async () => {
            const files = [...(input.files ?? [])].filter((f) => f.name.endsWith('.json') && !(f as File & { webkitRelativePath: string }).webkitRelativePath.includes('/.versions/'));
            const res = await this.store.import(files);
            await this.reload();
            this.setStatus(`Imported ${res.added.length} level(s)${res.errors.length ? `; skipped ${res.errors.length}: ${res.errors.join('; ')}` : ''}`);
        };
        input.click();
    }

    private async deleteLevel() {
        if (!this.savedId) {
            if (confirm(`Discard the unsaved level "${this.level.name}"?`)) { await this.store.writeDraft(null); this.dirty = false; await this.reload(); this.levels.length ? this.open(this.levels[0]) : this.newLevel(); }
            return;
        }
        if (!confirm(`Delete "${this.level.name}" (${this.savedId})? Its version history is kept.`)) return;
        await this.store.remove(this.savedId);
        this.setStatus(`Deleted ${this.savedId}`);
        this.dirty = false;
        this.savedId = null;
        await this.store.writeDraft(null);
        await this.reload();
        if (this.levels.length) await this.open(this.levels[0]);
        else await this.newLevel();
    }

    // ---------- details bar ----------

    private renderDetails() {
        clear(this.details);
        const field = (label: string, input: HTMLElement) => h('label', { class: 'field' }, h('span', {}, label), input);
        const set = (fn: () => void) => { this.begin(); fn(); this.end(true); this.renderLevels(); };
        const idInput = h('input', { value: this.level.id, onchange: async () => {
            const v = idInput.value.trim();
            if (!v || /[\\/:*?"<>|]/.test(v)) { idInput.value = this.level.id; return this.setStatus('Id must be non-empty and file-name safe'); }
            if (v !== this.savedId && (await this.store.exists(v))) { idInput.value = this.level.id; return this.setStatus(`Id "${v}" already exists`); }
            set(() => { this.level.id = v; });
            this.setStatus(this.savedId && v !== this.savedId ? `Id changes to "${v}" on Save (file, history and collections follow)` : '');
        } }) as HTMLInputElement;
        this.details.append(
            field('Name', h('input', { value: this.level.name, onchange: (e: Event) => set(() => { this.level.name = (e.target as HTMLInputElement).value; }) })),
            field('Id', idInput),
            field('Status', select(['WIP', 'PROD', 'ARCHIVE'], this.level.status ?? 'WIP', (v) => set(() => { this.level.status = v as Level['status']; }))),
            field('Difficulty', select(['none', '1', '2', '3', '4', '5'], this.level.difficulty ? String(this.level.difficulty) : 'none', (v) => set(() => { this.level.difficulty = v === 'none' ? null : +v; }))),
            field('Category', h('input', { value: this.level.category ?? '', onchange: (e: Event) => set(() => { this.level.category = (e.target as HTMLInputElement).value; }) })),
            field('Tutorial', select(['none', 'tap', 'collision', 'zoom'], this.level.tutorial ?? 'none', (v) => set(() => { if (v === 'none') delete this.level.tutorial; else this.level.tutorial = v as Level['tutorial']; }))));
    }

    // ---------- generator ----------

    private genOpts = { pairs: 20, colors: 7, difficulty: 3 };
    private genNote = h('div', { class: 'muted small' });
    private candidates: Candidate[] = [];
    private chosen = 0;
    private genRect: { x: number; y: number; w: number; h: number } | null = null;

    private renderGenerator() {
        clear(this.genPanel);
        const open = pref('genOpen', true);
        const sug = suggest(this.genOpts.difficulty);
        const num = (key: 'pairs' | 'colors', min: number, max: number) =>
            h('input', { type: 'number', min, max, value: this.genOpts[key], class: 'num-input', onchange: (e: Event) => { this.genOpts[key] = Math.max(min, Math.min(max, +(e.target as HTMLInputElement).value || min)); } });
        const thumb = this.image ? h('img', { src: this.image.url, class: 'thumb' }) : h('div', { class: 'thumb empty' }, 'PNG / SVG');
        const head = h('div', { class: 'gen-head', onclick: () => { setPref('genOpen', !open); this.renderGenerator(); } }, h('b', {}, 'Generate from a drawing'), h('span', { class: 'muted' }, open ? '▾' : '▸'));
        this.genPanel.append(head);
        if (!open) return;
        this.genPanel.append(h('div', { class: 'gen-row' },
            h('label', { class: 'thumb-btn', title: 'Line art: PNG/JPG with dark lines on a light background, or an SVG (recommended: exact lines)' }, thumb,
                h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,.svg', hidden: true, onchange: async (e: Event) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    await this.setImage(f, true);
                    this.candidates = [];
                    this.markDirty();
                    this.renderGenerator(); this.canvas.render();
                } })),
            h('label', { class: 'field' }, h('span', {}, 'Pairs'), num('pairs', 1, 300)),
            h('label', { class: 'field' }, h('span', {}, 'Colours'), num('colors', 1, PALETTE.length)),
            h('label', { class: 'field' }, h('span', {}, 'Target difficulty'), select(['1', '2', '3', '4', '5'], String(this.genOpts.difficulty), (v) => { this.genOpts.difficulty = +v; this.renderGenerator(); })),
            h('div', { class: 'suggest', title: 'Placeholder rule until the real one is decided (spec: TBD)' },
                h('span', {}, `Suggested: ${sug.pairs} pairs, ${sug.colors} colours `), h('span', { class: 'tbd' }, 'rule TBD'),
                h('button', { onclick: () => { this.genOpts.pairs = sug.pairs; this.genOpts.colors = sug.colors; this.renderGenerator(); } }, 'Use')),
            h('button', { class: 'accent', onclick: () => this.runGenerator() }, 'Generate'),
            h('span', { class: 'ok small' }, '✓ always solvable')));
        if (this.candidates.length) {
            this.genPanel.append(h('div', { class: 'cands' },
                h('span', { class: 'muted small' }, 'Pick a layout:'),
                this.candidates.map((c, i) => h('button', { class: `cand${i === this.chosen ? ' on' : ''}`, title: `Score ${c.score.toFixed(2)} (lower is closer to the target difficulty)`, onclick: () => this.applyCandidate(i) },
                    miniature(c), h('div', { class: 'small' }, `${c.pairs.length} pairs · ${c.sim.rounds} rounds · ${c.sim.openAtStart} open`)))));
        }
        this.genPanel.append(this.genNote);
    }

    private async runGenerator() {
        if (!this.image) return this.setStatus('Choose a PNG/JPG line drawing or an SVG first');
        if (this.level.pairs.length && !this.candidates.length && !confirm(`Replace the ${this.level.pairs.length} pairs of "${this.level.name}" with generated ones?`)) return;
        this.setStatus('Generating…');
        await new Promise((r) => setTimeout(r, 30));
        try {
            const src = await strokesFrom(this.image.blob);
            if (!src.strokes.length) return this.setStatus('No lines found in the drawing');
            const t0 = performance.now();
            this.candidates = generate(src.strokes, { ...this.genOpts, size: GEN_SIZE, seed: Date.now(), tries: 24, keep: 3 });
            if (!this.candidates.length) return this.setStatus('Nothing generated');
            const f = strokeFrame(src.strokes, GEN_SIZE);
            this.genRect = { x: r1(-f.cx * f.k), y: r1(-f.cy * f.k), w: r1(src.width * f.k), h: r1(src.height * f.k) };
            this.applyCandidate(0);
            const c = this.candidates[0];
            this.genNote.textContent = `${src.strokes.length} line(s) in the drawing, ${c.stats.tJunctions} T-junction(s), ${c.stats.cuts} cut(s), ${c.stats.accents} accent pair(s). ${Math.round(performance.now() - t0)} ms.${c.warnings.length ? ' ' + c.warnings.join('. ') + '.' : ''} Generate again for new layouts.`;
            this.setStatus(`Generated ${this.candidates.length} layouts from ${isSvg(this.image.blob) ? 'SVG' : 'image'}`);
        } catch (e) {
            this.setStatus(`Generate failed: ${(e as Error).message}`);
        }
    }

    private applyCandidate(i: number) {
        const c = this.candidates[i];
        if (!c || !this.image) return;
        this.chosen = i;
        this.begin();
        this.level.pairs = structuredClone(c.pairs);
        this.level.source = { image: `${this.level.id}.${isSvg(this.image.blob) ? 'svg' : 'png'}`, rect: this.genRect ?? undefined, pairs: this.genOpts.pairs, colors: this.genOpts.colors, difficulty: this.genOpts.difficulty };
        this.image.pending = true;
        this.selection.clear();
        this.end(true);
        this.canvas.fit();
        this.renderGenerator();
    }

    // ---------- inspector ----------

    renderInspector() {
        clear(this.inspector);
        const sel = this.level.pairs.filter((p) => this.selection.has(p.id));
        const section = (t: string) => h('div', { class: 'section' }, t);
        this.inspector.append(section(sel.length ? `Selection · ${sel.length === 1 ? `pair ${sel[0].id}` : `${sel.length} pairs`}` : 'Colour for new pairs'));
        const sw = h('div', { class: 'swatches' });
        for (const c of PALETTE) {
            const on = sel.length ? sel.every((p) => p.color === c.name) : this.activeColour === c.name;
            sw.append(h('button', { class: `swatch${on ? ' on' : ''}`, title: c.name, style: { background: c.base }, onclick: () => {
                this.activeColour = c.name;
                if (sel.length) { this.begin(); for (const p of sel) p.color = c.name; this.end(true); } else this.renderInspector();
            } }));
        }
        this.inspector.append(sw, h('div', { class: 'muted small' }, sel.length ? `${[...new Set(sel.map((p) => p.color))].join(', ')}` : this.activeColour));

        if (sel.length) {
            const slider = (label: string, get: () => number, setv: (v: number) => void) => {
                const out = h('span', {}, String(get()));
                const input = h('input', { type: 'range', min: 6, max: 48, step: 1, value: get(),
                    onpointerdown: () => this.begin(),
                    oninput: (e: Event) => { setv(+(e.target as HTMLInputElement).value); out.textContent = String(get()); this.canvas.render(); },
                    onchange: () => this.end(true) });
                return h('div', { class: 'slider' }, h('div', { class: 'row' }, h('span', { class: 'grow' }, label), out), input);
            };
            if (sel.length === 1) {
                const p = sel[0];
                this.inspector.append(slider('Dot A radius', () => p.a.r, (v) => { p.a.r = v; }), slider('Dot B radius', () => p.b.r, (v) => { p.b.r = v; }));
            } else {
                this.inspector.append(slider('Radius (all selected dots)', () => sel[0].a.r, (v) => { for (const p of sel) { p.a.r = v; p.b.r = v; } }));
            }
            this.inspector.append(h('div', { class: 'row gap wrap' },
                h('button', { title: 'Re-fit the curve as smoothly as possible', onclick: () => { this.begin(); for (const p of sel) p.path = smoothPath(p.path); this.end(true); } }, 'Smooth'),
                h('button', { title: 'Copy (Ctrl/Cmd+D)', onclick: () => this.duplicate() }, 'Copy'),
                h('button', { class: 'danger', title: 'Delete (Del)', onclick: () => this.deleteSelection() }, 'Delete'),
                h('button', { onclick: () => { this.selection.clear(); this.canvas.render(); this.renderInspector(); } }, 'Deselect')));
            if (sel.length === 1) this.inspector.append(h('div', { class: 'muted small' }, 'Drag the square points and round handles to bend the line. Double-click the line to add a point, double-click a point to remove it. Alt-drag a handle to break the mirror.'));
        }

        this.inspector.append(section('Level checks'));
        for (const c of this.checks()) {
            const icon = c.level === 'ok' ? '✓' : c.level === 'warn' ? '⚠' : 'ℹ';
            this.inspector.append(h('div', { class: `check-line ${c.level}${c.pairs ? ' link' : ''}`, onclick: c.pairs ? () => { this.selection.clear(); c.pairs!.forEach((id) => this.selection.add(id)); this.canvas.render(); this.renderInspector(); } : undefined }, `${icon} ${c.text}`));
        }

        this.inspector.append(section('Simulation'));
        const sim = this.sim;
        if (sim && this.level.pairs.length) {
            this.inspector.append(
                h('div', {}, 'Solvable: ', h('b', { class: sim.solvable ? 'ok' : 'warn' }, sim.solvable ? 'yes' : 'no')),
                h('div', {}, `Open at start: ${sim.openAtStart} / ${this.level.pairs.length}`),
                h('div', {}, `Blocked at start: ${sim.blockedAtStart}`),
                h('div', { title: 'Rounds needed when every open pair is cleared each round (length of the longest blocking chain)' }, `Min rounds: ${sim.rounds}`),
                h('div', { class: 'tbd-box' }, 'Difficulty score: TBD'));
        } else this.inspector.append(h('div', { class: 'muted small' }, 'Add pairs to simulate.'));
        this.inspector.append(h('div', { class: 'muted small' }, 'Pairs: ', String(this.level.pairs.length), ' · Colours: ', String(new Set(this.level.pairs.map((p) => p.color)).size)));
    }

    private checks(): Check[] {
        const out = dataChecks(this.level);
        if (this.sim && this.level.pairs.length) {
            out.push(this.sim.solvable
                ? { level: 'ok', text: 'Level can be solved' }
                : { level: 'warn', text: `Can't be solved: ${this.sim.stuck.join(', ')} block each other`, pairs: this.sim.stuck });
            out.push({ level: 'info', text: `${this.sim.openAtStart} pair(s) open at start` });
        }
        return out;
    }

    private runSim() {
        this.sim = this.level.pairs.length ? solve(this.level) : null;
    }

    // ---------- edits, undo, save ----------

    begin() {
        this.pendingSnapshot = JSON.stringify(this.level);
    }

    end(changed: boolean) {
        if (changed && this.pendingSnapshot) {
            this.undoStack.push(this.pendingSnapshot);
            if (this.undoStack.length > 200) this.undoStack.shift();
            this.redoStack = [];
            this.markDirty();
        }
        this.pendingSnapshot = null;
        this.runSim();
        this.canvas.render();
        this.renderInspector();
    }

    private markDirty() {
        this.dirty = true;
        this.renderSaveState();
        this.saveDraft();
    }

    private saveDraft = debounce(() => { if (this.store && this.dirty) this.store.writeDraft({ level: this.level, savedId: this.savedId }, this.image?.pending ? this.image.blob : null); }, 600);

    private restore(snapshot: string) {
        this.level = JSON.parse(snapshot);
        for (const id of [...this.selection]) if (!this.level.pairs.some((p) => p.id === id)) this.selection.delete(id);
        this.markDirty();
        this.runSim();
        this.canvas.render();
        this.renderInspector();
        this.renderDetails();
    }

    undo() {
        const s = this.undoStack.pop();
        if (!s) return;
        this.redoStack.push(JSON.stringify(this.level));
        this.restore(s);
    }

    redo() {
        const s = this.redoStack.pop();
        if (!s) return;
        this.undoStack.push(JSON.stringify(this.level));
        this.restore(s);
    }

    private renderSaveState() {
        this.saveState.textContent = this.dirty ? `${this.level.name} · Unsaved changes` : 'Saved';
        this.saveState.classList.toggle('warn', this.dirty);
        this.undoBtn.disabled = !this.undoStack.length;
        this.redoBtn.disabled = !this.redoStack.length;
        this.renderLevels();
    }

    async save() {
        if (!this.store) return;
        try {
            if (!this.savedId && (await this.store.exists(this.level.id))) return this.setStatus(`Id "${this.level.id}" already exists; change the Id first`);
            const saved = await this.store.save(this.level, this.savedId, this.image?.pending ? this.image.blob : null);
            if (this.image) this.image.pending = false;
            this.level = saved;
            this.savedId = saved.id;
            this.dirty = false;
            await this.store.writeDraft(null);
            await this.reload();
            this.renderSaveState();
            this.renderDetails();
            this.setStatus(`Saved ${saved.name} (version ${saved.rev})`);
        } catch (e) {
            this.setStatus(`Save failed: ${(e as Error).message}`);
        }
    }

    private deleteSelection() {
        if (!this.selection.size) return;
        this.begin();
        this.level.pairs = this.level.pairs.filter((p) => !this.selection.has(p.id));
        this.selection.clear();
        this.end(true);
    }

    private duplicate() {
        if (!this.selection.size) return;
        this.begin();
        this.canvas.duplicateSelection(30);
        this.end(true);
    }

    private paste() {
        if (!this.clipboard.length) return;
        this.begin();
        this.selection.clear();
        for (const c of this.clipboard) {
            const p: Pair = structuredClone(c);
            p.id = nextPairId(this.level);
            p.a.x += 30; p.a.y += 30; p.b.x += 30; p.b.y += 30;
            p.path = translatePath(p.path, 30, 30);
            this.level.pairs.push(p);
            this.selection.add(p.id);
        }
        this.clipboard = this.level.pairs.filter((p) => this.selection.has(p.id)).map((p) => structuredClone(p));
        this.end(true);
    }

    private nudge(dx: number, dy: number) {
        if (!this.selection.size) return;
        this.begin();
        for (const p of this.level.pairs) {
            if (!this.selection.has(p.id)) continue;
            p.a.x += dx; p.a.y += dy; p.b.x += dx; p.b.y += dy;
            p.path = translatePath(p.path, dx, dy);
        }
        this.end(true);
    }

    private key(e: KeyboardEvent) {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
        const mod = e.metaKey || e.ctrlKey;
        const k = e.key.toLowerCase();
        if (mod && k === 's') { e.preventDefault(); this.save(); return; }
        if (this.tab !== 'editor' || document.querySelector('.play-overlay, .modal')) return;
        if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
        else if (mod && k === 'y') { e.preventDefault(); this.redo(); }
        else if (mod && k === 'c') { this.clipboard = this.level.pairs.filter((p) => this.selection.has(p.id)).map((p) => structuredClone(p)); this.setStatus(`Copied ${this.clipboard.length} pair(s)`); }
        else if (mod && k === 'v') { e.preventDefault(); this.paste(); }
        else if (mod && k === 'd') { e.preventDefault(); this.duplicate(); }
        else if (mod && k === 'a') { e.preventDefault(); this.level.pairs.forEach((p) => this.selection.add(p.id)); this.canvas.render(); this.renderInspector(); }
        else if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.deleteSelection(); }
        else if (k === 'escape') { this.selection.clear(); this.canvas.cancelPending(); this.canvas.render(); this.renderInspector(); }
        else if (k.startsWith('arrow')) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            this.nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
        }
        else if (!mod && k === 'v') this.setTool('select');
        else if (!mod && k === 'p') this.setTool('pair');
        else if (!mod && k === 'h') this.setTool('pan');
        else if (!mod && k === 'f') this.canvas.fit();
    }

    // ---------- misc ----------

    setStatus(text: string) {
        this.status.textContent = text;
    }

    private toggleTheme() {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        setPref('theme', next);
        this.canvas.render();
    }

    private async changeStorage() {
        if (!(await this.confirmDiscard())) return;
        this.dirty = false;
        this.welcome(null);
    }

    private play() {
        openPlay(this);
    }

    radiusDefault() {
        return DEFAULT_RADIUS;
    }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Small preview of a generated layout. */
function miniature(c: Candidate) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of c.pairs) for (const q of [...p.path, p.a, p.b]) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const pad = 24, size = Math.max(x1 - x0, y1 - y0) + pad * 2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return svgEl('svg', { viewBox: `${cx - size / 2} ${cy - size / 2} ${size} ${size}`, class: 'mini' },
        c.pairs.map((p) => {
            const col = colour(p.color)?.base ?? COMPLETED_LINE;
            let d = `M${p.path[0].x} ${p.path[0].y}`;
            for (let i = 1; i < p.path.length; i++) { const a = p.path[i - 1], b = p.path[i]; const o = a.out ?? a, n = b.in ?? b; d += ` C${o.x} ${o.y} ${n.x} ${n.y} ${b.x} ${b.y}`; }
            return svgEl('g', {}, svgEl('path', { d, stroke: col, 'stroke-width': 6, fill: 'none' }), svgEl('circle', { cx: p.a.x, cy: p.a.y, r: p.a.r, fill: col }), svgEl('circle', { cx: p.b.x, cy: p.b.y, r: p.b.r, fill: col }));
        }));
}

function select(options: string[], value: string, onChange: (v: string) => void) {
    return h('select', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
        options.map((o) => h('option', { value: o, selected: o === value }, o)));
}

// ---------- collapsible / resizable panels ----------

function panel(side: 'left' | 'right', head: HTMLElement, ...content: HTMLElement[]) {
    const btn = h('button', { class: 'icon small collapse', title: 'Collapse panel', onclick: () => { setPref(`${side}Collapsed`, !pref(`${side}Collapsed`, false)); applyPanelState(); } }, side === 'left' ? '‹' : '›');
    head.append(btn);
    return h('aside', { class: `panel ${side}` }, head, ...content);
}

function resizer(side: 'left' | 'right') {
    const el = h('div', { class: 'resizer' });
    el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        const startX = e.clientX, start = pref(`${side}Width`, side === 'left' ? 230 : 280);
        const move = (ev: PointerEvent) => {
            const w = Math.max(170, Math.min(520, start + (side === 'left' ? ev.clientX - startX : startX - ev.clientX)));
            setPref(`${side}Width`, w);
            applyPanelState();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
    });
    return el;
}

function applyPanelState(el?: HTMLElement) {
    const grid = el ?? (document.querySelector('.editor-grid') as HTMLElement | null);
    if (!grid) return;
    const lw = pref('leftCollapsed', false) ? 34 : pref('leftWidth', 230);
    const rw = pref('rightCollapsed', false) ? 34 : pref('rightWidth', 280);
    grid.style.gridTemplateColumns = `${lw}px 5px minmax(0,1fr) 5px ${rw}px`;
    grid.classList.toggle('left-collapsed', pref('leftCollapsed', false));
    grid.classList.toggle('right-collapsed', pref('rightCollapsed', false));
}

export type { App };
const app = new App();
(window as unknown as { editor: App }).editor = app;
app.start();
