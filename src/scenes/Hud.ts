import * as Phaser from 'phaser';
import { BoardState, Game, HEARTS } from './Game';
import { levels } from '../game/source';

const FONT = 'Lilita, system-ui, sans-serif';
const OUTLINE = '#26346e';

/** HUD (GDD 3.6): pause, hearts, hint (AD), progress bar; plus the win / lose screens
 *  styled after the prototype-ui shell ("Well Done!" + CONTINUE, red lose title + RETRY). */
export class Hud extends Phaser.Scene {
    private game$!: Game;
    private hearts: Phaser.GameObjects.Text[] = [];
    private bar!: Phaser.GameObjects.Graphics;
    private label!: Phaser.GameObjects.Text;
    private overlay: Phaser.GameObjects.Container | null = null;

    constructor() {
        super('Hud');
    }

    create() {
        this.game$ = this.scene.get('Game') as unknown as Game;
        const w = this.scale.width;

        this.roundButton(70, 90, 0xf6c9a8, (g) => { g.fillStyle(0xffffff, 1).fillRoundedRect(-14, -16, 10, 32, 3).fillRoundedRect(4, -16, 10, 32, 3); }, () => this.pause());
        this.roundButton(w - 70, 90, 0x9db4f7, (g) => {
            // light bulb
            g.fillStyle(0xffffff, 1).fillCircle(0, -6, 15).fillRect(-7, 4, 14, 10);
            g.fillStyle(0xdfe6ff, 1).fillRoundedRect(-8, 15, 16, 6, 2);
        }, () => this.game$.hint());
        const ad = this.add.text(w - 34, 52, 'AD', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', backgroundColor: '#f07c1c', padding: { x: 6, y: 1 } }).setOrigin(0.5);
        ad.setDepth(2);
        for (let i = 0; i < HEARTS; i++) this.hearts.push(this.add.text(w / 2 + (i - 1) * 62, 90, '♥', { fontFamily: FONT, fontSize: '60px', color: '#e8333d' }).setOrigin(0.5));
        this.label = this.add.text(w / 2, 150, '', { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5);
        this.bar = this.add.graphics();
        this.add.text(16, this.scale.height - 16, __APP_VERSION__, { fontSize: '20px', color: '#b5b0a5' }).setOrigin(0, 1);

        this.game$.events.on('state', (s: BoardState) => this.updateState(s));
        this.game$.events.on('win', () => this.endScreen(true));
        this.game$.events.on('lose', () => this.endScreen(false));
        this.game$.events.on('loaded', () => this.closeOverlay());
        if (this.game$.sys.isActive() && levels.level()) this.updateState(this.game$.state());
    }

    private roundButton(x: number, y: number, fill: number, icon: (g: Phaser.GameObjects.Graphics) => void, onClick: () => void) {
        const c = this.add.container(x, y);
        const g = this.add.graphics();
        g.fillStyle(fill, 1).fillCircle(0, 0, 40);
        g.lineStyle(5, 0xffffff, 1).strokeCircle(0, 0, 40);
        icon(g);
        c.add([g]);
        c.setSize(90, 90).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
        return c;
    }

    private updateState(s: BoardState) {
        this.hearts.forEach((h, i) => h.setAlpha(i < s.hearts ? 1 : 0.2));
        this.label.setText(`LEVEL ${s.number}`);
        const w = this.scale.width, x = 60, y = 190, bw = w - 120;
        this.bar.clear();
        this.bar.fillStyle(0xe5e2da, 1).fillRoundedRect(x, y, bw, 14, 7);
        const f = s.total ? s.cleared / s.total : 0;
        if (f > 0) this.bar.fillStyle(0xf6a26b, 1).fillRoundedRect(x, y, Math.max(14, bw * f), 14, 7);
    }

    private pause() {
        if (this.overlay) return;
        this.scene.pause('Game');
        this.showOverlay('Paused', '#ffb44c', '#ff7a1c', 'RESUME', 0x3fbf4a, () => { this.closeOverlay(); this.scene.resume('Game'); });
    }

    private endScreen(win: boolean) {
        if (win) {
            const confetti = this.add.particles(this.scale.width / 2, 300, 'spark', {
                speed: { min: 250, max: 700 }, angle: { min: 200, max: 340 }, gravityY: 900, lifespan: 1800, scale: { start: 0.9, end: 0.4 },
                tint: [0xff3b3b, 0xffc430, 0x43c0ff, 0x6bd234, 0x9f54fa, 0xff80c4], emitting: false
            });
            confetti.explode(120);
            this.time.delayedCall(2200, () => confetti.destroy());
            this.showOverlay('Well Done!', '#ffd25a', '#ff8a1c', 'CONTINUE', 0x3fbf4a, () => {
                const next = levels.next();
                if (next) this.game$.loadLevel(next);
            }, 0.55);
        } else {
            this.showOverlay('Out of Hearts!', '#ff8a8a', '#e8333d', 'RETRY', 0xe8333d, () => this.game$.restart(), 0.75, 'Every bump costs a heart.');
        }
    }

    private showOverlay(title: string, top: string, bottom: string, button: string, btnColour: number, onClick: () => void, dim = 0.75, sub?: string) {
        this.closeOverlay();
        const { width: w, height: h } = this.scale;
        const c = this.add.container(0, 0).setDepth(10);
        const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x0b0b12, dim).setInteractive();
        const t = this.add.text(w / 2, h * 0.36, title, { fontFamily: FONT, fontSize: '104px', color: top, stroke: OUTLINE, strokeThickness: 12 }).setOrigin(0.5);
        const grad = t.context.createLinearGradient(0, 0, 0, t.height);
        grad.addColorStop(0.2, top);
        grad.addColorStop(0.85, bottom);
        t.setFill(grad);
        c.add([bg, t]);
        if (sub) c.add(this.add.text(w / 2, h * 0.36 + 100, sub, { fontFamily: FONT, fontSize: '36px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5));
        const btn = this.add.container(w / 2, h * 0.6);
        const g = this.add.graphics();
        g.fillStyle(btnColour, 1).fillRoundedRect(-170, -55, 340, 110, 40);
        g.lineStyle(6, 0xffffff, 1).strokeRoundedRect(-170, -55, 340, 110, 40);
        btn.add([g, this.add.text(0, 0, button, { fontFamily: FONT, fontSize: '54px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5)]);
        btn.setSize(340, 110).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
        c.add(btn);
        this.overlay = c;
    }

    private closeOverlay() {
        this.overlay?.destroy();
        this.overlay = null;
    }
}
