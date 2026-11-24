import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Clock, Flag, Layers, PartyPopper, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { db } from '@/db/database';
import { finishSession, startSession } from '@/db/repo';
import { parseStudyParams, studyHref, type StudyLinkOptions } from '@/lib/study/links';
import { formatRelative, plural, shuffle } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import type { CardOrder, Deck, Flashcard, StudyMode } from '@/types';
import { MODE_META } from '@/components/study/modeMeta';
import { buildSrsQueue, buildStudyAheadQueue, countNewIntroducedToday, nextDueAt } from '@/components/study/srsQueue';
import { ClassicMode } from '@/components/study/ClassicMode';
import { SrsMode } from '@/components/study/SrsMode';
import { WrittenMode } from '@/components/study/WrittenMode';
import { ChoiceMode } from '@/components/study/ChoiceMode';
import { MatchMode } from '@/components/study/MatchMode';
import { ExamMode } from '@/components/study/ExamMode';
import { SessionResults } from '@/components/study/SessionResults';
import type { ModeProps, ModeResult } from '@/components/study/types';

const MODE_COMPONENTS: Record<StudyMode, (p: ModeProps) => JSX.Element | null> = {
  classic: ClassicMode,
  srs: SrsMode,
  written: WrittenMode,
  choice: ChoiceMode,
  match: MatchMode,
  exam: ExamMode,
};

export function StudySessionPage() {
  const [search] = useSearchParams();
  const key = search.toString();
  const params = useMemo(() => parseStudyParams(new URLSearchParams(key)), [key]);
  const [nonce, setNonce] = useState(0);
  return <SessionRunner key={`${key}:${nonce}`} params={params} onRestart={() => setNonce((n) => n + 1)} />;
}

function orderCards(cards: Flashcard[], order: CardOrder, deckOrder: string[]): Flashcard[] {
  if (order === 'shuffled') return shuffle(cards);
  if (order === 'difficult-first') {
    return cards.slice().sort((a, b) => b.srs.lapses - a.srs.lapses || b.srs.difficulty - a.srs.difficulty || b.flagged - a.flagged);
  }
  const rank = new Map(deckOrder.map((id, i) => [id, i]));
  return cards.slice().sort((a, b) => (rank.get(a.deckId) ?? 0) - (rank.get(b.deckId) ?? 0) || a.position - b.position);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; decks: Deck[]; pool: Flashcard[]; cards: Flashcard[]; nextDue: number | null; newLimitReached: boolean };

