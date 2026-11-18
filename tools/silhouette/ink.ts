// The "ink" of a silhouette level and how it is divided into lines.
//
// Ink = strokes: contour loops, centre lines of thin parts and the fill pattern. Every stroke end is
// either a free tip or lands ON another stroke (a T node). One dot sits at every T node and every
// tip, so the dots are fixed by the ink. What is left to choose is, at each T node, which two of the
// three arms run on as one line and which one stops there (its dot then blocks the line that passes):
//   state 0  the stem stops, the host line passes (a plain T);
//   state 1  the stem turns into the host towards its start, the other side of the host stops;
//   state 2  the stem turns into the host towards its end, the other side stops.
// The number of lines is always (T nodes + tips) / 2. An annealing search picks the states so that
// the level is solvable and its blocking depth and open share match the plan.
import type { Pt } from '../../src/core/path';
import { Grid, at, cut, dist, lengths, project, tangent } from './geom';

export interface End {
    /** Host stroke id, or -1 for a free tip. */
    host: number;
    /** Arc position of the T node on the host. */
    s: number;
}

export interface Stroke {
    id: number;
    pts: Pt[];
    acc: number[];
    len: number;
    /** Closed strokes repeat their first point at the end and have no ends of their own. */
    closed: boolean;
    role: 'contour' | 'thin' | 'fill' | 'rung' | 'spur';
    ends: [End, End];
    /** Pattern family of a fill stroke (0 = main), for reporting and colouring. */
    family?: number;
    /** Index of the pattern curve this stroke was cut from (its row). */
    row?: number;
    /** Dot radius of a detail stroke (smaller than the level's); a line takes the smallest radius of its strokes. */
    r?: number;
}

export function makeStroke(id: number, pts: Pt[], closed: boolean, role: Stroke['role'], ends?: [End, End]): Stroke {
    const acc = lengths(pts);
    return { id, pts, acc, len: acc[acc.length - 1], closed, role, ends: ends ?? [{ host: -1, s: 0 }, { host: -1, s: 0 }] };
}

interface Node {
    stem: number;
    stemEnd: 0 | 1;
    host: number;
    s: number;
    p: Pt;
    /** Bitmask of the states allowed here (bit i = state i). */
    allowed: number;
    /** Segment ids: the stem's end segment, the host segment before the node and the one after. */
    seg: [number, number, number];
}

interface Seg {
    stroke: number;
    s0: number;
    s1: number;
    len: number;
    /** What is at each end: a node (index, arm 0 stem / 1 before / 2 after) or a tip (node -1). */
    e: [{ node: number; arm: number; tip: number }, { node: number; arm: number; tip: number }];
}

export interface Graph {
    strokes: Stroke[];
    nodes: Node[];
    segs: Seg[];
    /** Dots: node dots first (index = node index), then tips. */
    dots: { p: Pt; node: number; seg: number }[];
    /** For every dot: segments within reach and their distance. */
    near: { seg: number; d: number }[][];
    reach: number;
    /** Dot radius per segment (from its stroke). */
    segR: Float32Array;
}

/** Turn (degrees, 0 = straight on) when a line goes from the stem into the host arm. */
function turnAngle(stem: Stroke, stemEnd: 0 | 1, host: Stroke, s: number, arm: 1 | 2): number {
    const st = tangent(stem.pts, stem.acc, stemEnd === 0 ? 4 : stem.len - 4, 4);
    // direction of travel arriving at the node along the stem
    const inDir = stemEnd === 0 ? { x: -st.x, y: -st.y } : st;
    const ht = tangent(host.pts, host.acc, Math.max(4, Math.min(host.len - 4, s)), 4);
    const outDir = arm === 1 ? { x: -ht.x, y: -ht.y } : ht;
    const c = Math.max(-1, Math.min(1, inDir.x * outDir.x + inDir.y * outDir.y));
    return (Math.acos(c) * 180) / Math.PI;
}

