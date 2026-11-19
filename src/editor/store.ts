// Editor storage: a folder on disk (File System Access API, Chrome/Edge) or browser storage
// (IndexedDB). Both expose the same tiny file API; level, version, draft and collection logic
// sits on top once.
//
// <root>/
//   levels/<chapter>/                 one folder per chapter; each chapter is independent:
//     <id>.json                       level
//     <id>.png | <id>.svg             source image used by the generator (optional)
//     .versions/<id>/<rev>.json       3 most recent saved versions
//     collections.json                collection list of this chapter (the first one = play order)
//     collections/<name>/NNN_<id>.json  numbered copies in play order
//   drafts/current.json               autosaved draft of the open level (remembers its chapter)
// Older projects keep levels directly in levels/ with collections.json at the root: that layout
// still opens, as the chapter "" (shown as "levels/").
import { Level, parseLevel } from '../core/level';

export interface Files {
    kind: 'folder' | 'browser';
    label: string;
    read(path: string): Promise<string | null>;
    readBlob(path: string): Promise<Blob | null>;
    write(path: string, data: string | Blob): Promise<void>;
    remove(path: string): Promise<void>;
    /** File names (not dirs) directly inside `dir`. */
    list(dir: string): Promise<string[]>;
    /** Folder names directly inside `dir`. */
    listDirs(dir: string): Promise<string[]>;
    removeDir(dir: string): Promise<void>;
}

// ---------- IndexedDB helpers ----------

function idb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('dotline-editor', 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('files');
            req.result.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await idb();
    return new Promise((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export const kvGet = <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, v: unknown) => tx('kv', 'readwrite', (s) => s.put(v, key));

export class BrowserFiles implements Files {
    kind = 'browser' as const;
    label = 'Browser storage';
    async read(path: string) {
        const v = await tx<unknown>('files', 'readonly', (s) => s.get(path));
        if (v === undefined) return null;
        return typeof v === 'string' ? v : await (v as Blob).text();
    }
    async readBlob(path: string) {
        const v = await tx<unknown>('files', 'readonly', (s) => s.get(path));
        return v instanceof Blob ? v : null;
    }
    async write(path: string, data: string | Blob) {
        await tx('files', 'readwrite', (s) => s.put(data, path));
    }
    async remove(path: string) {
        await tx('files', 'readwrite', (s) => s.delete(path));
    }
    async list(dir: string) {
        const keys = (await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) as string[];
        const pre = dir.endsWith('/') ? dir : `${dir}/`;
        return keys.filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length));
    }
    async listDirs(dir: string) {
        const keys = (await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) as string[];
        const pre = dir.endsWith('/') ? dir : `${dir}/`;
        return [...new Set(keys.filter((k) => k.startsWith(pre) && k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length).split('/')[0]))];
    }
    async removeDir(dir: string) {
        const keys = (await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) as string[];
        const pre = dir.endsWith('/') ? dir : `${dir}/`;
        for (const k of keys) if (k.startsWith(pre)) await this.remove(k);
    }
}

// ---------- Folder on disk ----------

type DirHandle = FileSystemDirectoryHandle & {
    queryPermission(o: { mode: string }): Promise<PermissionState>;
    requestPermission(o: { mode: string }): Promise<PermissionState>;
    values(): AsyncIterable<FileSystemHandle>;
};

export const folderSupported = () => 'showDirectoryPicker' in window;

export class FolderFiles implements Files {
    kind = 'folder' as const;
    /**
     * true when the chosen folder is the levels folder itself (chapter folders directly inside)
     * rather than the project folder that contains levels/. Paths are mapped so both work.
     */
    private levelsOnly = false;
    constructor(private root: DirHandle) {}
    get label() {
        return this.levelsOnly ? `${this.root.name} (levels folder)` : this.root.name;
    }

    /** Project folder (has levels/) or the levels folder itself (chapter folders / level files inside)? */
    private async detect() {
        const dirs: string[] = [];
        let json = false;
        for await (const e of this.root.values()) {
            if (e.kind === 'directory') dirs.push(e.name);
            else if (e.name.endsWith('.json') && e.name !== 'package.json' && e.name !== 'collections.json') json = true;
        }
        this.levelsOnly = !dirs.includes('levels') && (this.root.name === 'levels' || dirs.some((d) => /^chapter/i.test(d)) || json);
        return this;
    }

