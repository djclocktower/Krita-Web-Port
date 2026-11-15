// Local persistence over IndexedDB: document snapshots, imported resources and one "current document" pointer.
// Every function returns a promise that rejects with a readable Error. If the database cannot be opened
// (private browsing, blocked), every call rejects with the same error and `unavailable` becomes true.

export interface DocRecord {
    id: string;
    name: string;
    width: number;
    height: number;
    savedAt: number;
    /** What `blob` holds: the real engine writes .kra, the mock only PNG. */
    format: 'kra' | 'png';
    blob: Blob;
    thumb: Blob | null;
}
export interface ResourceRecord { name: string; bytes: Uint8Array }

export let unavailable = false;
let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    return opened ??= new Promise((resolve, reject) => {
        const fail = (why: unknown) => { unavailable = true; reject(new Error(`Local storage is unavailable (${why instanceof Error ? why.message : why || 'blocked'})`)); };
        try {
            const r = indexedDB.open('krita-web', 1);
            r.onupgradeneeded = () => {
                r.result.createObjectStore('docs', { keyPath: 'id' });
                r.result.createObjectStore('resources', { autoIncrement: true });
                r.result.createObjectStore('meta');
            };
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => fail(r.error);
            r.onblocked = () => fail('blocked');
        } catch (e) { fail(e); }
    });
}

const wrap = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Runs `fn` in one transaction and resolves after it committed. Only await IDB requests inside `fn`. */
async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await open();
    try {
        const t = db.transaction(stores, mode);
        const done = new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error ?? new Error('transaction aborted')); });
        const out = await fn(t);
        await done;
        return out;
    } catch (e) {
        const x = e as DOMException;
        throw new Error(x?.name === 'QuotaExceededError' ? 'the browser storage is full' : `local storage failed: ${x?.message ?? x}`);
    }
}

/** Writes the snapshot (replacing the one with the same id in the same transaction), then evicts the oldest beyond `max`, never `id`. */
export function saveDoc(rec: DocRecord, max: number): Promise<void> {
    return tx(['docs'], 'readwrite', async t => {
        const s = t.objectStore('docs');
        s.put(rec);
        const all = (await wrap(s.getAll()) as DocRecord[]).sort((a, b) => a.savedAt - b.savedAt);
        for (const old of all) {
            if (all.length <= max) break;
            if (old.id === rec.id) continue;
            s.delete(old.id); all.splice(all.indexOf(old), 1);
        }
    });
}
export const listDocs = () => tx(['docs'], 'readonly', async t => (await wrap(t.objectStore('docs').getAll()) as DocRecord[]).sort((a, b) => b.savedAt - a.savedAt));
export const getDoc = (id: string) => tx(['docs'], 'readonly', t => wrap(t.objectStore('docs').get(id)) as Promise<DocRecord | undefined>);
export const deleteDoc = (id: string) => tx(['docs'], 'readwrite', async t => { t.objectStore('docs').delete(id); });
export const clearDocs = () => tx(['docs'], 'readwrite', async t => { t.objectStore('docs').clear(); });

export const getCurrent = () => tx(['meta'], 'readonly', t => wrap(t.objectStore('meta').get('current')) as Promise<string | undefined>);
export const setCurrent = (id: string | null) => tx(['meta'], 'readwrite', async t => { t.objectStore('meta').put(id, 'current'); });

/** A file added again under the same name replaces the old copy and moves to the end. */
export const addResource = (name: string, bytes: Uint8Array) => tx(['resources'], 'readwrite', async t => {
    const s = t.objectStore('resources');
    const [all, keys] = await Promise.all([wrap(s.getAll()) as Promise<ResourceRecord[]>, wrap(s.getAllKeys())]);
    all.forEach((r, i) => { if (r.name === name) s.delete(keys[i]); });
    s.add({ name, bytes: bytes.slice() });
});
/** In the order they were added. */
export const listResources = () => tx(['resources'], 'readonly', t => wrap(t.objectStore('resources').getAll()) as Promise<ResourceRecord[]>);
