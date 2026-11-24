import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, Kbd } from '@/components/ui/misc';
import { MarkdownView } from '@/components/card/MarkdownView';
import { logReview } from '@/db/repo';
import { buildChoiceQuestion, distinctAnswerCount, type ChoiceQuestion } from '@/lib/study/multipleChoice';
import { studyHref } from '@/lib/study/links';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { CardFace, Explanation, ModeProgress } from './CardFace';
import { useStudyKeys } from './useStudyKeys';
import type { ModeProps } from './types';

interface Miss {
  question: string;
  chosen: string;
  correct: string;
}

export function ChoiceMode({ cards, pool, deckIds, sessionId, onComplete }: ModeProps) {
  const { prefs } = usePreferences();
  const enoughAnswers = useMemo(() => distinctAnswerCount(pool) >= 2, [pool]);
  const questions = useMemo(
    () => (enoughAnswers ? cards.map((c) => buildChoiceQuestion(c, pool, 4)).filter((q): q is ChoiceQuestion => q !== null) : []),
    [cards, pool, enoughAnswers],
  );
  const skipped = cards.length - questions.length;

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const results = useRef(new Map<string, boolean>());
  const misses = useRef<Miss[]>([]);
  const shownAt = useRef(Date.now());
  const nextRef = useRef<HTMLButtonElement>(null);

  const q = questions[index];
  const card = q ? cards.find((c) => c.id === q.cardId) : undefined;

  useEffect(() => {
    shownAt.current = Date.now();
    setChosen(null);
  }, [index]);

  useEffect(() => {
    if (chosen !== null) nextRef.current?.focus();
  }, [chosen]);

  const finish = () => {
    const entries = [...results.current.entries()];
    const correct = entries.filter(([, ok]) => ok).length;
    const list = misses.current;
    onComplete({
      total: entries.length,
      correct,
      incorrect: entries.length - correct,
      missedCardIds: entries.filter(([, ok]) => !ok).map(([id]) => id),
      details:
        list.length > 0 ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold">Review your incorrect answers</h3>
            <ul className="space-y-3">
              {list.map((m, i) => (
                <li key={i} className="rounded-lg border border-border p-3 text-sm">
                  <MarkdownView source={m.question} className="font-medium" />
                  <p className="mt-2 flex items-start gap-1.5 text-danger">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="sr-only">Your answer: </span>
                      <span className="text-muted">You chose: </span>
                      {m.chosen}
                    </span>
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-success">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="text-muted">Correct: </span>
                      {m.correct}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : undefined,
    });
  };

  const choose = (i: number) => {
    if (!q || !card || chosen !== null) return;
    const opt = q.options[i];
    if (!opt) return;
    setChosen(i);
    results.current.set(card.id, opt.correct);
    if (!opt.correct) misses.current.push({ question: card.question, chosen: opt.text, correct: card.answer });
    void logReview({ cardId: card.id, deckId: card.deckId, sessionId, mode: 'choice', correct: opt.correct, durationMs: Date.now() - shownAt.current });
  };

  const next = () => {
    if (index + 1 >= questions.length) finish();
    else setIndex(index + 1);
  };

  useStudyKeys((e) => {
    if (!q) return;
    const n = Number(e.key);
    if (chosen === null && n >= 1 && n <= q.options.length) {
      e.preventDefault();
      choose(n - 1);
    } else if (chosen !== null && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });

  if (!enoughAnswers || !questions.length) {
    return (
      <EmptyState
        icon={<ListChecks className="h-5 w-5" />}
        title="Not enough distinct answers for multiple choice"
        description="Multiple choice builds wrong options from other cards' answers, so the selected decks need at least two cards with different answers."
        action={
          <Link to={studyHref({ deckIds, mode: 'classic' })} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong">
            Study with classic flashcards
          </Link>
        }
      />
    );
  }

  if (!q || !card) return null;

  const answered = chosen !== null;
  const wasCorrect = answered && q.options[chosen]?.correct;

  return (
    <div>
      <ModeProgress current={index} total={questions.length} label="Question" right={skipped > 0 ? <span>{skipped} card{skipped === 1 ? '' : 's'} skipped (no distinct options)</span> : undefined} />

      <div className="panel flex min-h-[180px] flex-col items-center justify-center px-5 py-8 sm:px-10">
        <CardFace label="Question" text={q.question} image={card.questionImage} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Answer options">
        {q.options.map((opt, i) => {
          const isChosen = chosen === i;
          const showCorrect = answered && opt.correct;
          const showWrong = answered && isChosen && !opt.correct;
          return (
            <button
              key={`${q.cardId}-${i}`}
              type="button"
              role="radio"
              aria-checked={isChosen}
              disabled={answered}
              onClick={() => choose(i)}
              className={cn(
                'flex min-h-[56px] items-start gap-3 rounded-xl border bg-surface p-3.5 text-left text-sm transition-colors disabled:cursor-default',
                !answered && 'border-border hover:border-accent/50 hover:bg-accent-soft/40',
                answered && !showCorrect && !showWrong && 'border-border opacity-60',
                showCorrect && 'border-success bg-success/10',
                showWrong && 'border-danger bg-danger/10',
              )}
            >
              <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold', showCorrect ? 'border-success text-success' : showWrong ? 'border-danger text-danger' : 'border-border text-muted')}>
                {showCorrect ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : showWrong ? <XCircle className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <MarkdownView source={opt.text} />
                {showCorrect && <span className="mt-1 block text-xs font-semibold text-success">Correct answer</span>}
                {showWrong && <span className="mt-1 block text-xs font-semibold text-danger">Your choice — incorrect</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-4">
        {answered && (
          <div className="flex flex-col gap-3">
            <p className={cn('flex items-center gap-2 text-sm font-semibold', wasCorrect ? 'text-success' : 'text-danger')}>
              {wasCorrect ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
              {wasCorrect ? 'Correct!' : 'Not quite.'}
            </p>
            {card.explanation && <Explanation text={card.explanation} />}
            <div className="flex justify-end">
              <Button ref={nextRef} onClick={next}>
                {index + 1 >= questions.length ? 'See results' : 'Next question'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {prefs.keyboardShortcuts ? (
          <p className="hidden items-center gap-3 text-xs text-muted sm:flex">
            <span><Kbd>1</Kbd>–<Kbd>{q.options.length}</Kbd> choose</span>
            <span><Kbd>Enter</Kbd> next</span>
          </p>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={finish}>
          End session
        </Button>
      </div>
    </div>
  );
}
