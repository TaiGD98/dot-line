import * as Phaser from 'phaser';
import { BACKGROUND, BACKGROUNDS, BackgroundId, SKIN, SKINS, SkinId, chooseLook, takeReopen } from '../game/mode';
import { isOpen, progress } from '../game/progress';
import { PALETTE, ui } from '../game/skinui';
import { ballThumb, bgThumb } from './thumbs';
import { levels } from '../game/source';
import { makeFluffy, preloadFluffy } from './fluffy';
import { hasUi, hexOf, preloadUi, recolour, uiKey } from './uiart';
import type { Game } from './Game';
import { FONT, IconName, OUTLINE, banner, iconImage, roundButton, sliced, wideButton } from './uikit';
import { settingsPopup } from './settingsui';

/** Hard level (purple on the map), as the HUD's "Hard" label. */
const isHard = (l: { category?: string; difficulty?: number | null } | null) => !!l && (l.category ? l.category === 'hard' : (l.difficulty ?? 0) >= 4);

type Tab = 'shop' | 'home' | 'theme';

/**
 * Home screen (the Home wireframe), over the paused game: the level map (the level to play next at the
 * bottom with a golden ring, the next ones above it on a path; hard levels purple), PLAY, and a tab bar:
 * Shop (later), Home, Theme. The Theme tab lists the looks (mode.SKINS) with a red ball of each as a
 * live thumbnail (its idle animation); a locked look says at which level it opens.
 */
export class Home extends Phaser.Scene {
    private game$!: Game;
    private view!: Phaser.GameObjects.Container;
    private tabBar!: Phaser.GameObjects.Container;
    private tab: Tab = 'home';
    /** Thumbnails animated every frame (the theme tab). */
    private ticks: ((t: number) => void)[] = [];
    /** Theme tab: which table tab is open. */
    private lookTab: 'ball' | 'background' = 'ball';
    private ring?: Phaser.GameObjects.Graphics;
    private ringImg?: Phaser.GameObjects.Image;
    /** PLAY was pressed (Home is opening onto the level). */
    private leaving = false;
    /** The open Settings pop-up, if any. */
    private settings?: Phaser.GameObjects.Container;

    constructor() {
        super('Home');
    }

    preload() {
        // The Fluffy thumbnail needs the fluffy ball and faces whatever look is in use.
        preloadFluffy(this);
        preloadUi(this);
    }

    create() {
        this.game$ = this.scene.get('Game') as unknown as Game;
        this.settings = undefined;
        makeFluffy(this);
        const { width: w, height: h } = this.scale;
        const k = ui();
        // Background: the look's light colour with faint decorations.
        const bg = this.add.graphics();
        bg.fillStyle(k.home, 1).fillRect(0, 0, w, h);
        bg.fillStyle(k.homeDeco, 1);
        for (const [x, y, s] of [[100, 260, 1], [650, 420, 0.8], [120, 820, 0.9], [670, 1010, 1.1], [90, 1260, 0.7], [690, 1380, 0.8], [400, 160, 0.6]] as const) {
            if (hasUi('cloud')) { this.add.image(x, y, uiKey('cloud')).setScale((110 * s) / 256).setAlpha(0.7); continue; }
            bg.fillEllipse(x, y, 70 * s, 34 * s).fillEllipse(x + 26 * s, y - 10 * s, 50 * s, 30 * s);
        }
        this.add.rectangle(w / 2, h / 2, w, h).setInteractive(); // the game under it gets no taps
        this.view = this.add.container(0, 0).setDepth(1);
        this.tabBar = this.add.container(0, 0).setDepth(2);
        // Back from picking a ball / background (the game reloaded): the Theme tab, the same table tab.
        const back = takeReopen();
        if (back?.startsWith('theme')) this.lookTab = back.endsWith('background') ? 'background' : 'ball';
        this.drawTabs();
        this.show(back?.startsWith('theme') ? 'theme' : 'home');
        performance.mark('dotline:home');
        this.leaving = false;
    }

