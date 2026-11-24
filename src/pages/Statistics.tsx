import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, Clock, Flame, HelpCircle, Target, Trophy } from 'lucide-react';
import { useAllCards, useDecks, useReviews, useSessions, groupByDeck } from '@/state/data';
import {
  accuracy,
  calendarHeatmap,
  computeStreak,
  dailyActivity,
  difficultCards,
  masteryDistribution,
  monthlyActivity,
  summariseCards,
  totalStudyTime,
  upcomingWorkload,
  weeklyActivity,
} from '@/lib/analytics/stats';
import { MASTERY_LABELS, type MasteryLevel } from '@/lib/srs/fsrs';
import { stripMarkdown } from '@/lib/markdown/render';
import { cn, formatDuration, plural } from '@/lib/utils';
import { EmptyState, PageHeader, Progress, SectionTitle, Segmented, Skeleton, Stat } from '@/components/ui/misc';
import { DeckGlyph } from '@/components/deck/deckVisuals';
import { tooltipStyle, useChartColors } from '@/components/charts/useChartColors';

type Range = 'daily' | 'weekly' | 'monthly';

export function StatisticsPage() {
  const decks = useDecks();
  const cards = useAllCards();
  const reviews = useReviews();
  const sessions = useSessions();
  const colors = useChartColors();
  const [range, setRange] = useState<Range>('daily');

  const data = useMemo(() => {
    if (!decks || !cards || !reviews || !sessions) return null;
    const now = Date.now();
    const activity = range === 'daily' ? dailyActivity(reviews, 30, now) : range === 'weekly' ? weeklyActivity(reviews, 12, now) : monthlyActivity(reviews, 12, now);
    const byDeck = groupByDeck(cards);
    const reviewsByDeck = new Map<string, typeof reviews>();
    for (const r of reviews) {
      const a = reviewsByDeck.get(r.deckId);
      if (a) a.push(r);
      else reviewsByDeck.set(r.deckId, [r]);
    }
    const deckPerf = decks
      .map((d) => ({ deck: d, summary: summariseCards(byDeck.get(d.id) ?? [], now), acc: accuracy(reviewsByDeck.get(d.id) ?? []), reviews: (reviewsByDeck.get(d.id) ?? []).length }))
      .filter((x) => x.summary.total > 0)
      .sort((a, b) => b.reviews - a.reviews);
    const deckName = new Map(decks.map((d) => [d.id, d.name]));
    return {
      activity,
      streak: computeStreak(reviews, now),
      acc: accuracy(reviews),
      totalTime: totalStudyTime(sessions),
      totalReviews: reviews.length,
      mastery: masteryDistribution(cards),
      workload: upcomingWorkload(cards, 14, now),
      difficult: difficultCards(cards, reviews, 8).map((d) => ({ ...d, deckName: deckName.get(d.card.deckId) ?? 'Deck' })),
      deckPerf,
      heatmap: calendarHeatmap(reviews, 26, now),
    };
  }, [decks, cards, reviews, sessions, range]);

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading statistics">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const masteryOrder: MasteryLevel[] = ['new', 'learning', 'familiar', 'mastered'];
  const masteryColors: Record<MasteryLevel, string> = { new: colors.border, learning: colors.warning, familiar: colors.accentSoft, mastered: colors.accent };
  const masteryData = masteryOrder.map((k) => ({ key: k, name: MASTERY_LABELS[k], value: data.mastery[k] }));
  const totalCards = masteryData.reduce((n, d) => n + d.value, 0);
  const axis = { tickLine: false, axisLine: false, tick: { fill: colors.muted, fontSize: 12 } } as const;
  const heatColors = [colors.subtle, `${colors.accent.replace('rgb(', 'rgb(').replace(')', ' / 0.25)')}`, `${colors.accent.replace(')', ' / 0.45)')}`, `${colors.accent.replace(')', ' / 0.7)')}`, colors.accent];

  if (data.totalReviews === 0 && totalCards === 0) {
    return (
      <div>
        <PageHeader title="Statistics" description="Your study history, calculated from data stored on this device." />
        <EmptyState icon={<ChartColumn className="h-5 w-5" />} title="No study history yet" description="Create a deck and complete a study session — your charts will appear here." action={<Link to="/decks/new" className="text-sm font-medium text-accent hover:underline">Create a deck</Link>} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Statistics" description="Every number here is calculated from your own study history on this device." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Current streak" value={plural(data.streak.current, 'day')} icon={<Flame className="h-4 w-4" />} hint={`Longest: ${plural(data.streak.longest, 'day')}`} />
        <Stat label="Total study time" value={formatDuration(data.totalTime)} icon={<Clock className="h-4 w-4" />} hint={`${data.totalReviews.toLocaleString()} answers recorded`} />
        <Stat label="Overall accuracy" value={data.acc === null ? '—' : `${data.acc}%`} icon={<Target className="h-4 w-4" />} hint="Correct ÷ all answers" />
        <Stat label="Mastered cards" value={`${totalCards ? Math.round((data.mastery.mastered / totalCards) * 100) : 0}%`} icon={<Trophy className="h-4 w-4" />} hint={`${data.mastery.mastered} of ${totalCards}`} />
      </div>

      <section className="panel p-5" aria-labelledby="activity-h">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="activity-h" className="text-sm font-semibold">
            Study activity
          </h2>
          <Segmented
            size="sm"
            label="Activity range"
            value={range}
            onChange={setRange}
            options={[
              { value: 'daily', label: '30 days' },
              { value: 'weekly', label: '12 weeks' },
              { value: 'monthly', label: '12 months' },
            ]}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Cards reviewed</p>
            <div className="h-56" role="img" aria-label="Bar chart of cards reviewed over time">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activity} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip cursor={{ fill: colors.subtle }} contentStyle={tooltipStyle(colors)} formatter={(v: number) => [v, 'Reviews']} />
                  <Bar dataKey="reviews" fill={colors.accent} radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Accuracy trend</p>
            <div className="h-56" role="img" aria-label="Line chart of accuracy over time">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.activity} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis domain={[0, 100]} unit="%" {...axis} />
                  <Tooltip contentStyle={tooltipStyle(colors)} formatter={(v: number) => [`${v}%`, 'Accuracy']} />
                  <Line type="monotone" dataKey="accuracy" stroke={colors.success} strokeWidth={2} dot={{ r: 2.5, fill: colors.success }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="mastery-h">
          <SectionTitle>
            <span id="mastery-h">Mastery distribution</span>
          </SectionTitle>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-44 w-44 shrink-0" role="img" aria-label={`Mastery: ${masteryData.map((m) => `${m.name} ${m.value}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={masteryData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                    {masteryData.map((d) => (
                      <Cell key={d.key} fill={masteryColors[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle(colors)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full min-w-[150px] flex-1 space-y-2.5">
              {masteryData.map((d) => (
                <li key={d.key} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: masteryColors[d.key] }} aria-hidden />
                      {d.name}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-muted">
                      {d.value} · {totalCards ? Math.round((d.value / totalCards) * 100) : 0}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="workload-h">
          <SectionTitle>
            <span id="workload-h">Upcoming revision workload</span>
          </SectionTitle>
          <div className="h-48" role="img" aria-label={`Reviews due over the next 14 days: ${data.workload.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workload} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip cursor={{ fill: colors.subtle }} contentStyle={tooltipStyle(colors)} formatter={(v: number) => [v, 'Reviews due']} />
                <Bar dataKey="count" fill={colors.accent} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted">Overdue reviews are counted in today. New cards aren’t included until you first study them.</p>
        </section>
      </div>

      <section className="panel p-5" aria-labelledby="cal-h">
        <SectionTitle>
          <span id="cal-h">Revision calendar</span>
        </SectionTitle>
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-[3px]" role="grid" aria-label="Reviews per day over the last 26 weeks">
            {data.heatmap.columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]" role="row">
                {col.map((day) => (
                  <div
                    key={day.key}
                    role="gridcell"
                    title={`${new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${plural(day.reviews, 'review')}`}
                    aria-label={`${new Date(day.date).toDateString()}: ${plural(day.reviews, 'review')}`}
                    className="h-3 w-3 rounded-[3px]"
                    style={{ background: heatColors[day.level], outline: day.level === 0 ? `1px solid ${colors.border}` : undefined, outlineOffset: -1 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          Less
          {heatColors.map((c, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c, outline: i === 0 ? `1px solid ${colors.border}` : undefined, outlineOffset: -1 }} aria-hidden />
          ))}
          More
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="deckperf-h">
          <SectionTitle>
            <span id="deckperf-h">Deck performance</span>
          </SectionTitle>
          {data.deckPerf.length === 0 ? (
            <p className="text-sm text-muted">No decks with cards yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.deckPerf.slice(0, 8).map(({ deck, summary, acc, reviews: n }) => (
                <li key={deck.id} className="flex items-center gap-3">
                  <DeckGlyph icon={deck.icon} color={deck.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link to={`/decks/${deck.id}`} className="truncate font-medium hover:text-accent">
                        {deck.name}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {acc === null ? 'no answers' : `${acc}% accuracy`} · {n} answers
                      </span>
                    </div>
                    <Progress value={summary.masteryPct} label={`${deck.name} mastery`} size="sm" className="mt-1.5" />
                    <p className="mt-1 text-[11px] text-muted">{summary.masteryPct}% mastered · {summary.due} due</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="difficult-h">
          <SectionTitle>
            <span id="difficult-h">Difficult cards</span>
          </SectionTitle>
          {data.difficult.length === 0 ? (
            <p className="text-sm text-muted">No struggling cards yet — cards you get wrong or forget will appear here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.difficult.map((d) => (
                <li key={d.card.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link to={`/decks/${d.card.deckId}?card=${d.card.id}`} className="block text-sm font-medium hover:text-accent">
                    <span className="line-clamp-1">{stripMarkdown(d.card.question)}</span>
                  </Link>
                  <p className="text-xs text-muted">
                    {d.deckName} · {d.incorrect} wrong of {d.attempts} · {d.card.srs.lapses} lapses
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-5" aria-labelledby="howto-h">
        <h2 id="howto-h" className="flex items-center gap-2 text-sm font-semibold">
          <HelpCircle className="h-4 w-4 text-accent" aria-hidden /> How these numbers are calculated
        </h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          {[
            ['Accuracy', 'Correct answers divided by all answers you have given, across every study mode. In spaced repetition, “Again” counts as incorrect; Hard, Good and Easy count as correct. Self-assessed classic cards and manual overrides in written mode are included as you marked them.'],
            ['Mastery', 'Based on the FSRS memory model. A card is Mastered once its memory stability reaches 21 days (you are predicted to remember it for three weeks or more), Familiar between 7 and 21 days, Learning below 7 days or while in learning steps, and New until first studied with spaced repetition.'],
            ['Revision progress', 'The share of a deck’s cards that have been studied at least once with spaced repetition.'],
            ['Streak & study time', 'A streak counts consecutive calendar days (in your time zone) with at least one answer. Study time is the total length of completed sessions.'],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="font-medium">{t}</dt>
              <dd className={cn('mt-0.5 text-muted')}>{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
