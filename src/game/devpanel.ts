// Dev cheat panel: dot speed slider, and in Fluffy how long a pair stays together before the hearts
// and the light on the balls. Changes apply at once; Confirm writes the values into the code
// (src/game/tuning.ts) through the dev server (vite.config.ts, /__dev/tuning). On the published site
// Confirm can't touch the code, so the values just stay in this browser.
import { FLUFFY } from './mode';
import { Tunable, TUNABLE, changed, codeValue, forgetSaved, setTunable, tuning } from './tuning';

interface Slider { k: Tunable; label: string; min: number; max: number; step: number; show: (v: number) => string }

/** A group of sliders with one Confirm and one Reset. */
function section(title: string, sliders: Slider[]) {
    const box = document.createElement('div');
    box.className = 'dev-group';
    const head = document.createElement('b');
    head.textContent = title;
    const note = document.createElement('div');
    note.className = 'dev-note';
    const inputs: HTMLInputElement[] = [];
    const lines: HTMLElement[] = [];
    const status = () => {
        sliders.forEach((s, i) => (lines[i].textContent = `${s.label}: ${s.show(tuning[s.k])}`));
        const diff = sliders.filter((s) => changed(s.k));
        note.textContent = diff.length ? `code: ${diff.map((s) => `${TUNABLE[s.k]} ${codeValue(s.k)}`).join(', ')} · not confirmed` : 'same as code';
    };
    box.append(head);
    for (const s of sliders) {
        const line = document.createElement('div');
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(tuning[s.k]) });
        input.addEventListener('input', () => { setTunable(s.k, +input.value); status(); });
        lines.push(line);
        inputs.push(input);
        box.append(line, input);
    }
    const confirm = document.createElement('button');
    confirm.textContent = 'Confirm';
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => {
        sliders.forEach((s, i) => { setTunable(s.k, codeValue(s.k)); inputs[i].value = String(codeValue(s.k)); });
        status();
    });
    confirm.addEventListener('click', async () => {
        const body = Object.fromEntries(sliders.map((s) => [s.k, tuning[s.k]]));
        try {
            const res = await fetch('/__dev/tuning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(await res.text());
            note.textContent = `Saved to code: ${sliders.map((s) => `${TUNABLE[s.k]} = ${tuning[s.k]}`).join(', ')}. Reloading…`;
            forgetSaved();
        } catch {
            note.textContent = 'Confirm writes the code only on the local dev server (npm run dev). Kept in this browser.';
        }
    });
    const row = document.createElement('div');
    row.className = 'dev-row';
    row.append(confirm, reset);
    box.append(row, note);
    status();
    return box;
}

export function mountDevPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'dev-panel';
    const toggle = document.createElement('button');
    toggle.textContent = '⚙ dev';
    toggle.title = 'Dev: tuning';
    const body = document.createElement('div');
    body.hidden = true;
    body.append(section('Speed', [
        { k: 'moveSpeed', label: `${tuning.startSpeed} →`, min: 300, max: 3000, step: 50, show: (v) => `${v} px/s in 1 s` }
    ]));
    if (FLUFFY) {
        body.append(section('Pair touch → hearts', [
            { k: 'hugHold', label: 'Wait', min: 0, max: 2, step: 0.05, show: (v) => `${v.toFixed(2)} s` }
        ]));
        const dirs = ['right', 'bottom right', 'bottom', 'bottom left', 'left', 'top left', 'top', 'top right'];
        body.append(section('Ball light', [
            { k: 'lightAngle', label: 'From', min: 0, max: 355, step: 5, show: (v) => `${v}° (${dirs[Math.round(v / 45) % 8]})` },
            { k: 'lightHeight', label: 'Height', min: 0.05, max: 1, step: 0.01, show: (v) => v.toFixed(2) },
            { k: 'lightAmbient', label: 'Shadow side', min: 0, max: 1.2, step: 0.01, show: (v) => v.toFixed(2) },
            { k: 'lightDiffuse', label: 'Lit side', min: 0, max: 1.5, step: 0.01, show: (v) => v.toFixed(2) },
            { k: 'lightSheen', label: 'Sheen', min: 0, max: 0.6, step: 0.01, show: (v) => v.toFixed(2) }
        ]));
    }
    // Cheats: win the level being played (the usual Well Done, progress and unlock pop-ups follow), and
    // forget all progress and choices (level 1, Jelly ball, Classic background, default settings).
    const cheats = document.createElement('div');
    cheats.className = 'dev-group';
    const head = document.createElement('b');
    head.textContent = 'Cheats';
    const win = document.createElement('button');
    win.textContent = 'Win level';
    win.addEventListener('click', () => {
        const g = (window as unknown as { __dotlineGame?: { scene: { getScene(k: string): unknown } } }).__dotlineGame;
        (g?.scene.getScene('Game') as { cheatWin?: () => void } | undefined)?.cheatWin?.();
    });
    const reset = document.createElement('button');
    reset.textContent = 'Reset progress';
    reset.addEventListener('click', () => {
        if (!confirm('Forget all progress, the chosen ball / background and the settings?')) return;
        try {
            for (const k of ['dotline.progress', 'dotline.skin', 'dotline.bg', 'dotline.settings', 'dotline.session']) localStorage.removeItem(k);
        } catch {
            /* storage blocked */
        }
        const url = new URL(location.href);
        url.searchParams.delete('mode');
        url.searchParams.delete('bg');
        location.href = url.toString();
    });
    const row = document.createElement('div');
    row.className = 'dev-row';
    row.append(win, reset);
    cheats.append(head, row);
    body.append(cheats);
    toggle.addEventListener('click', () => { body.hidden = !body.hidden; });
    wrap.append(toggle, body);
    document.body.append(wrap);
}
