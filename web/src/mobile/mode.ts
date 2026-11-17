// Which interface is shown: desktop, tablet or phone. Decided from the device's input (pointer and hover media queries,
// touch points) and the viewport, never from the user-agent. `?ui=` in the URL beats the saved setting, which beats detection.
import { useEffect, useState } from 'preact/hooks';
import { setDprCap } from '../canvas/view';
import { getSetting, onSettingChange } from '../settings/store';
import { store } from '../shell/store';

export type UiMode = 'desktop' | 'tablet' | 'phone';
const MODES: UiMode[] = ['desktop', 'tablet', 'phone'];

/** The shorter side of the viewport, in CSS px, under which a touch device counts as a phone. */
export const PHONE_SHORT_SIDE = 500;

export const urlMode = (): UiMode | null => { const v = new URLSearchParams(location.search).get('ui'); return MODES.find(m => m === v) ?? null; };

export function detectMode(): UiMode {
    const q = (s: string) => matchMedia(s).matches;
    // A touch laptop reports a fine primary pointer with hover and stays desktop; phones and tablets report coarse or no hover.
    const touchFirst = q('(pointer: coarse)') || (q('(hover: none)') && navigator.maxTouchPoints > 0);
    if (!touchFirst) return 'desktop';
    return Math.min(innerWidth, innerHeight) < PHONE_SHORT_SIDE ? 'phone' : 'tablet';
}

const decide = (): UiMode => { const s = getSetting('uiMode'); return urlMode() ?? (s === 'auto' ? detectMode() : s); };
export const ui = store({ mode: decide(), landscape: innerWidth > innerHeight });
export const uiMode = () => ui.get().mode;
/** Canvas backing stores are capped at this many device pixels per CSS pixel on touch devices (memory and fill rate). */
const DPR_CAP = 2;

export function refreshMode() {
    const mode = decide(), landscape = innerWidth > innerHeight, was = ui.get();
    if (mode === was.mode && landscape === was.landscape) return;
    ui.set({ mode, landscape });
    if (mode !== was.mode) {
        setDprCap(mode === 'desktop' ? Infinity : DPR_CAP);
        document.documentElement.dataset.ui = mode;
    }
}
setDprCap(uiMode() === 'desktop' ? Infinity : DPR_CAP);
document.documentElement.dataset.ui = uiMode();
addEventListener('resize', refreshMode);
addEventListener('orientationchange', refreshMode);
onSettingChange('uiMode', refreshMode);

export function useUi() {
    const [, bump] = useState(0);
    useEffect(() => ui.sub(() => bump(n => n + 1)), []);
    return ui.get();
}
export const useUiMode = () => useUi().mode;

/** Size of a new document: a screen-sized portrait or landscape canvas on touch devices, 1600 x 1200 on desktop. */
export function newDocDefaults() {
    const { mode, landscape } = ui.get();
    const [a, b] = mode === 'phone' ? [1080, 1920] : mode === 'tablet' ? [1536, 2048] : [1600, 1200];
    return mode === 'desktop' ? { width: a, height: b, name: 'Untitled' } : landscape ? { width: b, height: a, name: 'Untitled' } : { width: a, height: b, name: 'Untitled' };
}