/** Builds nodes, segments, dots and the "which ink is near which dot" table. */
export function compile(strokes: Stroke[], R: number, maxTurn = 150): Graph {
    const reach = 0.85 * 2 * R + 0.01;
    const byId = new Map(strokes.map((s) => [s.id, s]));
    const nodes: Node[] = [];
    for (const st of strokes) {
        if (st.closed) continue;
        for (const e of [0, 1] as const) {
            const en = st.ends[e];
            if (en.host < 0) continue;
            const host = byId.get(en.host)!;
            let allowed = 1;
            if (turnAngle(st, e, host, en.s, 1) <= maxTurn) allowed |= 2;
            if (turnAngle(st, e, host, en.s, 2) <= maxTurn) allowed |= 4;
            nodes.push({ stem: st.id, stemEnd: e, host: en.host, s: en.s, p: at(host.pts, host.acc, en.s), allowed, seg: [-1, -1, -1] });
        }
    }
    const hosted = new Map<number, number[]>();
    nodes.forEach((n, i) => hosted.set(n.host, [...(hosted.get(n.host) ?? []), i]));
    const segs: Seg[] = [];
    const tipDots: { p: Pt; seg: number }[] = [];
    const stemNode = new Map<string, number>();
    nodes.forEach((n, i) => stemNode.set(`${n.stem}:${n.stemEnd}`, i));
    for (const st of strokes) {
        const hs = (hosted.get(st.id) ?? []).slice().sort((a, b) => nodes[a].s - nodes[b].s);
        const ownEnd = (e: 0 | 1) => {
            const ni = stemNode.get(`${st.id}:${e}`);
            return ni === undefined ? { node: -1, arm: 0, tip: 1 } : { node: ni, arm: 0, tip: 0 };
        };
        if (st.closed) {
            if (!hs.length) throw new Error(`closed stroke ${st.id} has no node (cut it first)`);
            for (let i = 0; i < hs.length; i++) {
                const a = hs[i], b = hs[(i + 1) % hs.length];
                const s0 = nodes[a].s, s1 = nodes[b].s;
                const id = segs.length;
                segs.push({ stroke: st.id, s0, s1, len: s1 > s0 ? s1 - s0 : st.len - s0 + s1, e: [{ node: a, arm: 2, tip: 0 }, { node: b, arm: 1, tip: 0 }] });
                nodes[a].seg[2] = id; nodes[b].seg[1] = id;
            }
            continue;
        }
        const stops = [0, ...hs.map((h) => nodes[h].s), st.len];
        for (let i = 0; i < stops.length - 1; i++) {
            const id = segs.length;
            const e0 = i === 0 ? ownEnd(0) : { node: hs[i - 1], arm: 2, tip: 0 };
            const e1 = i === stops.length - 2 ? ownEnd(1) : { node: hs[i], arm: 1, tip: 0 };
            segs.push({ stroke: st.id, s0: stops[i], s1: stops[i + 1], len: stops[i + 1] - stops[i], e: [e0, e1] });
            if (e0.tip) tipDots.push({ p: st.pts[0], seg: id }); else nodes[e0.node].seg[e0.arm] = id;
            if (e1.tip) tipDots.push({ p: st.pts[st.pts.length - 1], seg: id }); else nodes[e1.node].seg[e1.arm] = id;
        }
    }
    const dots = [...nodes.map((n, i) => ({ p: n.p, node: i, seg: -1 })), ...tipDots.map((t) => ({ p: t.p, node: -1, seg: t.seg }))];
    // near table
    const grid = new Grid<number>(reach);
    segs.forEach((g, gi) => {
        const st = byId.get(g.stroke)!;
        const add = (a: number, b: number) => { for (const p of cut(st.pts, st.acc, a, b)) grid.add(p, gi); };
        if (st.closed && g.s1 <= g.s0) { add(g.s0, st.len); add(0, g.s1); } else add(g.s0, g.s1);
    });
    const near = dots.map((d) => {
        const best = new Map<number, number>();
        for (const h of grid.near(d.p, reach + 3)) if (h.d < (best.get(h.v) ?? Infinity)) best.set(h.v, h.d);
        const out: { seg: number; d: number }[] = [];
        for (const [seg, dd] of best) {
            // exact distance to the segment's polyline (samples are a few px apart)
            const g = segs[seg], st = byId.get(g.stroke)!;
            let exact = dd;
            if (dd > 0.01) {
                const pr = project(st.pts, st.acc, d.p);
                const inside = st.closed && g.s1 <= g.s0 ? pr.s >= g.s0 || pr.s <= g.s1 : pr.s >= g.s0 - 0.01 && pr.s <= g.s1 + 0.01;
                if (inside) exact = pr.d;
            }
            if (exact < reach) out.push({ seg, d: exact });
        }
        return out;
    });
    const segR = Float32Array.from(segs, (sg) => byId.get(sg.stroke)!.r ?? R);
    return { strokes, nodes, segs, dots, near, reach, segR };
}

