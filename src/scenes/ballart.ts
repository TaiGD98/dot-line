import * as Phaser from 'phaser';
import { PaletteColour } from '../core/palette';

/**
 * Balls drawn in code (stand-ins until art/balls/ has pictures, docs/guide/ui-assets.md):
 * - paintGlossy: the Jelly ball, a glossy candy ball (rim, lit body, sharp highlight);
 * - paintWater: the Water ball, a clear balloon full of coloured water that sloshes inside.
 * Both draw round (0, 0) on a graphics already moved, turned and scaled to the ball; `at(fx, fy)`
 * gives the local point for a world-space offset of (fx, fy) radii, so the light stays at the top left
 * however the ball is turned or squashed.
 */
export type At = (fx: number, fy: number) => { x: number; y: number };

const int = (hex: string) => parseInt(hex.slice(1), 16);

/** Mix two 0xRRGGBB colours (t = 0: a, 1: b). */
export function mix(a: number, b: number, t: number): number {
    const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function paintGlossy(g: Phaser.GameObjects.Graphics, at: At, r: number, c: PaletteColour) {
    const base = int(c.base);
    // Body: dark rim (the colour ramp's darkest key), lit body shifted towards the light, soft glow.
    g.fillStyle(int(c.dark), 1);
    g.fillCircle(0, 0, r);
    let o = at(-0.08, -0.1);
    g.fillStyle(base, 1);
    g.fillCircle(o.x, o.y, r * 0.87);
    o = at(-0.17, -0.2);
    g.fillStyle(int(c.gradient), 0.4);
    g.fillCircle(o.x, o.y, r * 0.6);
}

/** The glossy highlights (after the stripes of a marked ball, so they shine over them). */
export function paintGloss(g: Phaser.GameObjects.Graphics, at: At, r: number, c: PaletteColour) {
    let o = at(-0.3, -0.34);
    g.fillStyle(int(c.inner), 0.45);
    g.fillCircle(o.x, o.y, r * 0.38);
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(o.x, o.y, r * 0.24);
    o = at(-0.36, -0.4);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(o.x, o.y, r * 0.12);
    o = at(0.36, 0.42);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(o.x, o.y, r * 0.16);
}

/** Points of the part of the circle below the wavy line y = level + amp·sin(k·x + phase) (a closed shape). */
function below(r: number, level: number, amp: number, phase: number, k = 2.6): { x: number; y: number }[] {
    const top: { x: number; y: number }[] = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
        const x = -r + (2 * r * i) / N, edge = Math.sqrt(Math.max(0, r * r - x * x));
        const y = Math.min(edge, Math.max(-edge, level + amp * Math.sin((k * x) / r + phase)));
        top.push({ x, y });
    }
    const bottom: { x: number; y: number }[] = [];
    for (let i = N; i >= 0; i--) {
        const x = -r + (2 * r * i) / N;
        bottom.push({ x, y: Math.sqrt(Math.max(0, r * r - x * x)) });
    }
    return [...top, ...bottom];
}

/**
 * Water balloon: a thin clear shell full of coloured water (no air at the top), the water sloshing
 * inside: two wavy darker layers rock and roll through it, light ripples drift over it. `t` is the time
 * in seconds, `slosh` how much it moves (idle about 1, running more).
 */
export function paintWater(g: Phaser.GameObjects.Graphics, at: At, r: number, c: PaletteColour, t: number, slosh = 1) {
    const base = int(c.base), deep = int(c.dark), light = int(c.inner);
    const R = r * 0.93; // the water, inside the shell
    // Shell edge: a thin darker ring of the colour (water seen through the glass at a grazing angle).
    g.fillStyle(mix(deep, base, 0.35), 1);
    g.fillCircle(0, 0, r);
    // The water: full, a touch lighter towards the light.
    g.fillStyle(base, 1);
    g.fillCircle(0, 0, R);
    const lit = at(-0.15, -0.18);
    g.fillStyle(mix(base, light, 0.45), 0.35);
    g.fillCircle(lit.x, lit.y, R * 0.7);
    // Sloshing: two deeper layers whose wavy tops rock left and right.
    const rock = Math.sin(t * 2.1) * 0.12 * slosh;
    g.fillStyle(mix(base, deep, 0.55), 0.38);
    g.fillPoints(below(R, R * (0.1 + rock * 0.6), R * 0.09 * slosh, t * 3.1 + rock * 4) as unknown as Phaser.Math.Vector2[], true);
    g.fillStyle(mix(base, deep, 0.8), 0.32);
    g.fillPoints(below(R, R * (0.48 - rock * 0.5), R * 0.07 * slosh, -t * 2.6 + 1.7) as unknown as Phaser.Math.Vector2[], true);
    // Light ripples (caustics) drifting through the water.
    g.lineStyle(Math.max(1, r * 0.06), mix(base, 0xffffff, 0.55), 0.35);
    for (let k = 0; k < 2; k++) {
        const y = -R * (0.15 + 0.3 * k) + Math.sin(t * 1.7 + k * 2) * R * 0.08 * slosh;
        g.beginPath();
        for (let i = 0; i <= 10; i++) {
            const x = -R * 0.55 + (R * 1.1 * i) / 10, yy = y + Math.sin(i * 1.3 + t * 3 + k) * R * 0.05;
            if (x * x + yy * yy > R * R * 0.8) continue;
            if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
        }
        g.strokePath();
    }
    // The shell: a faint bright rim, a big curved highlight at the top left and a sharp glint.
    g.lineStyle(Math.max(1, r * 0.05), 0xffffff, 0.45);
    g.strokeCircle(0, 0, r * 0.97);
    const h = at(-0.02, -0.02);
    g.lineStyle(Math.max(2, r * 0.13), 0xffffff, 0.55);
    g.beginPath();
    g.arc(h.x, h.y, r * 0.72, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(255));
    g.strokePath();
    const s = at(-0.42, -0.44);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(s.x, s.y, r * 0.1);
    const b = at(0.4, 0.45);
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(b.x, b.y, r * 0.12);
}
