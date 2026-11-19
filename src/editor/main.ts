// Dot Line level editor: app shell, Editor tab (levels, details, canvas, generator, inspector),
// storage choice, undo/redo, drafts and keyboard shortcuts. Organiser and Play live in their own files.
import './editor.css';
import { strokeFrame, suggest, worldSize } from '../core/generator';
import { MIN_BOARD, strokeTargets, strokeWorldSize } from '../core/strokemode';
import { OverlapCandidate, PATTERN_STYLES, PatternStyle, crossChecks, crossCounts, generateOverlap } from '../core/overlap';
import { Check, DEFAULT_RADIUS, Dot, Level, MIN_RADIUS, Pair, dataChecks, isBigDot, mainRadius, newLevel, nextPairId, parseLevel, setDotSize } from '../core/level';
import { PALETTE } from '../core/palette';
import { smoothPath, translatePath } from '../core/path';
import { SolveResult, solve } from '../core/solver';
import { Canvas, CanvasHost, Tool } from './canvas';
import { clear, debounce, h, logo, pref, setPref } from './dom';
import { Organiser } from './organiser';
import { openPlay } from './play';
import { BrowserFiles, FolderFiles, ImageSaveError, Store, chapterLabel, folderSupported } from './store';
import { isSvg, strokesFrom } from './sources';
import { miniature } from './mini';
import type { GenRequest } from './genWorker';
import type { Candidate, GenerateOptions } from '../core/generator';
import type { StrokeModeCandidate, StrokeModeOptions } from '../core/strokemode';
import type { Stroke } from '../core/trace';

