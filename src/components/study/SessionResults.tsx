import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Clock, Flag, House, RotateCcw, Target, Trophy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress, Stat } from '@/components/ui/misc';
import { db } from '@/db/database';
import { setCardFlag } from '@/db/repo';
import { summariseCards } from '@/lib/analytics/stats';
import { stripMarkdown } from '@/lib/markdown/render';
import { studyHref } from '@/lib/study/links';
import { cn, formatDuration, pct } from '@/lib/utils';
import { STUDY_MODE_LABELS, type StudyMode } from '@/types';
import type { ModeResult } from './types';

interface Props {
  result: ModeResult;
  durationMs: number;
  deckIds: string[];
  mode: StudyMode;
  onRestart: () => void;
}

export function SessionResults({ result, durationMs, deckIds, mode, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const deckCards = useLiveQuery(() => db.cards.where('deckId').anyOf(deckIds).toArray(), [deckIds.join(',')]);
  const summary = useMemo(() => (deckCards ? summariseCards(deckCards) : null), [deckCards]);
  const byId = useMemo(() => new Map((deckCards ?? []).map((c) => [c.id, c])), [deckCards]);
  const missed = result.missedCardIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const answered = result.correct + result.incorrect;
  const accuracy = answered ? pct(result.correct, answered) : null;

  const headline =
    result.total === 0 ? 'Session ended' : accuracy === null ? 'Nice work!' : accuracy >= 90 ? 'Excellent work!' : accuracy >= 70 ? 'Good progress!' : 'Keep going — practice pays off.';

  const linkBtn = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors';

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold" tabIndex={-1} ref={headingRef}>
            {headline}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{STUDY_MODE_LABELS[mode]} session complete.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Reviewed" value={result.total} icon={<Target className="h-4 w-4" />} />
        <Stat label="Correct" value={result.correct} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
        <Stat label="Incorrect" value={result.incorrect} icon={<XCircle className="h-4 w-4 text-danger" />} />
        <Stat label="Accuracy" value={accuracy === null ? '—' : `${accuracy}%`} hint={accuracy === null ? 'No answers were graded' : undefined} />
        <Stat label="Duration" value={formatDuration(durationMs)} icon={<Clock className="h-4 w-4" />} className="col-span-2 sm:col-span-1" />
      </div>

      {result.details && <div className="panel mt-4 p-4 sm:p-5">{result.details}</div>}

      <div className="panel mt-4 p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Deck mastery</span>
          <span className="tabular-nums text-muted">{summary ? `${summary.masteryPct}% mastered · ${summary.progressPct}% studied` : '…'}</span>
        </div>
        <Progress value={summary?.masteryPct ?? 0} label="Deck mastery" tone="success" />
        <p className="mt-2 text-xs text-muted">
          {summary
            ? `${summary.mastered} of ${summary.total} cards are mastered (memory stability of 21+ days in spaced repetition). ${summary.due} due for review.`
            : 'Loading…'}
        </p>
      </div>

      <div className="panel mt-4 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">
          Needs more revision <span className="font-normal text-muted">({missed.length})</span>
        </h2>
        {missed.length === 0 ? (
          <p className="text-sm text-muted">{result.total ? 'Nothing missed this time.' : 'No cards were answered.'}</p>
        ) : (
          <ul className="divide-y divide-border">
            {missed.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{stripMarkdown(c.question)}</p>
                  <p className="truncate text-xs text-muted">{stripMarkdown(c.answer)}</p>
                </div>
                <Button
                  size="sm"
                  variant={c.flagged ? 'soft' : 'outline'}
                  icon={<Flag className="h-3.5 w-3.5" />}
                  aria-pressed={!!c.flagged}
                  onClick={() => setCardFlag(c.id, !c.flagged)}
                >
                  {c.flagged ? 'Marked' : 'Mark'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link to="/" className={cn(linkBtn, 'border border-border bg-surface hover:bg-subtle')}>
          <House className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
        {missed.length > 0 ? (
          <Link to={studyHref({ deckIds, mode: 'classic', cardIds: missed.map((c) => c.id) })} className={cn(linkBtn, 'bg-accent-soft text-accent hover:bg-accent/15')}>
            Revise incorrect cards ({missed.length})
          </Link>
        ) : (
          <Button variant="soft" disabled>
            Revise incorrect cards
          </Button>
        )}
        <Button icon={<RotateCcw className="h-4 w-4" />} onClick={onRestart}>
          Restart
        </Button>
      </div>
    </div>
  );
}
