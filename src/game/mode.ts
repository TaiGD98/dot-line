// Game variants, all playing the same levels:
// - classic (/demo/);
// - jelly (/jelly/, ?mode=jelly locally): dots deform while moving instead of leaving a trail, jiggle
//   more on a bump, and a dot that reaches its partner presses into it and merges before popping;
// - magic (/magic/, ?mode=magic): the level is a seal carved into a double door (src/scenes/Door.ts).
// The site build sets window.__DOTLINE_MODE__ in jelly/ and magic/index.html (scripts/build-site.sh).
const set = (window as unknown as { __DOTLINE_MODE__?: string }).__DOTLINE_MODE__;
export const MODE = set ?? new URLSearchParams(location.search).get('mode') ?? 'classic';
export const JELLY = MODE === 'jelly';
export const MAGIC = MODE === 'magic';
