// Publishes the levels you saved in the editor to the live game (GitHub Pages), in one command:
//   1. checks git: on main, in sync with GitHub, and only level files changed;
//   2. checks every level the game plays (src/game/playlist.ts): it must load, have no data
//      warnings and be solvable;
//   3. commits the changed level files, pushes main and rebuilds the latest site.
// The game on the web shows the new levels about a minute later.
//
// Run: npm run publish:levels            (-- --dry-run  checks only, commits and publishes nothing)
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dataChecks, parseLevel } from '../src/core/level';
import { solve } from '../src/core/solver';
import { crossChecks } from '../src/core/overlap';
import { PLAYLIST } from '../src/game/playlist';

const dry = process.argv.includes('--dry-run');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = (msg: string): never => {
    console.error(`\n✗ ${msg}\n`);
    process.exit(1);
};

// ---- 1. Git state ----
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Switch to the main branch first (git checkout main).');
git('fetch', '--quiet', 'origin');
if (Number(git('rev-list', '--count', 'HEAD..origin/main')) > 0) fail('GitHub has newer commits: run git pull first.');
// (not git(): trimming would eat the leading space of the first status line)
const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ code: l.slice(0, 2), path: l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '') }));
const levelChanges = changed.filter((c) => c.path.startsWith('levels/'));
const other = changed.filter((c) => !c.path.startsWith('levels/'));
if (other.length) {
    const msg = `Other files changed too (not levels). Commit them first, or undo them:\n${other.map((c) => `   ${c.code} ${c.path}`).join('\n')}`;
    if (!dry) fail(msg);
    console.log(`! ${msg}\n  (dry run: checking the levels anyway)`);
}
if (!levelChanges.length) {
    console.log('No level changes to publish: save the level in the editor first (with the project folder chosen).');
    process.exit(0);
}
console.log(`Level files changed (${levelChanges.length}):\n${levelChanges.map((c) => `   ${c.code} ${c.path}`).join('\n')}`);

// ---- 2. The levels the game plays ----
const order = (chapter: string): string[] => {
    const dir = `levels/${chapter}`;
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'collections.json').map((f) => f.slice(0, -5));
    const colFile = `${dir}/collections.json`;
    const first: string[] = existsSync(colFile) ? (JSON.parse(readFileSync(colFile, 'utf8')).collections?.[0]?.levels ?? []).filter((id: string) => files.includes(id)) : [];
    return [...first, ...files.filter((f) => !first.includes(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
};
const played = PLAYLIST.flatMap((entry) => {
    const [chapter, id] = entry.split('/');
    return (id === '*' ? order(chapter) : [id]).map((x) => ({ chapter, id: x }));
});
const problems: string[] = [];
played.forEach(({ chapter, id }, i) => {
    const file = `levels/${chapter}/${id}.json`;
    const n = `LEVEL ${i + 1} (${chapter}/${id})`;
    if (!existsSync(file)) return problems.push(`${n}: file missing`);
    try {
        const level = parseLevel(JSON.parse(readFileSync(file, 'utf8')));
        const warns = [...dataChecks(level), ...crossChecks(level.pairs)].filter((c) => c.level === 'warn').map((c) => c.text);
        const sim = solve(level);
        if (!sim.solvable) warns.push(`not solvable: ${sim.stuck.join(', ')} block each other`);
        if (warns.length) problems.push(`${n}: ${warns.join('; ')}`);
    } catch (e) {
        problems.push(`${n}: cannot be read (${(e as Error).message})`);
    }
});
if (problems.length) fail(`Fix these levels in the editor first (Level checks):\n${problems.map((p) => `   ${p}`).join('\n')}`);
console.log(`✓ All ${played.length} levels of the game load and can be solved.`);

if (dry) {
    console.log('\nDry run: nothing committed or published.');
    process.exit(0);
}

// ---- 3. Commit, push, publish ----
const names = [...new Set(levelChanges.map((c) => c.path.split('/').pop()!.replace(/\.(json|png|svg)$/, '')).filter((n) => !/^\d{3}_/.test(n) && n !== 'collections'))];
git('add', '--', 'levels');
execFileSync('git', ['commit', '--quiet', '-m', `Update levels: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}`], { stdio: 'inherit' });
console.log('Pushing to GitHub…');
execFileSync('git', ['push', '--quiet', 'origin', 'main'], { stdio: 'inherit' });
console.log('Building and publishing the game…');
execFileSync('bash', ['scripts/release.sh', 'latest'], { stdio: 'inherit' });
const pages = JSON.parse(readFileSync('prototype.config.json', 'utf8')).pagesUrl;
console.log(`\n✓ Published. The game shows the new levels in about a minute: ${pages}/demo/`);
