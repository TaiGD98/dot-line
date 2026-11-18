import { defineConfig, Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
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

export default defineConfig({
    plugins: [devTuning()],
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
