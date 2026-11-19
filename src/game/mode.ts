// Game variant. The jelly variant (/jelly/ on the site, or ?mode=jelly locally) plays the same
// levels with jelly dots: they deform while moving instead of leaving a trail, jiggle more on a
// bump, and a dot that reaches its partner presses into it and merges before popping.
// The site build sets window.__DOTLINE_MODE__ in jelly/index.html (scripts/build-site.sh).
const set = (window as unknown as { __DOTLINE_MODE__?: string }).__DOTLINE_MODE__;
export const JELLY = (set ?? new URLSearchParams(location.search).get('mode')) === 'jelly';
