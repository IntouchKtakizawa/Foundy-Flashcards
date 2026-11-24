import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/misc';
import { logReview } from '@/db/repo';
import { stripMarkdown } from '@/lib/markdown/render';
import { cn, formatClock, formatDuration, pct, shuffle } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import type { Flashcard } from '@/types';
import type { ModeProps } from './types';

const ROUND_SIZE = 6;

const norm = (s: string) => stripMarkdown(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Split cards into rounds where every question and answer text is unique within a round. */
export function buildMatchRounds(cards: Flashcard[], size = ROUND_SIZE): Flashcard[][] {
  let remaining = shuffle(cards);
  const rounds: Flashcard[][] = [];
  while (remaining.length) {
    const round: Flashcard[] = [];
    const qs = new Set<string>();
    const as = new Set<string>();
    const rest: Flashcard[] = [];
    for (const c of remaining) {
      const qk = norm(c.question);
      const ak = norm(c.answer);
      if (round.length < size && !qs.has(qk) && !as.has(ak)) {
        round.push(c);
        qs.add(qk);
        as.add(ak);
      } else rest.push(c);
    }
    rounds.push(round);
    remaining = rest;
  }
  return rounds;
}

export function MatchMode(props: ModeProps) {
  const [nonce, setNonce] = useState(0);
  return <MatchGame key={nonce} {...props} onRestart={() => setNonce((n) => n + 1)} />;
}

type Side = 'q' | 'a';

function MatchGame({ cards, sessionId, onComplete, onRestart }: ModeProps & { onRestart: () => void }) {
  const { reducedMotion } = usePreferences();
  const rounds = useMemo(() => buildMatchRounds(cards), [cards]);
  const [roundIdx, setRoundIdx] = useState(0);
  const round = rounds[roundIdx] ?? [];
  const left = useMemo(() => shuffle(round), [round]);
  const right = useMemo(() => shuffle(round), [round]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ side: Side; id: string } | null>(null);
  const [wrong, setWrong] = useState<{ q: string; a: string; n: number } | null>(null);
  const [showTimer, setShowTimer] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [announce, setAnnounce] = useState('');
  const startedAt = useRef(Date.now());
  const mistakes = useRef(new Map<string, number>());
  const totalMistakes = useRef(0);
  const done = useRef(false);
  const matchedAll = useRef(new Set<string>());

  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(t);
  }, []);

  const complete = () => {
    if (done.current) return;
    done.current = true;
    const duration = Date.now() - startedAt.current;
    // Only cards the learner actually attempted count (matters when ending early).
    const attempted = cards.filter((c) => matchedAll.current.has(c.id) || mistakes.current.has(c.id));
    const perCard = Math.round(duration / Math.max(1, attempted.length));
    const missed = attempted.filter((c) => (mistakes.current.get(c.id) ?? 0) > 0).map((c) => c.id);
    for (const c of attempted) {
      void logReview({ cardId: c.id, deckId: c.deckId, sessionId, mode: 'match', correct: !missed.includes(c.id), durationMs: perCard });
    }
    const correct = attempted.length - missed.length;
    onComplete({
      total: attempted.length,
      correct,
      incorrect: missed.length,
      missedCardIds: missed,
      details: (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-border p-3">
            <div className="text-lg font-semibold tabular-nums">{formatDuration(duration)}</div>
            <div className="text-xs text-muted">Completion time</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-lg font-semibold tabular-nums">{totalMistakes.current}</div>
            <div className="text-xs text-muted">Mistakes</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-lg font-semibold tabular-nums">{pct(correct, attempted.length)}%</div>
            <div className="text-xs text-muted">First-try matches</div>
          </div>
        </div>
      ),
    });
  };

  const tryPair = (qId: string, aId: string) => {
    setSelected(null);
    if (qId === aId) {
      const next = new Set(matched);
      next.add(qId);
      matchedAll.current.add(qId);
      setMatched(next);
      setAnnounce('Match!');
      if (next.size >= round.length) {
        if (roundIdx + 1 >= rounds.length) window.setTimeout(complete, 350);
        else
          window.setTimeout(() => {
            setRoundIdx((r) => r + 1);
            setMatched(new Set());
            setAnnounce(`Round ${roundIdx + 2} of ${rounds.length}`);
          }, 450);
      }
    } else {
      totalMistakes.current++;
      for (const id of [qId, aId]) mistakes.current.set(id, (mistakes.current.get(id) ?? 0) + 1);
      setWrong({ q: qId, a: aId, n: totalMistakes.current });
      setAnnounce('Not a match. Try again.');
      window.setTimeout(() => setWrong((w) => (w && w.n === totalMistakes.current ? null : w)), 600);
    }
  };

  const pick = (side: Side, id: string) => {
    if (matched.has(id)) return;
    if (!selected || selected.side === side) {
      setSelected(selected && selected.side === side && selected.id === id ? null : { side, id });
      return;
    }
    if (side === 'a') tryPair(selected.id, id);
    else tryPair(id, selected.id);
  };

  const tile = (side: Side, c: Flashcard) => {
    const isMatched = matched.has(c.id);
    const isSelected = selected?.side === side && selected.id === c.id;
    const isWrong = wrong && (side === 'q' ? wrong.q === c.id : wrong.a === c.id);
    const text = stripMarkdown(side === 'q' ? c.question : c.answer) || '(image)';
    return (
      <motion.button
        key={`${side}-${c.id}`}
        type="button"
        aria-pressed={isSelected}
        aria-label={`${side === 'q' ? 'Question' : 'Answer'}: ${text}${isMatched ? ' (matched)' : ''}`}
        disabled={isMatched}
        onClick={() => pick(side, c.id)}
        animate={isWrong && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className={cn(
          'flex min-h-[64px] w-full items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors',
          isMatched && 'border-success/40 bg-success/10 text-muted',
          !isMatched && isSelected && 'border-accent bg-accent-soft ring-2 ring-accent/30',
          !isMatched && !isSelected && isWrong && 'border-danger bg-danger/10',
          !isMatched && !isSelected && !isWrong && 'border-border bg-surface hover:border-accent/50',
        )}
      >
        {isMatched && <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />}
        <span className="line-clamp-4 min-w-0 flex-1">{text}</span>
      </motion.button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold">
            Round {roundIdx + 1} of {rounds.length}
          </span>
          <span className="ml-2 text-muted">
            {matched.size}/{round.length} matched · {totalMistakes.current} mistake{totalMistakes.current === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {showTimer && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-subtle px-2.5 py-1 font-mono text-sm tabular-nums" aria-label={`Elapsed time ${formatClock(elapsed)}`}>
              <Timer className="h-3.5 w-3.5 text-muted" aria-hidden />
              {formatClock(elapsed)}
            </span>
          )}
          <div className="w-36">
            <Switch checked={showTimer} onChange={setShowTimer} label="Show timer" />
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted">Select a question, then the answer that matches it.</p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2" role="group" aria-label="Questions">
          {left.map((c) => tile('q', c))}
        </div>
        <div className="space-y-2" role="group" aria-label="Answers">
          {right.map((c) => tile('a', c))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="outline" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onRestart}>
          Restart
        </Button>
        <Button variant="ghost" size="sm" onClick={complete}>
          End game
        </Button>
      </div>
    </div>
  );
}
