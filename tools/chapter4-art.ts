// The 10 drawings of chapter 4, drawn stroke by stroke to research/image_requirement.md.
// Coordinates: 400 x 520 canvas. Each function returns the strokes in drawing order.
import { St, at, branch, bridge, from, mirror, mk, pt, reach } from './stroke-art';

export interface Drawing { id: string; name: string; tier: 'normal' | 'hard'; desc: string; draw: () => St[] }

const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));

function leaf(): St[] {
    const M = mk([pt(200, 492), pt(204, 400), pt(200, 280), pt(192, 160), pt(200, 48)]);
    const E1 = from(M, 0.2, [pt(118, 372), pt(78, 250), pt(108, 130), pt(176, 66)], 'main');
    const E2 = from(M, 0.24, [pt(286, 362), pt(322, 240), pt(294, 120), pt(224, 60)], 'main');
    const out = [M, E1, E2];
    range(0.32, 0.8, 5).forEach((t, i) => {
        const p = at(M, t).p;
        out.push(i % 2 === 0 ? reach(M, t, [pt(p.x - 60, p.y - 48), pt(p.x - 120, p.y - 80)], E1) : from(M, t, [pt(p.x - 40, p.y - 34), pt(p.x - 72, p.y - 58)]));
    });
    range(0.36, 0.84, 5).forEach((t, i) => {
        const p = at(M, t).p;
        out.push(i % 2 === 1 ? reach(M, t, [pt(p.x + 60, p.y - 46), pt(p.x + 125, p.y - 78)], E2) : from(M, t, [pt(p.x + 40, p.y - 32), pt(p.x + 74, p.y - 56)]));
    });
    out.push(from(E2, 0.52, [pt(282, 262), pt(268, 268)], 'fine'));
    out.push(mk([pt(320, 420), pt(332, 410), pt(344, 420)], 'fine'), mk([pt(70, 440), pt(80, 430), pt(92, 438)], 'fine'));
    return out;
}

function feather(): St[] {
    const S = mk([pt(214, 505), pt(206, 410), pt(196, 280), pt(198, 150), pt(214, 35)]);
    const L = from(S, 0.24, [pt(128, 352), pt(104, 222), pt(138, 96), pt(186, 54)], 'main');
    const R = from(S, 0.3, [pt(286, 346), pt(302, 216), pt(270, 96), pt(230, 54)], 'main');
    const out = [S, L, R];
    range(0.36, 0.86, 7).forEach((t, i) => {
        const p = at(S, t).p;
        out.push(i % 2 === 0 ? reach(S, t, [pt(p.x - 50, p.y - 30), pt(p.x - 105, p.y - 52)], L) : from(S, t, [pt(p.x - 34, p.y - 22), pt(p.x - 64, p.y - 36)]));
        out.push(i % 2 === 1 ? reach(S, t + 0.02, [pt(p.x + 50, p.y - 30), pt(p.x + 105, p.y - 52)], R) : from(S, t + 0.02, [pt(p.x + 34, p.y - 22), pt(p.x + 64, p.y - 36)]));
    });
    out.push(from(L, 0.45, [pt(150, 250), pt(176, 220)], 'fine'));
    return out;
}

function mushrooms(): St[] {
    const G = mk([pt(28, 472), pt(140, 482), pt(262, 476), pt(374, 462)]);
    const C1 = mk([pt(60, 250), pt(96, 150), pt(200, 98), pt(300, 150), pt(332, 250)]);
    const C2 = mk([at(C1, 0.08).p, pt(200, 276), at(C1, 0.92).p]);
    const sL = reach(C2, 0.38, [pt(172, 360), pt(168, 476)], G, 'main');
    const sR = reach(C2, 0.62, [pt(232, 360), pt(236, 476)], G, 'main');
    const out = [G, C1, C2, sL, sR];
    for (const t of [0.17, 0.27, 0.73, 0.83]) { const p = at(C2, t).p; out.push(from(C2, t, [pt(p.x + (t < 0.5 ? 14 : -14), p.y + 14), pt(p.x + (t < 0.5 ? 26 : -26), p.y + 22)], 'fine')); }
    out.push(mk([pt(130, 182), pt(146, 168), pt(162, 182)], 'detail'), mk([pt(200, 140), pt(214, 128), pt(228, 140)], 'detail'), mk([pt(250, 190), pt(266, 178), pt(280, 190)], 'detail'));
    const c3 = mk([pt(272, 404), pt(298, 354), pt(340, 350), pt(366, 398)]);
    const c3b = mk([at(c3, 0.08).p, pt(318, 412), at(c3, 0.92).p]);
    out.push(c3, c3b, reach(c3b, 0.38, [pt(306, 444), pt(307, 476)], G), reach(c3b, 0.62, [pt(330, 444), pt(332, 472)], G));
    out.push(from(G, 0.14, [pt(70, 452), pt(66, 432)], 'fine'), from(G, 0.28, [pt(110, 455), pt(118, 436)], 'fine'), from(G, 0.86, [pt(354, 446), pt(350, 426)], 'fine'));
    out.push(from(G, 0.52, [pt(214, 456), pt(244, 448)], 'detail'));
    return out;
}

