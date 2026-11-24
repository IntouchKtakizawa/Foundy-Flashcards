import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, Check, GraduationCap, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, PageHeader, SectionTitle, Skeleton, Switch } from '@/components/ui/misc';
import { DeckGlyph } from '@/components/deck/deckVisuals';
import { MODE_META, MODE_ORDER } from '@/components/study/modeMeta';
import { summariseCards, type DeckSummary } from '@/lib/analytics/stats';
import { parseStudyParams, studyHref } from '@/lib/study/links';
import { cn, plural } from '@/lib/utils';
import { groupByDeck, useAllCards, useDecks } from '@/state/data';
import { usePreferences } from '@/state/preferences';
import type { StudyMode } from '@/types';

export function StudyHubPage() {
  const decks = useDecks();
  const cards = useAllCards();
  const { prefs } = usePreferences();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const initial = useMemo(() => parseStudyParams(search), [search]);
  const presetMode = search.get('mode') ? initial.mode : null;

  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.deckIds));
  const [mode, setMode] = useState<StudyMode | null>(presetMode);
  const [flaggedOnly, setFlaggedOnly] = useState(initial.flaggedOnly ?? false);
  const [showArchived, setShowArchived] = useState(false);

  const effectiveMode = mode ?? prefs.defaultStudyMode;

  const summaries = useMemo(() => {
    const m = new Map<string, DeckSummary & { flaggedCount: number }>();
    if (!cards) return m;
    const now = Date.now();
    for (const [deckId, list] of groupByDeck(cards)) {
      m.set(deckId, { ...summariseCards(list, now), flaggedCount: list.filter((c) => c.flagged).length });
    }
    return m;
  }, [cards]);

  const sorted = useMemo(
    () => (decks ?? []).slice().sort((a, b) => (b.lastStudiedAt ?? b.updatedAt) - (a.lastStudiedAt ?? a.updatedAt)),
    [decks],
  );
  const visible = sorted.filter((d) => showArchived || !d.archived || selected.has(d.id));
  const archivedCount = sorted.filter((d) => d.archived).length;

  // Drop preselected ids that don't exist (e.g. a stale link).
  useEffect(() => {
    if (!decks) return;
    const ids = new Set(decks.map((d) => d.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [decks]);

  const stat = (id: string) => summaries.get(id);
  const selectedIds = [...selected];
  const selectedTotal = selectedIds.reduce((n, id) => n + (stat(id)?.total ?? 0), 0);
  const selectedDue = selectedIds.reduce((n, id) => n + (stat(id)?.due ?? 0), 0);
  const selectedNew = selectedIds.reduce((n, id) => n + (stat(id)?.newCount ?? 0), 0);
  const selectedFlagged = selectedIds.reduce((n, id) => n + (stat(id)?.flaggedCount ?? 0), 0);
  const studyable = flaggedOnly ? selectedFlagged : selectedTotal;

  const dueDecks = sorted.filter((d) => !d.archived && (stat(d.id)?.due ?? 0) > 0);
  const totalDue = dueDecks.reduce((n, d) => n + (stat(d.id)?.due ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = () => {
    if (!selected.size || !studyable) return;
    navigate(studyHref({ deckIds: selectedIds, mode: effectiveMode, flaggedOnly }));
  };

  if (!decks || !cards) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-6 h-8 w-40" />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!decks.length) {
    return (
      <div>
        <PageHeader title="Study" description="Choose decks and a study mode." />
        <EmptyState
          icon={<GraduationCap className="h-5 w-5" />}
          title="Nothing to study yet"
          description="Create a deck and add cards, or import a document with Foundy QuickImport to get started."
          action={
            <>
              <Link to="/decks/new" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong">
                Create a deck
              </Link>
              <Link to="/import" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-subtle">
                Import cards
              </Link>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Study" description="Pick one or more decks, choose how you want to practise, and start." />

      {totalDue > 0 && (
        <section className="panel mb-6 p-4 sm:p-5" aria-labelledby="due-now-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Brain className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="due-now-title" className="text-sm font-semibold">
                  Due now
                </h2>
                <p className="text-sm text-muted">
                  {plural(totalDue, 'review')} across {plural(dueDecks.length, 'deck')}.
                </p>
              </div>
            </div>
            <Button icon={<Play className="h-4 w-4" />} onClick={() => navigate(studyHref({ deckIds: dueDecks.map((d) => d.id), mode: 'srs' }))}>
              Review all due
            </Button>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {dueDecks.slice(0, 8).map((d) => (
              <li key={d.id}>
                <Link
                  to={studyHref({ deckIds: [d.id], mode: 'srs' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm hover:border-accent/50"
                >
                  <DeckGlyph icon={d.icon} color={d.color} size="sm" />
                  <span className="max-w-[12rem] truncate font-medium">{d.name}</span>
                  <Badge tone="accent">{stat(d.id)?.due ?? 0} due</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section aria-labelledby="pick-decks">
            <SectionTitle
              action={
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(visible.map((d) => d.id)))}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>
                    Clear
                  </Button>
                </div>
              }
            >
              <span id="pick-decks">1. Choose decks</span>
            </SectionTitle>
            <ul className="panel divide-y divide-border overflow-hidden" role="group" aria-label="Decks">
              {visible.map((d) => {
                const s = stat(d.id);
                const checked = selected.has(d.id);
                return (
                  <li key={d.id}>
                    <label className={cn('flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors', checked ? 'bg-accent-soft/50' : 'hover:bg-subtle/60')}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(d.id)} className="h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" />
                      <DeckGlyph icon={d.icon} color={d.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {d.name}
                          {d.archived ? <span className="ml-2 text-xs font-normal text-muted">Archived</span> : null}
                        </span>
                        <span className="block text-xs text-muted">
                          {plural(s?.total ?? 0, 'card')} · {s?.due ?? 0} due · {s?.newCount ?? 0} new
                          {s?.flaggedCount ? ` · ${s.flaggedCount} marked` : ''}
                        </span>
                      </span>
                      {(s?.due ?? 0) > 0 && <Badge tone="accent">{s?.due} due</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
            {archivedCount > 0 && (
              <div className="mt-3">
                <Switch checked={showArchived} onChange={setShowArchived} label={`Show archived decks (${archivedCount})`} />
              </div>
            )}
          </section>

          <section aria-labelledby="pick-mode">
            <SectionTitle>
              <span id="pick-mode">2. Choose a mode</span>
            </SectionTitle>
            <div role="radiogroup" aria-labelledby="pick-mode" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MODE_ORDER.map((m) => {
                const meta = MODE_META[m];
                const active = effectiveMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m)}
                    className={cn(
                      'relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                      active ? 'border-accent bg-accent-soft/60 ring-1 ring-accent/30' : 'border-border bg-surface hover:border-accent/40',
                    )}
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted')}>
                      <meta.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{meta.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{meta.description}</span>
                    </span>
                    {active && <Check className="absolute right-3 top-3 h-4 w-4 text-accent" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="panel p-4 sm:p-5">
            <h2 className="text-sm font-semibold">3. Start</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Decks selected</dt>
                <dd className="font-medium tabular-nums">{selected.size}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Cards</dt>
                <dd className="font-medium tabular-nums">{selectedTotal}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Due for review</dt>
                <dd className="font-medium tabular-nums">{selectedDue}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">New</dt>
                <dd className="font-medium tabular-nums">{selectedNew}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Mode</dt>
                <dd className="font-medium">{MODE_META[effectiveMode].label}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <Switch
                checked={flaggedOnly}
                onChange={setFlaggedOnly}
                label="Only cards marked for revision"
                description={selected.size ? `${plural(selectedFlagged, 'card')} marked in the selected decks.` : 'Mark cards while studying with F.'}
              />
            </div>
            <Button size="lg" className="mt-5 w-full" icon={<Play className="h-4 w-4" />} disabled={!selected.size || !studyable} onClick={start}>
              Start studying
            </Button>
            {!selected.size ? (
              <p className="mt-2 text-center text-xs text-muted">Select at least one deck.</p>
            ) : !studyable ? (
              <p className="mt-2 text-center text-xs text-muted">{flaggedOnly ? 'No marked cards in these decks.' : 'The selected decks have no cards yet.'}</p>
            ) : effectiveMode === 'srs' && selectedDue === 0 && selectedNew === 0 ? (
              <p className="mt-2 text-center text-xs text-muted">Nothing is due — you can still study ahead.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
