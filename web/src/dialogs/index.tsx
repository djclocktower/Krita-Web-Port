import { useEffect, useState } from 'preact/hooks';
import type { ColorSpaceInfo, Engine, ExportFormat } from '../engine/protocol';
import { app, report } from '../shell/state';
import { useStore } from '../shell/store';
import { download } from './download';
import { Modal, area, pixels } from './Modal';
import { About } from './About';
import { Recent } from './Recent';
import { Settings } from './Settings';
import { Workspaces } from './Workspaces';

export function Dialogs({ engine }: { engine: Engine }) {
    const { dialog, doc } = useStore(app);
    if (dialog === 'recent') return <Recent />;
    if (dialog === 'settings') return <Settings />;
    if (dialog === 'about') return <About />;
    if (dialog === 'workspaces') return <Workspaces />;
    if (!dialog || !doc) return null;
    return dialog === 'export' ? <Export engine={engine} /> : dialog === 'scale' ? <Scale engine={engine} />
        : dialog === 'resize' ? <Resize engine={engine} /> : dialog === 'rotate' ? <Rotate engine={engine} /> : <Convert engine={engine} />;
}

const FORMATS: [ExportFormat, string][] = [['png', 'PNG'], ['jpg', 'JPEG'], ['kra', 'Krita (.kra)'], ['psd', 'Photoshop (.psd)'],
    ['ora', 'OpenRaster (.ora)'], ['tga', 'TGA'], ['bmp', 'BMP']];

