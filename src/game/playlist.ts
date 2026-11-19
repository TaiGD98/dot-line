// Fallback play order, used only when levels/game.json does not exist. The play order is set in the
// level editor (Organiser → "Game · play order"), which writes levels/game.json.
// What the game plays, in order. Each entry is "<chapter>/<level id>" or "<chapter>/*" (the whole
// chapter in its own play order: its first collection, then its other levels by id).
// The level numbers shown in the game (LEVEL 1, 2, ...) follow this list.
// An empty list plays every chapter in folder order.
export const PLAYLIST: string[] = [
    'chapter-1/001-rainbow', // tutorial: tap
    'chapter-1/002-lollipop', // tutorial: bumping costs a heart
    'chapter-5/*'
];
