import * as Phaser from 'phaser';
import { ui } from '../game/skinui';
import { hasUi, hexOf, recolour, uiKey } from './uiart';

/**
 * Shared UI pieces drawn in code, in the colours of the current look (skinui.ts): white icons, round
 * and wide buttons with a 3D bottom edge, and the pop-up card with its title ribbon and close button
 * (the Settings wireframe). Stand-ins until the UI pictures are there (docs/guide/ui-assets.md).
 */
export const FONT = 'Lilita, system-ui, sans-serif';
export const OUTLINE = '#26346e'; // the play screen's navy text outline (skinui PALETTE.navy)

export type IconName = 'settings' | 'pause' | 'play' | 'restart' | 'close' | 'sound' | 'music' | 'vibrate' | 'sun' | 'moon' | 'home' | 'shop' | 'theme' | 'lock';

/** A white icon about `s` px across, centred on (0, 0). `off`: crossed out. */
export function drawIcon(g: Phaser.GameObjects.Graphics, name: IconName, s: number, off = false, colour = 0xffffff) {
    const u = s / 2;
    g.fillStyle(colour, 1);
    g.lineStyle(u * 0.18, colour, 1);
    switch (name) {
        case 'settings': {
            g.fillCircle(0, 0, u * 0.62);
            for (let k = 0; k < 8; k++) {
                const a = (k * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
                g.fillPoints([
                    { x: c * u * 0.55 - sn * u * 0.17, y: sn * u * 0.55 + c * u * 0.17 },
                    { x: c * u * 0.95 - sn * u * 0.13, y: sn * u * 0.95 + c * u * 0.13 },
                    { x: c * u * 0.95 + sn * u * 0.13, y: sn * u * 0.95 - c * u * 0.13 },
                    { x: c * u * 0.55 + sn * u * 0.17, y: sn * u * 0.55 - c * u * 0.17 }
                ] as unknown as Phaser.Math.Vector2[], true);
            }
            g.fillStyle(0x000000, 0.25).fillCircle(0, 0, u * 0.26);
            break;
        }
        case 'pause':
            g.fillRoundedRect(-u * 0.5, -u * 0.6, u * 0.34, u * 1.2, u * 0.08).fillRoundedRect(u * 0.16, -u * 0.6, u * 0.34, u * 1.2, u * 0.08);
            break;
        case 'play':
            g.fillTriangle(-u * 0.4, -u * 0.6, -u * 0.4, u * 0.6, u * 0.6, 0);
            break;
        case 'restart': {
            g.lineStyle(u * 0.22, colour, 1);
            g.beginPath();
            g.arc(0, 0, u * 0.58, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(250), false);
            g.strokePath();
            const a = Phaser.Math.DegToRad(-50), ex = Math.cos(a) * u * 0.58, ey = Math.sin(a) * u * 0.58;
            g.fillTriangle(ex + u * 0.36, ey - u * 0.02, ex - u * 0.22, ey - u * 0.36, ex - u * 0.04, ey + u * 0.36);
            break;
        }
        case 'close':
            g.lineStyle(u * 0.28, colour, 1);
            g.lineBetween(-u * 0.45, -u * 0.45, u * 0.45, u * 0.45).lineBetween(-u * 0.45, u * 0.45, u * 0.45, -u * 0.45);
            break;
        case 'sound':
            g.fillRect(-u * 0.75, -u * 0.25, u * 0.3, u * 0.5);
            g.fillTriangle(-u * 0.5, -u * 0.25, -u * 0.05, -u * 0.65, -u * 0.05, u * 0.65).fillTriangle(-u * 0.5, -u * 0.25, -u * 0.05, u * 0.65, -u * 0.5, u * 0.25);
            g.lineStyle(u * 0.13, colour, 1);
            for (const rr of [0.35, 0.65]) { g.beginPath(); g.arc(0, 0, u * rr + u * 0.15, -0.8, 0.8); g.strokePath(); }
            break;
        case 'music':
            g.fillEllipse(-u * 0.38, u * 0.45, u * 0.5, u * 0.38).fillEllipse(u * 0.42, u * 0.3, u * 0.5, u * 0.38);
            g.fillRect(-u * 0.2, -u * 0.6, u * 0.13, u * 1.05).fillRect(u * 0.6, -u * 0.75, u * 0.13, u * 1.05);
            g.fillPoints([{ x: -u * 0.2, y: -u * 0.6 }, { x: u * 0.73, y: -u * 0.75 }, { x: u * 0.73, y: -u * 0.45 }, { x: -u * 0.2, y: -u * 0.3 }] as unknown as Phaser.Math.Vector2[], true);
            break;
        case 'vibrate':
            g.lineStyle(u * 0.14, colour, 1);
            g.strokeRoundedRect(-u * 0.3, -u * 0.62, u * 0.6, u * 1.24, u * 0.12);
            g.fillRect(-u * 0.08, u * 0.42, u * 0.16, u * 0.08);
            for (const sgn of [-1, 1]) {
                g.beginPath();
                g.moveTo(sgn * u * 0.5, -u * 0.4); g.lineTo(sgn * u * 0.65, -u * 0.2); g.lineTo(sgn * u * 0.5, 0); g.lineTo(sgn * u * 0.65, u * 0.2); g.lineTo(sgn * u * 0.5, u * 0.4);
                g.strokePath();
            }
            break;
        case 'sun':
            g.fillCircle(0, 0, u * 0.36);
            g.lineStyle(u * 0.13, colour, 1);
            for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.lineBetween(Math.cos(a) * u * 0.55, Math.sin(a) * u * 0.55, Math.cos(a) * u * 0.8, Math.sin(a) * u * 0.8); }
            break;
        case 'moon':
            g.beginPath();
            g.arc(0, 0, u * 0.62, Phaser.Math.DegToRad(-40), Phaser.Math.DegToRad(220), false);
            g.arc(u * 0.28, -u * 0.22, u * 0.5, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(-20), true);
            g.closePath();
            g.fillPath();
            break;
        case 'home':
            g.fillTriangle(-u * 0.75, -u * 0.05, u * 0.75, -u * 0.05, 0, -u * 0.72);
            g.fillRect(-u * 0.52, -u * 0.08, u * 1.04, u * 0.72);
            g.fillStyle(0x000000, 0.22).fillRect(-u * 0.14, u * 0.22, u * 0.28, u * 0.42);
            break;
        case 'shop':
            g.fillRoundedRect(-u * 0.6, -u * 0.25, u * 1.2, u * 0.9, u * 0.12);
            g.lineStyle(u * 0.13, colour, 1);
            g.beginPath(); g.arc(0, -u * 0.25, u * 0.32, Math.PI, 0); g.strokePath();
            break;
        case 'theme':
            g.fillEllipse(0, 0, u * 1.5, u * 1.25);
            for (const [x, y, c] of [[-0.38, -0.2, 0xff6f91], [0, -0.38, 0xffc542], [0.38, -0.2, 0x5ccf7a], [0.3, 0.22, 0x4fb6ef]] as const) g.fillStyle(c, 1).fillCircle(x * u, y * u, u * 0.15);
            g.fillStyle(0x000000, 0.22).fillCircle(-u * 0.25, u * 0.25, u * 0.16);
            break;
        case 'lock':
            g.fillRoundedRect(-u * 0.5, -u * 0.1, u, u * 0.75, u * 0.12);
            g.lineStyle(u * 0.16, colour, 1);
            g.beginPath(); g.arc(0, -u * 0.12, u * 0.32, Math.PI, 0); g.strokePath();
            g.fillStyle(0x000000, 0.25).fillCircle(0, u * 0.22, u * 0.1);
            break;
    }
    if (off) {
        g.lineStyle(u * 0.2, 0xe8536b, 1);
        g.lineBetween(-u * 0.7, -u * 0.7, u * 0.7, u * 0.7);
    }
}

