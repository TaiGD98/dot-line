// Tiny DOM helpers for the editor UI.

type Attrs = Record<string, unknown>;
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    apply(el, attrs);
    append(el, children);
    return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag);
    apply(el, attrs);
    append(el, children);
    return el;
}

function apply(el: Element, attrs: Attrs) {
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
        else if (k === 'class') el.setAttribute('class', String(v));
        else if (k === 'style' && typeof v === 'object') Object.assign((el as HTMLElement).style, v);
        else if (k in el && !(el instanceof SVGElement)) (el as unknown as Record<string, unknown>)[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
    }
}

function append(el: Element, children: Child[]) {
    for (const c of children.flat(Infinity as 1) as Child[]) {
        if (c === null || c === undefined || c === false) continue;
        el.append(c instanceof Node ? c : String(c));
    }
}

export function clear(el: Element) {
    while (el.firstChild) el.firstChild.remove();
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
    let t: number | undefined;
    return (...a: A) => {
        clearTimeout(t);
        t = window.setTimeout(() => fn(...a), ms);
    };
}

export function pref<T>(key: string, fallback: T): T {
    try {
        const v = localStorage.getItem(`dotline.${key}`);
        return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
        return fallback;
    }
}

export function setPref(key: string, value: unknown) {
    try {
        localStorage.setItem(`dotline.${key}`, JSON.stringify(value));
    } catch {
        /* storage blocked: preferences are a convenience only */
    }
}

/** Athena logo: orange on dark theme, black on light (colour comes from CSS). */
export function logo(): SVGSVGElement {
    return s('svg', { viewBox: '0 0 132 24', class: 'logo', 'aria-label': 'Athena' },
        s('path', { d: 'M10 1 L20 23 H15.5 L10 10.5 L4.5 23 H0 Z', fill: 'currentColor' }),
        s('text', { x: 24, y: 19, 'font-size': 18, 'font-weight': 700, 'letter-spacing': 2, fill: 'currentColor', 'font-family': 'system-ui, sans-serif' }, 'ATHENA'));
}
