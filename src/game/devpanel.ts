// Dev cheat panel: dot speed slider. Changes apply at once; Confirm writes the value into the
// code (src/game/tuning.ts, MOVE_SPEED) through the dev server (vite.config.ts, /__dev/tuning).
// On the published site Confirm can't touch the code, so the value just stays in this browser.
import { MOVE_SPEED, overridden, setMoveSpeed, tuning } from './tuning';

export function mountDevPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'dev-panel';
    const toggle = document.createElement('button');
    toggle.textContent = '⚙ speed';
    toggle.title = 'Dev: dot speed';
    const body = document.createElement('div');
    body.hidden = true;
    const value = document.createElement('b');
    const slider = document.createElement('input');
    Object.assign(slider, { type: 'range', min: '300', max: '3000', step: '50', value: String(tuning.moveSpeed) });
    const note = document.createElement('div');
    note.className = 'dev-note';
    const confirm = document.createElement('button');
    confirm.textContent = 'Confirm';
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    const show = () => {
        value.textContent = `${tuning.startSpeed} → ${tuning.moveSpeed} px/s in 1 s`;
        note.textContent = overridden() ? `code: ${MOVE_SPEED} · not confirmed` : 'same as code';
    };
    slider.addEventListener('input', () => { setMoveSpeed(+slider.value); show(); });
    reset.addEventListener('click', () => { setMoveSpeed(MOVE_SPEED, false); slider.value = String(MOVE_SPEED); show(); });
    confirm.addEventListener('click', async () => {
        try {
            const res = await fetch('/__dev/tuning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moveSpeed: tuning.moveSpeed }) });
            if (!res.ok) throw new Error(await res.text());
            note.textContent = `Saved to code: MOVE_SPEED = ${tuning.moveSpeed}. Reloading…`;
            setMoveSpeed(tuning.moveSpeed, false);
        } catch {
            note.textContent = 'Confirm writes the code only on the local dev server (npm run dev). Kept in this browser.';
        }
    });
    toggle.addEventListener('click', () => { body.hidden = !body.hidden; });
    const row = document.createElement('div');
    row.className = 'dev-row';
    row.append(confirm, reset);
    body.append(value, slider, row, note);
    wrap.append(toggle, body);
    document.body.append(wrap);
    show();
}
