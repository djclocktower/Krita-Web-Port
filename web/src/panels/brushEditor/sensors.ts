// The <Id>Sensor value of a curve option is XML (see the header of descriptions/brushes.ts). Plain functions, no DOM.
const NAMES: Record<string, string> = {
    pressure: 'Pressure', pressurein: 'PressureIn', xtilt: 'X-Tilt', ytilt: 'Y-Tilt', ascension: 'Tilt direction', declination: 'Tilt elevation',
    speed: 'Speed', fade: 'Fade', distance: 'Distance', time: 'Time', drawingangle: 'Drawing angle', rotation: 'Rotation',
    fuzzy: 'Fuzzy Dab', fuzzystroke: 'Fuzzy Stroke', perspective: 'Perspective', tangentialpressure: 'Tangential pressure',
};
export const DEFAULT_CURVE = '0,0;1,1;';

export interface SensorInfo {
    /** Display names of the active sensors. */
    names: string[];
    /** The curve of a single-sensor XML (what the curve editor edits); null for a sensor list or unreadable XML. */
    curve: string | null;
}

export function parseSensor(xml: string): SensorInfo {
    const m = /<params\s+([^>]*?)\s*\/?>/.exec(xml);
    const id = m && /\bid="([^"]*)"/.exec(m[1])?.[1];
    if (!m || !id) return { names: [], curve: null };
    if (id === 'sensorslist') {
        const ids = [...xml.matchAll(/<ChildSensor\s+[^>]*?\bid="([^"]*)"/g)].map(x => x[1]);
        return { names: ids.map(i => NAMES[i] ?? i), curve: null };
    }
    return { names: [NAMES[id] ?? id], curve: /<curve>([^<]*)<\/curve>/.exec(xml)?.[1].trim() || DEFAULT_CURVE };
}

/** Same single sensor with another curve; keeps the sensor's own attributes. Null for a sensor list or unreadable XML. */
export function withCurve(xml: string, curve: string): string | null {
    const m = /<params\s+([^>]*?)\s*\/?>/.exec(xml);
    if (!m || /\bid="sensorslist"/.test(m[1])) return null;
    return `<!DOCTYPE params> <params ${m[1]}> <curve>${curve}</curve> </params> `;
}

/** "x,y;x,y;" with every number in 0..1 and x strictly increasing: the only curves the curve editor can show without changing them. */
export function validCurve(text: string): boolean {
    const pts = text.split(';').filter(p => p.trim() !== '').map(p => p.split(',').map(Number));
    return pts.length >= 2 && pts.every((p, i) => p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1) && (!i || p[0] > pts[i - 1][0]));
}