/** The icon picture for an icon name (crossed-out ones have their own picture), or null. */
function iconArt(name: IconName, off: boolean): { key: string; slash: boolean } | null {
    const own = off && hasUi(`icon-${name}-off`);
    if (!hasUi(`icon-${name}`)) return null;
    return { key: uiKey(own ? `icon-${name}-off` : `icon-${name}`), slash: off && !own };
}

/** An icon about `s` px across at (x, y): the picture when there is one, else drawn in code. `tint` greys or colours it. */
export function iconImage(scene: Phaser.Scene, name: IconName, x: number, y: number, s: number, off = false, tint?: number) {
    const a = iconArt(name, off);
    if (a) {
        const img = scene.add.image(x, y, a.key);
        img.setScale(s / img.width);
        if (tint !== undefined) img.setTint(tint);
        return img;
    }
    const g = scene.add.graphics();
    drawIcon(g, name, s, off, tint ?? 0xffffff);
    return g.setPosition(x, y);
}

/** Round button with a 3D bottom edge and a white icon. `repaint` redraws it (another colour or icon). */
export function roundButton(scene: Phaser.Scene, x: number, y: number, r: number, icon: IconName, onClick: () => void, colour = ui().button, edge = ui().buttonEdge) {
    const c = scene.add.container(x, y);
    c.setSize(r * 2.2, r * 2.2).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
    if (hasUi('round')) {
        // The round button picture (recoloured for any colour but the default blue), the icon on top.
        const bg = scene.add.image(0, 0, uiKey('round'));
        const ic = scene.add.image(0, -r * 0.04, uiKey('round'));
        const slash = scene.add.graphics();
        c.add([bg, ic, slash]);
        const paint = (name: IconName, fill: number, _dark: number, off = false) => {
            // The picture is the palette's pink button; other colours are recolourings of it.
            bg.setTexture(fill === ui().button ? uiKey('round') : recolour(scene, 'round', hexOf(fill), 0.6));
            bg.setScale((2.25 * r) / bg.width);
            const a = iconArt(name, off);
            slash.clear();
            if (a) {
                ic.setVisible(true).setTexture(a.key).setScale((1.15 * r) / ic.width);
                if (a.slash) { slash.lineStyle(r * 0.14, 0xe8536b, 1); slash.lineBetween(-r * 0.4, -r * 0.4, r * 0.4, r * 0.4); }
            } else {
                ic.setVisible(false);
                drawIcon(slash, name, r * 1.05, off);
            }
        };
        paint(icon, colour, edge);
        return { box: c, paint };
    }
    const g = scene.add.graphics();
    const paint = (ic: IconName, fill: number, dark: number, off = false) => {
        g.clear();
        g.fillStyle(dark, 1).fillCircle(0, r * 0.1, r);
        g.fillStyle(fill, 1).fillCircle(0, 0, r);
        g.lineStyle(Math.max(3, r * 0.1), 0xffffff, 1).strokeCircle(0, 0, r);
        g.fillStyle(0xffffff, 0.25).fillEllipse(-r * 0.25, -r * 0.45, r * 0.9, r * 0.35);
        drawIcon(g, ic, r * 1.05, off);
    };
    paint(icon, colour, edge);
    c.add(g);
    return { box: c, paint };
}

