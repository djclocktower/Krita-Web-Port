// User preferences: one typed object, persisted in IndexedDB (`meta` store, key "settings"), loaded before the app renders.
// Other modules use getSetting / setSetting / onSettingChange. Without storage the values live in memory for the session.
import { useEffect, useState } from 'preact/hooks';
import { reportError } from '../shell/errors';
import * as db from '../storage/db';

export type ThemeId = 'dark' | 'darker' | 'neutral' | 'light';
export type Area = 'left' | 'right' | 'bottom';
/** open: expanded; active: selected panel id; size: width (left, right) or height (bottom) in px;
 *  stacked: panels shown one above the other instead of as tabs (wide layout, only while they are all the dock has). */
export interface DockState { open: boolean; active: string | null; size: number; stacked?: string[] }
/** visible: ids of the panels shown, null for all. */
export interface DockLayout { visible: string[] | null; docks: Record<Area, DockState> }

export interface Settings {
    autosave: boolean;
    autosaveSeconds: number;          // save this long after the last change
    confirmClose: boolean;            // ask before closing the page with unsaved changes
    theme: ThemeId;
    canvasBorder: string;             // exposed as --canvas-border, --checker-a, --checker-b on the root; the canvas must adopt them
    checkerA: string;
    checkerB: string;
    shortcuts: Record<string, string>;   // command id -> shortcut; '' means cleared. Absent means the command's default.
    dockLayout: DockLayout;
    workspace: string;                // name of the workspace last switched to
    workspaces: Record<string, DockLayout>;   // user-saved ones; the built-ins live in shell/workspaces.ts
    uiMode: UiModeSetting;            // 'auto' decides from the device (src/mobile/mode.ts); ?ui= in the URL beats it
    touchGestures: boolean;           // two-finger tap = undo, three-finger tap = redo
    pinnedSheet: string;              // tablet: the side sheet kept open beside the canvas ('' for none)
}
export type UiModeSetting = 'auto' | 'desktop' | 'tablet' | 'phone';

export const DEFAULT_DOCKS: DockLayout = {
    visible: null,
    docks: { left: { open: true, active: null, size: 240, stacked: ['toolbox', 'toolOptions'] }, right: { open: true, active: null, size: 260 }, bottom: { open: true, active: null, size: 180 } },
};

export const DEFAULTS: Settings = {
    autosave: true, autosaveSeconds: 3, confirmClose: true,
    theme: 'dark', canvasBorder: '#1e1e1e', checkerA: '#ffffff', checkerB: '#c0c0c0',
    shortcuts: {}, dockLayout: DEFAULT_DOCKS, workspace: 'Default', workspaces: {},
    uiMode: 'auto', touchGestures: true, pinnedSheet: '',
};
export const THEMES: [ThemeId, string][] = [['dark', 'Krita Dark'], ['darker', 'Krita Darker'], ['neutral', 'Krita Neutral'], ['light', 'Krita Light']];

type Key = keyof Settings;
let values: Settings = structuredClone(DEFAULTS);
const subs = new Map<Key, Set<(v: never) => void>>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const getSetting = <K extends Key>(key: K): Settings[K] => values[key];

export function setSetting<K extends Key>(key: K, value: Settings[K]) {
    if (same(values[key], value)) return;
    values = { ...values, [key]: value };
    subs.get(key)?.forEach(f => f(value as never));
    persist();
}

/** Calls `fn` with the new value after every change; returns the unsubscribe function. */
export function onSettingChange<K extends Key>(key: K, fn: (v: Settings[K]) => void): () => void {
    let set = subs.get(key);
    if (!set) subs.set(key, set = new Set());
    set.add(fn as (v: never) => void);
    return () => { set.delete(fn as (v: never) => void); };
}

/** Back to the defaults: the given keys, or every setting. */
export function resetSettings(keys: Key[] = Object.keys(DEFAULTS) as Key[]) {
    for (const k of keys) setSetting(k, structuredClone(DEFAULTS[k]) as never);
}

/** Re-renders the component when the setting changes. */
export function useSetting<K extends Key>(key: K): Settings[K] {
    const [, bump] = useState(0);
    useEffect(() => onSettingChange(key, () => bump(n => n + 1)), [key]);
    return values[key];
}

// ---- persistence
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();
function persist() {
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
}
function flush() {
    clearTimeout(timer);
    if (db.unavailable) return;
    writing = writing.then(() => db.putMeta('settings', values)).catch(() => {});
}
/** Resolves once everything set so far is written (tests wait on it). */
export const settingsSaved = async () => { if (timer) flush(); await writing; };
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

let loading: Promise<void> | null = null;
/** Reads the stored settings once; call and await before rendering. Never rejects. */
export function loadSettings(): Promise<void> {
    return loading ??= (async () => {
        try {
            const stored = await db.getMeta<Partial<Settings>>('settings');
            if (stored && typeof stored === 'object') {
                const next = { ...values } as Record<string, unknown>;
                for (const k of Object.keys(DEFAULTS) as Key[]) {
                    // keep only values of the right type (a stale or hand-edited record must not break the app)
                    if (k in stored && typeof stored[k] === typeof DEFAULTS[k] && stored[k] !== null) next[k] = stored[k];
                }
                if (!THEMES.some(([t]) => t === next.theme)) next.theme = DEFAULTS.theme;
                if (!['auto', 'desktop', 'tablet', 'phone'].includes(next.uiMode as string)) next.uiMode = 'auto';
                const okLayout = (l: any) => ['left', 'right', 'bottom'].every(a => typeof l?.docks?.[a]?.size === 'number');
                if (!okLayout(next.dockLayout)) next.dockLayout = structuredClone(DEFAULT_DOCKS);
                next.workspaces = Object.fromEntries(Object.entries(next.workspaces as object).filter(([, l]) => okLayout(l)));
                values = next as unknown as Settings;
            }
        } catch {
            reportError('Local storage is unavailable, so your settings will last only until you close this page.');
        }
    })();
}

if (import.meta.env.DEV) (window as unknown as { __settings: unknown }).__settings = { get: getSetting, set: setSetting, reset: resetSettings, saved: settingsSaved };   // for tests