function tree(): St[] {
    const G = mk([pt(20, 492), pt(200, 482), pt(380, 494)]);
    const Tr = from(G, 0.5, [pt(194, 400), pt(206, 300), pt(198, 190)], 'main');
    const b = [
        from(Tr, 0.4, [pt(140, 300), pt(78, 256)], 'main'),
        from(Tr, 0.55, [pt(268, 268), pt(330, 216)], 'main'),
        from(Tr, 0.72, [pt(150, 206), pt(112, 132)], 'main'),
        from(Tr, 0.86, [pt(250, 170), pt(282, 96)], 'main')
    ];
    const out = [G, Tr, ...b];
    const twigs: St[] = [];
    b.forEach((br, i) => {
        const s = i % 2 === 0 ? 1 : -1;
        twigs.push(branch(br, 0.3, 40 * s, 62, 0.1), branch(br, 0.55, -36 * s, 58, -0.1), branch(br, 0.8, 34 * s, 54, 0.1));
    });
    out.push(...twigs);
    twigs.forEach((tw, i) => out.push(branch(tw, 0.6, i % 2 ? -55 : 55, 30, i % 2 ? -0.3 : 0.3, 'fine')));
    out.push(reach(Tr, 0.07, [pt(168, 476), pt(150, 486)], G, 'detail'), reach(Tr, 0.1, [pt(232, 474), pt(252, 488)], G, 'detail'));
    const seat = mk([pt(98, 392), pt(124, 394), pt(150, 392)], 'detail');
    out.push(seat, reach(b[0], 0.5, [pt(109, 340), pt(108, 392)], seat, 'fine'), reach(b[0], 0.78, [pt(92, 330), pt(140, 392)], seat, 'fine'));
    out.push(mk([pt(300, 60), pt(310, 52), pt(320, 60)], 'fine'), mk([pt(332, 80), pt(340, 73), pt(348, 80)], 'fine'));
    [1, 4, 7, 10].forEach((i) => out.push(branch(twigs[i], 0.35, 90, 18, 0.4, 'fine')));
    out.push(from(G, 0.8, [pt(304, 470), pt(312, 452)], 'fine'));
    return out;
}

function fish(): St[] {
    const top = mk([pt(70, 232), pt(150, 150), pt(270, 160), pt(330, 230)]);
    const bot = mk([at(top, 0.06).p, pt(150, 300), pt(270, 296), at(top, 0.94).p]);
    const tailU = from(top, 0.9, [pt(368, 178), pt(386, 160)], 'main');
    const tailD = from(bot, 0.9, [pt(372, 286), pt(388, 302)], 'main');
    const out = [top, bot, tailU, tailD, bridge(tailU, 0.65, tailD, 0.65, 0.12)];
    out.push(mk([pt(104, 206), pt(116, 194), pt(128, 206)], 'detail'));
    out.push(bridge(top, 0.22, bot, 0.25, -0.18));
    for (const t of [0.36, 0.52, 0.68]) { out.push(bridge(top, t, bot, t + 0.12, 0.1), bridge(top, t + 0.12, bot, t, -0.1)); }
    out.push(from(top, 0.42, [pt(196, 118), pt(246, 126)], 'detail'), from(bot, 0.32, [pt(148, 338), pt(126, 352)], 'detail'));
    const G = mk([pt(30, 502), pt(200, 490), pt(370, 504)]);
    const w = [from(G, 0.2, [pt(82, 432), pt(60, 384), pt(86, 330)]), from(G, 0.36, [pt(132, 440), pt(152, 400), pt(132, 360)]), from(G, 0.8, [pt(312, 440), pt(332, 400), pt(314, 352)])];
    out.push(G, ...w, ...w.map((s, i) => branch(s, 0.55, i % 2 ? 50 : -50, 30, 0.2, 'fine')));
    out.push(mk([pt(60, 120), pt(68, 110), pt(78, 118)], 'fine'), mk([pt(92, 80), pt(100, 72), pt(108, 80)], 'fine'));
    return out;
}