export interface Eval {
    valid: boolean;
    /** Closed trails + lines that end on themselves. */
    broken: number;
    lines: number;
    lineOf: Int32Array;
    length: Float32Array;
    /** Dot radius per line. */
    radius: Float32Array;
    indeg: Int32Array;
    outdeg: Int32Array;
    round: Int32Array;
    open: number;
    depth: number;
    stuck: number;
    blocks: number;
    turns: number;
    /** Blocking pairs as owner * lines + blocked. */
    edges: Set<number>;
}

/**
 * Lines and blocking for a choice of node states. A dot blocks a line when it is closer to it than
 * 0.85 x the sum of the two lines' dot radii (the game's rule).
 */
export function evaluate(g: Graph, state: Uint8Array): Eval {
    const { nodes, segs, dots, near, segR } = g;
    const M = segs.length;
    const parent = new Int32Array(M);
    for (let i = 0; i < M; i++) parent[i] = i;
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    let broken = 0, turns = 0;
    const stopSeg = new Int32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], st = state[i];
        const a = st === 0 ? n.seg[1] : n.seg[0], b = st === 0 ? n.seg[2] : st === 1 ? n.seg[1] : n.seg[2];
        stopSeg[i] = st === 0 ? n.seg[0] : st === 1 ? n.seg[2] : n.seg[1];
        if (st !== 0) turns++;
        const ra = find(a), rb = find(b);
        if (ra === rb) broken++; else parent[ra] = rb;
    }
    // compact line ids
    const lineOf = new Int32Array(M).fill(-1);
    let L = 0;
    const idOfRoot = new Map<number, number>();
    for (let i = 0; i < M; i++) { const r = find(i); let id = idOfRoot.get(r); if (id === undefined) { id = L++; idOfRoot.set(r, id); } lineOf[i] = id; }
    const length = new Float32Array(L), radius = new Float32Array(L).fill(1e9);
    for (let i = 0; i < M; i++) { length[lineOf[i]] += segs[i].len; if (segR[i] < radius[lineOf[i]]) radius[lineOf[i]] = segR[i]; }
    // block edges
    const edge = new Set<number>();
    const indeg = new Int32Array(L), outdeg = new Int32Array(L);
    const adj: number[][] = Array.from({ length: L }, () => []);
    for (let di = 0; di < dots.length; di++) {
        const d = dots[di];
        const owner = lineOf[d.node >= 0 ? stopSeg[d.node] : d.seg];
        if (d.node >= 0) { const n = nodes[d.node]; const through = lineOf[state[d.node] === 0 ? n.seg[1] : n.seg[0]]; if (through === owner) broken++; }
        for (const h of near[di]) {
            const y = lineOf[h.seg];
            if (y === owner || h.d >= 0.85 * (radius[owner] + radius[y])) continue;
            const key = owner * L + y;
            if (edge.has(key)) continue;
            edge.add(key); adj[owner].push(y); indeg[y]++; outdeg[owner]++;
        }
    }
    // rounds: clear every open line each round
    const round = new Int32Array(L).fill(0);
    const left = indeg.slice();
    let frontier: number[] = [];
    for (let i = 0; i < L; i++) if (!left[i]) frontier.push(i);
    const open = frontier.length;
    let depth = 0, done = 0;
    while (frontier.length) {
        depth++;
        const nextF: number[] = [];
        for (const x of frontier) { round[x] = depth; done++; for (const y of adj[x]) if (--left[y] === 0) nextF.push(y); }
        frontier = nextF;
    }
    return { valid: broken === 0 && done === L, broken, lines: L, lineOf, length, radius, indeg, outdeg, round, open, depth, stuck: L - done, blocks: edge.size, turns, edges: edge };
}