    /** "levels/…" paths go straight into a chosen levels folder; the editor's own files into .dotline-editor/. */
    private map(path: string): string {
        if (!this.levelsOnly) return path;
        if (path === 'levels') return '';
        if (path.startsWith('levels/')) return path.slice(7);
        return `.dotline-editor/${path}`;
    }

    static async pick(): Promise<FolderFiles> {
        const root = (await (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite' }));
        await kvSet('folder', root);
        return new FolderFiles(root).detect();
    }

    /** Remembered folder; `needsPermission` means a click on Reconnect is required first. */
    static async remembered(): Promise<{ files: FolderFiles; needsPermission: boolean } | null> {
        const root = await kvGet<DirHandle>('folder');
        if (!root) return null;
        const state = await root.queryPermission({ mode: 'readwrite' });
        const files = new FolderFiles(root);
        // Without permission the folder can't be read yet; detect() again after reconnecting.
        if (state === 'granted') await files.detect();
        return { files, needsPermission: state !== 'granted' };
    }

    async reconnect(): Promise<boolean> {
        const ok = (await this.root.requestPermission({ mode: 'readwrite' })) === 'granted';
        if (ok) await this.detect();
        return ok;
    }

    private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
        let d: FileSystemDirectoryHandle = this.root;
        for (const p of parts) {
            try {
                d = await d.getDirectoryHandle(p, { create });
            } catch {
                return null;
            }
        }
        return d;
    }

    private split(path: string) {
        const parts = path.split('/').filter(Boolean);
        return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
    }

    async readBlob(path: string) {
        const { dirs, name } = this.split(this.map(path));
        const d = await this.dir(dirs, false);
        if (!d) return null;
        try {
            // A copy in memory, not the File itself: Chrome refuses to read a File from disk again once
            // the folder permission was granted again or the file was rewritten ("The requested file
            // could not be read…"), e.g. when Save writes the level's image later on.
            const f = await (await d.getFileHandle(name)).getFile();
            return new File([await f.arrayBuffer()], f.name, { type: f.type, lastModified: f.lastModified });
        } catch {
            return null;
        }
    }
    async read(path: string) {
        const b = await this.readBlob(path);
        return b ? await b.text() : null;
    }
    async write(path: string, data: string | Blob) {
        const { dirs, name } = this.split(this.map(path));
        const d = (await this.dir(dirs, true))!;
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(data);
        await w.close();
    }
    async remove(path: string) {
        const { dirs, name } = this.split(this.map(path));
        const d = await this.dir(dirs, false);
        try {
            await d?.removeEntry(name);
        } catch {
            /* already gone */
        }
    }
    async list(dir: string) {
        const d = (await this.dir(this.map(dir).split('/').filter(Boolean), false)) as DirHandle | null;
        if (!d) return [];
        const out: string[] = [];
        for await (const e of d.values()) if (e.kind === 'file') out.push(e.name);
        return out;
    }
    async listDirs(dir: string) {
        const d = (await this.dir(this.map(dir).split('/').filter(Boolean), false)) as DirHandle | null;
        if (!d) return [];
        const out: string[] = [];
        for await (const e of d.values()) if (e.kind === 'directory') out.push(e.name);
        return out;
    }
    async removeDir(dir: string) {
        const { dirs, name } = this.split(this.map(dir));
        const d = await this.dir(dirs, false);
        try {
            await d?.removeEntry(name, { recursive: true });
        } catch {
            /* already gone */
        }
    }
}

// ---------- Levels, versions, drafts, collections ----------

export const KEEP_VERSIONS = 3;

export interface Collection {
    name: string;
    version: number;
    levels: string[];
}

export interface Draft {
    level: Level;
    savedId: string | null;
    /** Chapter the draft belongs to (absent in old drafts = the root chapter ""). */
    chapter?: string;
}

/** Shown name of a chapter folder. */
export const chapterLabel = (c: string) => (c ? c : 'levels/ (no chapter)');

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** The game's play order: "<chapter>/<level id>" entries, levels from any chapter (the game reads it). */
export const GAME_FILE = 'levels/game.json';

/** Game play order, or null when the project has no levels/game.json yet. */
export async function readGame(files: Files): Promise<string[] | null> {
    const t = await files.read(GAME_FILE);
    if (!t) return null;
    try {
        const v = JSON.parse(t).levels;
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
    } catch {
        return null;
    }
}

export function writeGame(files: Files, entries: string[]) {
    return files.write(GAME_FILE, JSON.stringify({ levels: entries }, null, 2) + '\n');
}

/** The level was saved, but its image could not be written. */
export class ImageSaveError extends Error {
    constructor(public saved: Level, public cause: Error) {
        super(`the level was saved, but its image could not be written: ${cause?.message || cause}`);
    }
}

export class Store {
    /** `chapter` = folder under levels/ ("" = levels/ itself, the old single-chapter layout). */
    constructor(public files: Files, public chapter = '') {}

