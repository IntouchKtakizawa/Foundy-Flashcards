# Foundy Flashcards

**Learn smarter. Remember longer.**

Foundy Flashcards is a free, privacy-first flashcard app by **DevFoundy**. It helps students memorise information through active recall, spaced repetition (FSRS) and interactive revision — with no account, no server, no tracking and no limits.

**Live app:** https://intouchktakizawa.github.io/Foundy-Flashcards/

---

## Features

- **Decks & folders** — unlimited decks with descriptions, colours, icons, subject tags and folders. Duplicate, archive, merge, export and delete (with confirmation). Grid and list views, search, filter and sort. Select several decks to study them together.
- **Card editor** — question, answer, hint, explanation, tags, accepted alternative answers and optional images. Markdown and KaTeX maths (`$F = ma$`) with a live preview. "Save & add another" plus keyboard shortcuts for fast entry. Edit, duplicate, delete, flag and reorder (drag or arrows).
- **Foundy QuickImport** — paste text or drop a **TXT, Markdown, DOCX, PDF, CSV or Foundy JSON** file. A deterministic, fault-tolerant parser turns `QUESTION:` / `ANSWER:` blocks into cards, validates each one independently and shows a review screen where you can fix, select, de-duplicate and import. Downloadable TXT/DOCX/CSV templates and a copy-ready prompt for any AI assistant.
- **Six study modes**
  - *Classic* — flip cards (Space), previous/next, shuffle, reverse, mark for revision.
  - *Spaced repetition* — FSRS scheduling with Again/Hard/Good/Easy and the predicted next interval for each.
  - *Written answers* — typed answers compared with configurable normalisation and aliases, with manual override.
  - *Multiple choice* — distractors drawn from the deck, never duplicated, graceful with small decks.
  - *Match* — timed matching game with mistakes, completion stats and restart.
  - *Exam* — configurable question count, time limit and question type, with a full review and "revise missed cards".
- **Session results** — reviewed, correct, incorrect, accuracy, duration, cards needing revision and deck mastery progress.
- **Statistics** — daily/weekly/monthly activity, accuracy trend, streaks, total study time, mastery distribution, difficult cards, deck performance, upcoming workload and a revision calendar. Every number comes from your own study history.
- **Backups** — export a deck (JSON/CSV/TXT), all decks, or a complete backup including study history, scheduling, folders and preferences. Restores are validated first and can **merge** or **replace**.
- **Offline PWA** — installable, works fully offline (studying, creating and importing). Updates never touch your data.
- **Accessible & responsive** — keyboard navigation, visible focus, screen-reader labels, accessible dialogs, reduced-motion support, colour-independent feedback, light/dark/system themes and six accent colours.

## Technology

React 18 · TypeScript (strict) · Vite · Tailwind CSS · Framer Motion · Lucide · Dexie.js (IndexedDB) · ts-fsrs · Recharts · Mammoth.js · PDF.js · Papa Parse · marked + DOMPurify · KaTeX · docx · vite-plugin-pwa (Workbox) · Vitest.

## Getting started