export interface Targets {
    depth: number;
    open: number;
    /** Wanted blockers per line (distinct lines whose dot sits on it). */
    blocks: number;
    /** Lines longer than this are penalised. */
    maxLen: number;
    minLen: number;
}

/** Soft part: how far the level is from the plan. */
export function softCost(ev: Eval, t: Targets): number {
    let c = 40 * Math.abs(ev.open / ev.lines - t.open);
    c += 14 * Math.abs(ev.depth - t.depth) / Math.max(3, t.depth);
    c += 12 * Math.max(0, Math.abs(ev.blocks / ev.lines - t.blocks) - 0.05);
    let over = 0, big = 0;
    for (let i = 0; i < ev.lines; i++) {
        if (ev.length[i] > t.maxLen) over += (ev.length[i] - t.maxLen) / t.maxLen;
        if (ev.length[i] < t.minLen) over += 0.5 * (t.minLen - ev.length[i]) / t.minLen;
        if (ev.indeg[i] > 5) big += ev.indeg[i] - 5;
    }
    return c + 5 * over + 0.4 * big;
}

/** Hard part: closed trails, lines ending on themselves, lines that can never be cleared. */
const hardCount = (ev: Eval) => 4 * ev.broken + ev.stuck;

export function cost(ev: Eval, t: Targets): number {
    return 200 * hardCount(ev) + softCost(ev, t);
}

/**
 * A layout that is always solvable when the ink allows one: every node a plain T, and every closed
 * stroke opened by two stems that have a free tip at their other end. Both stems turn into the same
 * arc of the loop, the arc between them stops on that line at both ends.
 */
function feasibleStart(g: Graph, rand: () => number): Uint8Array | null {
    const N = g.nodes.length;
    const byId = new Map(g.strokes.map((s) => [s.id, s]));
    const closed = g.strokes.filter((s) => s.closed);
    const farHost = (n: Node) => byId.get(n.stem)!.ends[n.stemEnd === 0 ? 1 : 0].host;
    const leadsTo = (from: number, target: number, seen = new Set<number>()): boolean => {
        if (from === target) return true;
        if (from < 0 || seen.has(from)) return false;
        seen.add(from);
        const st = byId.get(from);
        if (!st || st.closed) return false;
        return st.ends.some((e) => leadsTo(e.host, target, seen));
    };
    // per loop: the pairs of stems that can open it (their other end must not lead back to the loop); free tips first
    const choices: [number, number, number, number][][] = [];
    for (const loop of closed) {
        const cand = g.nodes.map((n, i) => ({ n, i })).filter((x) => x.n.host === loop.id && !leadsTo(farHost(x.n), loop.id));
        const pairs: [number, number, number, number][] = [];
        const tipPairs: [number, number, number, number][] = [];
        for (let a = 0; a < cand.length; a++)
            for (let b = 0; b < cand.length; b++) {
                if (a === b || cand[a].n.stem === cand[b].n.stem) continue;
                // short arc runs from a (after) to b (before): a turns to its before side, b to its after side
                if ((cand[a].n.allowed & 2) && (cand[b].n.allowed & 4)) {
                    const p: [number, number, number, number] = [cand[a].i, 1, cand[b].i, 2];
                    pairs.push(p);
                    if (farHost(cand[a].n) < 0 && farHost(cand[b].n) < 0) tipPairs.push(p);
                }
            }
        if (!pairs.length) return null;
        choices.push(tipPairs.length ? [...tipPairs, ...tipPairs, ...tipPairs, ...pairs] : pairs);
    }
    const state = new Uint8Array(N);
    const pick: [number, number, number, number][] = choices.map((c) => c[Math.floor(rand() * c.length)]);
    const apply = () => { state.fill(0); for (const p of pick) { state[p[0]] = p[1]; state[p[2]] = p[3]; } };
    apply();
    let hard = hardCount(evaluate(g, state));
    // local search over the choices: re-pick one loop's pair, keep it when no worse
    for (let it = 0; it < 400 + 300 * closed.length && hard > 0 && closed.length; it++) {
        const li = Math.floor(rand() * closed.length);
        const old = pick[li];
        pick[li] = choices[li][Math.floor(rand() * choices[li].length)];
        apply();
        const h2 = hardCount(evaluate(g, state));
        if (h2 <= hard) hard = h2; else { pick[li] = old; }
    }
    apply();
    return hardCount(evaluate(g, state)) === 0 ? state : null;
}

