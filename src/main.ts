import * as Phaser from 'phaser';
import { Game } from './scenes/Game';
import { Hud } from './scenes/Hud';
import { Door } from './scenes/Door';
import { Home } from './scenes/Home';
import { Transition } from './scenes/Transition';
import { MAGIC } from './game/mode';
import { mountDevPanel } from './game/devpanel';

// Portrait phone: 390x844 points rendered at 2x for crisp text.
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    title: 'Dot Line',
    backgroundColor: '#fbfaf3',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container',
        width: 780,
        height: 1688
    },
    input: { activePointers: 3 },
    // Magic: the Door scene is launched by Game and drawn below it.
    // Home (level map, theme picker) is launched by Game, over it.
    scene: MAGIC ? [Game, Hud, Door, Home, Transition] : [Game, Hud, Home, Transition]
};

// Wait for the UI font so the first HUD frame uses it.
let game: Phaser.Game;
performance.mark('dotline:boot');
document.fonts.load('40px Lilita').finally(() => {
    game = new Phaser.Game(config);
    mountDevPanel();
    if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
    // The dev panel's cheats reach the game through this.
    (window as unknown as { __dotlineGame: Phaser.Game }).__dotlineGame = game;
});