Requirements: Node.js 20+ (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:5173
```

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Typecheck and create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icons |

### Production build

```bash
npm run build                                   # served from /
BASE_PATH=/Foundy-Flashcards/ npm run build     # served from a sub-path (GitHub Pages project site)
```

Optional build-time variables (see `.env.example`): `BASE_PATH`, `VITE_DEVFOUNDY_URL` (shows a link on the About page) and `VITE_SOURCE_URL`.

## Deployment

The app is a static site and uses hash-based routing, so deep links work on any static host without rewrite rules.

**GitHub Pages** — run `npm run deploy:gh-pages`. It typechecks, tests, builds with `BASE_PATH=/<repo>/` and publishes `dist/` to the `gh-pages` branch (Pages source: *Deploy from a branch → gh-pages / root*).

To deploy automatically on every push instead, copy [`docs/github-pages-workflow.yml`](docs/github-pages-workflow.yml) to `.github/workflows/deploy.yml` and switch *Pages → Source* to **GitHub Actions**. It typechecks, tests, builds with `BASE_PATH=/<repo>/` and deploys on each push to `main`. (Pushing workflow files requires a GitHub token with the `workflow` scope.)

**Cloudflare Pages** — build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`. `public/_headers` adds security headers.

## Foundy QuickImport format

```text
QUESTION: What is osmosis?
ANSWER: The net movement of water molecules through a partially permeable membrane.

QUESTION: What is the function of a ribosome?
ANSWER: Protein synthesis.
HINT: Think about proteins.
EXPLANATION: Ribosomes translate messenger RNA into polypeptide chains.
TAGS: Biology, Cells
ALIASES: protein production | making proteins
```

- Markers are case-insensitive, allow spaces around the colon (`Question :`) and may be numbered, bulleted or bold (`1. QUESTION:`, `- **Answer:**`).
- `Q:` / `A:` work too (enabled automatically when the document uses `Q:`).
- Questions and answers can span multiple lines and keep Markdown and maths.
- `HINT`, `EXPLANATION`, `TAGS` (comma separated) and `ALIASES` (accepted written answers, `|` separated) are optional.
- **CSV:** a header row with `question, answer, hint, explanation, tags` (also `front/back`, `term/definition`) or positional columns.
- **PDF:** must contain selectable text — scanned PDFs need OCR first, and the app says so clearly.

Each card is validated independently: a document with 100 cards and 7 mistakes imports 93 and lists the 7 with line numbers so you can fix them in place. See [docs/IMPORT_PARSER.md](docs/IMPORT_PARSER.md) for the parser architecture.

## Privacy architecture

- All data is stored locally in IndexedDB (via Dexie). There is no backend, account, API key or cloud sync.
- Files are read with the File API and parsed in the browser (PDF.js worker and Mammoth are bundled). Nothing is uploaded.
- No analytics, trackers or third-party requests. Fonts are self-hosted.
- Imported content is untrusted: Markdown is rendered through DOMPurify, a strict Content-Security-Policy is injected into production builds, JSON and backups are schema-checked, and oversized files are rejected.
- The app asks the browser for persistent storage. Clearing site data still deletes everything, so the app reminds users to export backups.

## Project structure

```text
src/
  components/   UI primitives, layout, deck, card, import and study components
  db/           Dexie schema + migrations (database.ts) and data services (repo.ts)
  lib/
    parser/     QuickImport parser, validation, CSV/JSON readers, file extractors
    srs/        FSRS adapter and mastery levels
    study/      answer comparison, multiple-choice generation, study links
    analytics/  pure statistics functions
    backup/     backup, restore and export
    markdown/   safe Markdown + maths rendering
    templates/  TXT/CSV/DOCX templates and the AI prompt
  pages/        route-level screens
  state/        preferences, toasts and live data hooks
  types/        domain types
```

The architecture leaves room for future features (optional AI generation, sync, community decks, classrooms, audio cards, image occlusion) without a rewrite: storage is isolated behind `db/repo.ts`, scheduling behind `lib/srs`, and import formats behind `lib/parser/extractors.ts`.

## Known limitations

- Data lives in one browser on one device; use backups to move between devices.
- Scanned/image-only PDFs are not OCR'd. Legacy `.doc` files are not supported (use `.docx`).
- Written-answer marking is text comparison only — it cannot judge meaning, so a manual override is always available.
- Images are stored inside the database (downscaled to 1200 px) and count towards browser storage quota.
- Very large imports are capped at 10,000 cards per document.

## Contributing

1. Fork the repository and create a branch.
2. `npm install`, then make your change with tests where it affects logic (`src/**/*.test.ts`).
3. Run `npm run typecheck && npm test && npm run build` before opening a pull request.
4. Keep the privacy guarantees: no network requests, trackers or external services for core features.

Bug reports and suggestions are welcome via GitHub issues.

## Licence

MIT © DevFoundy — see [LICENSE](LICENSE). Third-party libraries are listed with their licences on the in-app About page.