/**
 * Picks the node states: starts from a solvable layout and anneals on the plan's targets, never
 * leaving the solvable layouts. Falls back to a penalty search when no solvable start exists.
 */
export function anneal(g: Graph, t: Targets, rand: () => number, iterations = 20000, restarts = 3): { state: Uint8Array; ev: Eval; cost: number } {
    const N = g.nodes.length;
    const options = g.nodes.map((n) => [0, 1, 2].filter((s) => n.allowed & (1 << s)));
    const free = options.map((o, i) => (o.length > 1 ? i : -1)).filter((i) => i >= 0);
    let best: { state: Uint8Array; ev: Eval; cost: number } | null = null;
    const consider = (state: Uint8Array, ev: Eval) => { const full = cost(ev, t); if (!best || full < best.cost) best = { state: state.slice(), ev, cost: full }; };
    for (let run = 0; run < restarts; run++) {
        const start = feasibleStart(g, rand);
        if (!start) break;
        const state = start;
        let ev = evaluate(g, state), c = softCost(ev, t);
        consider(state, ev);
        if (!free.length) break;
        for (let it = 0; it < iterations; it++) {
            const f = it / iterations;
            const temp = 1.6 * (1 - f) * (1 - f) + 0.02;
            const i = free[Math.floor(rand() * free.length)];
            const old = state[i];
            let nv = old;
            while (nv === old) nv = options[i][Math.floor(rand() * options[i].length)];
            state[i] = nv;
            // every fourth move changes a second node too (needed to re-route a loop)
            let j = -1, oldJ = 0;
            if (it % 4 === 3 && free.length > 1) {
                j = free[Math.floor(rand() * free.length)];
                if (j === i) j = -1;
                else { oldJ = state[j]; let v = oldJ; while (v === oldJ) v = options[j][Math.floor(rand() * options[j].length)]; state[j] = v; }
            }
            const e2 = evaluate(g, state);
            let take = false;
            if (hardCount(e2) === 0) { const c2 = softCost(e2, t); if (c2 <= c || rand() < Math.exp((c - c2) / temp)) { ev = e2; c = c2; take = true; consider(state, ev); } }
            if (!take) { state[i] = old; if (j >= 0) state[j] = oldJ; }
        }
        if (best && (best as { cost: number }).cost < 1.0) break;
    }
    if (best) return best;
    // fallback: penalty search through unsolvable layouts
    for (let run = 0; run < restarts; run++) {
        const state = new Uint8Array(N);
        for (let i = 0; i < N; i++) state[i] = rand() < 0.35 ? options[i][Math.floor(rand() * options[i].length)] : options[i][0];
        let ev = evaluate(g, state);
        const total = (e: Eval, w: number) => w * hardCount(e) + softCost(e, t);
        let w = 1.5, c = total(ev, w);
        consider(state, ev);
        if (!free.length) break;
        for (let it = 0; it < iterations; it++) {
            const f = it / iterations;
            const temp = 2.2 * (1 - f) * (1 - f) + 0.03;
            w = 1.5 + 80 * f * f; c = total(ev, w);
            const i = free[Math.floor(rand() * free.length)];
            const old = state[i];
            let nv = old;
            while (nv === old) nv = options[i][Math.floor(rand() * options[i].length)];
            state[i] = nv;
            const e2 = evaluate(g, state), c2 = total(e2, w);
            const worseHard = f > 0.6 && hardCount(e2) > hardCount(ev);
            if (!worseHard && (c2 <= c || rand() < Math.exp((c - c2) / temp))) { ev = e2; c = c2; consider(state, ev); }
            else state[i] = old;
        }
        if (best && hardCount((best as { ev: Eval }).ev) === 0) break;
    }
    return best!;
}

