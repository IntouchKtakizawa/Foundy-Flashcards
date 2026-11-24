import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, BookOpen, Clock, Flame, Layers, ListChecks, Plus, Sparkles, Target, Upload, Wand2 } from 'lucide-react';
import { useAllCards, useDecks, useReviews, useSessions, groupByDeck } from '@/state/data';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import { accuracy, computeStreak, dailyActivity, summariseCards } from '@/lib/analytics/stats';
import { createSampleDeck } from '@/lib/sampleDeck';
import { studyHref } from '@/lib/study/links';
import { DAY_MS, formatDuration, formatRelative, plural, startOfDay } from '@/lib/utils';
import { STUDY_MODE_LABELS } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Progress, SectionTitle, Skeleton, Stat } from '@/components/ui/misc';
import { DeckGlyph } from '@/components/deck/deckVisuals';
import { tooltipStyle, useChartColors } from '@/components/charts/useChartColors';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Studying late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const decks = useDecks();
  const cards = useAllCards();
  const reviews = useReviews(startOfDay() - 400 * DAY_MS);
  const sessions = useSessions();
  const { prefs } = usePreferences();
  const colors = useChartColors();
  const navigate = useNavigate();
  const toast = useToast();
  const [creatingSample, setCreatingSample] = useState(false);

  const loading = !decks || !cards || !reviews || !sessions;

  const data = useMemo(() => {
    if (!decks || !cards || !reviews || !sessions) return null;
    const now = Date.now();
    const active = decks.filter((d) => !d.archived);
    const activeIds = new Set(active.map((d) => d.id));
    const activeCards = cards.filter((c) => activeIds.has(c.deckId));
    const byDeck = groupByDeck(activeCards);
    const overall = summariseCards(activeCards, now);
    const today = startOfDay(now);
    const reviewsToday = reviews.filter((r) => r.reviewedAt >= today).length;
    const deckRows = active.map((d) => ({ deck: d, summary: summariseCards(byDeck.get(d.id) ?? [], now) }));
    const recommended = deckRows
      .filter((r) => r.summary.total > 0 && (r.summary.due > 0 || r.summary.newCount > 0 || r.summary.flagged > 0))
      .sort((a, b) => b.summary.due - a.summary.due || a.summary.masteryPct - b.summary.masteryPct || (a.deck.lastStudiedAt ?? 0) - (b.deck.lastStudiedAt ?? 0))
      .slice(0, 4);
    const recent = [...active]
      .filter((d) => d.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 5)
      .map((d) => ({ deck: d, summary: deckRows.find((r) => r.deck.id === d.id)!.summary }));
    const deckById = new Map(decks.map((d) => [d.id, d]));
    return {
      overall,
      totalCards: cards.length,
      totalDecks: active.length,
      archivedDecks: decks.length - active.length,
      acc: accuracy(reviews),
      streak: computeStreak(reviews, now),
      week: dailyActivity(reviews, 7, now),
      reviewsToday,
      recommended,
      recent,
      recentSessions: sessions.filter((s) => s.endedAt).slice(0, 5).map((s) => ({ s, names: s.deckIds.map((id) => deckById.get(id)?.name).filter(Boolean) as string[] })),
      dueDeckIds: deckRows.filter((r) => r.summary.due > 0).map((r) => r.deck.id),
    };
  }, [decks, cards, reviews, sessions]);

  const startSample = async () => {
    setCreatingSample(true);
    try {
      const id = await createSampleDeck();
      toast.success('Starter deck created', 'Edit it, study it, or delete it whenever you like.');
      navigate(`/decks/${id}`);
    } catch (e) {
      toast.error('Could not create the starter deck', (e as Error).message);
    } finally {
      setCreatingSample(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-60" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const isNewUser = data.totalDecks === 0 && data.archivedDecks === 0;
  const targetPct = Math.min(100, (data.reviewsToday / Math.max(1, prefs.dailyTarget)) * 100);

  if (isNewUser) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="panel overflow-hidden">
          <div className="border-b border-border p-6 sm:p-8">
            <p className="text-sm font-medium text-accent">Welcome to Foundy Flashcards</p>
            <h1 className="mt-1 text-2xl font-semibold">Learn smarter. Remember longer.</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Build decks by hand or paste a whole document with QuickImport, then let spaced repetition tell you exactly what to revise each day. Everything stays on this device — no account needed.
            </p>
          </div>
          <ol className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { icon: Plus, title: 'Create a deck', text: 'Give it a name, colour and subject tags.', to: '/decks/new', cta: 'New deck' },
              { icon: Upload, title: 'Add cards fast', text: 'Paste QUESTION:/ANSWER: text or drop a DOCX, PDF, CSV or TXT file.', to: '/import', cta: 'QuickImport' },
              { icon: Target, title: 'Study daily', text: 'Six study modes, with FSRS scheduling your reviews.', to: '/study', cta: 'Study modes' },
            ].map((s, i) => (
              <li key={s.title} className="flex flex-col p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                  Step {i + 1}
                </div>
                <s.icon className="mt-3 h-5 w-5 text-accent" aria-hidden />
                <h2 className="mt-2 text-sm font-semibold">{s.title}</h2>
                <p className="mt-1 flex-1 text-sm text-muted">{s.text}</p>
                <Link to={s.to} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3 border-t border-border bg-subtle/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Want to look around first? Create a small starter deck you can edit or delete.</p>
            <div className="flex gap-2">
              <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} loading={creatingSample} onClick={startSample}>
                Starter deck
              </Button>
              <Button onClick={() => navigate('/import')} icon={<Upload className="h-4 w-4" />}>
                Import cards
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-0.5 text-xl font-semibold sm:text-2xl">{greeting()}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/import')}>
            Quick import
          </Button>
          <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/decks/new')}>
            New deck
          </Button>
          {data.overall.due > 0 && (
            <Button icon={<BookOpen className="h-4 w-4" />} onClick={() => navigate(studyHref({ deckIds: data.dueDeckIds, mode: 'srs' }))}>
              Review {data.overall.due} due
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Flashcards" value={data.totalCards.toLocaleString()} icon={<ListChecks className="h-4 w-4" />} hint={`${data.overall.newCount} not yet studied`} />
        <Stat label="Decks" value={data.totalDecks} icon={<Layers className="h-4 w-4" />} hint={data.archivedDecks ? `${data.archivedDecks} archived` : 'Active decks'} />
        <Stat label="Due for revision" value={data.overall.due} icon={<Clock className="h-4 w-4" />} hint={data.overall.due ? 'Ready to review now' : 'All caught up'} />
        <Stat label="Accuracy" value={data.acc === null ? '—' : `${data.acc}%`} icon={<Target className="h-4 w-4" />} hint="Correct ÷ all answers" />
        <Stat
          label="Study streak"
          value={
            <span className="flex items-baseline gap-1">
              {data.streak.current}
              <span className="text-sm font-medium text-muted">{data.streak.current === 1 ? 'day' : 'days'}</span>
            </span>
          }
          icon={<Flame className="h-4 w-4" />}
          hint={data.streak.studiedToday ? 'Studied today' : data.streak.current ? 'Study today to keep it' : `Best: ${data.streak.longest}`}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="panel p-5" aria-labelledby="rec-title">
            <SectionTitle
              action={
                <Link to="/study" className="text-xs font-medium text-accent hover:underline">
                  All study options
                </Link>
              }
            >
              <span id="rec-title">Recommended to revise</span>
            </SectionTitle>
            {data.recommended.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="Nothing waiting for you"
                description={data.overall.total ? 'Every card is scheduled for later. Practise freely or add new cards.' : 'Add some cards to a deck to start revising.'}
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.recommended.map(({ deck, summary }) => (
                  <li key={deck.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <DeckGlyph icon={deck.icon} color={deck.color} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/decks/${deck.id}`} className="block truncate text-sm font-medium hover:text-accent">
                        {deck.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {summary.due > 0 ? `${summary.due} due` : `${summary.newCount} new`} · {summary.masteryPct}% mastered · studied {formatRelative(deck.lastStudiedAt).toLowerCase()}
                      </p>
                    </div>
                    <Button size="sm" variant={summary.due ? 'primary' : 'soft'} onClick={() => navigate(studyHref({ deckIds: [deck.id], mode: summary.due || summary.newCount ? 'srs' : prefs.defaultStudyMode }))}>
                      Study
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="week-title">
            <SectionTitle
              action={
                <Link to="/stats" className="text-xs font-medium text-accent hover:underline">
                  Statistics
                </Link>
              }
            >
              <span id="week-title">This week</span>
            </SectionTitle>
            <div className="h-52" role="img" aria-label={`Cards reviewed per day this week: ${data.week.map((d) => `${d.label} ${d.reviews}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.week} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.muted, fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: colors.muted, fontSize: 12 }} />
                  <Tooltip cursor={{ fill: colors.subtle }} contentStyle={tooltipStyle(colors)} formatter={(v: number) => [v, 'Cards reviewed']} />
                  <Bar dataKey="reviews" fill={colors.accent} radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel p-5" aria-labelledby="goal-title">
            <SectionTitle>
              <span id="goal-title">Daily target</span>
            </SectionTitle>
            <p className="text-2xl font-semibold tabular-nums">
              {data.reviewsToday}
              <span className="text-base font-medium text-muted"> / {prefs.dailyTarget} cards</span>
            </p>
            <Progress value={targetPct} label="Daily target progress" className="mt-3" tone={targetPct >= 100 ? 'success' : 'accent'} />
            <p className="mt-2 text-xs text-muted">{targetPct >= 100 ? 'Target reached — nice work.' : `${Math.max(0, prefs.dailyTarget - data.reviewsToday)} more to hit today's target.`}</p>
          </section>

          <section className="panel p-5" aria-labelledby="recent-title">
            <SectionTitle>
              <span id="recent-title">Recently opened</span>
            </SectionTitle>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted">Decks you open will appear here.</p>
            ) : (
              <ul className="space-y-1">
                {data.recent.map(({ deck, summary }) => (
                  <li key={deck.id}>
                    <Link to={`/decks/${deck.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-subtle">
                      <DeckGlyph icon={deck.icon} color={deck.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{deck.name}</span>
                      <span className="text-xs tabular-nums text-muted">{plural(summary.total, 'card')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="activity-title">
            <SectionTitle>
              <span id="activity-title">Recent activity</span>
            </SectionTitle>
            {data.recentSessions.length === 0 ? (
              <p className="text-sm text-muted">Finished study sessions will show up here.</p>
            ) : (
              <ul className="space-y-3">
                {data.recentSessions.map(({ s, names }) => (
                  <li key={s.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                      <Wand2 className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{STUDY_MODE_LABELS[s.mode]}</p>
                      <p className="truncate text-xs text-muted">
                        {names.join(', ') || 'Deleted deck'} · {s.total} cards · {s.total ? Math.round((s.correct / Math.max(1, s.correct + s.incorrect)) * 100) : 0}% · {formatDuration(s.durationMs)} · {formatRelative(s.endedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