function owl(): St[] {
    const head = mk([pt(110, 172), pt(140, 110), pt(200, 94), pt(260, 110), pt(290, 172)]);
    const sideL = from(head, 0.12, [pt(100, 262), pt(112, 362), pt(160, 428)], 'main');
    const sideR = mirror(sideL);
    const eye = mk([pt(126, 180), pt(138, 154), pt(160, 144), pt(182, 154), pt(194, 180)], 'detail');
    const eye2 = mk([at(eye, 0.3).p, pt(148, 202), pt(172, 202), at(eye, 0.7).p], 'detail');
    const wingL = from(sideL, 0.32, [pt(140, 296), pt(152, 384)], 'main');
    const wingR = mirror(wingL);
    const perch = mk([pt(38, 446), pt(200, 440), pt(372, 450)]);
    const earL = from(head, 0.22, [pt(120, 96), pt(110, 68)], 'detail');
    const out = [head, sideL, sideR, bridge(sideL, 0.94, sideR, 0.94, -0.06, 'main'), earL, mirror(earL), eye, eye2, mirror(eye), mirror(eye2)];
    out.push(bridge(eye2, 0.85, mirror(eye2), 0.15, -0.6, 'detail'));
    out.push(wingL, wingR, branch(wingL, 0.4, 40, 34, 0.1), branch(wingL, 0.7, 40, 30, 0.1), branch(wingR, 0.4, -40, 34, -0.1), branch(wingR, 0.7, -40, 30, -0.1));
    for (const t of [0.42, 0.62, 0.82]) out.push(bridge(wingL, t, wingR, t, 0.22, 'detail'));
    out.push(perch, from(perch, 0.42, [pt(176, 428), pt(178, 418)], 'fine'), from(perch, 0.56, [pt(226, 428), pt(224, 418)], 'fine'), branch(perch, 0.86, -60, 34, 0.3, 'detail'), branch(perch, 0.1, -60, 34, -0.3, 'detail'), branch(perch, 0.7, -50, 30, 0.3, 'fine'));
    return out;
}

function cactus(): St[] {
    const rim = mk([pt(108, 372), pt(200, 378), pt(292, 372)]);
    const potL = from(rim, 0.18, [pt(140, 442), pt(152, 496)], 'main');
    const potR = mirror(potL);
    const tL = from(rim, 0.38, [pt(166, 250), pt(170, 132), pt(196, 84)], 'main');
    const tR = reach(rim, 0.62, [pt(238, 250), pt(232, 140), pt(206, 92)], tL, 'main');
    const out = [rim, potL, potR, bridge(potL, 0.92, potR, 0.92, 0, 'main'), bridge(potL, 0.35, potR, 0.35, 0.04), bridge(potL, 0.62, potR, 0.62, 0.04), tL, tR];
    out.push(from(tL, 0.42, [pt(110, 300), pt(88, 240), pt(100, 186)], 'main'), from(tL, 0.56, [pt(132, 262), pt(122, 214)], 'main'));
    out.push(from(tR, 0.36, [pt(300, 282), pt(312, 222), pt(296, 168)], 'main'), from(tR, 0.5, [pt(272, 256), pt(282, 206)], 'main'));
    out.push(from(rim, 0.5, [pt(202, 250), pt(204, 140)], 'detail'));
    const arms = out.slice(8, 12);
    [tL, tR, ...arms].forEach((s, i) => { out.push(branch(s, 0.3, i % 2 ? -62 : 62, 16, 0.2, 'fine')); if (i < 4) out.push(branch(s, 0.7, i % 2 ? -62 : 62, 16, 0.2, 'fine')); });
    out.push(from(tL, 0.93, [pt(182, 62), pt(192, 46)], 'detail'), from(tR, 0.9, [pt(224, 66), pt(214, 50)], 'detail'));
    out.push(mk([pt(250, 470), pt(262, 460), pt(276, 468)], 'fine'));
    return out;
}

