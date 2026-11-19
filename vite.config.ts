import { defineConfig, Plugin } from 'vite';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config from './prototype.config.json';

/** Dev server only: the game's dev panel (⚙ speed → Confirm) writes MOVE_SPEED into the code. */
function devTuning(): Plugin {
    return {
        name: 'dot-line-dev-tuning',
        configureServer(server) {
            server.middlewares.use('/__dev/tuning', (req, res) => {
                if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
                let body = '';
                req.on('data', (c) => (body += c));
                req.on('end', () => {
                    const v = Math.round(Number(JSON.parse(body || '{}').moveSpeed));
                    if (!(v >= 100 && v <= 5000)) { res.statusCode = 400; return res.end('moveSpeed must be 100-5000'); }
                    const file = resolve(__dirname, 'src/game/tuning.ts');
                    const src = readFileSync(file, 'utf8');
                    const next = src.replace(/export const MOVE_SPEED = \d+;/, `export const MOVE_SPEED = ${v};`);
                    if (next === src && !src.includes(`MOVE_SPEED = ${v};`)) { res.statusCode = 500; return res.end('MOVE_SPEED line not found'); }
                    writeFileSync(file, next);
                    res.end(JSON.stringify({ moveSpeed: v }));
                });
            });
        }
    };
}

/**
 * `virtual:game-levels`: exactly the levels the game plays, in order, and nothing else (so the build
 * matches the Organiser's play order). Read from levels/game.json ("<chapter>/<id>" or
 * "<chapter>/*" entries), else from the PLAYLIST in src/game/playlist.ts. Every file read is
 * watched: saving a level or the play order in the editor reloads the dev game, and only the game
 * (an "dotline:levels" event that src/game/source.ts listens to): Vite's own full reload would
 * reload every open page, the level editor too.
 */
function gameLevels(): Plugin {
    const ID = 'virtual:game-levels', RESOLVED = '\0' + ID;
    const root = __dirname;
    const watched = new Set<string>();
    return {
        name: 'dot-line-game-levels',
        resolveId: (id) => (id === ID ? RESOLVED : undefined),
        handleHotUpdate({ file, server }) {
            if (!watched.has(file)) return;
            const mod = server.moduleGraph.getModuleById(RESOLVED);
            if (mod) server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'custom', event: 'dotline:levels' });
            return [];
        },
        load(id) {
            if (id !== RESOLVED) return;
            const watch = (f: string) => { this.addWatchFile(f); watched.add(f); };
            const gameFile = resolve(root, 'levels/game.json');
            watch(gameFile);
            let order: string[] = [];
            if (existsSync(gameFile)) order = JSON.parse(readFileSync(gameFile, 'utf8')).levels ?? [];
            if (!order.length) {
                const playlist = resolve(root, 'src/game/playlist.ts');
                watch(playlist);
                const body = readFileSync(playlist, 'utf8').split('PLAYLIST')[1] ?? '';
                order = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
            }
            /** A chapter's own order: its first collection, then its other levels by id. */
            const chapterOrder = (chapter: string) => {
                const dir = resolve(root, 'levels', chapter);
                if (!existsSync(dir)) return [];
                const ids = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'collections.json').map((f) => f.slice(0, -5));
                const colFile = resolve(dir, 'collections.json');
                watch(colFile);
                const first: string[] = existsSync(colFile) ? (JSON.parse(readFileSync(colFile, 'utf8')).collections?.[0]?.levels ?? []).filter((x: string) => ids.includes(x)) : [];
                return [...first, ...ids.filter((x) => !first.includes(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
            };
            const out: { chapter: string; level: unknown }[] = [];
            const seen = new Set<string>();
            for (const entry of order) {
                const k = entry.indexOf('/'), chapter = entry.slice(0, k), id = entry.slice(k + 1);
                for (const x of id === '*' ? chapterOrder(chapter) : [id]) {
                    const key = `${chapter}/${x}`, file = resolve(root, 'levels', chapter, `${x}.json`);
                    if (seen.has(key)) continue; // a level listed twice plays at its first place
                    if (!existsSync(file)) { this.warn(`Play order: no level file for "${key}"`); continue; }
                    watch(file);
                    seen.add(key);
                    out.push({ chapter, level: JSON.parse(readFileSync(file, 'utf8')) });
                }
            }
            return `export default ${JSON.stringify(out)};`;
        }
    };
}

export default defineConfig({
    plugins: [devTuning(), gameLevels()],
    base: './',
    // Set by scripts/publish-site.sh ("latest" or a tag like "v0.2.0"); "dev" when run locally.
    define: { __APP_VERSION__: JSON.stringify(process.env.SITE_VERSION ?? 'dev') },
    // 127.0.0.1: reachable as localhost and 127.0.0.1 in every browser (Node's default 'localhost' binds IPv6 ::1 only).
    server: { port: config.devPort, host: '127.0.0.1' },
    build: {
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined)
            }
        }
    }
});
