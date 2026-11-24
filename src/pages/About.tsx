import { ExternalLink, Heart, Lock, Sparkles, WifiOff } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, APP_VERSION, DEVELOPER, DEVFOUNDY_URL, SOURCE_URL } from '@/config';
import { LogoMark } from '@/components/layout/Logo';

const DEPENDENCIES: Array<[string, string, string]> = [
  ['React', 'UI library', 'MIT'],
  ['TypeScript', 'Typed JavaScript', 'Apache-2.0'],
  ['Vite', 'Build tooling', 'MIT'],
  ['Tailwind CSS', 'Styling', 'MIT'],
  ['Framer Motion', 'Animations', 'MIT'],
  ['Lucide', 'Icons', 'ISC'],
  ['Dexie.js', 'IndexedDB storage', 'Apache-2.0'],
  ['ts-fsrs', 'FSRS spaced-repetition scheduler', 'MIT'],
  ['Recharts', 'Charts', 'MIT'],
  ['Mammoth.js', 'Word document text extraction', 'BSD-2-Clause'],
  ['PDF.js', 'PDF text extraction', 'Apache-2.0'],
  ['Papa Parse', 'CSV parsing', 'MIT'],
  ['marked', 'Markdown rendering', 'MIT'],
  ['DOMPurify', 'HTML sanitisation', 'Apache-2.0 / MPL-2.0'],
  ['KaTeX', 'Maths typesetting', 'MIT'],
  ['docx', 'DOCX template generation', 'MIT'],
  ['Workbox / vite-plugin-pwa', 'Offline support', 'MIT'],
  ['Inter & JetBrains Mono', 'Typefaces (self-hosted)', 'OFL-1.1'],
];

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="panel p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <LogoMark className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
            <p className="text-sm text-muted">
              Version {APP_VERSION} · Developed by {DEVELOPER}
            </p>
          </div>
        </div>
        <p className="mt-5 text-lg font-medium">{APP_TAGLINE}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Foundy Flashcards is a free, modern flashcard app that helps students memorise information through active recall, spaced repetition and interactive revision. Build decks by hand or convert whole documents with Foundy QuickImport, then study with six modes while the FSRS algorithm schedules every review.
        </p>
        {(DEVFOUNDY_URL || SOURCE_URL) && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {DEVFOUNDY_URL && (
              <a href={DEVFOUNDY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Visit DevFoundy <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {SOURCE_URL && (
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Source code <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Project philosophy">
        {[
          { icon: Heart, title: 'Free, without limits', text: 'No paywalls, card limits or ads. Study as much as you like.' },
          { icon: Sparkles, title: 'Simple by design', text: 'A calm, focused interface that gets out of the way of learning.' },
          { icon: WifiOff, title: 'Works offline', text: 'Install it as an app and keep studying without a connection.' },
        ].map((p) => (
          <div key={p.title} className="panel p-5">
            <p.icon className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-sm font-semibold">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.text}</p>
          </div>
        ))}
      </section>

      <section className="panel p-6" aria-labelledby="privacy-h">
        <h2 id="privacy-h" className="flex items-center gap-2 text-base font-semibold">
          <Lock className="h-4 w-4 text-accent" aria-hidden /> Privacy
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>• Everything you create is stored only in this browser (IndexedDB). There is no account and no server.</li>
          <li>• Imported documents are processed locally and are never uploaded.</li>
          <li>• No analytics, tracking, advertising or third-party requests — even fonts are bundled with the app.</li>
          <li>• Imported content is treated as untrusted: Markdown is sanitised and nothing in your files is executed.</li>
          <li>• Because data is local, clearing your browser’s site data deletes it. Use Settings → Export complete backup regularly.</li>
        </ul>
      </section>

      <section className="panel p-6" aria-labelledby="deps-h">
        <h2 id="deps-h" className="text-base font-semibold">
          Open-source acknowledgements
        </h2>
        <p className="mt-1 text-sm text-muted">{APP_NAME} is built on these excellent open-source projects. Thank you to their authors and contributors.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Project
                </th>
                <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                  Used for
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Licence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {DEPENDENCIES.map(([name, use, licence]) => (
                <tr key={name}>
                  <td className="px-4 py-2 font-medium">{name}</td>
                  <td className="hidden px-4 py-2 text-muted sm:table-cell">{use}</td>
                  <td className="px-4 py-2 text-muted">{licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pb-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} {DEVELOPER}. {APP_NAME} {APP_VERSION}.
      </p>
    </div>
  );
}