    /** Folder of this chapter's levels. */
    private get lv() {
        return this.chapter ? `levels/${this.chapter}` : 'levels';
    }
    private get colFile() {
        return this.chapter ? `${this.lv}/collections.json` : 'collections.json';
    }
    private get colDir() {
        return this.chapter ? `${this.lv}/collections` : 'collections';
    }

    /** Chapter folders (sorted), plus "" when levels/ itself holds level files. */
    static async chapters(files: Files): Promise<string[]> {
        const dirs = (await files.listDirs('levels')).filter((d) => !d.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const root = (await files.list('levels')).some((f) => f.endsWith('.json') && f !== 'game.json' && f !== 'collections.json');
        return [...(root ? [''] : []), ...dirs];
    }

    async levels(): Promise<Level[]> {
        const out: Level[] = [];
        for (const f of await this.files.list(this.lv)) {
            if (!f.endsWith('.json') || f === 'collections.json' || (!this.chapter && f === 'game.json')) continue;
            try {
                out.push(parseLevel(JSON.parse((await this.files.read(`${this.lv}/${f}`))!)));
            } catch (e) {
                console.warn(`Skipped ${this.lv}/${f}:`, e);
            }
        }
        return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    async exists(id: string) {
        return (await this.files.read(`${this.lv}/${id}.json`)) !== null;
    }

    async uniqueId(id: string): Promise<string> {
        if (!(await this.exists(id))) return id;
        let n = 2;
        while (await this.exists(`${id}-${n}`)) n++;
        return `${id}-${n}`;
    }

    /** Saves `level`; keeps the previous file as a version. `savedId` is the id it was loaded under. */
    async save(level: Level, savedId: string | null, image?: Blob | null): Promise<Level> {
        if (savedId && savedId !== level.id) await this.rename(savedId, level.id);
        const prev = await this.files.read(`${this.lv}/${level.id}.json`);
        if (prev) {
            const old = parseLevel(JSON.parse(prev));
            await this.files.write(`${this.lv}/.versions/${level.id}/${String(old.rev ?? 0).padStart(4, '0')}.json`, prev);
            const vs = (await this.files.list(`${this.lv}/.versions/${level.id}`)).sort();
            for (const v of vs.slice(0, Math.max(0, vs.length - KEEP_VERSIONS))) await this.files.remove(`${this.lv}/.versions/${level.id}/${v}`);
        }
        const saved = { ...level, rev: (level.rev ?? 0) + 1 };
        const ext = image ? (image.type === 'image/svg+xml' || (image as File).name?.toLowerCase().endsWith('.svg') ? 'svg' : 'png') : null;
        if (ext) saved.source = { ...(saved.source ?? {}), image: `${level.id}.${ext}` };
        // The level first: if writing the image fails, the level is still saved.
        await this.files.write(`${this.lv}/${level.id}.json`, json(saved));
        if (image && ext) {
            try {
                await this.files.write(`${this.lv}/${level.id}.${ext}`, image);
                await this.files.remove(`${this.lv}/${level.id}.${ext === 'svg' ? 'png' : 'svg'}`);
            } catch (e) {
                throw new ImageSaveError(saved, e as Error);
            }
        }
        return saved;
    }

    async versions(id: string): Promise<Level[]> {
        const out: Level[] = [];
        for (const v of (await this.files.list(`${this.lv}/.versions/${id}`)).sort().reverse()) {
            const t = await this.files.read(`${this.lv}/.versions/${id}/${v}`);
            if (t) out.push(parseLevel(JSON.parse(t)));
        }
        return out;
    }

    /** Source image of a level (PNG or SVG), typed so callers can tell them apart. */
    async image(id: string): Promise<Blob | null> {
        const png = await this.files.readBlob(`${this.lv}/${id}.png`);
        if (png) return png.type ? png : new Blob([png], { type: 'image/png' });
        const svg = await this.files.readBlob(`${this.lv}/${id}.svg`);
        return svg ? new Blob([svg], { type: 'image/svg+xml' }) : null;
    }

    /** Deletes the level file and its image; version history is kept. */
    async remove(id: string) {
        await this.files.remove(`${this.lv}/${id}.json`);
        await this.files.remove(`${this.lv}/${id}.png`);
        await this.files.remove(`${this.lv}/${id}.svg`);
    }

    /** Moves a level to a new id: file, image, history and collection entries. */
    async rename(oldId: string, newId: string) {
        if (oldId === newId) return;
        if (await this.exists(newId)) throw new Error(`Id "${newId}" already exists`);
        const text = await this.files.read(`${this.lv}/${oldId}.json`);
        if (text) await this.files.write(`${this.lv}/${newId}.json`, json({ ...JSON.parse(text), id: newId }));
        const img = await this.image(oldId);
        if (img) await this.files.write(`${this.lv}/${newId}.${img.type === 'image/svg+xml' ? 'svg' : 'png'}`, img);
        for (const v of await this.files.list(`${this.lv}/.versions/${oldId}`)) {
            const t = await this.files.read(`${this.lv}/.versions/${oldId}/${v}`);
            if (t) await this.files.write(`${this.lv}/.versions/${newId}/${v}`, json({ ...JSON.parse(t), id: newId }));
        }
        await this.files.removeDir(`${this.lv}/.versions/${oldId}`);
        await this.remove(oldId);
        const cols = await this.collections();
        for (const c of cols) c.levels = c.levels.map((id) => (id === oldId ? newId : id));
        await this.writeCollections(cols);
    }

    /** Imports level files; never overwrites (duplicate ids get -2, -3...). Returns new ids. */
    async import(files: File[]): Promise<{ added: string[]; errors: string[] }> {
        const added: string[] = [], errors: string[] = [];
        for (const f of files) {
            if (!f.name.endsWith('.json')) continue;
            try {
                const level = parseLevel(JSON.parse(await f.text()));
                level.id = await this.uniqueId(level.id);
                await this.files.write(`${this.lv}/${level.id}.json`, json(level));
                added.push(level.id);
            } catch (e) {
                errors.push(`${f.name}: ${(e as Error).message}`);
            }
        }
        return { added, errors };
    }

    async draft(): Promise<Draft | null> {
        const t = await this.files.read('drafts/current.json');
        try {
            return t ? (JSON.parse(t) as Draft) : null;
        } catch {
            return null;
        }
    }

    /** Autosaved draft; `image` is an unsaved source image (null removes it, undefined keeps it). */
    async writeDraft(d: Draft | null, image?: Blob | null) {
        if (!d) {
            await this.files.remove('drafts/current.json');
            await this.files.remove('drafts/current.img');
            return;
        }
        await this.files.write('drafts/current.json', json(d));
        if (image) {
            await this.files.write('drafts/current.img', image);
            await this.files.write('drafts/current.img.type', image.type || 'image/png');
        } else if (image === null) await this.files.remove('drafts/current.img');
    }

    async draftImage(): Promise<Blob | null> {
        const b = await this.files.readBlob('drafts/current.img');
        if (!b) return null;
        return new Blob([b], { type: (await this.files.read('drafts/current.img.type')) ?? 'image/png' });
    }

    async collections(): Promise<Collection[]> {
        const t = await this.files.read(this.colFile);
        try {
            return t ? ((JSON.parse(t).collections ?? []) as Collection[]) : [];
        } catch {
            return [];
        }
    }

    writeCollections(cols: Collection[]) {
        return this.files.write(this.colFile, json({ collections: cols }));
    }

    static copyName(index: number, id: string) {
        return `${String(index + 1).padStart(3, '0')}_${id}.json`;
    }

    async copyStatus(c: Collection): Promise<Set<string>> {
        return new Set(await this.files.list(`${this.colDir}/${c.name}`));
    }

    /** Writes collections.json and the numbered copies; `oldName` folder is removed after a rename. */
    async saveCollection(all: Collection[], c: Collection, oldName: string | null) {
        await this.writeCollections(all);
        if (oldName && oldName !== c.name) await this.files.removeDir(`${this.colDir}/${oldName}`);
        await this.files.removeDir(`${this.colDir}/${c.name}`);
        let copied = 0;
        for (let i = 0; i < c.levels.length; i++) {
            const t = await this.files.read(`${this.lv}/${c.levels[i]}.json`);
            if (!t) continue;
            await this.files.write(`${this.colDir}/${c.name}/${Store.copyName(i, c.levels[i])}`, t);
            copied++;
        }
        return copied;
    }
}