function balloon(): St[] {
    const envL = mk([pt(200, 40), pt(112, 70), pt(80, 170), pt(118, 268), pt(160, 322)]);
    const envR = mk([at(envL, 0.02).p, pt(288, 70), pt(320, 170), pt(282, 268), pt(240, 322)]);
    const band = mk([at(envL, 0.97).p, pt(200, 336), at(envR, 0.97).p]);
    const belts = [0.3, 0.52, 0.74].map((t) => bridge(envL, t, envR, t, 0.04, 'detail'));
    const out = [envL, envR, band, ...belts];
    for (const f of [0.28, 0.5, 0.72]) out.push(reach(belts[0], f, [pt(at(belts[0], f).p.x + (f - 0.5) * 30, 260), pt(at(belts[0], f).p.x + (f - 0.5) * 60, 340)], band));
    out.push(reach(envL, 0.1, [pt(160, 70), pt(150, 110)], belts[0], 'fine'), reach(envR, 0.1, [pt(240, 70), pt(250, 110)], belts[0], 'fine'));
    const rimB = mk([pt(136, 412), pt(200, 416), pt(264, 412)]);
    for (const t of [0.22, 0.78]) { const p = at(band, t).p; out.push(reach(band, t, [pt(p.x + (t - 0.5) * 10, 372), pt(at(rimB, t).p.x, 413)], rimB, 'fine')); }
    out.push(mk([pt(180, 372), pt(200, 366), pt(220, 372)], 'fine'), from(band, 0.5, [pt(200, 360), pt(200, 380)], 'fine'));
    const bL = from(rimB, 0.18, [pt(156, 474)], 'main');
    const bR = mirror(bL);
    out.push(rimB, bL, bR, bridge(bL, 0.92, bR, 0.92, 0, 'main'), bridge(bL, 0.4, bR, 0.4, 0, 'fine'), bridge(bL, 0.7, bR, 0.7, 0, 'fine'));
    out.push(branch(bL, 0.5, 70, 18, 0.3, 'fine'), branch(bR, 0.5, -70, 18, -0.3, 'fine'), from(rimB, 0.5, [pt(196, 392), pt(204, 378)], 'fine'));
    out.push(mk([pt(40, 120), pt(62, 104), pt(84, 114), pt(100, 100)], 'detail'), mk([pt(318, 380), pt(340, 366), pt(362, 376)], 'detail'));
    out.push(mk([pt(320, 200), pt(330, 192), pt(340, 200)], 'fine'), mk([pt(346, 230), pt(354, 223), pt(362, 230)], 'fine'));
    return out;
}

function pineapple(): St[] {
    const cap = mk([pt(150, 202), pt(200, 186), pt(250, 202)]);
    const bodyL = from(cap, 0.2, [pt(120, 262), pt(104, 350), pt(134, 450), pt(190, 484)], 'main');
    const bodyR = from(cap, 0.8, [pt(280, 262), pt(296, 350), pt(266, 450), pt(212, 484)], 'main');
    const out = [cap, bodyL, bodyR];
    for (const t of [0.12, 0.26, 0.4, 0.54, 0.68]) { out.push(bridge(bodyL, t, bodyR, t + 0.24, 0.03), bridge(bodyR, t, bodyL, t + 0.24, -0.03)); }
    out.push(bridge(bodyL, 0.05, bodyR, 0.18, 0.03), bridge(bodyR, 0.05, bodyL, 0.18, -0.03));
    [[160, 270], [240, 270], [200, 300], [150, 340], [250, 340], [200, 370], [160, 410], [240, 410], [200, 440], [130, 300], [270, 300]].forEach(([x, y]) => out.push(mk([pt(x - 6, y - 4), pt(x, y + 3), pt(x + 6, y - 4)], 'fine')));
    const leaves = range(0.12, 0.88, 7).map((t, i) => { const p = at(cap, t).p; const a = (t - 0.5) * 2; return from(cap, t, [pt(p.x + a * 30, p.y - 50), pt(p.x + a * 60 + (i % 2 ? 12 : -12), p.y - 110 + Math.abs(a) * 30)], i % 3 === 1 ? 'main' : 'detail'); });
    out.push(...leaves);
    leaves.forEach((l, i) => { if (i % 2 === 0) out.push(branch(l, 0.35, i < 3 ? 35 : -35, 34, 0.15)); });
    leaves.forEach((l, i) => { if (i % 2 === 1) out.push(branch(l, 0.5, i < 3 ? -40 : 40, 16, 0.2, 'fine')); });
    const plate = mk([pt(80, 500), pt(200, 510), pt(320, 500)]);
    out.push(plate, from(plate, 0.22, [pt(84, 486), pt(70, 474)], 'detail'), from(plate, 0.8, [pt(318, 486), pt(334, 476)], 'detail'));
    return out;
}

