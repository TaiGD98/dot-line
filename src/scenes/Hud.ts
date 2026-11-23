import * as Phaser from 'phaser';
import { BOTTOM_HEIGHT, BoardState, Game, HEARTS, HUD_HEIGHT } from './Game';
import { levels } from '../game/source';
import { onSettings, setSetting, settings } from '../game/settings';
import { MAGIC } from '../game/mode';
import { handTip, hasArt, key as fluffyKey } from './fluffy';
import { theme } from '../game/theme';
import { PALETTE, ui } from '../game/skinui';
import { Unlock, progress, unlocksBetween } from '../game/progress';
import { ballThumb, bgThumb } from './thumbs';
import { settingsPopup } from './settingsui';
import { hasUi, hexOf, recolour, uiKey } from './uiart';
import { fromEditor } from '../game/source';
import { BACKGROUNDS, BackgroundId, SKINS, SkinId, chooseLook } from '../game/mode';
import { FONT, OUTLINE, popupCard, roundButton, wideButton } from './uikit';


/** "Hard" label: hard slots of the level system (category), else difficulty 4+. */
const isHard = (l: { category?: string; difficulty?: number | null }) => (l.category ? l.category === 'hard' : (l.difficulty ?? 0) >= 4);

/** HUD (GDD 3.6): top band (pause, hearts, level, progress bar), bottom band with the boosters
 *  (hint, scissors; both AD), plus the win / lose screens
 *  styled after the prototype-ui shell ("Well Done!" + CONTINUE, red lose title + RETRY). */
/** Extra card height for the level progress block of an "Are you sure?" pop-up. */
const PROGRESS_SPACE = 0;

export class Hud extends Phaser.Scene {
    private game$!: Game;
    private hearts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
    private bar!: Phaser.GameObjects.Graphics;
    private label!: Phaser.GameObjects.Text;
    private overlay: Phaser.GameObjects.Container | null = null;
    private hard!: Phaser.GameObjects.Text;
    private panels!: Phaser.GameObjects.Graphics;
    private panelsBottom!: Phaser.GameObjects.Graphics;
    /** Magic: everything in the top and bottom bands, with its resting y (they slide out for the win). */
    private bands: { o: Phaser.GameObjects.Components.Transform; y: number; dir: -1 | 1 }[] = [];
    /** The HUD's own objects (hidden while the Well Done screen is up). */
    private chrome: Phaser.GameObjects.Components.Visible[] = [];
    private chromeShown = new Map<Phaser.GameObjects.Components.Visible, boolean>();
    private bandShown = { k: 1 };
    private scissors!: { box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics };
    private cutHint!: Phaser.GameObjects.Text;
    private tut: { kind: 'tap' | 'collision' | 'zoom'; ring: Phaser.GameObjects.Graphics; hand: Phaser.GameObjects.Text | Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; t: number } | null = null;

    constructor() {
        super('Hud');
    }

