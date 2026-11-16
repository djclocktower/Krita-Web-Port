// Krita's own tool option panel, embedded in the Tool Options dock. It follows the dock's width.
import { useEffect, useRef } from 'preact/hooks';
import type { Engine, KritaWindow } from '../engine/protocol';
import { KritaWindowView } from './WindowView';
import './krita.css';

export function KritaToolOptions({ engine, w }: { engine: Engine; w: KritaWindow }) {
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined, last = '';
        const send = () => {
            const width = Math.floor(box.current!.clientWidth);
            // ponytail: the height is a fixed share of the screen, not the dock's, so a growing dock cannot feed back into the window size
            const height = Math.round(Math.min(480, Math.max(200, innerHeight * 0.5)));
            if (width < 40 || `${width}x${height}` === last) return;
            last = `${width}x${height}`;
            engine.resizeKritaWindow(w.id, width, height).catch(() => {});
        };
        const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(send, 120); });
        ro.observe(box.current!);   // fires once at once, so the first size goes out after the panel has subscribed to the store
        return () => { ro.disconnect(); clearTimeout(timer); };
    }, [engine, w.id]);
    return <div class="krita-options" ref={box} style="overflow:auto"><KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} /></div>;
}
