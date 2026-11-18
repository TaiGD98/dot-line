import * as Phaser from 'phaser';
import { BOTTOM_HEIGHT, BoardState, Game, HEARTS, HUD_HEIGHT } from './Game';
import { levels } from '../game/source';
import { onSettings, setSetting, settings } from '../game/settings';
import { theme } from '../game/theme';

const FONT = 'Lilita, system-ui, sans-serif';

/** "Hard" label: hard slots of the level system (category), else difficulty 4+. */
const isHard = (l: { category?: string; difficulty?: number | null }) => (l.category ? l.category === 'hard' : (l.difficulty ?? 0) >= 4);
const OUTLINE = '#26346e';

/** HUD (GDD 3.6): top band (pause, hearts, level, progress bar), bottom band with the boosters
 *  (hint, scissors; both AD), plus the win / lose screens
 *  styled after the prototype-ui shell ("Well Done!" + CONTINUE, red lose title + RETRY). */
export class Hud extends Phaser.Scene {
    private game$!: Game;
    private hearts: Phaser.GameObjects.Text[] = [];
    private bar!: Phaser.GameObjects.Graphics;
    private label!: Phaser.GameObjects.Text;
    private overlay: Phaser.GameObjects.Container | null = null;
    private hard!: Phaser.GameObjects.Text;
    private panels!: Phaser.GameObjects.Graphics;
    private scissors!: { box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics };
    private cutHint!: Phaser.GameObjects.Text;
    private tut: { kind: 'tap' | 'collision' | 'zoom'; ring: Phaser.GameObjects.Graphics; hand: Phaser.GameObjects.Text; text: Phaser.GameObjects.Text; t: number } | null = null;

    constructor() {
        super('Hud');
    }