function SessionRunner({ params, onRestart }: { params: StudyLinkOptions; onRestart: () => void }) {
  const { prefs, ready: prefsReady } = usePreferences();
  const toast = useToast();
  const [studyAhead, setStudyAhead] = useState(false);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<{ result: ModeResult; durationMs: number } | null>(null);
  const sessionStarted = useRef(false);
  const startedAt = useRef(Date.now());
  const { mode } = params;

  useEffect(() => {
    if (!prefsReady) return;
    let cancelled = false;
    (async () => {
      const found = (await db.decks.bulkGet(params.deckIds)).filter((d): d is Deck => !!d);
      if (!found.length) {
        if (!cancelled) setState({ status: 'missing' });
        return;
      }
      const ids = found.map((d) => d.id);
      const pool = await db.cards.where('deckId').anyOf(ids).toArray();
      let selected = pool;
      if (params.cardIds?.length) {
        const wanted = new Set(params.cardIds);
        selected = selected.filter((c) => wanted.has(c.id));
      }
      if (params.flaggedOnly) selected = selected.filter((c) => c.flagged);
      selected = orderCards(selected, prefs.cardOrder, ids);

      const now = Date.now();
      let nextDue: number | null = null;
      let newLimitReached = false;
      if (mode === 'srs') {
        if (studyAhead) selected = buildStudyAheadQueue(selected);
        else {
          const introduced = await countNewIntroducedToday(now);
          const newLimit = Math.max(0, prefs.newCardsPerDay - introduced);
          const hasNew = selected.some((c) => c.srs.reps === 0);
          newLimitReached = hasNew && newLimit === 0;
          nextDue = nextDueAt(selected, now);
          selected = buildSrsQueue(selected, now, newLimit);
        }
      }
      if (!cancelled) setState({ status: 'ready', decks: found, pool, cards: selected, nextDue, newLimitReached });
    })().catch((e) => {
      if (!cancelled) {
        toast.error('Could not load this study session', e instanceof Error ? e.message : undefined);
        setState({ status: 'missing' });
      }
    });
    return () => {
      cancelled = true;
    };
    // prefs values are read once per load; changing them mid-session must not reshuffle the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, mode, studyAhead, prefsReady]);

  const cardCount = state.status === 'ready' ? state.cards.length : 0;
  const deckIds = state.status === 'ready' ? state.decks.map((d) => d.id) : params.deckIds;

  useEffect(() => {
    if (state.status !== 'ready' || cardCount === 0 || sessionStarted.current) return;
    sessionStarted.current = true;
    startedAt.current = Date.now();
    startSession(deckIds, mode, cardCount)
      .then((s) => setSessionId(s.id))
      .catch(() => toast.error('Could not start the session', 'Your answers will not be saved.'));
  }, [state.status, cardCount, deckIds, mode, toast]);

  const complete = async (r: ModeResult) => {
    const durationMs = Date.now() - startedAt.current;
    setResult({ result: r, durationMs });
    if (sessionId) {
      try {
        await finishSession(sessionId, { total: r.total, correct: r.correct, incorrect: r.incorrect, missedCardIds: r.missedCardIds, durationMs });
      } catch {
        toast.error('Could not save session results');
      }
    }
    window.scrollTo({ top: 0 });
  };

  const meta = MODE_META[mode];
  const header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/study" className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Back to study options">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <meta.icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{state.status === 'ready' ? state.decks.map((d) => d.name).join(', ') : 'Study session'}</p>
          <p className="text-xs text-muted">
            {meta.label}
            {params.flaggedOnly && ' · marked cards'}
            {params.cardIds?.length ? ' · selected cards' : ''}
            {studyAhead && ' · studying ahead'}
          </p>
        </div>
      </div>
      {state.status === 'ready' && !result && cardCount > 0 && <Badge tone="accent">{plural(cardCount, 'card')}</Badge>}
    </div>
  );

  if (state.status === 'loading' || !prefsReady) {
    return (
      <div aria-busy="true" aria-label="Loading study session">
        <Skeleton className="mb-5 h-10 w-64" />
        <Skeleton className="mb-4 h-2 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <EmptyState
        icon={<SearchX className="h-5 w-5" />}
        title="Deck not found"
        description="The deck for this session doesn't exist on this device. It may have been deleted, or the link came from another device."
        action={
          <Link to="/study" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong">
            Choose decks to study
          </Link>
        }
      />
    );
  }

  if (result) {
    return <SessionResults result={result.result} durationMs={result.durationMs} deckIds={deckIds} mode={mode} onRestart={onRestart} />;
  }

  if (cardCount === 0) {
    return (
      <div>
        {header}
        <EmptySession state={state} mode={mode} params={params} onStudyAhead={() => setStudyAhead(true)} />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div aria-busy="true">
        {header}
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const Mode = MODE_COMPONENTS[mode];
  return (
    <div>
      {header}
      <Mode cards={state.cards} pool={state.pool} deckIds={deckIds} sessionId={sessionId} onComplete={complete} />
    </div>
  );
}

function EmptySession({
  state,
  mode,
  params,
  onStudyAhead,
}: {
  state: Extract<LoadState, { status: 'ready' }>;
  mode: StudyMode;
  params: StudyLinkOptions;
  onStudyAhead: () => void;
}) {
  const deckIds = state.decks.map((d) => d.id);
  const linkCls = 'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors';

  if (state.pool.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title={state.decks.length > 1 ? 'These decks have no cards yet' : 'This deck has no cards yet'}
        description="Add cards by hand or bulk-import them with Foundy QuickImport, then come back to study."
        action={
          <>
            {state.decks.length === 1 && (
              <Link to={`/decks/${state.decks[0].id}`} className={`${linkCls} bg-accent text-accent-fg hover:bg-accent-strong`}>
                Add cards
              </Link>
            )}
            <Link to="/import" className={`${linkCls} border border-border bg-surface hover:bg-subtle`}>
              Import cards
            </Link>
          </>
        }
      />
    );
  }

  if (params.flaggedOnly) {
    return (
      <EmptyState
        icon={<Flag className="h-5 w-5" />}
        title="No cards are marked for revision"
        description="Mark cards while studying (press F) to build a focused revision set."
        action={
          <Link to={studyHref({ deckIds, mode })} className={`${linkCls} bg-accent text-accent-fg hover:bg-accent-strong`}>
            Study all cards instead
          </Link>
        }
      />
    );
  }

  if (mode === 'srs') {
    return (
      <EmptyState
        icon={<PartyPopper className="h-5 w-5" />}
        title="You're all caught up"
        description={
          <>
            Nothing is due for review right now.
            {state.nextDue && (
              <span className="mt-1 flex items-center justify-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden /> Next review {formatRelative(state.nextDue)}.
              </span>
            )}
            {state.newLimitReached && <span className="mt-1 block">You've reached today's limit for new cards (change it in Settings).</span>}
          </>
        }
        action={
          <>
            <Button onClick={onStudyAhead}>Study ahead anyway</Button>
            <Link to={studyHref({ deckIds, mode: 'classic' })} className={`${linkCls} border border-border bg-surface hover:bg-subtle`}>
              Practise with flashcards
            </Link>
            <Link to="/" className={`${linkCls} text-muted hover:bg-subtle hover:text-fg`}>
              Back to dashboard
            </Link>
          </>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<SearchX className="h-5 w-5" />}
      title="No cards match this session"
      description="The selected cards may have been deleted or moved to another deck."
      action={
        <Link to={studyHref({ deckIds, mode })} className={`${linkCls} bg-accent text-accent-fg hover:bg-accent-strong`}>
          Study the whole deck
        </Link>
      }
    />
  );
}