/** Generate part 1 in a worker (the page stays responsive). One worker, restarted if it fails. */
let worker: Worker | null = null, nextJob = 1;
function inWorker(mode: 'strokes', strokes: Stroke[], opt: StrokeModeOptions): Promise<StrokeModeCandidate[]>;
function inWorker(mode: 'cut', strokes: Stroke[], opt: GenerateOptions): Promise<Candidate[]>;
function inWorker(mode: 'strokes' | 'cut', strokes: Stroke[], opt: StrokeModeOptions | GenerateOptions): Promise<unknown> {
    worker ??= new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
    const w = worker, id = nextJob++;
    return new Promise((resolve, reject) => {
        const done = () => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); };
        const onMsg = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
            if (e.data.id !== id) return;
            done();
            if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result);
        };
        const onErr = (e: ErrorEvent) => { done(); w.terminate(); worker = null; reject(new Error(e.message || 'generator worker failed')); };
        w.addEventListener('message', onMsg);
        w.addEventListener('error', onErr);
        w.postMessage({ id, mode, strokes, opt } as GenRequest);
    });
}

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
    /** Chapter folders under levels/ (each one is independent: levels, history, collections). */
    private chapters: string[] = [];
    private chapterSel = h('select', { class: 'grow', title: 'Chapter = a folder under levels/. Each chapter has its own levels and collections.', onchange: (e: Event) => this.switchChapter((e.target as HTMLSelectElement).value) }) as HTMLSelectElement;
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
        overlay: () => this.overlay(),
        radiusDefault: () => this.radiusDefault()
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
                h('p', { class: 'muted small' }, 'Tip: choose the dot-line project folder itself to edit the game\'s own levels (levels/ and collections.json); the game picks up every save.'),
                h('p', { class: 'muted small' }, 'Browser storage keeps levels in this browser only. A folder keeps plain JSON files you can commit or share.')));
        document.body.append(box);
    }

    private async pickFolder(box?: HTMLElement) {
        let f: FolderFiles;
        try {
            f = await FolderFiles.pick();
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') return; // picker cancelled
            const msg = `Could not open the folder: ${(e as Error)?.message || e}`;
            this.setStatus(msg);
            alert(`${msg}\n\nUse Chrome or Edge, choose the dot-line project folder (the one that contains levels/) and allow "View and edit".`);
            return;
        }
        box?.remove();
        setPref('storage', 'folder');
        try {
            await this.useFiles(f);
            const n = (await Store.chapters(f)).length;
            if (!n) this.setStatus(`No levels found in "${f.label}": choose the dot-line project folder (the one that contains levels/), or its levels folder`);
        } catch (e) {
            console.error(e);
            const msg = `Could not read the levels in "${f.label}": ${(e as Error)?.message || e}`;
            this.setStatus(msg);
            alert(msg);
        }
    }

    private async useFiles(files: BrowserFiles | FolderFiles) {
        this.chapters = await Store.chapters(files);
        const pendingDraft = await new Store(files).draft();
        const wanted = pendingDraft?.level ? pendingDraft.chapter ?? '' : pref('chapter', this.chapters[0] ?? 'chapter-1');
        const chapter = this.chapters.includes(wanted) ? wanted : this.chapters[0] ?? 'chapter-1';
        if (!this.chapters.includes(chapter)) this.chapters.push(chapter);
        this.store = new Store(files, chapter);
        this.renderChapters();
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

    private renderChapters() {
        this.chapterSel.replaceChildren(...this.chapters.map((c) => h('option', { value: c, selected: c === this.store?.chapter }, chapterLabel(c))));
    }

    /** Opens another chapter (folder under levels/): its levels and collections. */
    private async switchChapter(chapter: string) {
        if (!this.store || chapter === this.store.chapter) return;
        if (!(await this.confirmDiscard())) return this.renderChapters();
        this.store = new Store(this.store.files, chapter);
        setPref('chapter', chapter);
        this.renderChapters();
        this.dirty = false;
        this.savedId = null;
        await this.store.writeDraft(null);
        await this.reload();
        if (this.levels.length) await this.open(this.levels[0], true);
        else { this.level = newLevel('level-1', 'Level 1'); this.selection.clear(); }
        this.afterLoad();
        this.setStatus(`Chapter "${chapterLabel(chapter)}": ${this.levels.length} level(s)`);
    }

    private async newChapter() {
        const raw = prompt('New chapter folder name (created under levels/ on the first Save):', `chapter-${this.chapters.filter(Boolean).length + 1}`);
        const name = raw?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        if (!name) return;
        if (!this.chapters.includes(name)) this.chapters.push(name);
        await this.switchChapter(name);
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
            h('div', { class: 'row gap chapter-row' }, h('span', { class: 'muted small' }, 'Chapter'), this.chapterSel,
                h('button', { class: 'icon', title: 'New chapter (a new folder under levels/)', onclick: () => this.newChapter() }, '+')),
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
                h('div', { class: 'hint' }, 'Drag: move · Shift: multi-select · Alt-drag: copy · Double-click line: add point · Draw: lines round themselves (hold Alt: keep sharp corners) · Space-drag / right-drag: pan · Wheel: zoom'))),
            this.genPanel);
        const grid = h('div', { class: 'editor-grid' }, left, resizer('left'), center, resizer('right'), right);
        this.body.append(grid);
        applyPanelState(grid);
        this.renderGenerator();
    }

    private renderToolbar() {
        clear(this.toolbar);
        const tools: [Tool, string, string][] = [['select', '↖', 'Select / move (V)'], ['pair', '⊕', 'New pair: drag to draw the line (rounded automatically, hold Alt for sharp corners), or click start then end (P)'], ['pan', '✋', 'Pan (H)']];
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
        this.candidates = []; this.overlaps = [];
        const src = l.source, cc = crossCounts(l.pairs);
        this.genOpts = { pairs: src?.pairs ?? (cc.base || this.genOpts.pairs), colors: src?.colors ?? this.genOpts.colors, difficulty: src?.difficulty ?? this.genOpts.difficulty,
            x: src?.x ?? cc.x, t: src?.t ?? cc.t, pattern: (src?.pattern as PatternStyle) ?? 'auto', mode: src?.mode === 'cut' ? 'cut' : 'strokes',
            dot: src?.dot ?? (cc.base ? mainRadius(l.pairs.filter((p) => !p.cross)) : this.genOpts.dot), big: src?.big ?? true };
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
        let blob = await this.store.image(id);
        // Levels built from the art folder point at their SVG (e.g. art/levels/012_apple.svg).
        const src = this.level.source?.image;
        if (!blob && src && src.includes('/')) {
            const b = await this.store.files.readBlob(src);
            if (b) blob = new Blob([b], { type: src.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
        }
        if (blob) await this.setImage(blob, false);
    }

    private async setImage(blob: Blob, pending: boolean) {
        // Keep a copy in memory (see FolderFiles.readBlob): a File picked from disk can become unreadable.
        blob = new File([await blob.arrayBuffer()], (blob as File).name ?? 'image', { type: blob.type });
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

    /** mode: 'strokes' = one stroke of the drawing per line (reference style); 'cut' = contours cut into pairs (v2). */
    /** dot: radius of every normal dot of the generated level; big: round details of the drawing become big dots (stroke mode). */
    private genOpts = { pairs: 20, colors: 7, difficulty: 3, x: 6, t: 6, pattern: 'auto' as PatternStyle, mode: 'strokes' as 'strokes' | 'cut', dot: DEFAULT_RADIUS, big: true };
    private overlaps: OverlapCandidate[] = [];
    private chosenOverlap = 0;
    private genNote = h('div', { class: 'muted small' });
    private generating = false;
    private candidates: { pairs: Pair[]; sim: SolveResult; score: number; note: string; rect: { x: number; y: number; w: number; h: number } }[] = [];
    private chosen = 0;

    private renderGenerator() {
        clear(this.genPanel);
        const open = pref('genOpen', true);
        const sug = suggest(this.genOpts.difficulty);
        const num = (key: 'pairs' | 'colors' | 'x' | 't' | 'dot', min: number, max: number) =>
            h('input', { type: 'number', min, max, value: this.genOpts[key], class: 'num-input', onchange: (e: Event) => { this.genOpts[key] = Math.max(min, Math.min(max, +(e.target as HTMLInputElement).value || min)); this.renderGenerator(); } });
        const thumb = this.image ? h('img', { src: this.image.url, class: 'thumb' }) : h('div', { class: 'thumb empty' }, 'PNG / SVG');
        const head = h('div', { class: 'gen-head', onclick: () => { setPref('genOpen', !open); this.renderGenerator(); } }, h('b', {}, 'Generate from a drawing'), h('span', { class: 'muted' }, open ? '▾' : '▸'));
        this.genPanel.append(head);
        if (!open) return;
        const now = crossCounts(this.level.pairs), o = this.genOpts;
        const col1 = h('div', { class: 'gen-col' }), col2 = h('div', { class: 'gen-col' });
        // ---- Part 1: pairs that fill the lines of the drawing ----
        col1.append(h('div', { class: 'gen-part', title: 'Pairs only on the lines of the drawing. Near lines never share a colour. Only replaces the base lines: the overlap lines stay.' }, h('b', {}, '1 · Fill the lines'), h('span', { class: 'muted small' }, 'base lines only')));
        col1.append(h('div', { class: 'gen-row' },
            h('label', { class: 'thumb-btn', title: 'Line art: PNG/JPG with dark lines on a light background, or an SVG (recommended: exact lines)' }, thumb,
                h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,.svg', hidden: true, onchange: async (e: Event) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    await this.setImage(f, true);
                    this.candidates = [];
                    this.markDirty();
                    this.renderGenerator(); this.canvas.render();
                } })),
            h('label', { class: 'field', title: 'Strokes: each stroke of the drawing is one line and its ends land on other strokes (like the reference levels). Cut: contours are cut into consecutive pairs (older generator).' }, h('span', {}, 'Mode'),
                h('select', { onchange: (e: Event) => { o.mode = (e.target as HTMLSelectElement).value as 'strokes' | 'cut'; this.renderGenerator(); } },
                    h('option', { value: 'strokes', selected: o.mode === 'strokes' }, 'Strokes'), h('option', { value: 'cut', selected: o.mode === 'cut' }, 'Cut contours'))),
            h('label', { class: 'field', title: o.mode === 'strokes' ? 'Stroke mode makes one line per stroke: this is the number you aim for (the drawing decides; add more lines with part 2)' : 'Pairs to cut the drawing into' }, h('span', {}, 'Pairs'), num('pairs', 1, 300)),
            h('label', { class: 'field' }, h('span', {}, 'Colours'), num('colors', 1, PALETTE.length)),
            h('label', { class: 'field' }, h('span', {}, 'Target difficulty'), select(['1', '2', '3', '4', '5'], String(o.difficulty), (v) => { o.difficulty = +v; this.renderGenerator(); })),
            h('label', { class: 'field', title: 'Radius of every dot of the generated level: one size for the whole level. When the drawing has strokes too small for this size, the board is made bigger instead of the dots smaller.' }, h('span', {}, 'Dot size'), num('dot', MIN_RADIUS, 32)),
            o.mode === 'strokes' ? h('label', { class: 'check', title: 'Small closed round details of the drawing (an eye, a nose, a button) become a big dot instead of a line. A line of the drawing that touches the detail carries the big dot; two details with no line are linked into one pair.' },
                h('input', { type: 'checkbox', checked: o.big, onchange: (e: Event) => { o.big = (e.target as HTMLInputElement).checked; } }), 'Big dots') : null,
            h('button', { class: 'accent', onclick: () => this.runGenerator() }, 'Generate lines')));
        col1.append(h('div', { class: 'suggest small', title: 'Placeholder rule until the real one is decided (spec: TBD)' },
            h('span', {}, `Suggested: ${sug.pairs} pairs, ${sug.colors} colours `), h('span', { class: 'tbd' }, 'rule TBD'),
            h('button', { onclick: () => { o.pairs = sug.pairs; o.colors = sug.colors; this.renderGenerator(); } }, 'Use'),
            h('span', { class: 'ok small' }, '✓ always solvable')));
        if (this.candidates.length) {
            col1.append(h('div', { class: 'cands' },
                h('span', { class: 'muted small' }, 'Pick:'),
                this.candidates.map((c, i) => h('button', { class: `cand${i === this.chosen ? ' on' : ''}`, title: `Score ${c.score.toFixed(2)} (lower is closer to the target difficulty)`, onclick: () => this.applyCandidate(i) },
                    miniature(c), h('div', { class: 'small' }, `${c.pairs.length} pairs · ${c.sim.rounds} rounds · ${c.sim.openAtStart} open`)))));
        }
        // ---- Part 2: overlap = cross lines drawn over the base lines, as a pattern ----
        col2.append(h('div', { class: 'gen-part', title: 'Cross lines as an ornament over the picture. X: crosses lines, both dots in empty space. T: one dot on a line (blocks it), the other in empty space. Only replaces the cross lines: the base lines are never changed.' }, h('b', {}, '2 · Overlap pattern'),
            h('span', { class: 'muted small' }, 'X and T cross lines only')));
        col2.append(h('div', { class: 'gen-row' },
            h('label', { class: 'field', title: 'Lines that cross other lines; both dots in empty space; block nothing' }, h('span', {}, 'X cross'), num('x', 0, 200)),
            h('label', { class: 'field', title: 'Lines with one dot on another line (blocks it) and one dot in empty space' }, h('span', {}, 'T cross'), num('t', 0, 200)),
            h('label', { class: 'field' }, h('span', {}, 'Pattern'),
                h('select', { onchange: (e: Event) => { o.pattern = (e.target as HTMLSelectElement).value as PatternStyle; } }, PATTERN_STYLES.map((p) => h('option', { value: p.id, selected: p.id === o.pattern }, p.label)))),
            h('button', { class: 'accent', onclick: () => this.runOverlap() }, 'Generate overlap'),
            h('button', { disabled: !(now.x + now.t), title: 'Remove every X and T cross line', onclick: () => { this.begin(); this.level.pairs = this.level.pairs.filter((p) => !p.cross); this.overlaps = []; this.selection.clear(); this.end(true); this.renderGenerator(); } }, 'Clear')));
        col2.append(h('div', { class: 'suggest small' }, h('span', {}, `Target lines: ${o.pairs} + ${o.x} X + ${o.t} T = `), h('b', {}, String(o.pairs + o.x + o.t)),
            h('span', { class: 'muted' }, ` · now ${now.base} + ${now.x} X + ${now.t} T = ${this.level.pairs.length}`)));
        if (this.overlaps.length) {
            const base = this.level.pairs.filter((p) => !p.cross);
            col2.append(h('div', { class: 'cands' },
                h('span', { class: 'muted small' }, 'Pick:'),
                this.overlaps.map((c, i) => h('button', { class: `cand${i === this.chosenOverlap ? ' on' : ''}`, title: c.warnings.join('. ') || 'All lines placed', onclick: () => this.applyOverlap(i) },
                    miniature({ pairs: [...base, ...c.pairs] }), h('div', { class: 'small' }, `${c.style} · ${c.x} X · ${c.t} T${c.symmetric ? ' · mirrored' : ''}`)))));
        }
        this.genPanel.append(h('div', { class: 'gen-cols' }, col1, col2), this.genNote);
    }

    /** Part 1: replaces the base lines only; cross lines (overlap) stay as they are. */
    private async runGenerator() {
        if (!this.image) return this.setStatus('Choose a PNG/JPG line drawing or an SVG first');
        if (this.generating) return this.setStatus('Still generating… (big drawings take a few seconds)');
        const baseNow = this.level.pairs.filter((p) => !p.cross).length;
        if (baseNow && !this.candidates.length && !confirm(`Replace the ${baseNow} base pairs of "${this.level.name}" with generated ones?`)) return;
        this.setStatus('Generating…');
        this.generating = true;
        await new Promise((r) => setTimeout(r, 30));
        try {
            const src = await strokesFrom(this.image.blob);
            if (!src.strokes.length) return this.setStatus('No lines found in the drawing');
            const t0 = performance.now();
            // Room for every line of the level (pairs + X + T). With an overlap in place, keep its scale.
            const unit = strokeFrame(src.strokes, 1000).k, rect = this.level.source?.rect;
            const total = this.genOpts.pairs + this.genOpts.x + this.genOpts.t;
            const keepScale = this.level.pairs.some((p) => p.cross) && rect;
            const size = keepScale ? Math.round((1000 * rect!.w) / (src.width * unit)) : this.genOpts.mode === 'strokes' ? Math.max(strokeWorldSize(src.strokes, total), MIN_BOARD) : worldSize(total);
            // World rectangle of the drawing for a layout of the given size (the image shown under the level).
            const rectFor = (sz: number) => { const f = strokeFrame(src.strokes, sz); return { x: r1(-f.cx * f.k), y: r1(-f.cy * f.k), w: r1(src.width * f.k), h: r1(src.height * f.k) }; };
            if (this.genOpts.mode === 'strokes') {
                const tg = strokeTargets(this.genOpts.difficulty);
                // With an overlap in place the scale is kept: the board cannot grow under the cross lines.
                this.candidates = (await inWorker('strokes', src.strokes, { pairs: this.genOpts.pairs, colors: this.genOpts.colors, difficulty: this.genOpts.difficulty, size, seed: Date.now(), tries: 8, keep: 3, fill: false, radius: this.genOpts.dot, bigDots: this.genOpts.big, grow: !keepScale, budgetMs: 8000 })).map((c) => {
                    const st = c.stats, pc = (v: number) => `${Math.round(v * 100)}%`;
                    return { pairs: c.pairs, sim: c.sim, score: c.score, rect: rectFor(st.size),
                        note: `Stroke mode: ${st.strokes} stroke(s) → ${st.lines} line(s). Dot radius ${st.radius} on a ${st.size} px board${st.size > size ? ` (made bigger from ${size} to fit the strokes)` : ''}${st.bigDots ? `, ${st.bigDots} big dot(s)` : ''}. Dots: ${pc(st.tDots)} on a line, ${pc(st.freeDots)} free, ${pc(st.touchingDots)} side by side. Open ${pc(st.openShare)} (target ${pc(tg.open)}), ${st.blocksPerLine.toFixed(2)} blocks per line (target ${tg.blocks}), depth ${st.depth}, ${st.crossingsPerLine.toFixed(2)} crossings per line. ${st.pulledBack} end(s) pulled back, ${st.extended} extended onto a line.${st.lines < this.genOpts.pairs ? ` ${this.genOpts.pairs - st.lines} line(s) short of Pairs: add them with part 2.` : ''}${c.warnings.length ? ' ' + c.warnings.join('. ') + '.' : ''}` };
                });
            } else {
                this.candidates = (await inWorker('cut', src.strokes, { pairs: this.genOpts.pairs, colors: this.genOpts.colors, difficulty: this.genOpts.difficulty, size, seed: Date.now(), tries: 24, keep: 3, radius: this.genOpts.dot })).map((c) => {
                    // Cut mode keeps one dot size too: in a tight layout every dot gets smaller together.
                    const got = mainRadius(c.pairs);
                    return { pairs: c.pairs, sim: c.sim, score: c.score, rect: rectFor(size),
                        note: `${src.strokes.length} line(s) in the drawing, ${c.stats.tJunctions} T-junction(s), ${c.stats.cuts} cut(s), ${c.stats.accents} accent pair(s). Dot radius ${got}${got < this.genOpts.dot ? ` (asked ${this.genOpts.dot}: every dot was made smaller to fit; raise Pairs or X/T for a bigger board)` : ''}.${c.warnings.length ? ' ' + c.warnings.join('. ') + '.' : ''}` };
                });
            }
            if (!this.candidates.length) return this.setStatus('Nothing generated');
            this.applyCandidate(0);
            const c = this.candidates[0];
            this.genNote.textContent = `${c.note} ${Math.round(performance.now() - t0)} ms.${this.overlapClash()} Generate again for new layouts.`;
            this.setStatus(`Generated ${this.candidates.length} layouts from ${isSvg(this.image.blob) ? 'SVG' : 'image'}`);
        } catch (e) {
            this.setStatus(`Generate failed: ${(e as Error).message}`);
        } finally {
            this.generating = false;
        }
    }

    /** After the base changed: do the kept overlap lines still fit? */
    private overlapClash(): string {
        if (!this.level.pairs.some((p) => p.cross)) return '';
        const bad = [...dataChecks(this.level), ...crossChecks(this.level.pairs)].some((c) => c.level === 'warn') || !solve(this.level).solvable;
        return bad ? ' The overlap lines were kept but no longer fit this base: press Generate overlap.' : ' Overlap lines kept.';
    }

    private applyCandidate(i: number) {
        const c = this.candidates[i];
        if (!c || !this.image) return;
        this.chosen = i;
        this.begin();
        // Cross lines (overlap) that stay get the new base's dot size; their big dots keep theirs.
        const base = structuredClone(c.pairs), size = mainRadius(base);
        const crossKept = this.level.pairs.filter((p) => p.cross);
        const crossMain = mainRadius(crossKept);
        for (const p of crossKept) for (const d of [p.a, p.b]) if (!isBigDot(d, crossMain)) d.r = size;
        this.level.pairs = [...base, ...crossKept];
        this.level.source = { ...this.level.source, image: `${this.level.id}.${isSvg(this.image.blob) ? 'svg' : 'png'}`, rect: c.rect, pairs: this.genOpts.pairs, colors: this.genOpts.colors, difficulty: this.genOpts.difficulty, mode: this.genOpts.mode, dot: this.genOpts.dot, big: this.genOpts.big };
        this.image.pending = true;
        this.selection.clear();
        this.end(true);
        this.canvas.fit();
        this.renderGenerator();
        this.genNote.textContent = `${c.note}${this.overlapClash()}`;
    }

    /** Part 2: replaces the cross lines only; the base lines are never touched. */
    private async runOverlap() {
        const base = this.level.pairs.filter((p) => !p.cross);
        if (!base.length) return this.setStatus('Generate or draw the base lines first (part 1)');
        if (this.genOpts.x + this.genOpts.t < 1) return this.setStatus('Set the number of X or T cross lines');
        this.setStatus('Generating overlap…');
        await new Promise((r) => setTimeout(r, 30));
        const t0 = performance.now();
        this.overlaps = generateOverlap(base, { x: this.genOpts.x, t: this.genOpts.t, difficulty: this.genOpts.difficulty, style: this.genOpts.pattern, seed: Date.now(), tries: 10, keep: 3 });
        if (!this.overlaps.length) return this.setStatus('No overlap generated');
        this.applyOverlap(0);
        this.setStatus(`Generated ${this.overlaps.length} overlap patterns in ${Math.round(performance.now() - t0)} ms`);
    }

    private applyOverlap(i: number) {
        const c = this.overlaps[i];
        if (!c) return;
        this.chosenOverlap = i;
        this.begin();
        const ids = new Set(this.level.pairs.filter((p) => !p.cross).map((p) => p.id));
        const fresh = structuredClone(c.pairs);
        for (const p of fresh) while (ids.has(p.id)) p.id += '_';
        this.level.pairs = [...this.level.pairs.filter((p) => !p.cross), ...fresh];
        this.level.source = { ...this.level.source, x: this.genOpts.x, t: this.genOpts.t, pattern: this.genOpts.pattern };
        this.selection.clear();
        this.end(true);
        this.genNote.textContent = `Overlap "${c.style}": ${c.x} X + ${c.t} T cross lines${c.symmetric ? ', mirrored' : ''}${c.stacked ? `, ${c.stacked} T on other cross lines` : ''}. ${c.warnings.length ? c.warnings.join('. ') + '. Try fewer lines, another pattern, or a bigger drawing.' : 'Crossing lines never share a colour.'} Generate again for other patterns.`;
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
                const input = h('input', { type: 'range', min: MIN_RADIUS, max: 48, step: 1, value: get(),
                    onpointerdown: () => this.begin(),
                    oninput: (e: Event) => { setv(+(e.target as HTMLInputElement).value); out.textContent = String(get()); this.canvas.render(); },
                    onchange: () => this.end(true) });
                return h('div', { class: 'slider' }, h('div', { class: 'row' }, h('span', { class: 'grow' }, label), out), input);
            };
            // Normal dots have the level's dot size (section "Level" below); only big dots have their own.
            const main = mainRadius(this.level.pairs);
            const dotControls = (label: string, d: Dot) => {
                const big = isBigDot(d, main);
                const box = h('input', { type: 'checkbox', checked: big, onchange: (e: Event) => {
                    this.begin();
                    if ((e.target as HTMLInputElement).checked) { d.big = true; d.r = Math.max(d.r, Math.round(main * 1.5)); }
                    else { delete d.big; d.r = main; }
                    this.end(true);
                } });
                const row = h('label', { class: 'check', title: 'Big dot: a round detail of the drawing, with its own size. A normal dot always has the level\'s dot size.' }, box, `${label}: big dot`);
                if (!big) return [row, h('div', { class: 'muted small' }, `Radius ${d.r} (the level's dot size)`)];
                return [row, slider(`${label} radius`, () => d.r, (v) => { d.r = v; d.big = true; })];
            };
            if (sel.length === 1) {
                const p = sel[0];
                this.inspector.append(...dotControls('Dot A', p.a), ...dotControls('Dot B', p.b));
            } else {
                const bigs = sel.flatMap((p) => [p.a, p.b]).filter((d) => isBigDot(d, main));
                if (bigs.length) this.inspector.append(slider(`Radius (${bigs.length} selected big dot${bigs.length > 1 ? 's' : ''})`, () => bigs[0].r, (v) => { for (const d of bigs) { d.r = v; d.big = true; } }));
                else this.inspector.append(h('div', { class: 'muted small' }, `No big dots selected: normal dots have the level's dot size (${main}).`));
            }
            const kind = new Set(sel.map((p) => p.cross ?? 'base'));
            this.inspector.append(h('label', { class: 'field', title: 'Base = a line of the drawing (generator part 1). X / T = cross lines of the overlap (part 2): Generate overlap replaces them.' }, h('span', {}, 'Line type'),
                h('select', { onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v === 'mixed') return; this.begin(); for (const p of sel) { if (v === 'base') delete p.cross; else p.cross = v as 'x' | 't'; } this.end(true); } },
                    [['base', 'Base line'], ['x', 'X cross (crosses lines)'], ['t', 'T cross (dot on a line)'], ...(kind.size > 1 ? [['mixed', 'Mixed']] : [])].map(([v, label]) => h('option', { value: v, selected: kind.size > 1 ? v === 'mixed' : kind.has(v as 'base') }, label)))));
            this.inspector.append(h('div', { class: 'row gap wrap' },
                h('button', { title: 'Round the selected lines: removes kinks and wobbles, rounds every corner', onclick: () => { this.begin(); for (const p of sel) p.path = smoothPath(p.path); this.end(true); } }, 'Smooth'),
                h('button', { title: 'Copy (Ctrl/Cmd+D)', onclick: () => this.duplicate() }, 'Copy'),
                h('button', { class: 'danger', title: 'Delete (Del)', onclick: () => this.deleteSelection() }, 'Delete'),
                h('button', { onclick: () => { this.selection.clear(); this.canvas.render(); this.renderInspector(); } }, 'Deselect')));
            if (sel.length === 1) this.inspector.append(h('div', { class: 'muted small' }, 'Drag the square points and round handles to bend the line. Double-click the line to add a point, double-click a point to remove it. Alt-drag a handle to break the mirror.'));
        }

        // Level: one dot size for every normal dot (big dots keep their own size).
        this.inspector.append(section('Level'));
        const main = mainRadius(this.level.pairs);
        this.inspector.append(h('label', { class: 'field', title: 'Radius of every normal dot of this level, cross lines included. Big dots keep their own size.' }, h('span', {}, 'Dot size'),
            h('input', { type: 'number', min: MIN_RADIUS, max: 32, value: main, class: 'num-input', onchange: (e: Event) => {
                const v = Math.max(MIN_RADIUS, Math.min(32, Math.round(+(e.target as HTMLInputElement).value) || main));
                this.begin();
                setDotSize(this.level.pairs, v);
                this.genOpts.dot = v;
                if (this.level.source) this.level.source.dot = v;
                this.end(true);
                this.renderGenerator();
            } })));

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
        const out = [...dataChecks(this.level), ...crossChecks(this.level.pairs)];
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

    private saveDraft = debounce(() => { if (this.store && this.dirty) this.store.writeDraft({ level: this.level, savedId: this.savedId, chapter: this.store.chapter }, this.image?.pending ? this.image.blob : null); }, 600);

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
            let saved: Level;
            try {
                saved = await this.store.save(this.level, this.savedId, this.image?.pending ? this.image.blob : null);
                if (this.image) this.image.pending = false;
            } catch (e) {
                if (!(e instanceof ImageSaveError)) throw e;
                // The level is saved; the image stays pending, so the next Save tries it again.
                saved = e.saved;
                alert(`Saved ${saved.name}, but its image could not be written.\n\n${e.cause?.message || e.cause}\n\nPress Save again to retry the image. If it keeps failing, reload the page and load the image again (Generate → image).`);
            }
            this.level = saved;
            this.savedId = saved.id;
            this.dirty = false;
            await this.store.writeDraft(null);
            await this.reload();
            this.renderSaveState();
            this.renderDetails();
            this.setStatus(`Saved ${saved.name} (version ${saved.rev})`);
        } catch (e) {
            const msg = `Save failed: ${(e as Error).message}`;
            this.setStatus(msg);
            alert(`${msg}\n\nNothing was saved. If the editor uses a folder, check that Chrome still has permission for it (Change storage → reconnect), then press Save again.`);
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

    /** Radius of a newly drawn dot: the level's dot size. */
    radiusDefault() {
        return this.level.pairs.length ? mainRadius(this.level.pairs) : this.genOpts.dot ?? DEFAULT_RADIUS;
    }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Small preview of a generated layout. */
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