    create() {
        this.game$ = this.scene.get('Game') as unknown as Game;
        const w = this.scale.width;

        const h = this.scale.height;
        // Top and bottom bands in the board's background colour: the board slides under them when zoomed.
        this.panels = this.add.graphics();
        this.drawPanels();
        this.roundButton(70, 90, 0xf6c9a8, (g) => { g.fillStyle(0xffffff, 1).fillRoundedRect(-14, -16, 10, 32, 3).fillRoundedRect(4, -16, 10, 32, 3); }, () => this.pause());
        // Boosters (bottom band): hint and scissors.
        const by = h - BOTTOM_HEIGHT / 2 - 18;
        this.booster(w / 2 - 110, by, 0x9db4f7, 'HINT', (g) => {
            // light bulb
            g.fillStyle(0xffffff, 1).fillCircle(0, -8, 18).fillRect(-8, 4, 16, 12);
            g.fillStyle(0xdfe6ff, 1).fillRoundedRect(-10, 18, 20, 7, 2);
        }, () => { this.game$.setCutting(false); this.game$.hint(); });
        const cut = this.booster(w / 2 + 110, by, 0xf59bb8, 'CUT', (g) => this.drawScissors(g), () => this.game$.setCutting(!this.game$.isCutting));
        const ring = this.add.graphics();
        cut.addAt(ring, 0);
        this.scissors = { box: cut, ring };
        this.cutHint = this.add.text(w / 2, h - BOTTOM_HEIGHT - 40, 'Tap a line to cut it', { fontFamily: FONT, fontSize: '44px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5).setVisible(false);
        this.game$.events.on('cutting', (on: boolean) => this.showCutting(on));
        for (let i = 0; i < HEARTS; i++) this.hearts.push(this.add.text(w / 2 + (i - 1) * 62, 90, '♥', { fontFamily: FONT, fontSize: '60px', color: '#e8333d' }).setOrigin(0.5));
        this.label = this.add.text(w / 2, 150, '', { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5);
        this.bar = this.add.graphics();
        const version = this.add.text(16, this.scale.height - 10, __APP_VERSION__, { fontSize: '20px', color: theme().version }).setOrigin(0, 1);
        const off = onSettings(() => {
            this.drawPanels();
            version.setColor(theme().version);
            if (this.tut) this.tut.text.setColor(theme().caption);
            if (this.lastState) this.updateState(this.lastState);
        });
        this.events.once('shutdown', off);

        this.game$.events.on('state', (s: BoardState) => this.updateState(s));
        this.game$.events.on('win', () => this.endScreen(true));
        this.game$.events.on('lose', () => this.endScreen(false));
        this.hard = this.add.text(w / 2, 34, 'Hard', { fontFamily: FONT, fontSize: '34px', color: '#a24bf0', stroke: '#ffffff', strokeThickness: 6 }).setOrigin(0.5).setVisible(false);
        this.game$.events.on('loaded', () => { this.closeOverlay(); this.startTutorial(); this.hard.setVisible(isHard(this.game$.current)); });
        this.game$.events.on('tapped', () => { if (this.tut && this.tut.kind !== 'zoom') this.endTutorial(); });
        this.game$.events.on('zoomed', () => { if (this.tut?.kind === 'zoom') this.endTutorial(); });
        if (this.game$.current) { this.startTutorial(); this.hard.setVisible(isHard(this.game$.current)); }
        if (this.game$.sys.isActive() && levels.level()) this.updateState(this.game$.state());
    }

    private drawPanels() {
        const { width: w, height: h } = this.scale;
        const bg = Phaser.Display.Color.HexStringToColor(theme().background).color;
        const g = this.panels;
        g.clear();
        g.fillStyle(bg, 1).fillRect(0, 0, w, HUD_HEIGHT);
        // Bottom band: rounded top corners and a soft shadow so it reads as a panel over the board.
        const top = h - BOTTOM_HEIGHT;
        for (let i = 1; i <= 6; i++) g.fillStyle(theme().shadow, 0.012 * (7 - i)).fillRoundedRect(0, top - i * 2, w, BOTTOM_HEIGHT + 40, 36);
        g.fillStyle(bg, 1).fillRoundedRect(0, top, w, BOTTOM_HEIGHT + 40, 36);
    }

    /** Booster button: round icon, name below, AD badge. */
    private booster(x: number, y: number, fill: number, name: string, icon: (g: Phaser.GameObjects.Graphics) => void, onClick: () => void) {
        const c = this.add.container(x, y);
        const g = this.add.graphics();
        g.fillStyle(fill, 1).fillCircle(0, 0, 52);
        g.lineStyle(6, 0xffffff, 1).strokeCircle(0, 0, 52);
        icon(g);
        const label = this.add.text(0, 76, name, { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5);
        const ad = this.add.text(40, -44, 'AD', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', backgroundColor: '#f07c1c', padding: { x: 6, y: 1 } }).setOrigin(0.5);
        c.add([g, label, ad]);
        c.setSize(120, 150).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
        return c;
    }

    /** White scissors: two blades open in a V (tips to the upper right), ring handles below. */
    private drawScissors(g: Phaser.GameObjects.Graphics) {
        g.save();
        g.rotateCanvas(Math.PI / 5);
        g.fillStyle(0xffffff, 1);
        // Blades: long thin wedges crossing at the pivot (0, 0).
        g.fillTriangle(-4, 6, 4, 2, 10, -32).fillTriangle(-4, 6, 10, -32, 5, -33);
        g.fillTriangle(4, 6, -4, 2, -10, -32).fillTriangle(4, 6, -10, -32, -5, -33);
        // Arms to the handles, and the rings.
        g.lineStyle(6, 0xffffff, 1);
        g.lineBetween(-2, 4, -9, 14).lineBetween(2, 4, 9, 14);
        g.strokeCircle(-12, 22, 9);
        g.strokeCircle(12, 22, 9);
        g.fillStyle(0xf59bb8, 1).fillCircle(0, 2, 3);
        g.restore();
    }

    /** Scissors armed: pulsing ring on the button and a caption above the bottom band. */
    private showCutting(on: boolean) {
        this.cutHint.setVisible(on);
        this.scissors.ring.clear();
        this.tweens.killTweensOf(this.scissors.box);
        this.scissors.box.setScale(1);
        if (!on) return;
        this.scissors.ring.fillStyle(0xffd25a, 1).fillCircle(0, 0, 64);
        this.tweens.add({ targets: this.scissors.box, scale: 1.08, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

    // ---------- tutorial (hand + caption) ----------

    private startTutorial() {
        this.endTutorial();
        const kind = this.game$.current?.tutorial;
        if (!kind) return;
        const caption = { tap: 'Tap a dot to send it home', collision: 'Bumping costs a heart', zoom: 'Pinch to zoom' }[kind];
        const ring = this.add.graphics().setDepth(5);
        const hand = this.add.text(0, 0, '👆', { fontSize: '120px' }).setOrigin(0.3, 0.05).setDepth(6);
        const text = this.add.text(this.scale.width / 2, this.scale.height - BOTTOM_HEIGHT - 70, caption, { fontFamily: FONT, fontSize: '64px', color: theme().caption }).setOrigin(0.5).setDepth(6);
        this.tut = { kind, ring, hand, text, t: 0 };
    }

    private endTutorial() {
        if (!this.tut) return;
        this.tut.ring.destroy(); this.tut.hand.destroy(); this.tut.text.destroy();
        this.tut = null;
    }

    update(_t: number, dt: number) {
        const tut = this.tut;
        if (!tut) return;
        // While the scissors are armed their caption replaces the tutorial.
        const cutting = this.game$.isCutting;
        tut.text.setVisible(!cutting);
        if (cutting) { tut.hand.setVisible(false); tut.ring.clear(); return; }
        tut.hand.setVisible(true);
        tut.t += dt / 1000;
        const pulse = (Math.sin(tut.t * 5) + 1) / 2;
        tut.ring.clear();
        if (tut.kind === 'zoom') {
            const cx = this.scale.width / 2, cy = this.scale.height * 0.55, spread = 40 + pulse * 70;
            tut.hand.setPosition(cx + spread * 0.5, cy + spread * 0.4).setAngle(-20);
            tut.ring.lineStyle(6, 0x8a5a2b, 0.35).strokeCircle(cx - spread * 0.4, cy - spread * 0.4, 26).strokeCircle(cx + spread * 0.4, cy + spread * 0.4, 26);
            return;
        }
        const target = this.game$.tutorialTarget(tut.kind);
        if (!target) { tut.hand.setVisible(false); return; }
        const p = this.game$.toScreen(target);
        tut.hand.setVisible(true).setPosition(p.x, p.y + 10 - pulse * 14);
        tut.ring.lineStyle(5, 0xffffff, 0.9).strokeCircle(p.x, p.y, 44 + pulse * 10);
        tut.ring.lineStyle(3, 0x8a5a2b, 0.25).strokeCircle(p.x, p.y, 44 + pulse * 10);
    }

    private lastState: BoardState | null = null;

    private updateState(s: BoardState) {
        this.lastState = s;
        this.hearts.forEach((h, i) => h.setAlpha(i < s.hearts ? 1 : 0.2));
        this.label.setText(`LEVEL ${s.number}`);
        const w = this.scale.width, x = 60, y = 190, bw = w - 120;
        this.bar.clear();
        this.bar.fillStyle(theme().progressTrack, 1).fillRoundedRect(x, y, bw, 14, 7);
        const f = s.total ? s.cleared / s.total : 0;
        if (f > 0) this.bar.fillStyle(theme().progressFill, 1).fillRoundedRect(x, y, Math.max(14, bw * f), 14, 7);
    }

    /** Pause button opens Settings (the game is paused while it is open). */
    private pause() {
        if (this.overlay) return;
        this.scene.pause('Game');
        this.showOverlay('Settings', '#9fd6ff', '#3f8de0', 'RESUME', 0x3fbf4a, () => { this.closeOverlay(); this.scene.resume('Game'); });
        const { width: w, height: h } = this.scale;
        const label = () => `THEME: ${settings.theme === 'dark' ? 'DARK' : 'LIGHT'}`;
        const colourOf = () => (settings.theme === 'dark' ? 0x3b4462 : 0xf2a93b);
        const themeBtn = this.button(w / 2, h * 0.47, label(), colourOf(), () => {
            setSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
            themeBtn.text.setText(label());
            themeBtn.paint(colourOf());
        });
        this.overlay!.add(themeBtn.box);
    }

    private button(x: number, y: number, text: string, colour: number, onClick: () => void) {
        const box = this.add.container(x, y);
        const g = this.add.graphics();
        const paint = (c: number) => {
            g.clear();
            g.fillStyle(c, 1).fillRoundedRect(-200, -50, 400, 100, 40);
            g.lineStyle(6, 0xffffff, 1).strokeRoundedRect(-200, -50, 400, 100, 40);
        };
        paint(colour);
        const t = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '50px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5);
        box.add([g, t]);
        box.setSize(400, 100).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
        return { box, text: t, paint };
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
