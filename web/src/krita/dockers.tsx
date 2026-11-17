// Krita's own dockers as panels of the page's docks. An opened docker is a Krita window of kind 'docker';
// it shows up as a panel in the right dock (with a close button) and the Settings menu lists all of them.
import type { ComponentType } from 'preact';
import { panels, type Command, type Panel } from '../panels';
import { setDock } from '../shell/workspaces';
import { report } from '../shell/state';
import { useStore } from '../shell/store';
import type { Engine } from '../engine/protocol';
import { krita, kritaEngine } from './state';
import { KritaToolOptions } from './ToolOptionsView';

export const dockerPanelId = (docker: string) => `krita-docker:${docker}`;

const components = new Map<string, ComponentType<{ engine: Engine }>>();   // one stable component per docker, so a re-render does not remount the picture
function componentFor(docker: string) {
    let c = components.get(docker);
    if (!c) {
        c = ({ engine }: { engine: Engine }) => {
            const w = useStore(krita).windows.find(x => x.kind === 'docker' && x.docker === docker);
            return <div class="tool-options krita-docker" role="group" aria-label={`Krita docker ${docker}`}>{w && <KritaToolOptions engine={engine} w={w} />}</div>;
        };
        components.set(docker, c);
    }
    return c;
}

/** The page's panels plus one for each open Krita docker. */
export function usePanels(): Panel[] {
    const k = useStore(krita);
    const open = k.windows.filter(w => w.kind === 'docker' && w.docker);
    if (!open.length) return panels;
    return [...panels, ...open.map((w): Panel => ({
        id: dockerPanelId(w.docker!), title: k.dockers.find(d => d.id === w.docker)?.title ?? w.title, area: 'right', order: 100,
        component: componentFor(w.docker!), close: e => { e.showKritaDocker(w.docker!, false).catch(report); },
    }))];
}

const isOpen = (docker: string) => krita.get().windows.some(w => w.kind === 'docker' && w.docker === docker);

/** One entry per Krita docker for the Settings > Dockers submenu (see menus.ts; the check mark marks the open ones). */
export const isDockerOpen = (c: Command) => isOpen(c.id.replace('krita.docker.', ''));
export function dockerCommands(): Command[] {
    return krita.get().dockers.map(d => ({
        id: `krita.docker.${d.id}`, menu: 'Settings' as const, title: d.title,
        run: async (e: Engine) => {
            const show = !isOpen(d.id);
            if (show) setDock('right', { active: dockerPanelId(d.id), open: true });
            await (kritaEngine() ?? e).showKritaDocker(d.id, show);
        },
    }));
}
