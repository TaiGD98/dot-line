import { defineConfig } from 'vite';

// Level editor: its own page, built to dist-editor/ and published at <pagesUrl>/editor/
// (latest site only, not part of versioned snapshots). Play loads the game from ../demo/.
export default defineConfig({
    root: 'editor',
    base: './',
    build: { outDir: '../dist-editor', emptyOutDir: true }
});
