// Play test: the project's own game in an iframe over the editor. The game reads the editor's
// level JSON directly (postMessage), starting with the open level including unsaved changes.
// Its dev menu can switch to any other level in storage.
import type { App } from './main';
import { h } from './dom';
import { Level } from '../core/level';

export const GAME_URL = import.meta.env.DEV ? '/?editor=1' : '../demo/?editor=1';

export interface EditorToGame {
    type: 'dotline-level';
    level: Level;
    levels: { id: string; name: string }[];
}

export function openPlay(app: App) {
    document.querySelector('.play-overlay')?.remove();
    const frame = h('iframe', { src: GAME_URL, title: 'Play test', allow: 'autoplay' }) as HTMLIFrameElement;
    const title = h('b', {}, `${app.level.name}${app.dirty ? ' (unsaved)' : ''}`);
    const send = (level: Level) => {
        title.textContent = level.id === app.level.id ? `${app.level.name}${app.dirty ? ' (unsaved)' : ''}` : level.name;
        const msg: EditorToGame = { type: 'dotline-level', level, levels: app.levels.map((l) => ({ id: l.id, name: l.name })) };
        frame.contentWindow?.postMessage(msg, '*');
    };
    let current: Level = structuredClone(app.level);
    const onMessage = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow) return;
        const d = e.data as { type?: string; id?: string };
        if (d.type === 'dotline-ready') send(current);
        if (d.type === 'dotline-request' && d.id) {
            const l = d.id === app.level.id ? app.level : app.levels.find((x) => x.id === d.id);
            if (l) { current = structuredClone(l); send(current); }
        }
    };
    const close = () => {
        window.removeEventListener('message', onMessage);
        window.removeEventListener('keydown', onKey);
        overlay.remove();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    const overlay = h('div', { class: 'play-overlay' },
        h('div', { class: 'phone' },
            h('div', { class: 'phone-bar' },
                h('button', { class: 'icon', title: 'Back to the editor (Esc)', onclick: close }, '‹ Editor'),
                title,
                h('button', { class: 'icon', title: 'Restart level', onclick: () => send(current) }, '↻')),
            frame));
    document.body.append(overlay);
    frame.focus();
}