/** Wide rounded button with a 3D bottom edge and a label. */
export function wideButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, colour = ui().main, edge = ui().mainEdge) {
    const c = scene.add.container(x, y);
    if (hasUi('wide')) {
        // The wide button picture as a nine-slice (its round ends kept), recoloured for other colours.
        const key = colour === ui().main ? uiKey('wide') : recolour(scene, 'wide', hexOf(colour), 0.5);
        const src = scene.textures.get(uiKey('wide')).getSourceImage() as HTMLImageElement;
        const k = h / src.height, cap = src.height * 0.5;
        const ns = scene.add.nineslice(0, 0, key, undefined, w / k, src.height, cap, cap, 0, 0).setScale(k);
        c.add(ns);
    } else {
        const g = scene.add.graphics();
        g.fillStyle(edge, 1).fillRoundedRect(-w / 2, -h / 2 + h * 0.12, w, h, h * 0.4);
        g.fillStyle(colour, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.4);
        g.lineStyle(6, 0xffffff, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h * 0.4);
        g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 16, -h / 2 + 8, w - 32, h * 0.3, h * 0.15);
        c.add(g);
    }
    const t = scene.add.text(0, -h * 0.05, label, { fontFamily: FONT, fontSize: `${Math.round(h * 0.5)}px`, color: '#ffffff', stroke: OUTLINE, strokeThickness: 8 }).setOrigin(0.5);
    c.add(t);
    c.setSize(w, h).setInteractive({ useHandCursor: true }).on('pointerup', onClick);
    return { box: c, text: t };
}