export interface LineOut {
    /** Line id of the evaluation. */
    id: number;
    /** Dot radius. */
    r: number;
    pts: Pt[];
    /** Stroke roles this line runs over, by length. */
    roles: Record<string, number>;
    indeg: number;
    outdeg: number;
    round: number;
}

/** The lines (polylines from dot to dot) for a choice of states. */
export function extractLines(g: Graph, state: Uint8Array, ev: Eval): LineOut[] {
    const byId = new Map(g.strokes.map((s) => [s.id, s]));
    const { nodes, segs } = g;
    // link partner of a segment end, or -1 when the line stops there
    const partner = (seg: number, end: 0 | 1): { seg: number; end: 0 | 1 } | null => {
        const e = segs[seg].e[end];
        if (e.tip) return null;
        const n = nodes[e.node], st = state[e.node];
        const pair: [number, number] = st === 0 ? [1, 2] : st === 1 ? [0, 1] : [0, 2];
        if (e.arm !== pair[0] && e.arm !== pair[1]) return null;
        const otherArm = e.arm === pair[0] ? pair[1] : pair[0];
        const os = n.seg[otherArm];
        // which end of the other segment touches this node
        const oe = segs[os].e[0].node === e.node && segs[os].e[0].arm === otherArm && !segs[os].e[0].tip ? 0 : 1;
        return { seg: os, end: oe as 0 | 1 };
    };
    const segPts = (seg: number, fromEnd: 0 | 1): Pt[] => {
        const s = segs[seg], st = byId.get(s.stroke)!;
        let pts: Pt[];
        if (st.closed && s.s1 <= s.s0) pts = [...cut(st.pts, st.acc, s.s0, st.len), ...cut(st.pts, st.acc, 0, s.s1).slice(1)];
        else pts = cut(st.pts, st.acc, s.s0, s.s1);
        return fromEnd === 0 ? pts : pts.reverse();
    };
    const out: LineOut[] = [];
    const used = new Uint8Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        for (const e of [0, 1] as const) {
            if (used[i] || partner(i, e)) continue;
            // start of a line: walk from this end
            const pts: Pt[] = [];
            const roles: Record<string, number> = {};
            let seg = i, from: 0 | 1 = e;
            for (;;) {
                used[seg] = 1;
                const p = segPts(seg, from);
                pts.push(...(pts.length ? p.slice(1) : p));
                const role = byId.get(segs[seg].stroke)!.role;
                roles[role] = (roles[role] ?? 0) + segs[seg].len;
                const nx = partner(seg, from === 0 ? 1 : 0);
                if (!nx || used[nx.seg]) break;
                seg = nx.seg; from = nx.end;
            }
            const id = ev.lineOf[i];
            out.push({ id, r: ev.radius[id], pts, roles, indeg: ev.indeg[id], outdeg: ev.outdeg[id], round: ev.round[id] });
        }
    }
    return out;
}

export { dist };
