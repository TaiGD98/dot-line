import * as Phaser from 'phaser';
import { SKIN } from '../game/mode';
import { ui } from '../game/skinui';
import { colour } from '../core/palette';
import { ballThumb } from './thumbs';
import { hasUi, uiKey } from './uiart';
import { FONT, OUTLINE } from './uikit';

/**
 * Loading screen between Home and a level (both ways) and from Well Done to the next level: the Home
 * screen's background (cream, soft clouds) with a loading line at the bottom: one ball of the current
 * look waits at the left, its partner runs from it to the right as the loading goes, a waving rope
 * between them, and the percent above.
 *
 * It slides in from the side (`dir` 1: from the right, -1: from the left) over the screen being left;
 * once it covers the screen, `covered` switches what is under it; the loading runs to 100%, waits half
 * a second, then the new screen (the scenes in `reveal`) slides in from the same side while the loading
 * screen slides out the other way, and `done` follows.
 */
export interface TransitionData {
    covered: () => void;
    done: () => void;
    dir: 1 | -1;
    reveal: string[];
}

/** Slide in / out, the loading run, the wait at 100% (ms). */
const SLIDE = 320, RUN = 900, HOLD = 500;

export class Transition extends Phaser.Scene {
    private rope!: Phaser.GameObjects.Graphics;
    private balls: Phaser.GameObjects.Container[] = [];
    private pct!: Phaser.GameObjects.Text;
    private ticks: ((t: number) => void)[] = [];
    private p = { f: 0 };

    constructor() {
        super('Transition');
    }

    create(data: TransitionData) {
        const { width: w, height: h } = this.scale;
        const k = ui(), cam = this.cameras.main;
        this.ticks = [];
        this.balls = [];
        this.p = { f: 0 };
        this.add.rectangle(w / 2, h / 2, w, h, k.home).setInteractive(); // covers and swallows taps
        for (const [x, y, sc] of [[100, 260, 1], [650, 420, 0.8], [120, 820, 0.9], [670, 1010, 1.1], [90, 1260, 0.7], [690, 1380, 0.8], [400, 160, 0.6]] as const)
            if (hasUi('cloud')) this.add.image(x, y, uiKey('cloud')).setScale((110 * sc) / 256).setAlpha(0.7);
        // The loading line: a waving rope between two balls of the same colour, the percent above it.
        this.rope = this.add.graphics();
        this.rope.setData('colour', parseInt(colour('red')!.base.slice(1), 16));
        for (let i = 0; i < 2; i++) {
            const c = this.add.container(0, 0);
            this.ticks.push(ballThumb(this, c, SKIN, 0, 0, 34));
            this.balls.push(c);
        }
        this.pct = this.add.text(w / 2, h - 320, '0%', { fontFamily: FONT, fontSize: '56px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 10 }).setOrigin(0.5);
        // In from the side, over the screen being left.
        cam.x = data.dir * w;
        this.tweens.add({
            targets: cam, x: 0, duration: SLIDE, ease: 'Cubic.easeOut', onComplete: () => {
                data.covered();
                this.tweens.add({
                    targets: this.p, f: 1, duration: RUN, ease: 'Sine.easeInOut', onComplete: () => this.time.delayedCall(HOLD, () => this.leave(data))
                });
            }
        });
    }

    /** The new screen slides in from the same side as this one came; this one slides out the other way. */
    private leave(data: TransitionData) {
        const w = this.scale.width;
        const cams = data.reveal.filter((k) => this.scene.isActive(k) || this.scene.isPaused(k)).map((k) => this.scene.get(k).cameras.main);
        for (const c of cams) { this.tweens.killTweensOf(c); c.x = data.dir * w; }
        this.tweens.add({ targets: cams, x: 0, duration: SLIDE, ease: 'Cubic.easeInOut' });
        this.tweens.add({
            targets: this.cameras.main, x: -data.dir * w, duration: SLIDE, ease: 'Cubic.easeInOut', onComplete: () => {
                data.done();
                this.scene.stop();
            }
        });
    }

    update(time: number) {
        const { width: w, height: h } = this.scale;
        const [a, b] = this.balls;
        if (!a) return;
        const t = time / 1000, y = h - 230, left = w / 2 - 270, right = left + 80 + this.p.f * (540 - 80);
        a.setPosition(left, y);
        b.setPosition(right, y);
        this.pct.setText(`${Math.round(this.p.f * 100)}%`);
        // The rope: a sine wave between the balls that runs along it, its swing fading at the ends.
        const g = this.rope, col = g.getData('colour') as number, len = right - left, N = 40;
        g.clear();
        g.lineStyle(10, col, 1);
        g.beginPath();
        for (let i = 0; i <= N; i++) {
            const u = i / N, x = left + u * len;
            const yy = y + Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 3 - t * 9) * Math.min(18, len * 0.06);
            if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.strokePath();
        for (const tick of this.ticks) tick(t);
    }
}