    create() {
        this.game$ = this.scene.get('Game') as unknown as Game;
        // (A restart after a look change starts from nothing.)
        this.hearts = [];
        this.bands = [];
        this.tut = null;
        this.overlay = null;
        this.lastState = null;
        const w = this.scale.width;

        const h = this.scale.height;
        // Top and bottom bands in the board's background colour: the board slides under them when zoomed.
        this.panels = this.add.graphics();
        this.panelsBottom = this.add.graphics();
        this.drawPanels();
        if (hasUi('round')) roundButton(this, 70, 90, 42, 'pause', () => this.pause(), PALETTE.peach, PALETTE.peachEdge);
        else this.roundButton(70, 90, 0xf6c9a8, (g) => { g.fillStyle(0xffffff, 1).fillRoundedRect(-14, -16, 10, 32, 3).fillRoundedRect(4, -16, 10, 32, 3); }, () => this.pause());
        // Light / dark board: a round sun / moon button at the top right (it used to be in Settings).
        const themeBtn = roundButton(this, w - 70, 90, 40, settings.theme === 'dark' ? 'moon' : 'sun', () => setSetting('theme', settings.theme === 'dark' ? 'light' : 'dark'),
            0x3b4462, 0x232a40);
        const paintTheme = () => (settings.theme === 'dark' ? themeBtn.paint('moon', 0x3b4462, 0x232a40) : themeBtn.paint('sun', 0xf6b13b, 0xc98a1f));
        paintTheme();
        this.events.once('shutdown', onSettings(paintTheme));
        // Boosters (bottom band): hint and scissors.
        const by = h - BOTTOM_HEIGHT / 2 - 18;
        this.booster(w / 2 - 110, by, PALETTE.pink, 'HINT', (g) => {
            // light bulb
            g.fillStyle(0xffffff, 1).fillCircle(0, -8, 18).fillRect(-8, 4, 16, 12);
            g.fillStyle(0xdfe6ff, 1).fillRoundedRect(-10, 18, 20, 7, 2);
        }, () => { this.game$.setCutting(false); this.game$.hint(); });
        const cut = this.booster(w / 2 + 110, by, PALETTE.pink, 'CUT', (g) => this.drawScissors(g), () => this.game$.setCutting(!this.game$.isCutting));
        const ring = this.add.graphics();
        cut.addAt(ring, 0);
        this.scissors = { box: cut, ring };
        this.cutHint = this.add.text(w / 2, h - BOTTOM_HEIGHT - 40, 'Tap a line to cut it', { fontFamily: FONT, fontSize: '44px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5).setVisible(false);
        this.game$.events.on('cutting', (on: boolean) => this.showCutting(on));
        // Play on: the refilled hearts pop one after another.
        this.game$.events.on('playOn', () => this.hearts.forEach((ht, i) => {
            // Back to each heart's own size (the heart picture is scaled down, the ♥ text is not).
            const full = ht instanceof Phaser.GameObjects.Image ? 60 / 128 : 1;
            ht.setScale(full * 0.3);
            this.tweens.add({ targets: ht, scale: full, duration: 380, delay: 120 * i, ease: 'Back.easeOut' });
        }));
        this.game$.events.on('freebump', () => this.toast('Free this time!\nNext bump costs a heart'));
        // Hearts: the heart icon in red (or a ♥ when there is no picture).
        for (let i = 0; i < HEARTS; i++) this.hearts.push(hasUi('icon-heart')
            ? this.add.image(w / 2 + (i - 1) * 66, 90, uiKey('icon-heart')).setTint(0xff4d5e).setScale(60 / 128)
            : this.add.text(w / 2 + (i - 1) * 62, 90, '♥', { fontFamily: FONT, fontSize: '60px', color: '#e8333d' }).setOrigin(0.5));
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
        // The HUD as made here (top and bottom bands, buttons, hearts...): hidden on the Well Done screen.
        this.chrome = this.children.list.filter((o) => o !== this.cutHint) as unknown as Phaser.GameObjects.Components.Visible[];
        this.game$.events.on('loaded', () => { this.showChrome(true); this.closeOverlay(); this.endTutorial(); this.hard.setVisible(isHard(this.game$.current)); });
        // The tutorial comes once the dots have run out (intro done); Magic: it goes when the last dot is gone.
        this.game$.events.on('introDone', () => this.startTutorial());
        this.game$.events.on('allCleared', () => this.endTutorial());
        this.game$.events.on('tapped', () => { if (this.tut && this.tut.kind !== 'zoom') this.endTutorial(); });
        this.game$.events.on('zoomed', () => { if (this.tut?.kind === 'zoom') this.endTutorial(); });
        if (this.game$.current) { if (!MAGIC) this.startTutorial(); this.hard.setVisible(isHard(this.game$.current)); }
        if (MAGIC) {
            // The bands leave for the Well Done screen (the door opens onto the room) and slide back in
            // once the door has closed on the next level: the top one from above, the bottom one from below.
            for (const o of this.children.list as unknown as (Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject)[]) {
                if (o === this.cutHint) continue;
                const dir = o === this.panels || o === this.bar ? -1 : o === this.panelsBottom ? 1 : o.y < HUD_HEIGHT ? -1 : o.y > h - BOTTOM_HEIGHT ? 1 : 0;
                if (dir) this.bands.push({ o, y: o.y, dir });
            }
            this.setBands(0);
            this.game$.events.on('doorClosed', () => this.slideBands(true));
            this.game$.events.on('doorOpening', () => this.slideBands(false));
        }
        if (this.game$.sys.isActive() && levels.level()) this.updateState(this.game$.state());
    }

    /** Magic: bands at k (1 = in place, 0 = slid off the screen). */
    private setBands(k: number) {
        for (const b of this.bands) b.o.y = b.y + b.dir * (1 - k) * (b.dir < 0 ? HUD_HEIGHT + 30 : BOTTOM_HEIGHT + 70);
    }

    private slideBands(show: boolean) {
        this.tweens.killTweensOf(this.bandShown);
        this.tweens.add({
            targets: this.bandShown, k: show ? 1 : 0, duration: show ? 420 : 320, ease: show ? 'Back.easeOut' : 'Quad.easeIn',
            onUpdate: () => this.setBands(this.bandShown.k)
        });
    }

    private drawPanels() {
        const { width: w, height: h } = this.scale;
        const bg = Phaser.Display.Color.HexStringToColor(theme().background).color;
        let g = this.panels;
        g.clear();
        g.fillStyle(bg, 1).fillRect(0, 0, w, HUD_HEIGHT);
        g = this.panelsBottom;
        g.clear();
        // Bottom band: rounded top corners and a soft shadow so it reads as a panel over the board.
        const top = h - BOTTOM_HEIGHT;
        for (let i = 1; i <= 6; i++) g.fillStyle(theme().shadow, 0.012 * (7 - i)).fillRoundedRect(0, top - i * 2, w, BOTTOM_HEIGHT + 40, 36);
        g.fillStyle(bg, 1).fillRoundedRect(0, top, w, BOTTOM_HEIGHT + 40, 36);
    }

    /** Booster button: round icon, name below, AD badge. */
    private booster(x: number, y: number, fill: number, name: string, icon: (g: Phaser.GameObjects.Graphics) => void, onClick: () => void) {
        const c = this.add.container(x, y);
        const g = this.add.graphics();
        const art = name === 'HINT' ? 'hint' : 'cut';
        if (hasUi('round') && hasUi(`icon-${art}`)) {
            // The round button picture in the booster's colour, the icon picture on it.
            const bg = this.add.image(0, 0, fill === PALETTE.pink ? uiKey('round') : recolour(this, 'round', `#${fill.toString(16).padStart(6, '0')}`, 0.6));
            bg.setScale(118 / bg.width);
            const ic = this.add.image(0, -2, uiKey(`icon-${art}`));
            ic.setScale(64 / ic.width);
            c.add([bg, ic]);
        } else {
            g.fillStyle(fill, 1).fillCircle(0, 0, 52);
            g.lineStyle(6, 0xffffff, 1).strokeCircle(0, 0, 52);
            icon(g);
        }
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

    /** Short message above the bottom band that fades out by itself. */
    private toast(message: string) {
        const t = this.add.text(this.scale.width / 2, this.scale.height - BOTTOM_HEIGHT - 120, message, { fontFamily: FONT, fontSize: '50px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 9, align: 'center' }).setOrigin(0.5).setDepth(8).setScale(0.6);
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 2200, duration: 500, onComplete: () => t.destroy() });
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
        const caption = { tap: 'Tap a dot to send it home', collision: 'Blocked dots bounce back', zoom: 'Pinch to zoom' }[kind];
        const ring = this.add.graphics().setDepth(5);
        // The tutorial hand picture (hand.png, once it is there; one for every look), its fingertip on the target.
        const handKey = hasUi('hand') && this.textures.exists(uiKey('hand')) ? uiKey('hand') : hasArt('hand') && this.textures.exists(fluffyKey('hand')) ? fluffyKey('hand') : null;
        const hand = handKey
            ? (() => { const tip = handTip(this, handKey), img = this.add.image(0, 0, handKey); return img.setOrigin(tip.x, tip.y).setScale(170 / img.height).setDepth(6); })()
            : this.add.text(0, 0, '👆', { fontSize: '120px' }).setOrigin(0.3, 0.05).setDepth(6);
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

    /** A dimmed screen under a pop-up (taps on it do `onTap`, or nothing). */
    private dim(alpha: number, onTap?: () => void) {
        const { width: w, height: h } = this.scale;
        const r = this.add.rectangle(w / 2, h / 2, w, h, 0x0b0b12, alpha).setInteractive();
        if (onTap) r.on('pointerup', onTap);
        return r;
    }

    /**
     * Pause button opens the Settings pop-up (settingsui.ts; the game is paused while it is open): the
     * three toggles, then a long RESTART and a long HOME button. Closing it (X) plays on.
     */
    private pause() {
        if (this.overlay) return;
        this.scene.pause('Game');
        this.closeOverlay();
        const resume = () => { this.closeOverlay(); this.scene.resume('Game'); };
        this.overlay = settingsPopup(this, resume, {
            restart: () => this.confirmLeave('restart'),
            home: () => this.confirmLeave('home')
        });
    }

    private endScreen(win: boolean) {
        if (win) {
            if (MAGIC && this.tut) this.endTutorial(); // nothing over the room behind the door
            // The next level is saved now. CONTINUE: the next level comes on screen, its dots still at the
            // start of their lines; first a pop-up for each ball, then each background, that just opened
            // (APPLY / LATER / a tap beside it), then the level's intro run.
            const before = progress.reached;
            const next = levels.next();
            const opened = fromEditor ? [] : unlocksBetween(before, progress.reached);
            this.wellDone(before, () => {
                if (!next) return;
                // Through the transition screen: under it the Well Done screen goes and the next level comes
                // (empty, its intro held); once it has gone, the new-look pop-ups (if any), then the intro.
                this.game$.transition(() => this.game$.loadLevel(next, true), () => {
                    if (opened.length) this.offerLooks(opened, {}, () => this.game$.releaseIntro());
                    else this.game$.releaseIntro();
                });
            });
        } else {
            // Play on (AD): refill the hearts and keep going from here. Quit asks first (the progress is lost).
            this.showOverlay('Out of Hearts!', 'PLAY ON', () => this.playOn(), 0.75, 'Refill your hearts and keep going?',
                { label: 'GIVE UP', colour: PALETTE.red, onClick: () => this.confirmQuit() }, true);
            this.heartFill();
        }
    }

    /** Hide (false) or bring back (true) the HUD's own objects, keeping what was already hidden hidden. */
    private showChrome(on: boolean) {
        if (!on) {
            this.chromeShown.clear();
            for (const o of this.chrome) { this.chromeShown.set(o, o.visible); o.setVisible(false); }
        } else {
            for (const [o, v] of this.chromeShown) o.setVisible(v);
            this.chromeShown.clear();
        }
    }

    /**
     * Well Done screen: the HUD's bands go, no card: on the Home screen's background only the big "Well Done!",
     * the progress towards the next ball / background (if one is still locked) and CONTINUE. The
     * progress: the next look(s) as black silhouettes with a "?" over a bar of levels won / the level
     * to win (filling from before this win to now); when the bar fills, the silhouettes light up into
     * the look itself with a glow.
     */
    private wellDone(before: number, onContinue: () => void) {
        this.closeOverlay();
        this.endTutorial();
        this.showChrome(false);
        const { width: w, height: h } = this.scale;
        const c = this.add.container(0, 0).setDepth(10);
        // The Home screen's background (cream, a few soft clouds) instead of a dark dim; Magic keeps the
        // room behind its open door.
        c.add(this.add.rectangle(w / 2, h / 2, w, h, ui().home, MAGIC ? 0 : 1).setInteractive());
        if (!MAGIC) for (const [x, y, sc] of [[100, 260, 1], [650, 420, 0.8], [120, 820, 0.9], [670, 1010, 1.1], [90, 1260, 0.7], [690, 1380, 0.8], [400, 160, 0.6]] as const) {
            if (hasUi('cloud')) c.add(this.add.image(x, y, uiKey('cloud')).setScale((110 * sc) / 256).setAlpha(0.7));
        }
        const title = this.add.text(w / 2, h * 0.27, 'Well Done!', { fontFamily: FONT, fontSize: '112px', color: '#ffd25a', stroke: OUTLINE, strokeThickness: 14 }).setOrigin(0.5);
        const grad = title.context.createLinearGradient(0, 0, 0, title.height);
        grad.addColorStop(0.2, '#ffd25a');
        grad.addColorStop(0.85, hexOf(PALETTE.peach));
        title.setFill(grad);
        c.add(title);
        this.tweens.add({ targets: title, scale: { from: 0.6, to: 1 }, duration: 380, ease: 'Back.easeOut' });
        // Progress towards the next unlock (levels won are reached - 1).
        const wonBefore = before - 1, wonNow = progress.reached - 1;
        const lv = fromEditor ? [] : [...SKINS, ...BACKGROUNDS].map((l) => l.unlock).filter((u) => u > wonBefore);
        if (lv.length) {
            const at = Math.min(...lv), items = unlocksBetween(at, at + 1);
            const sy = h * 0.43, gap = 220, x0 = w / 2 - ((items.length - 1) * gap) / 2;
            const reveal: (() => void)[] = [];
            items.forEach((u, i) => {
                const x = x0 + i * gap;
                const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setPosition(x, sy);
                for (let r = 120; r > 0; r -= 12) glow.fillStyle(0xfff0b0, 0.05 + 0.06 * (1 - r / 120)).fillCircle(0, 0, r);
                const holder = this.add.container(0, 0);
                const tick = u.kind === 'ball' ? ballThumb(this, holder, u.look.id as SkinId, x, sy, 70) : bgThumb(this, holder, u.look.id as BackgroundId, x, sy, 130, 130, true);
                // Black silhouette: every picture of the thumbnail filled dark.
                const pics = holder.list.filter((o) => o instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image[];
                for (const p of pics) { p.tintMode = Phaser.TintModes.FILL; p.setTint(0x2b2530); }
                const q = this.add.text(x, sy, '?', { fontFamily: FONT, fontSize: '84px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 10 }).setOrigin(0.5);
                c.add([glow, holder, q]);
                const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => tick(this.time.now / 1000) });
                holder.once('destroy', () => ev.remove());
                reveal.push(() => {
                    // Light up: the "?" goes, the silhouette turns into the look, a soft glow swells behind it.
                    this.tweens.add({ targets: q, alpha: 0, scale: 1.6, duration: 260 });
                    this.time.delayedCall(120, () => { for (const p of pics) { p.tintMode = Phaser.TintModes.MULTIPLY; p.clearTint(); } });
                    this.tweens.add({ targets: glow, alpha: 1, duration: 300 });
                    this.tweens.add({ targets: glow, scale: { from: 0.85, to: 1.15 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                });
            });
            // The bar: levels won / the level to win.
            const bw = 460, bx = w / 2 - bw / 2, by = h * 0.53;
            const bar = this.add.graphics();
            const fill = { f: wonBefore / at };
            const f1 = Math.min(1, wonNow / at);
            const paint = () => {
                bar.clear();
                bar.fillStyle(0xe2dccf, 1).fillRoundedRect(bx, by, bw, 44, 22);
                bar.fillStyle(PALETTE.peach, 1).fillRoundedRect(bx, by, Math.max(44, bw * fill.f), 44, 22);
                bar.lineStyle(5, 0xffffff, 1).strokeRoundedRect(bx, by, bw, 44, 22);
            };
            paint();
            const count = this.add.text(w / 2, by + 22, `${Math.min(wonNow, at)} / ${at}`, { fontFamily: FONT, fontSize: '30px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5);
            c.add([bar, count]);
            this.tweens.add({ targets: fill, f: f1, duration: 700, delay: 400, ease: 'Sine.easeOut', onUpdate: paint, onComplete: () => { if (f1 >= 1) reveal.forEach((r) => r()); } });
        }
        c.add(wideButton(this, w / 2, h * 0.63, 380, 112, 'CONTINUE', onContinue).box);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 200 });
        this.overlay = c;
        // Confetti bursts as the screen comes in, over it.
        const confetti = this.add.particles(w / 2, h * 0.2, 'spark', {
            speed: { min: 250, max: 700 }, angle: { min: 200, max: 340 }, gravityY: 900, lifespan: 1800, scale: { start: 0.9, end: 0.4 },
            tint: [0xff3b3b, 0xffc430, 0x43c0ff, 0x6bd234, 0x9f54fa, 0xff80c4], emitting: false
        }).setDepth(11);
        confetti.explode(120);
        this.time.delayedCall(2200, () => confetti.destroy());
    }

    /**
     * One pop-up per newly opened look (balls first, then backgrounds), over the next level waiting to
     * start: its live thumbnail, APPLY and LATER (a tap beside it is LATER too). After the last one: the
     * level's intro run; if anything was applied, the game switches to the new look and starts that level.
     */
    private offerLooks(list: Unlock[], apply: { ball?: SkinId; bg?: BackgroundId }, done: () => void) {
        if (!list.length) {
            this.closeOverlay();
            if (apply.ball || apply.bg) return chooseLook(apply, true);
            return done();
        }
        const [u, ...rest] = list;
        const isBall = u.kind === 'ball';
        const later = () => this.offerLooks(rest, apply, done);
        this.showOverlay(isBall ? 'New Ball!' : 'New Background!', 'APPLY', () => {
            this.offerLooks(rest, isBall ? { ...apply, ball: u.look.id as SkinId } : { ...apply, bg: u.look.id as BackgroundId }, done);
        }, 0.6, `${u.look.name} ${isBall ? 'ball' : 'background'} unlocked`, { label: 'LATER', colour: 0x8a8fa3, onClick: later });
        // A tap beside the pop-up counts as LATER.
        (this.overlay!.list[0] as Phaser.GameObjects.Rectangle).on('pointerup', later);
        // The look itself, live, between the text and the buttons.
        const { width: w, height: h } = this.scale;
        const holder = this.add.container(0, 0);
        const tick = isBall ? ballThumb(this, holder, u.look.id as SkinId, w / 2, h * 0.45 - 55, 80) : bgThumb(this, holder, u.look.id as BackgroundId, w / 2, h * 0.45 - 55, 150, 150, true);
        this.overlay!.add(holder);
        const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => tick(this.time.now / 1000) });
        holder.once('destroy', () => ev.remove());
        tick(this.time.now / 1000);
    }

    /**
     * Out of Hearts: three hearts (the heart icon, as in the top bar) come back one after another: pale,
     * then each pops in red (grows past full size and settles), quickly in turn; the whole thing plays
     * once every 2 s. Only the heart picture and tweens (tint and scale), no animation frames.
     */
    private heartFill() {
        if (!hasUi('icon-heart') || !this.overlay) return;
        const { width: w, height: h } = this.scale;
        const RED = 0xff4d5e, PALE = 0xe4dcd0, size = 108, s0 = size / 128;
        const hearts = [-1, 0, 1].map((k) => this.add.image(w / 2 + k * 124, h * 0.45 - 40, uiKey('icon-heart')).setScale(s0));
        this.overlay.add(hearts);
        const play = () => {
            hearts.forEach((ht, i) => {
                this.tweens.killTweensOf(ht);
                ht.setTint(PALE).setAlpha(0.75).setScale(s0);
                // Its turn: red, small, then past full size and back.
                this.time.delayedCall(120 + i * 110, () => {
                    if (!ht.active) return;
                    ht.setTint(RED).setAlpha(1).setScale(s0 * 0.35);
                    this.tweens.chain({ targets: ht, tweens: [
                        { scale: s0 * 1.18, duration: 140, ease: 'Quad.easeOut' },
                        { scale: s0, duration: 110, ease: 'Sine.easeOut' }
                    ] });
                });
            });
        };
        play();
        const ev = this.time.addEvent({ delay: 2000, loop: true, callback: play });
        hearts[0].once('destroy', () => { ev.remove(); hearts.forEach((ht) => this.tweens.killTweensOf(ht)); });
    }

    private playOn() {
        this.closeOverlay();
        this.game$.playOn();
    }

    /** "Are you sure?" before giving up a level: shows how far the player got. */
    private confirmQuit() {
        // Nothing cleared yet: nothing to lose, so no question: the level starts over.
        if (!this.game$.state().cleared) { this.closeOverlay(); this.game$.restart(); return; }
        this.showOverlay('Are you sure?', 'PLAY ON', () => this.playOn(), 0.8, this.clearedLine(),
            { label: 'REPLAY', colour: 0xe8333d, onClick: () => this.game$.restart() }, true, PROGRESS_SPACE);
        this.levelProgress();
    }

    /** "You have cleared X of Y lines." */
    private clearedLine() {
        const st = this.game$.state();
        return `You have cleared ${st.cleared} of ${st.total} lines.`;
    }

    /** In an "Are you sure?" pop-up: the level's progress (bar and percent) and what leaving costs. */
    private levelProgress() {
        const st = this.game$.state();
        const f = st.total ? st.cleared / st.total : 0;
        const { width: w, height: h } = this.scale;
        // Under the "cleared X of Y" line, the warning under it, evenly between that line and the buttons.
        const bw = 440, x = w / 2 - bw / 2, y = h * 0.45 - 128;
        const bar = this.add.graphics();
        bar.fillStyle(0xe2dccf, 1).fillRoundedRect(x, y, bw, 34, 17);
        bar.fillStyle(0xf6a26b, 1).fillRoundedRect(x, y, Math.max(34, bw * f), 34, 17);
        bar.lineStyle(4, 0xffffff, 1).strokeRoundedRect(x, y, bw, 34, 17);
        const pct = this.add.text(w / 2, y + 17, `${Math.round(f * 100)}%`, { fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 6 }).setOrigin(0.5);
        const warn = this.add.text(w / 2, y + 92, 'You will lose your progress', { fontFamily: FONT, fontSize: '40px', color: '#d14a4a', align: 'center' }).setOrigin(0.5);
        this.overlay?.add([bar, pct, warn]);
    }

    /**
     * RESTART or HOME in Settings while playing: "Are you sure?" first when some lines are cleared (the
     * level's progress and what is lost), the action itself as the main button, and CANCEL straight back
     * to the game. With nothing cleared it just goes.
     */
    private confirmLeave(kind: 'restart' | 'home') {
        const go = () => {
            this.closeOverlay();
            this.scene.resume('Game');
            if (kind === 'restart') this.game$.restart();
            else this.game$.goHome();
        };
        // Nothing cleared yet: nothing to lose, so no question.
        if (!this.game$.state().cleared) return go();
        this.showOverlay('Are you sure?', kind === 'restart' ? 'RESTART' : 'HOME', go, 0.8, this.clearedLine(),
            { label: 'CANCEL', colour: 0x8a8fa3, onClick: () => { this.closeOverlay(); this.scene.resume('Game'); } }, false, PROGRESS_SPACE);
        this.levelProgress();
    }

    /**
     * A pop-up in the current look: card with a title ribbon, an optional line of text, the main button
     * and an optional second one (with `ad`: the main button carries a heart and an AD badge).
     */
    private showOverlay(title: string, button: string, onClick: () => void, dim = 0.75, sub?: string,
        second?: { label: string; colour: number; onClick: () => void }, ad = false, space = 0) {
        this.closeOverlay();
        const k = ui();
        const { width: w, height: h } = this.scale;
        const c = this.add.container(0, 0).setDepth(10);
        // `space`: extra height in the middle of the card for more content (the level progress block).
        const px = w / 2, py = h * 0.45, pw = 640, ph = (second ? 640 : 560) + space;
        const card = popupCard(this, px, py, pw, ph, title);
        c.add([this.dim(dim), card.box]);
        if (sub) c.add(this.add.text(px, py - ph / 2 + 130, sub, { fontFamily: FONT, fontSize: '34px', color: k.ink, align: 'center', wordWrap: { width: pw - 100 } }).setOrigin(0.5, 0));
        const by = second ? py + ph / 2 - 230 : py + ph / 2 - 110;
        const btn = wideButton(this, px, by, 380, 112, button, onClick);
        if (ad) {
            // Watch an ad to use it (not wired to an ad network yet).
            const badge = this.add.text(170, -54, 'AD', { fontFamily: FONT, fontSize: '28px', color: '#ffffff', backgroundColor: '#f07c1c', padding: { x: 8, y: 2 } }).setOrigin(0.5);
            btn.box.add(badge);
        }
        c.add(btn.box);
        if (second) c.add(wideButton(this, px, by + 135, 280, 90, second.label, second.onClick, second.colour, Phaser.Display.Color.ValueToColor(second.colour).darken(25).color).box);
        c.setAlpha(0);
        this.tweens.add({ targets: c, alpha: 1, duration: 180 });
        this.overlay = c;
    }

    private closeOverlay() {
        this.overlay?.destroy();
        this.overlay = null;
    }
}
