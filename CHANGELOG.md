# Changelog

All notable changes to Foundy Flashcards are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-24

First public release.

### Added
- Dashboard with real totals, due cards, accuracy, study streak, daily target, recommended decks, recently opened decks, recent sessions, weekly activity chart and a first-run onboarding with an optional starter deck.
- Deck management: create, edit, colours, icons, folders, tags, duplicate, archive, merge, delete with confirmation, export (JSON/CSV/TXT), grid/list views, search, filter, sort and multi-deck study.
- Card editor with Markdown, KaTeX maths, images, hints, explanations, tags, accepted answers, live preview, "save & add another" and keyboard shortcuts; card duplicate, delete, flag, move and reorder.
- Foundy QuickImport: paste or upload TXT, Markdown, DOCX, PDF, CSV and Foundy JSON; fault-tolerant parser with per-card validation, duplicate detection, line numbers, inline fixing with instant revalidation, selective import, error report download, copy skipped content and import into a new or existing deck. TXT/DOCX/CSV templates and an AI prompt.
- Study modes: classic flashcards, FSRS spaced repetition, written answers, multiple choice, match and exam, plus a session results screen.
- Statistics: activity (daily/weekly/monthly), accuracy trend, streaks, study time, mastery distribution, difficult cards, deck performance, upcoming workload and revision calendar, with explanations of every metric.
- Complete backups (decks, cards, scheduling, history, folders, preferences) with validation and merge/replace restore; export of individual or all decks.
- Settings for theme, accent colour, animations, default mode, daily target, new cards per day, card order, retention, answer sensitivity, keyboard shortcuts and data management.
- Installable offline PWA with update prompt.
- IndexedDB schema v2 with migration, persistent-storage request, error boundaries, toasts, skeleton loading states and accessible dialogs/menus.
- Automated tests for the parser, file formats, FSRS scheduling, answer comparison, multiple choice, analytics, Markdown sanitisation, persistence and backup/restore.
- GitHub Pages deploy script (`npm run deploy:gh-pages`) and Cloudflare Pages headers.
