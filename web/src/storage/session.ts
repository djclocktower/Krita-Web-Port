// Autosave, recovery and resource persistence, wrapped around the engine at the boundary:
// `wrapEngine(engine)` returns a proxy that forwards everything and watches newDocument, openDocument and importResource.
import type { DocumentInfo, Engine } from '../engine/protocol';
import { getSetting, onSettingChange } from '../settings/store';
import { reportError } from '../shell/errors';
import { store } from '../shell/store';
import * as db from './db';

// ---- timing (tests override these with ?asIdle=ms&asMax=ms)
const q = new URLSearchParams(location.search);
const ms = (key: string, dflt: number) => Number(q.get(key)) > 0 ? Number(q.get(key)) : dflt;
const idleMs = () => ms('asIdle', getSetting('autosaveSeconds') * 1000);    // save this long after the last change (setting)
const maxWaitMs = () => ms('asMax', Math.max(30000, idleMs() * 10));        // ... but at most this long after the first unsaved change
const autosaving = () => getSetting('autosave');
const RETRY_MS = 500;                      // check again this soon while a pointer is down or an export runs
const STUCK_MS = 60000;                    // a pointer "down" for longer than this is assumed lost
const MAX_RECENT = 10;

export const saveState = store({ kind: 'none' as 'none' | 'saving' | 'saved' | 'error', at: 0, reason: '' });
/** Set after a document was restored on start-up; the shell shows a dismissible notice. */
export const notice = store({ restored: null as { name: string; at: number } | null });

let raw: Engine;
let sid: string = crypto.randomUUID();        // id of the open document's snapshot
let dirty = false, version = 0, firstAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let busy: Promise<void> | null = null;
let reported = false, persistAsked = false;
const downs = new Map<number, number>();

const pointerDown = () => [...downs.values()].some(t => Date.now() - t < STUCK_MS);
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const swallow = () => {};

function unavailableOnce(e: unknown) {
    if (db.unavailable && !reported) { reported = true; reportError(`${message(e)}. Your work will not be kept in this browser; save with File > Save as .kra.`); }
}

function changed() {
    if (!dirty) firstAt = Date.now();
    dirty = true; version++;
    if (autosaving()) schedule(Math.min(idleMs(), firstAt + maxWaitMs() - Date.now()));
}
function schedule(wait: number) { clearTimeout(timer); timer = setTimeout(tick, Math.max(0, wait)); }
function tick() {
    if (!dirty) return;
    if (db.unavailable) return saveState.set({ kind: 'error', reason: 'storage unavailable' });
    if (pointerDown() || busy) return schedule(RETRY_MS);
    void save();
}
/** Saves now if there is anything unsaved (ignores the pointer: used before replacing the document and on hide). */
async function flush() {
    clearTimeout(timer);
    await busy;
    if (dirty && !db.unavailable) await save();
}
function save(): Promise<void> {
    return busy ??= saveOnce().finally(() => { busy = null; });
}

async function snapshot(): Promise<{ bytes: Uint8Array; format: 'kra' | 'png' }> {
    try { return { bytes: await raw.exportDocument('kra'), format: 'kra' }; }
    catch (e) {
        // Only the mock engine cannot write .kra; any other failure must not replace a good .kra with a flat PNG.
        if (!/mock engine/i.test(message(e))) throw e;
        return { bytes: await raw.exportDocument('png'), format: 'png' };
    }
}
async function thumbnail(png: Uint8Array): Promise<Blob | null> {
    try {
        const bmp = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>]));
        const k = Math.min(1, 160 / Math.max(bmp.width, bmp.height)), c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        return await c.convertToBlob({ type: 'image/png' });
    } catch { return null; }
}

async function saveOnce() {
    const v = version, id = sid;
    saveState.set({ kind: 'saving' });
    try {
        const { bytes, format } = await snapshot();
        const info = await raw.documentInfo();
        if (!info) throw new Error('no document');
        let png = format === 'png' ? bytes : null;
        if (!png && !pointerDown()) png = await raw.exportDocument('png').catch(() => null);
        const now = Date.now();
        await db.saveDoc({ id, name: info.name, width: info.width, height: info.height, savedAt: now, format,
            blob: new Blob([bytes as Uint8Array<ArrayBuffer>]), thumb: png ? await thumbnail(png) : null }, MAX_RECENT);
        await db.setCurrent(id);
        if (v === version && id === sid) dirty = false;
        saveState.set({ kind: 'saved', at: now, reason: '' });
        if (!persistAsked) { persistAsked = true; void navigator.storage?.persist?.().catch(swallow); }
    } catch (e) {
        saveState.set({ kind: 'error', reason: db.unavailable ? 'storage unavailable' : message(e) });
        unavailableOnce(e);
        if (dirty && !db.unavailable && autosaving()) schedule(maxWaitMs());   // try again later, not in a tight loop
    }
}