    private drawTabs() {
        const { width: w, height: h } = this.scale;
        const k = ui();
        this.tabBar.removeAll(true);
        const top = h - 190;
        // The tab bar: paper with a soft shadow along its top (no coloured border).
        const g = this.add.graphics();
        g.fillStyle(0x0b0b12, 0.05).fillRect(0, top - 6, w, 6);
        g.fillStyle(k.panel, 1).fillRect(0, top, w, 190);
        g.lineStyle(2, k.homeDeco, 1).lineBetween(0, top, w, top);
        this.tabBar.add(g);
        const tabs: { id: Tab; label: string; icon: IconName }[] = [{ id: 'shop', label: 'Shop', icon: 'shop' }, { id: 'home', label: 'Home', icon: 'home' }, { id: 'theme', label: 'Theme', icon: 'theme' }];
        tabs.forEach((t, i) => {
            const x = w * (i + 0.5) / 3, y = top + 82;
            const c = this.add.container(x, y);
            const sel = t.id === this.tab && hasUi('tab-selected') ? sliced(this, 'tab-selected', 0, 0, 190, 140, 0.35) : this.add.graphics();
            if (t.id === this.tab && sel instanceof Phaser.GameObjects.Graphics) sel.fillStyle(k.inset, 1).fillRoundedRect(-95, -70, 190, 140, 34);
            const ic = iconImage(this, t.icon, 0, -16, 68, false, hasUi(`icon-${t.icon}`) ? undefined : t.id === this.tab ? k.nodeEdge : 0x9aa0ad);
            if (t.id !== this.tab) ic.setAlpha(0.55);
            const label = this.add.text(0, 42, t.label, { fontFamily: FONT, fontSize: '30px', color: t.id === this.tab ? Phaser.Display.Color.IntegerToColor(k.nodeEdge).rgba : '#8a8f9c' }).setOrigin(0.5);
            c.add([sel, ic, label]);
            if (t.id === 'shop') {
                if (hasUi('tag')) {
                    const tag = this.add.image(52, -58, uiKey('tag'));
                    tag.setScale(78 / tag.width);
                    c.add([tag, this.add.text(52, -60, 'SOON', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 4 }).setOrigin(0.5)]);
                } else c.add(this.add.text(52, -58, 'SOON', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', backgroundColor: '#f07c1c', padding: { x: 6, y: 2 } }).setOrigin(0.5));
            }
            c.setSize(220, 170).setInteractive({ useHandCursor: true }).on('pointerup', () => {
                // The tab already open: nothing to do (no redraw).
                if (t.id === this.tab) return;
                if (t.id === 'shop') return this.toast('Shop is coming soon');
                this.show(t.id);
            });
            this.tabBar.add(c);
        });
    }

    private show(tab: Tab) {
        // Another tab: the new screen slides in from the side of its tab (Theme from the right, Home from
        // the left when coming back from Theme) and the old one slides out the other way. The same tab
        // (e.g. Ball / Background inside Theme): redrawn in place.
        const ORDER: Tab[] = ['shop', 'home', 'theme'];
        const from = this.tab, slide = from !== tab && this.view.list.length > 0;
        this.tab = tab;
        if (slide) {
            const old = this.view, dir = ORDER.indexOf(tab) > ORDER.indexOf(from) ? 1 : -1, w = this.scale.width;
            this.tweens.killTweensOf(old);
            this.tweens.add({ targets: old, x: -dir * w, duration: 320, ease: 'Cubic.easeInOut', onComplete: () => { old.list.forEach((o) => this.tweens.killTweensOf(o)); old.destroy(); } });
            this.view = this.add.container(dir * w, 0).setDepth(1);
            this.tweens.add({ targets: this.view, x: 0, duration: 320, ease: 'Cubic.easeInOut' });
        } else this.view.removeAll(true);
        this.ticks = [];
        this.ring = undefined;
        this.ringImg = undefined;
        this.drawTabs();
        if (tab === 'home') this.drawMap();
        else this.drawThemes();
    }

    /** The level map: the level to play next at the bottom (golden ring), four more above it. */
    private drawMap() {
        this.cornerButton('settings');
        const { width: w } = this.scale;
        const k = ui();
        const x = w / 2, n = progress.level;
        const ys = [1120, 900, 690, 480, 270];
        if (hasUi('path')) {
            // The path picture, repeated down the map.
            const src = this.textures.get(uiKey('path')).getSourceImage() as HTMLImageElement, k2 = 34 / src.width;
            const path = this.add.tileSprite(x, (ys[0] + ys[4]) / 2, src.width, (ys[0] - ys[4]) / k2, uiKey('path')).setScale(k2);
            this.view.add(path);
        } else {
            const path = this.add.graphics();
            path.fillStyle(0x1b2b22, 0.85).fillRoundedRect(x - 15, ys[4], 30, ys[0] - ys[4], 8);
            path.fillStyle(0xffffff, 1).fillRoundedRect(x - 10, ys[4], 20, ys[0] - ys[4], 6);
            this.view.add(path);
        }
        ys.forEach((y, i) => {
            const num = n + i, r = i === 0 ? 82 : 64;
            const hard = isHard(levels.at(num));
            const fill = hard ? k.hard : k.node, edge = hard ? k.hardEdge : k.nodeEdge;
            if (hasUi('round')) {
                // Level buttons in the booster buttons' form (the round button picture): pink, hard ones
                // purple, the level to play peach, bigger and gently pulsing.
                const col = i === 0 ? PALETTE.peach : hard ? PALETTE.purple : PALETTE.pink;
                const box = this.add.container(x, y);
                const img = this.add.image(0, 0, col === PALETTE.pink ? uiKey('round') : recolour(this, 'round', hexOf(col), 0.6));
                img.setScale((2.25 * r) / img.width);
                const t = this.add.text(0, -r * 0.04, String(num), { fontFamily: FONT, fontSize: `${i === 0 ? 66 : 48}px`, color: '#ffffff', stroke: OUTLINE, strokeThickness: 9 }).setOrigin(0.5);
                box.add([img, t]);
                this.view.add(box);
                if (i === 0) this.tweens.add({ targets: box, scale: 1.06, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                return;
            }
            const g = this.add.graphics();
            g.fillStyle(edge, 1).fillCircle(x, y + r * 0.14, r);
            g.fillStyle(fill, 1).fillCircle(x, y, r);
            g.lineStyle(5, edge, 1).strokeCircle(x, y, r);
            g.lineStyle(4, 0xffffff, 0.55);
            g.beginPath(); g.arc(x, y, r * 0.78, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(285)); g.strokePath();
            const t = this.add.text(x, y + 2, String(num), { fontFamily: FONT, fontSize: `${i === 0 ? 64 : 48}px`, color: '#173a24' }).setOrigin(0.5);
            this.view.add([g, t]);
        });
        // Golden ring round the level to play (gently pulsing in update()).
        if (hasUi('round')) {
            // (The level to play pulses instead of a ring.)
        } else {
            this.ring = this.add.graphics();
            this.view.add(this.ring);
        }
        const play = wideButton(this, x, 1300, 420, 124, 'PLAY', () => this.play(), k.main, k.mainEdge);
        this.view.add(play.box);
    }

    /**
     * Theme tab: a big "Theme" banner, then a table with two tabs. Ball: a grid of cells, each a live red
     * ball of that kind (its idle animation) with its name small below. Background: the same with a tile
     * of each background. The one in use has a coloured frame and a tick; a locked one is faded with a
     * lock and its level; tapping an open one uses it (the game reloads).
     */
    private drawThemes() {
        this.cornerButton('close');
        const { width: w } = this.scale;
        const k = ui();
        // Banner.
        this.view.add(banner(this, w / 2 - 20, 150, 540, 'Theme')); // clear of the Settings button
        // The table: two tabs sitting on a panel whose thin border is the selected tab's colour, so the
        // tabs and the panel read as one piece.
        const tx = w / 2, top = 290, tw = 680, tabH = 96, py = top + tabH, ph = 1000, edge = 5;
        const panel = this.add.graphics();
        panel.fillStyle(0x0b0b12, 0.08).fillRoundedRect(tx - tw / 2 + 3, py + 8, tw, ph, { tl: 0, tr: 0, bl: 34, br: 34 });
        panel.fillStyle(PALETTE.peach, 1).fillRoundedRect(tx - tw / 2, py, tw, ph, { tl: 0, tr: 0, bl: 34, br: 34 });
        panel.fillStyle(k.panel, 1).fillRoundedRect(tx - tw / 2 + edge, py + edge, tw - 2 * edge, ph - 2 * edge, { tl: 0, tr: 0, bl: 30, br: 30 });
        this.view.add(panel);
        (['ball', 'background'] as const).forEach((id, i) => {
            const on = this.lookTab === id, x = tx - tw / 2 + tw * (i + 0.5) / 2, bw = tw / 2;
            const tab = this.add.container(x, top + tabH / 2);
            if (hasUi('tab-on')) {
                // The tab pictures, their bottom on the panel's top edge (the selected one runs into it).
                const pic = sliced(this, on ? 'tab-on' : 'tab-off', 0, 4, bw, tabH + 8, 0.3);
                tab.add(pic);
            } else {
                const g = this.add.graphics();
                g.fillStyle(on ? PALETTE.peach : k.inset, 1).fillRoundedRect(-bw / 2, -tabH / 2, bw, tabH + 4, { tl: 30, tr: 30, bl: 0, br: 0 });
                tab.add(g);
            }
            tab.add(this.add.text(0, 2, id === 'ball' ? 'Ball' : 'Background', { fontFamily: FONT, fontSize: '42px', color: on ? '#ffffff' : k.ink, stroke: on ? OUTLINE : undefined, strokeThickness: on ? 7 : 0 }).setOrigin(0.5));
            tab.setSize(bw, tabH).setInteractive({ useHandCursor: !on }).on('pointerup', () => { if (this.lookTab === id) return; this.lookTab = id; this.show('theme'); });
            this.view.add(tab);
        });
        // Grid: 3 cells a row. A cell is a frame just round the thumbnail; the name sits below it.
        const items: { id: string; name: string; unlock: number; current: boolean; pick: () => void }[] = this.lookTab === 'ball'
            ? SKINS.map((s) => ({ ...s, current: s.id === SKIN, pick: () => chooseLook({ ball: s.id }, false, 'theme:ball') }))
            : BACKGROUNDS.map((b) => ({ ...b, current: b.id === BACKGROUND, pick: () => chooseLook({ bg: b.id }, false, 'theme:background') }));
        const cs = 176, gapX = 30, rowH = cs + 76, x0 = tx - (3 * cs + 2 * gapX) / 2 + cs / 2, y0 = py + 50 + cs / 2;
        items.forEach((it, i) => {
            const x = x0 + (i % 3) * (cs + gapX), y = y0 + Math.floor(i / 3) * rowH;
            const open = isOpen(it);
            const cell = this.add.graphics();
            cell.fillStyle(0xffffff, 1).fillRoundedRect(x - cs / 2, y - cs / 2, cs, cs, 26);
            this.view.add(cell);
            const tick = this.lookTab === 'ball'
                ? ballThumb(this, this.view, it.id as SkinId, x, y, cs * 0.38)
                : bgThumb(this, this.view, it.id as BackgroundId, x, y, cs - 14, cs - 14);
            this.ticks.push(tick);
            const frame = this.add.graphics();
            frame.lineStyle(it.current ? 7 : 3, it.current ? PALETTE.peach : k.border, 1).strokeRoundedRect(x - cs / 2, y - cs / 2, cs, cs, 26);
            this.view.add(frame);
            this.view.add(this.add.text(x, y + cs / 2 + 30, open ? it.name : `Win level ${it.unlock}`, { fontFamily: FONT, fontSize: open ? '32px' : '27px', color: open ? k.ink : '#8f877c' }).setOrigin(0.5));
            if (it.current) {
                const badge = this.add.graphics();
                const bx = x + cs / 2 - 10, by = y - cs / 2 + 10;
                badge.fillStyle(PALETTE.peach, 1).fillCircle(bx, by, 24);
                badge.lineStyle(4, 0xffffff, 1).strokeCircle(bx, by, 24);
                badge.lineStyle(6, 0xffffff, 1);
                badge.beginPath(); badge.moveTo(bx - 11, by); badge.lineTo(bx - 3, by + 9); badge.lineTo(bx + 12, by - 9); badge.strokePath();
                this.view.add(badge);
            }
            if (!open) {
                const shade = this.add.graphics();
                shade.fillStyle(0xffffff, 0.6).fillRoundedRect(x - cs / 2, y - cs / 2, cs, cs, 26);
                const disc = this.add.graphics();
                disc.fillStyle(0x8f877c, 1).fillCircle(x, y, 36);
                this.view.add([shade, disc, iconImage(this, 'lock', x, y, 48)]);
            }
            const hit = this.add.zone(x, y + 20, cs, cs + 50).setInteractive({ useHandCursor: open && !it.current });
            hit.on('pointerup', () => {
                if (!open) return this.toast(`Win level ${it.unlock} to unlock`);
                if (!it.current) it.pick();
            });
            this.view.add(hit);
        });
    }

    update(time: number) {
        const t = time / 1000;
        if (this.ringImg) {
            const p = (Math.sin(t * 4) + 1) / 2;
            this.ringImg.setScale((215 + p * 12) / this.ringImg.width);
        }
        if (this.ring) {
            const { width: w } = this.scale;
            const p = (Math.sin(t * 4) + 1) / 2;
            this.ring.clear();
            this.ring.lineStyle(12, 0xffd45a, 1).strokeCircle(w / 2, 1120, 96 + p * 4);
            this.ring.lineStyle(6, 0xffffff, 0.5 * (1 - p)).strokeCircle(w / 2, 1120, 108 + p * 10);
        }
        for (const tick of this.ticks) tick(t);
    }

    /** PLAY: the transition screen comes up, the level starts under it (Game.goPlay). */
    private play() {
        if (this.leaving) return;
        this.leaving = true;
        this.game$.goPlay();
    }

    /** The top right button of a screen: Settings on the level map, close (X) on Theme; part of the screen, so it slides with it. */
    private cornerButton(kind: 'settings' | 'close') {
        const { width: w } = this.scale;
        const b = kind === 'settings'
            ? roundButton(this, w - 70, 90, 42, 'settings', () => {
                if (this.settings) return;
                this.settings = settingsPopup(this, () => { this.settings?.destroy(); this.settings = undefined; });
            })
            : roundButton(this, w - 70, 90, 42, 'close', () => this.show('home'), PALETTE.red, PALETTE.redEdge);
        this.view.add(b.box);
    }

    private toast(text: string) {
        const { width: w, height: h } = this.scale;
        const t = this.add.text(w / 2, h - 260, text, { fontFamily: FONT, fontSize: '40px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5);
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, delay: 900, duration: 500, onComplete: () => t.destroy() });
    }
}

