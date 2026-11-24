import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MarkdownView } from '@/components/card/MarkdownView';
import { logReview } from '@/db/repo';
import { compareAnswer, type CompareResult } from '@/lib/study/answerCompare';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { CardFace, Explanation, HintBox, ModeProgress } from './CardFace';
import type { ModeProps } from './types';

interface Outcome {
  auto: CompareResult;
  correct: boolean;
  overridden: boolean;
  submitted: string;
}

export function WrittenMode({ cards, sessionId, onComplete }: ModeProps) {
  const { prefs } = usePreferences();
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showHint, setShowHint] = useState(false);
  const results = useRef(new Map<string, boolean>());
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const card = cards[index];

  useEffect(() => {
    shownAt.current = Date.now();
    setInput('');
    setOutcome(null);
    setShowHint(false);
    inputRef.current?.focus();
  }, [index]);

  useEffect(() => {
    if (outcome) continueRef.current?.focus();
  }, [outcome]);

  const finish = () => {
    const entries = [...results.current.entries()];
    const correct = entries.filter(([, ok]) => ok).length;
    onComplete({ total: entries.length, correct, incorrect: entries.length - correct, missedCardIds: entries.filter(([, ok]) => !ok).map(([id]) => id) });
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!card || outcome) return;
    const auto = compareAnswer(input, card.answer, { sensitivity: prefs.answerSensitivity, ignorePunctuation: prefs.ignorePunctuation, aliases: card.aliases });
    setOutcome({ auto, correct: auto.correct, overridden: false, submitted: input });
  };

  const next = () => {
    if (!card || !outcome) return;
    results.current.set(card.id, outcome.correct);
    void logReview({ cardId: card.id, deckId: card.deckId, sessionId, mode: 'written', correct: outcome.correct, durationMs: Date.now() - shownAt.current });
    if (index + 1 >= cards.length) finish();
    else setIndex(index + 1);
  };

  if (!card) return null;

  return (
    <div>
      <ModeProgress current={index} total={cards.length} right={<span>{[...results.current.values()].filter(Boolean).length} correct so far</span>} />

      <div className="panel flex min-h-[200px] flex-col items-center justify-center px-5 py-8 sm:px-10">
        <CardFace label="Question" text={card.question} image={card.questionImage} />
        {showHint && card.hint && <HintBox text={card.hint} />}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="written-answer" className="sr-only">
          Your answer
        </label>
        <input
          id="written-answer"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!!outcome}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type your answer and press Enter"
          className="input-base h-12 flex-1 text-base"
        />
        {!outcome && (
          <div className="flex gap-2">
            {card.hint && !showHint && (
              <Button variant="outline" size="lg" icon={<Lightbulb className="h-4 w-4" />} onClick={() => setShowHint(true)}>
                Hint
              </Button>
            )}
            <Button type="submit" size="lg" className="flex-1 sm:flex-none">
              Check
            </Button>
          </div>
        )}
      </form>

      <div aria-live="polite">
        {outcome && (
          <div className={cn('mt-4 rounded-xl border p-4 sm:p-5', outcome.correct ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5')}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {outcome.correct ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : <XCircle className="h-5 w-5 text-danger" aria-hidden />}
              <span>
                {outcome.correct ? 'Correct' : 'Incorrect'}
                {outcome.overridden && ' (marked by you)'}
                {!outcome.overridden && outcome.auto.reason === 'alias' && ' — matched an accepted alternative'}
                {!outcome.overridden && outcome.auto.reason === 'close' && ' — close enough (small typo)'}
                {!outcome.overridden && outcome.auto.reason === 'empty' && ' — no answer given'}
              </span>
            </div>
            {outcome.submitted.trim() && (
              <p className="mt-2 text-sm">
                <span className="text-muted">You wrote: </span>
                <span className="font-medium">{outcome.submitted}</span>
              </p>
            )}
            <div className="mt-3">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Expected answer</span>
              <MarkdownView source={card.answer} image={card.answerImage} className="text-base font-medium" />
              {card.aliases.length > 0 && <p className="mt-1 text-xs text-muted">Also accepted: {card.aliases.join(', ')}</p>}
            </div>
            <Explanation text={card.explanation} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {outcome.correct ? (
                <Button variant="ghost" size="sm" onClick={() => setOutcome({ ...outcome, correct: false, overridden: true })}>
                  Mark incorrect
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setOutcome({ ...outcome, correct: true, overridden: true })}>
                  I was right
                </Button>
              )}
              <Button ref={continueRef} onClick={next}>
                {index + 1 >= cards.length ? 'Finish' : 'Continue'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="flex max-w-lg items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Automatic marking compares text ({prefs.answerSensitivity} sensitivity) and cannot judge meaning. Override it whenever your answer is right in substance.
        </p>
        <Button variant="ghost" size="sm" onClick={finish}>
          End session
        </Button>
      </div>
    </div>
  );
}