/**
 * Pop-up card at (x, y) of w × h: a rounded panel with a thick border, its title inside the top, and
 * (with `onClose`) a round close button at the top right. The card swallows taps.
 */
export function popupCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number, title: string, onClose?: () => void) {
    const k = ui();
    const c = scene.add.container(0, 0);
    const hit = scene.add.zone(x, y, w, h).setInteractive();
    let titleY = y - h / 2 + 92;
    if (hasUi('popup')) {
        // The pop-up frame with its header band (art/ui/pop up.png): the band's height (98 of 640 px, plus
        // its ledge) stays as it is in the top slice; the title sits in the middle of the band.
        const panel = scene.add.nineslice(x, y, uiKey('popup'), undefined, w, h, 64, 64, 112, 64);
        c.add([panel, hit]);
        titleY = y - h / 2 + 52;
    } else if (hasUi('panel')) {
        // Panel picture as a nine-slice (corners kept), the ribbon picture over its top edge.
        const src = scene.textures.get(uiKey('panel')).getSourceImage() as HTMLImageElement;
        const corner = Math.round(src.height * 0.24);
        const panel = scene.add.nineslice(x, y, uiKey('panel'), undefined, w, h, corner, corner, corner, corner);
        c.add([panel, hit]);
    } else {
        const g = scene.add.graphics();
        g.fillStyle(0x0b0b12, 0.25).fillRoundedRect(x - w / 2 + 6, y - h / 2 + 14, w, h, 44);
        void k;
        g.fillStyle(k.border, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 44);
        g.fillStyle(k.panel, 1).fillRoundedRect(x - w / 2 + 14, y - h / 2 + 14, w - 28, h - 28, 34);
        c.add([g, hit]);
    }
    // The title inside the top of the card (the ribbon picture is the Theme screen's banner, not the pop-ups').
    const t = scene.add.text(x, titleY, title, { fontFamily: FONT, fontSize: '58px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 10 }).setOrigin(0.5);
    c.add(t);
    if (onClose) c.add(roundButton(scene, x + w / 2 - 18, y - h / 2 + 18, 40, 'close', onClose, 0xe8536b, 0xb53a4f).box);
    return { box: c, title: t };
}

/** Big title banner (the Theme screen): the ribbon picture with the title on its band, else drawn in code. */
export function banner(scene: Phaser.Scene, x: number, y: number, w: number, title: string) {
    const k = ui();
    const c = scene.add.container(0, 0);
    if (hasUi('ribbon')) {
        const rb = scene.add.image(x, y, uiKey('ribbon'));
        rb.setScale(w / rb.width);
        // The band of this ribbon sits a little above the picture's middle.
        c.add([rb, scene.add.text(x, y - rb.displayHeight * 0.13, title, { fontFamily: FONT, fontSize: '84px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 12 }).setOrigin(0.5)]);
        return c;
    }
    const g = scene.add.graphics(), bw = w * 0.82;
    g.fillStyle(k.ribbonDark, 1);
    g.fillTriangle(x - bw / 2 - 60, y - 30, x - bw / 2 + 20, y - 30, x - bw / 2 + 20, y + 60);
    g.fillTriangle(x + bw / 2 + 60, y - 30, x + bw / 2 - 20, y - 30, x + bw / 2 - 20, y + 60);
    g.fillRoundedRect(x - bw / 2, y - 60, bw, 140, 30);
    g.fillStyle(k.ribbon, 1).fillRoundedRect(x - bw / 2, y - 70, bw, 140, 30);
    g.lineStyle(7, 0xffffff, 1).strokeRoundedRect(x - bw / 2, y - 70, bw, 140, 30);
    c.add([g, scene.add.text(x, y - 4, title, { fontFamily: FONT, fontSize: '92px', color: '#ffffff', stroke: OUTLINE, strokeThickness: 14 }).setOrigin(0.5)]);
    return c;
}

/** A picture stretched to w × h keeping its corners (`corner`: share of the picture's shorter side). */
export function sliced(scene: Phaser.Scene, name: string, x: number, y: number, w: number, h: number, corner = 0.3) {
    const src = scene.textures.get(uiKey(name)).getSourceImage() as HTMLImageElement;
    const c = Math.round(Math.min(src.width, src.height) * corner);
    return scene.add.nineslice(x, y, uiKey(name), undefined, w, h, c, c, c, c);
}
