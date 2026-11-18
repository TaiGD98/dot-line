// Runs Generate part 1 off the page's main thread, so the editor never freezes on a big drawing.
import { generate, GenerateOptions } from '../core/generator';
import { generateStrokes, StrokeModeOptions } from '../core/strokemode';
import type { Stroke } from '../core/trace';

export type GenRequest =
    | { id: number; mode: 'strokes'; strokes: Stroke[]; opt: StrokeModeOptions }
    | { id: number; mode: 'cut'; strokes: Stroke[]; opt: GenerateOptions };

self.onmessage = (e: MessageEvent<GenRequest>) => {
    const r = e.data;
    try {
        const result = r.mode === 'strokes' ? generateStrokes(r.strokes, r.opt) : generate(r.strokes, r.opt);
        (self as unknown as Worker).postMessage({ id: r.id, result });
    } catch (err) {
        (self as unknown as Worker).postMessage({ id: r.id, error: (err as Error).message || String(err) });
    }
};
