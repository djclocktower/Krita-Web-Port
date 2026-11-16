import { useEffect, useRef } from 'preact/hooks';
import pkg from '../../package.json';
import { app } from '../shell/state';

/** Owner: put the project's source repository URL here. */
const SOURCE_URL = 'https://example.invalid/replace-with-source-repository';
/** Shown only when the real engine runs. The engine does not report its version; keep this in step with the krita/ checkout. */
const KRITA_ENGINE = 'Krita 6.0.4.1 engine';

// Licences as named by each project; "see upstream" where we have not checked. Libraries from engine/build-deps.sh, plus Preact for this page.
const THIRD_PARTY: [string, string][] = [
    ['Krita', 'GPL-3.0-or-later'],
    ['Qt 6', 'LGPL-3.0 / GPL (open-source terms); see upstream per module'],
    ['KDE Frameworks (KI18n, KConfig, KCoreAddons, KCodecs, KWidgetsAddons, KItemViews, KCompletion, KGuiAddons, KColorScheme)', 'mostly LGPL-2.0-or-later; see upstream per module'],
    ['Extra CMake Modules', 'BSD-3-Clause'],
    ['LittleCMS 2', 'MIT'],
    ['zlib', 'zlib licence'],
    ['libpng', 'libpng licence'],
    ['FreeType', 'FreeType Licence or GPL-2.0'],
    ['HarfBuzz', 'MIT'],
    ['Boost', 'Boost Software Licence 1.0'],
    ['Eigen', 'MPL-2.0'],
    ['immer, zug, lager', 'Boost Software Licence 1.0'],
    ['xsimd', 'BSD-3-Clause'],
    ['Expat', 'MIT'],
    ['libunibreak', 'see upstream'],
    ['proxy-libintl (libintl stub)', 'see upstream'],
    ['QuaZip', 'LGPL-2.1 with a static-linking exception; see upstream'],
    ['Exiv2', 'GPL-2.0-or-later'],
    ['Fontconfig', 'MIT-style; see upstream'],
    ['FriBidi', 'LGPL-2.1-or-later'],
    ['GNU Scientific Library', 'GPL-3.0-or-later'],
    ['libjpeg-turbo', 'IJG, BSD-3-Clause and zlib; see upstream'],
    ['libtiff', 'libtiff licence (BSD-style)'],
    ['libwebp', 'BSD-3-Clause'],
    ['giflib', 'MIT'],
    ['Imath, OpenEXR', 'BSD-3-Clause'],
    ['Preact (this interface)', 'MIT'],
];

export function About() {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current!.showModal(); }, []);
    const choice = new URLSearchParams(location.search).get('engine') ?? (import.meta.env.PROD ? 'wasm' : 'mock');
    const version = (pkg as { version?: string }).version ?? 'unversioned';
    return (
        <dialog ref={ref} class="about" aria-labelledby="about-title" onClose={() => app.set({ dialog: null })}>
            <h2 id="about-title">About Krita Web</h2>
            <dl>
                <dt>Version</dt><dd class="about-version">{version}</dd>
                <dt>Engine</dt><dd class="about-engine">{choice === 'wasm' ? KRITA_ENGINE : 'Mock engine (an in-browser stand-in, not Krita)'}</dd>
                <dt>Licence</dt><dd>GPL-3.0</dd>
                <dt>Source</dt><dd><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{SOURCE_URL}</a></dd>
            </dl>
            <h3>Third-party notices</h3>
            <ul class="about-notices">
                {THIRD_PARTY.map(([n, l]) => <li key={n}><b>{n}</b> <span>{l}</span></li>)}
            </ul>
            <div class="buttons"><button type="button" class="primary" onClick={() => ref.current!.close()}>Close</button></div>
        </dialog>
    );
}
