import * as Phaser from 'phaser';
import { Game } from './scenes/Game';
import { Hud } from './scenes/Hud';
import { Door } from './scenes/Door';
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
    scene: MAGIC ? [Game, Hud, Door] : [Game, Hud]
};

// Wait for the UI font so the first HUD frame uses it.
let game: Phaser.Game;
document.fonts.load('40px Lilita').finally(() => {
    game = new Phaser.Game(config);
    mountDevPanel();
    if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