/** A different document is now open. */
function start(id: string, isDirty: boolean) {
    clearTimeout(timer);
    sid = id; dirty = false; version++;
    notice.set({ restored: null });
    saveState.set({ kind: 'none', reason: '' });
    if (isDirty) changed();
}

function fileFor(rec: db.DocRecord) { return rec.name.toLowerCase().endsWith(`.${rec.format}`) ? rec.name : `${rec.name}.${rec.format}`; }

async function adopt(rec: db.DocRecord) {
    await flush();
    await raw.openDocument(fileFor(rec), new Uint8Array(await rec.blob.arrayBuffer()));
    start(rec.id, false);
    saveState.set({ kind: 'saved', at: rec.savedAt, reason: '' });
    await db.setCurrent(rec.id).catch(swallow);
}

// ---- public API

export function wrapEngine(engine: Engine): Engine {
    raw = engine;
    engine.on('historyChanged', h => { if (h.canUndo || h.canRedo) changed(); });
    // Turning autosave off stops the timer; turning it on, or changing the interval, re-arms it for unsaved changes.
    const rearm = () => { clearTimeout(timer); if (dirty && autosaving()) schedule(Math.min(idleMs(), firstAt + maxWaitMs() - Date.now())); };
    onSettingChange('autosave', rearm); onSettingChange('autosaveSeconds', rearm);
    const w = window;
    const down = (e: PointerEvent) => void downs.set(e.pointerId, Date.now()), up = (e: PointerEvent) => void downs.delete(e.pointerId);
    w.addEventListener('pointerdown', down, true); w.addEventListener('pointerup', up, true); w.addEventListener('pointercancel', up, true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && autosaving()) void flush(); });
    w.addEventListener('beforeunload', e => { if (dirty && getSetting('confirmClose')) { e.preventDefault(); e.returnValue = ''; } });

    return new Proxy(engine, {
        get(t, k) {
            const v = Reflect.get(t, k, t);
            if (k === 'newDocument') return async (o: Parameters<Engine['newDocument']>[0]) => {
                await flush();
                const r = await t.newDocument(o);
                start(crypto.randomUUID(), false);
                db.setCurrent(null).catch(swallow);
                return r;
            };
            if (k === 'openDocument') return async (name: string, bytes: Uint8Array) => {
                await flush();
                const r: DocumentInfo = await t.openDocument(name, bytes);
                start(crypto.randomUUID(), true);   // so an opened file also shows up in Open Recent
                return r;
            };
            if (k === 'importResource') return async (name: string, bytes: Uint8Array) => {
                await t.importResource(name, bytes);
                await db.addResource(name, bytes).catch(unavailableOnce);
            };
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });
}

/** Re-imports stored resources in the order they were added; one banner message for all failures. */
export async function restoreResources() {
    let list: db.ResourceRecord[];
    try { list = await db.listResources(); } catch (e) { return unavailableOnce(e); }
    const bad: string[] = [];
    for (const r of list) await raw.importResource(r.name, r.bytes).catch(() => bad.push(r.name));
    if (bad.length) reportError(`Could not restore imported resources: ${bad.join(', ')}.`);
}

/** Opens the snapshot that was open when the app last closed. False when there is none or it would not open. */
export async function restoreDocument(): Promise<boolean> {
    let rec: db.DocRecord | undefined;
    try { const id = await db.getCurrent(); rec = id ? await db.getDoc(id) : undefined; } catch (e) { unavailableOnce(e); return false; }
    if (!rec) return false;
    try { await adopt(rec); notice.set({ restored: { name: rec.name, at: rec.savedAt } }); return true; }
    catch (e) {
        db.setCurrent(null).catch(swallow);
        reportError(`Could not open the saved copy of ${rec.name} (${message(e)}). It is kept in File > Open Recent.`);
        return false;
    }
}

export const recent = () => db.listDocs();
export const openRecent = (id: string) => db.getDoc(id).then(rec => { if (!rec) throw new Error('That document is no longer stored.'); return adopt(rec); });
export const currentId = () => sid;
export async function forget(id: string) {
    await db.deleteDoc(id);
    if (id === sid) await db.setCurrent(null);
}
export async function forgetAll() { await db.clearDocs(); await db.setCurrent(null); }
