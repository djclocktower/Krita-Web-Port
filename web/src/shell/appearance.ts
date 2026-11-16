// Applies the display settings to the page: the theme attribute (colours live in themes.css) and the canvas variables.
import { getSetting, onSettingChange } from '../settings/store';

const root = document.documentElement;
const canvasVars = { canvasBorder: '--canvas-border', checkerA: '--checker-a', checkerB: '--checker-b' } as const;

export function applyAppearance(): void {
    const theme = () => root.setAttribute('data-theme', getSetting('theme'));
    theme(); onSettingChange('theme', theme);
    for (const [key, name] of Object.entries(canvasVars) as [keyof typeof canvasVars, string][]) {
        const set = () => root.style.setProperty(name, getSetting(key));
        set(); onSettingChange(key, set);
    }
}
