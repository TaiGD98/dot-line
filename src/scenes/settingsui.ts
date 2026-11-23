import * as Phaser from 'phaser';
import { setSetting, settings } from '../game/settings';
import { ui } from '../game/skinui';
import { FONT, IconName, popupCard, roundButton, wideButton } from './uikit';

/**
 * The Settings pop-up (the Settings wireframe), shared by the play screen and the Home screen: a dimmed
 * screen, the card with its title and close (X); an inset row of three toggles (sound effects, music,
 * vibration; grey and crossed out when off); then, on the play screen only, a long RESTART button and a
 * long HOME button; the version at the bottom. Closing (X, or a tap beside the card) calls `onClose`.
 */
export function settingsPopup(scene: Phaser.Scene, onClose: () => void, actions?: { restart: () => void; home: () => void }) {
    const k = ui();
    const { width: w, height: h } = scene.scale;
    const c = scene.add.container(0, 0).setDepth(10);
    const pw = 640, ph = actions ? 720 : 470, px = w / 2, py = h * 0.45;
    const top = py - ph / 2;
    const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x0b0b12, 0.55).setInteractive();
    dim.on('pointerup', onClose);
    c.add([dim, popupCard(scene, px, py, pw, ph, 'Settings', onClose).box]);
    // Toggles, in an inset box.
    const iy = top + 160;
    const inset = scene.add.graphics();
    inset.fillStyle(k.inset, 1).fillRoundedRect(px - pw / 2 + 60, iy, pw - 120, 190, 36);
    c.add(inset);
    const toggles: { key: 'sfx' | 'bgm' | 'vibrate'; icon: IconName }[] = [{ key: 'sfx', icon: 'sound' }, { key: 'bgm', icon: 'music' }, { key: 'vibrate', icon: 'vibrate' }];
    toggles.forEach((t, i) => {
        const b = roundButton(scene, px + (i - 1) * 170, iy + 95, 62, t.icon, () => {
            setSetting(t.key, !settings[t.key]);
            paint();
            if (t.key === 'vibrate' && settings.vibrate) navigator.vibrate?.(40);
        });
        const paint = () => b.paint(t.icon, settings[t.key] ? k.button : 0x9aa0ad, settings[t.key] ? k.buttonEdge : 0x6f7480, !settings[t.key]);
        paint();
        c.add(b.box);
    });
    if (actions) {
        // Long buttons under the toggles: RESTART (the level starts over), then HOME (the level map).
        c.add(wideButton(scene, px, iy + 290, 420, 108, 'RESTART', actions.restart).box);
        c.add(wideButton(scene, px, iy + 420, 420, 108, 'HOME', actions.home, k.button, k.buttonEdge).box);
    }
    c.add(scene.add.text(px, py + ph / 2 - 46, __APP_VERSION__, { fontFamily: FONT, fontSize: '26px', color: k.ink }).setOrigin(0.5));
    c.setAlpha(0);
    scene.tweens.add({ targets: c, alpha: 1, duration: 160 });
    return c;
}