function lighthouse(): St[] {
    const rockL = mk([pt(48, 476), pt(110, 428), pt(176, 440), pt(208, 452)]);
    const rockR = mk([at(rockL, 0.86).p, pt(268, 430), pt(352, 470)]);
    const gallery = mk([pt(148, 172), pt(200, 166), pt(252, 172)]);
    const roof = mk([pt(170, 122), pt(200, 92), pt(230, 122)]);
    const tL = mk([at(rockL, 0.66).p, pt(170, 300), at(gallery, 0.28).p]);
    const tR = mk([at(rockR, 0.24).p, pt(230, 300), at(gallery, 0.72).p]);
    const lanL = reach(gallery, 0.38, [pt(182, 140), pt(180, 121)], roof);
    const lanR = reach(gallery, 0.62, [pt(218, 140), pt(220, 121)], roof);
    const out = [rockL, rockR, gallery, roof, tL, tR, lanL, lanR, from(roof, 0.5, [pt(200, 80), pt(200, 66)], 'detail')];
    out.push(branch(lanL, 0.4, 70, 54, 0, 'fine'), branch(lanL, 0.4, 110, 50, 0, 'fine'), branch(lanR, 0.4, -70, 54, 0, 'fine'), branch(lanR, 0.4, -110, 50, 0, 'fine'));
    for (const t of [0.25, 0.5, 0.75]) out.push(bridge(tL, t, tR, t, 0.05, 'detail'));
    out.push(mk([pt(188, 430), pt(200, 404), pt(212, 430)], 'detail'), mk([pt(192, 330), pt(200, 320), pt(208, 330)], 'fine'), mk([pt(194, 240), pt(200, 232), pt(206, 240)], 'fine'));
    // Two waves, 2 dot diameters apart; the first one runs from rock to rock under the tower.
    out.push(mk([at(rockL, 0.12).p, pt(80, 486), pt(140, 476), pt(200, 490), pt(260, 478), at(rockR, 0.9).p], 'detail'));
    out.push(mk([pt(24, 512), pt(90, 500), pt(160, 514), pt(240, 500), pt(310, 514), pt(378, 504)], 'detail'));
    out.push(branch(rockL, 0.3, 60, 22, 0.2, 'fine'), branch(rockR, 0.6, 60, 22, 0.2, 'fine'));
    out.push(from(gallery, 0.12, [pt(150, 156), pt(152, 148)], 'fine'), from(gallery, 0.88, [pt(250, 156), pt(248, 148)], 'fine'));
    out.push(mk([pt(300, 60), pt(310, 52), pt(320, 60)], 'fine'), mk([pt(330, 90), pt(338, 83), pt(346, 90)], 'fine'));
    out.push(mk([pt(40, 140), pt(62, 124), pt(86, 134), pt(104, 120)], 'detail'), mk([pt(290, 220), pt(312, 206), pt(336, 216), pt(354, 204)], 'detail'));
    return out;
}

export const DRAWINGS: Drawing[] = [
    { id: 'leaf', name: 'Leaf', tier: 'normal', desc: 'A big leaf: midrib, two edges, veins (some reach the edge)', draw: leaf },
    { id: 'feather', name: 'Feather', tier: 'normal', desc: 'A feather: shaft, two vanes, barbs and a split', draw: feather },
    { id: 'mushrooms', name: 'Mushrooms', tier: 'normal', desc: 'Two mushrooms on the ground with gills, spots and grass', draw: mushrooms },
    { id: 'tree', name: 'Tree with a swing', tier: 'hard', desc: 'Trunk, branches, twigs, leaves, apples, roots, a swing and birds', draw: tree },
    { id: 'fish', name: 'Fish and seaweed', tier: 'normal', desc: 'A fish with crossing scales, fins, seaweed and bubbles', draw: fish },
    { id: 'owl', name: 'Owl on a branch', tier: 'normal', desc: 'An owl with ear tufts, big eyes, wings, chest feathers, on a perch', draw: owl },
    { id: 'cactus', name: 'Cactus in a pot', tier: 'normal', desc: 'A cactus with two arms, spines and flowers in a banded pot', draw: cactus },
    { id: 'balloon', name: 'Hot air balloon', tier: 'normal', desc: 'A balloon with belts and gores, ropes, a basket, clouds and birds', draw: balloon },
    { id: 'pineapple', name: 'Pineapple', tier: 'hard', desc: 'A pineapple with a crossing lattice, scale marks and a leafy crown on a plate', draw: pineapple },
    { id: 'lighthouse', name: 'Lighthouse', tier: 'normal', desc: 'A striped lighthouse on rocks with light rays, waves, clouds and birds', draw: lighthouse }
];
