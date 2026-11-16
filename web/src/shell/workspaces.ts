// Workspaces: named dock arrangements (which panels are shown, which is selected in each dock, open or collapsed, size).
// The live arrangement is the `dockLayout` setting; a workspace is a saved copy of it.
import { DEFAULT_DOCKS, getSetting, setSetting, type Area, type DockLayout, type DockState } from '../settings/store';

export const BUILT_IN: Record<string, DockLayout> = {
    Default: DEFAULT_DOCKS,
    Minimal: { ...DEFAULT_DOCKS, visible: ['toolbox', 'layers'] },
    Animation: { ...DEFAULT_DOCKS, docks: { ...DEFAULT_DOCKS.docks, bottom: { open: true, active: 'timeline', size: 300 } } },
};

export const workspaceNames = () => [...Object.keys(BUILT_IN), ...Object.keys(getSetting('workspaces'))];

export function applyWorkspace(name: string) {
    const l = BUILT_IN[name] ?? getSetting('workspaces')[name];
    if (!l) return;
    setSetting('dockLayout', structuredClone(l));
    setSetting('workspace', name);
}

/** Saves the live arrangement under `name`. Throws a message for the dialog. */
export function saveWorkspace(raw: string) {
    const name = raw.trim();
    if (!name) throw new Error('Enter a name for the workspace.');
    if (name in BUILT_IN) throw new Error(`"${name}" is a built-in workspace; choose another name.`);
    setSetting('workspaces', { ...getSetting('workspaces'), [name]: structuredClone(getSetting('dockLayout')) });
    setSetting('workspace', name);
}

export function deleteWorkspace(name: string) {
    const { [name]: _, ...rest } = getSetting('workspaces');
    setSetting('workspaces', rest);
    if (getSetting('workspace') === name) setSetting('workspace', 'Default');
}

export function setDock(area: Area, patch: Partial<DockState>) {
    const l = getSetting('dockLayout');
    setSetting('dockLayout', { ...l, docks: { ...l.docks, [area]: { ...l.docks[area], ...patch } } });
}

export const DEFAULT_SIZE: Record<Area, number> = { left: DEFAULT_DOCKS.docks.left.size, right: DEFAULT_DOCKS.docks.right.size, bottom: DEFAULT_DOCKS.docks.bottom.size };
