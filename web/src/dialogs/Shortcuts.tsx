// Configure Krita… › Keyboard Shortcuts. Click a shortcut to record a new one: Escape cancels, Backspace clears.
// Overrides go to the `shortcuts` setting (command id -> shortcut); the canvas keys are listed read-only.
import { useState } from 'preact/hooks';
import type { Command } from '../panels';
import { canvasShortcuts, effective, fromEvent, heldModifiers, norm, unusable } from '../settings/shortcuts';
import { getSetting, setSetting, useSetting } from '../settings/store';
import { allCommands } from '../shell/commands';

type Rec = { id: string; held: string };
type Conflict = { id: string; combo: string; other: Command };

/** Overrides are stored only where they differ from Krita's default. */
function assign(c: Command, combo: string, map: Record<string, string>) {
    if ((c.shortcut ?? '') === combo) delete map[c.id]; else map[c.id] = combo;
}

export function Shortcuts() {
    const map = useSetting('shortcuts');
    const [q, setQ] = useState('');
    const [rec, setRec] = useState<Rec | null>(null);
    const [conflict, setConflict] = useState<Conflict | null>(null);
    const [msg, setMsg] = useState('');
    const byId = (id: string) => allCommands.find(c => c.id === id)!;
    const set = (changes: [Command, string][]) => {
        const next = { ...getSetting('shortcuts') };
        for (const [c, combo] of changes) assign(c, combo, next);
        setSetting('shortcuts', next);
    };

    const commit = (c: Command, combo: string) => {
        const bad = unusable(combo);
        if (bad) return setMsg(bad);
        const n = norm(combo);
        if (norm(effective(c, map) || '|') === n) { setRec(null); return setMsg(''); }   // unchanged
        const canvas = canvasShortcuts().find(k => norm(k.shortcut) === n);
        if (canvas) return setMsg(`${combo} is a canvas shortcut ("${canvas.title}") and cannot be reassigned yet. Press another key, or Escape to cancel.`);
        const other = allCommands.find(o => o.id !== c.id && effective(o, map) && norm(effective(o, map)) === n);
        setRec(null);
        if (other) { setMsg(''); return setConflict({ id: c.id, combo, other }); }
        setMsg(''); set([[c, combo]]);
    };
    const key = (c: Command) => (e: KeyboardEvent) => {
        if (rec?.id !== c.id || e.key === 'Tab') return;   // Tab moves focus on (which ends recording): never trap it
        e.preventDefault(); e.stopPropagation();   // also keeps Escape from closing the dialog
        if (e.key === 'Escape') { setRec(null); return setMsg(''); }
        if (e.key === 'Backspace' && !heldModifiers(e)) { setRec(null); setMsg(''); return set([[c, '']]); }
        const combo = fromEvent(e);
        if (combo) commit(c, combo); else setRec({ id: c.id, held: heldModifiers(e) });
    };
    const resolve = () => {
        if (!conflict) return;
        set([[byId(conflict.id), conflict.combo], [conflict.other, '']]);
        setConflict(null);
    };

    const needle = q.trim().toLowerCase();
    const hit = (title: string, shortcut: string, group: string) => !needle || `${title} ${shortcut} ${group}`.toLowerCase().includes(needle);
    const menus = [...new Set(allCommands.map(c => c.menu))];
    const canvas = canvasShortcuts().filter(k => hit(k.title, k.shortcut, 'canvas'));
    const changed = Object.keys(map).length;

    return (
        <div class="sc">
            <input type="text" aria-label="Search shortcuts" placeholder="Search actions or shortcuts" value={q} onInput={e => setQ(e.currentTarget.value)} />
            <div class="sc-bar">
                <span>{changed ? `${changed} changed` : 'All shortcuts are at their defaults'}</span>
                <button type="button" disabled={!changed} onClick={() => { setMsg(''); setConflict(null); setSetting('shortcuts', {}); }}>Restore all defaults</button>
            </div>
            <p class="error sc-msg" role="alert">{msg}</p>
            {conflict && (
                <div class="sc-conflict" role="alertdialog" aria-label="Shortcut conflict">
                    <span>{conflict.combo} is already used by "{conflict.other.title}" ({conflict.other.menu}). Reassign it to "{byId(conflict.id).title}"?</span>
                    <button type="button" class="primary" onClick={resolve}>Reassign</button>
                    <button type="button" onClick={() => setConflict(null)}>Cancel</button>
                </div>
            )}
            <div class="sc-list">
                {menus.map(m => {
                    const rows = allCommands.filter(c => c.menu === m && hit(c.title, effective(c, map), m));
                    return rows.length > 0 && (
                        <section key={m} aria-label={m}>
                            <h3>{m}</h3>
                            {rows.map(c => {
                                const cur = effective(c, map), recording = rec?.id === c.id, edited = c.id in map;
                                return (
                                    <div class="sc-row" key={c.id} data-command={c.id}>
                                        <span class="sc-title">{c.title}</span>
                                        <button type="button" class={`sc-key${edited ? ' edited' : ''}`} aria-label={`Shortcut for ${c.title}: ${cur || 'none'}. Activate to change.`}
                                            onClick={e => { setMsg(''); setConflict(null); setRec(recording ? null : { id: c.id, held: '' }); e.currentTarget.focus(); }}
                                            onKeyDown={key(c)} onBlur={() => { if (recording) setRec(null); }}>
                                            {recording ? `${rec.held ? rec.held + '+' : ''}… press keys (Esc cancels, Backspace clears)` : cur || 'None'}
                                        </button>
                                        <button type="button" disabled={!cur} aria-label={`Clear shortcut of ${c.title}`} onClick={() => set([[c, '']])}>Clear</button>
                                        <button type="button" disabled={!edited} aria-label={`Restore default of ${c.title}`} onClick={() => { setConflict(null); set([[c, c.shortcut ?? '']]); }}>Restore</button>
                                    </div>
                                );
                            })}
                        </section>
                    );
                })}
                {canvas.length > 0 && (
                    <section aria-label="Canvas shortcuts">
                        <h3>Canvas shortcuts (read-only)</h3>
                        {canvas.map(k => <div class="sc-row" key={k.title}><span class="sc-title">{k.title}</span><kbd>{k.shortcut}</kbd></div>)}
                    </section>
                )}
            </div>
        </div>
    );
}
