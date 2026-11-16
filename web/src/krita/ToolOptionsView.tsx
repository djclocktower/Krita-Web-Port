// A Krita window (the tool option panel, or a docker) embedded in a dock. The window is resized to the box it sits in.
import { useEffect, useRef } from 'preact/hooks';
import type { Engine, KritaWindow } from '../engine/protocol';
import { KritaWindowView } from './WindowView';
import './krita.css';

export function KritaToolOptions({ engine, w }: { engine: Engine; w: KritaWindow }) {
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined, last = '';
        // The box takes its size from the dock (flex: 1) and its picture is absolutely positioned, so the picture cannot change the
        // box and a resize cannot feed back into itself; the request goes out only when the rounded size really changed.
        const send = () => {
            const width = Math.floor(box.current!.clientWidth), height = Math.floor(box.current!.clientHeight);
            if (width < 40 || height < 40 || `${width}x${height}` === last) return;
            last = `${width}x${height}`;
            engine.resizeKritaWindow(w.id, width, height).catch(() => {});
        };
        const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(send, 120); });
        ro.observe(box.current!);   // fires once at once, so the first size goes out after the panel has subscribed to the store
        return () => { ro.disconnect(); clearTimeout(timer); };
    }, [engine, w.id]);
    return <div class="krita-options" ref={box}><div class="krita-options-pic"><KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} /></div></div>;
}