function Export({ engine }: { engine: Engine }) {
    const [format, setFormat] = useState<ExportFormat>('png');
    const [name, setName] = useState(app.get().doc!.name.replace(/\.[^.]*$/, ''));
    return (
        <Modal title="Export" submitLabel="Export" submit={async () => {
            const base = name.trim().replace(new RegExp(`\\.${format}$`, 'i'), '');
            if (!base || /[\\/:*?"<>|]/.test(base)) throw new Error('Enter a file name without \\ / : * ? " < > |.');
            download(`${base}.${format}`, await engine.exportDocument(format));
        }}>
            <label>Format
                <select value={format} onChange={e => setFormat(e.currentTarget.value as ExportFormat)}>
                    {FORMATS.map(([v, l]) => <option value={v} key={v}>{l}</option>)}
                </select>
            </label>
            <label>File name <input type="text" value={name} onInput={e => setName(e.currentTarget.value)} /></label>
        </Modal>
    );
}

type Unit = 'px' | '%';
const FILTERS = ['Bicubic', 'Bilinear', 'NearestNeighbor', 'Lanczos3'] as const;

function Scale({ engine }: { engine: Engine }) {
    const doc = app.get().doc!, ratio = doc.width / doc.height;
    const [unit, setUnit] = useState<Unit>('px');
    const [w, setW] = useState(String(doc.width)), [h, setH] = useState(String(doc.height));
    const [keep, setKeep] = useState(true);
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Bicubic');
    const round = (n: number, u = unit) => String(u === 'px' ? Math.round(n) : Math.round(n * 100) / 100);
    const edit = (which: 'w' | 'h', v: string) => {
        (which === 'w' ? setW : setH)(v);
        if (!keep || v.trim() === '' || !Number.isFinite(Number(v))) return;
        const n = Number(v);
        (which === 'w' ? setH : setW)(round(unit === '%' ? n : which === 'w' ? n / ratio : n * ratio));
    };
    const switchUnit = (u: Unit) => {
        const conv = (s: string, full: number) => Number.isFinite(Number(s)) && s.trim() !== '' ? round(u === '%' ? Number(s) / full * 100 : Number(s) * full / 100, u) : s;
        setW(conv(w, doc.width)); setH(conv(h, doc.height)); setUnit(u);
    };
    return (
        <Modal title="Scale Image To New Size" submitLabel="Scale" submit={() => {
            const px = (s: string, full: number, label: string) => pixels(unit === 'px' ? s : String(Math.round(Number(s) * full / 100)), label);
            const width = px(w, doc.width, 'Width'), height = px(h, doc.height, 'Height');
            area(width, height);
            return engine.scaleImage({ width, height, filter });
        }}>
            <label>Unit
                <select value={unit} onChange={e => switchUnit(e.currentTarget.value as Unit)}>
                    <option value="px">Pixels</option><option value="%">Percent</option>
                </select>
            </label>
            <label>Width ({unit}) <input type="number" step="any" value={w} onInput={e => edit('w', e.currentTarget.value)} /></label>
            <label>Height ({unit}) <input type="number" step="any" value={h} onInput={e => edit('h', e.currentTarget.value)} /></label>
            <label class="check"><input type="checkbox" checked={keep} onChange={e => setKeep(e.currentTarget.checked)} /> Keep aspect ratio</label>
            <label>Filter
                <select value={filter} onChange={e => setFilter(e.currentTarget.value as typeof filter)}>
                    {FILTERS.map(f => <option key={f}>{f}</option>)}
                </select>
            </label>
        </Modal>
    );
}

const ANCHORS = ['Top left', 'Top', 'Top right', 'Left', 'Center', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];

function Resize({ engine }: { engine: Engine }) {
    const doc = app.get().doc!;
    const [w, setW] = useState(String(doc.width)), [h, setH] = useState(String(doc.height));
    const [anchor, setAnchor] = useState(4);
    return (
        <Modal title="Resize Canvas" submitLabel="Resize" submit={() => {
            const width = pixels(w, 'Width'), height = pixels(h, 'Height');
            area(width, height);
            // anchor 0..8 is row-major; the old image sits at 0, half or all of the size difference
            return engine.resizeCanvas({ width, height, offsetX: Math.round((width - doc.width) * (anchor % 3) / 2), offsetY: Math.round((height - doc.height) * Math.floor(anchor / 3) / 2) });
        }}>
            <label>Width (px) <input type="number" value={w} onInput={e => setW(e.currentTarget.value)} /></label>
            <label>Height (px) <input type="number" value={h} onInput={e => setH(e.currentTarget.value)} /></label>
            <div>Anchor</div>
            <div class="anchor" role="radiogroup" aria-label="Anchor">
                {ANCHORS.map((a, i) => (
                    <button type="button" role="radio" aria-checked={anchor === i} aria-label={a} key={a} onClick={() => setAnchor(i)}>{anchor === i ? '●' : '○'}</button>
                ))}
            </div>
        </Modal>
    );
}

function Rotate({ engine }: { engine: Engine }) {
    const [deg, setDeg] = useState('45');
    return (
        <Modal title="Rotate Image" submitLabel="Rotate" submit={() => {
            const n = Number(deg);
            if (deg.trim() === '' || !Number.isFinite(n)) throw new Error('Degrees must be a number.');
            return engine.rotateImage(n);
        }}>
            <label>Degrees (clockwise) <input type="number" step="any" value={deg} onInput={e => setDeg(e.currentTarget.value)} /></label>
        </Modal>
    );
}

function Convert({ engine }: { engine: Engine }) {
    const [spaces, setSpaces] = useState<ColorSpaceInfo[] | null>(null);
    useEffect(() => { engine.colorSpaces().then(setSpaces).catch(e => { report(e); app.set({ dialog: null }); }); }, [engine]);
    return spaces?.length ? <ConvertForm engine={engine} spaces={spaces} /> : null;
}

function ConvertForm({ engine, spaces }: { engine: Engine; spaces: ColorSpaceInfo[] }) {
    const doc = app.get().doc!;
    // Depths depend on the model, profiles on both; anything that no longer fits falls back to the first choice.
    const norm = (model: string, depth: string, profile: string) => {
        const ofModel = spaces.filter(s => s.model === model), list = ofModel.length ? ofModel : spaces;
        const s = list.find(x => x.depth === depth) ?? list[0];
        return { model: s.model, depth: s.depth, profile: s.profiles.includes(profile) ? profile : s.profiles[0] };
    };
    const [v, setV] = useState(() => norm(doc.colorModel, doc.colorDepth, doc.profile));
    const models = [...new Map(spaces.map(s => [s.model, s.modelName])).entries()];
    const space = spaces.find(s => s.model === v.model && s.depth === v.depth)!;
    return (
        <Modal title="Convert Image Color Space" submitLabel="Convert" submit={() => engine.convertColorSpace(v)}>
            <label>Model
                <select value={v.model} onChange={e => setV(norm(e.currentTarget.value, v.depth, v.profile))}>
                    {models.map(([m, n]) => <option value={m} key={m}>{n}</option>)}
                </select>
            </label>
            <label>Depth
                <select value={v.depth} onChange={e => setV(norm(v.model, e.currentTarget.value, v.profile))}>
                    {spaces.filter(s => s.model === v.model).map(s => <option value={s.depth} key={s.depth}>{s.depthName}</option>)}
                </select>
            </label>
            <label>Profile
                <select value={v.profile} onChange={e => setV({ ...v, profile: e.currentTarget.value })}>
                    {space.profiles.map(p => <option key={p}>{p}</option>)}
                </select>
            </label>
        </Modal>
    );
}
