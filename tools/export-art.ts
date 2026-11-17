// Writes art/levels/NNN_<art>.svg from the drawing library. Existing files are kept unless
// --force is given, so hand-edited or replaced SVGs survive. Run: npm run art [-- --force]
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { ART } from './art-library';
import { plan } from './level-plan';

const OUT = `${process.cwd()}/art/levels/`;
const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });
let wrote = 0, kept = 0;
for (const row of plan()) {
    const file = OUT + row.file;
    if (existsSync(file) && !force) { kept++; continue; }
    const body = ART[row.art].draw().map((e) => `  ${e}`).join('\n');
    writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" fill="none" stroke="#222" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">\n  <!-- Level ${row.level} · ${row.name} · ${row.role}. data-big="1" = pair with big dots. -->\n${body}\n</svg>\n`);
    wrote++;
}
console.log(`art/levels: wrote ${wrote}, kept ${kept} existing (use --force to overwrite)`);
