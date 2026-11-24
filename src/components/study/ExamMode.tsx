import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/misc';
import { MarkdownView } from '@/components/card/MarkdownView';
import { logReview } from '@/db/repo';
import { compareAnswer } from '@/lib/study/answerCompare';
import { buildChoiceQuestion, distinctAnswerCount, type ChoiceQuestion } from '@/lib/study/multipleChoice';
import { cn, formatClock, pct, shuffle } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import type { Flashcard } from '@/types';
import { CardFace } from './CardFace';
import type { ModeProps } from './types';

type QuestionType = 'written' | 'choice' | 'mixed';

interface ExamQuestion {
  card: Flashcard;
  type: 'written' | 'choice';
  choice: ChoiceQuestion | null;
}

interface ExamConfig {
  count: number;
  minutes: number;
  type: QuestionType;
}

const TIME_OPTIONS = [0, 5, 10, 15, 30, 60];

export function ExamMode(props: ModeProps) {
  const [config, setConfig] = useState<ExamConfig | null>(null);
  if (!config) return <ExamSetup cards={props.cards} pool={props.pool} onStart={setConfig} />;
  return <ExamRunner {...props} config={config} />;
}

function ExamSetup({ cards, pool, onStart }: { cards: Flashcard[]; pool: Flashcard[]; onStart: (c: ExamConfig) => void }) {
  const choiceOk = distinctAnswerCount(pool) >= 2;
  const [count, setCount] = useState(String(Math.min(20, cards.length)));
  const [minutes, setMinutes] = useState(0);
  const [type, setType] = useState<QuestionType>(choiceOk ? 'mixed' : 'written');
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= cards.length;

  return (
    <form
      className="panel mx-auto max-w-xl space-y-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onStart({ count: n, minutes, type });
      }}
    >
      <div>
        <h2 className="text-base font-semibold">Set up your exam</h2>
        <p className="mt-1 text-sm text-muted">Questions are drawn at random from {cards.length} card{cards.length === 1 ? '' : 's'}. You won't see feedback until you submit.</p>
      </div>
      <Input
        label="Number of questions"
        type="number"
        inputMode="numeric"
        min={1}
        max={cards.length}
        value={count}
        onChange={(e) => setCount(e.target.value)}
        error={valid ? null : `Choose between 1 and ${cards.length}.`}
      />
      <Select label="Time limit" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
        {TIME_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? 'No time limit' : `${m} minutes`}
          </option>
        ))}
      </Select>
      <div>
        <span className="field-label" id="exam-type-label">
          Question type
        </span>
        <Segmented<QuestionType>
          label="Question type"
          value={type}
          onChange={(v) => (choiceOk || v === 'written' ? setType(v) : undefined)}
          options={[
            { value: 'written', label: 'Written' },
            { value: 'choice', label: 'Multiple choice' },
            { value: 'mixed', label: 'Mixed' },
          ]}
        />
        {!choiceOk && <p className="field-hint">Multiple choice needs at least two cards with different answers, so only written questions are available.</p>}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={!valid}>
        Start exam
      </Button>
    </form>
  );
}

function ExamRunner({ cards, pool, sessionId, onComplete, config }: ModeProps & { config: ExamConfig }) {
  const { prefs } = usePreferences();
  const questions = useMemo<ExamQuestion[]>(() => {
    return shuffle(cards)
      .slice(0, config.count)
      .map((card, i) => {
        const want: 'written' | 'choice' = config.type === 'mixed' ? (i % 2 === 0 ? 'choice' : 'written') : config.type;
        const choice = want === 'choice' ? buildChoiceQuestion(card, pool, 4) : null;
        return { card, type: choice ? 'choice' : 'written', choice };
      });
  }, [cards, pool, config]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const endsAt = useRef(config.minutes ? startedAt.current + config.minutes * 60_000 : null);
  const [now, setNow] = useState(Date.now());
  const submitted = useRef(false);

  const submit = () => {
    if (submitted.current) return;
    submitted.current = true;
    setConfirmOpen(false);
    const duration = Date.now() - startedAt.current;
    const perQ = Math.round(duration / questions.length);
    const graded = questions.map((q, i) => {
      const given = answers[i] ?? '';
      let correct = false;
      if (q.type === 'choice' && q.choice) correct = q.choice.options.some((o) => o.correct && o.text === given);
      else correct = compareAnswer(given, q.card.answer, { sensitivity: prefs.answerSensitivity, ignorePunctuation: prefs.ignorePunctuation, aliases: q.card.aliases }).correct;
      return { q, given, correct };
    });
    for (const g of graded) {
      void logReview({ cardId: g.q.card.id, deckId: g.q.card.deckId, sessionId, mode: 'exam', correct: g.correct, durationMs: perQ });
    }
    const wrong = graded.filter((g) => !g.correct);
    const correctCount = graded.length - wrong.length;
    const timedOut = endsAt.current !== null && Date.now() >= endsAt.current;
    onComplete({
      total: graded.length,
      correct: correctCount,
      incorrect: wrong.length,
      missedCardIds: wrong.map((g) => g.q.card.id),
      details: (
        <div>
          <p className="mb-4 text-sm">
            <span className="text-2xl font-semibold tabular-nums">
              {correctCount}/{graded.length}
            </span>
            <span className="ml-2 text-muted">
              Score {pct(correctCount, graded.length)}%{timedOut && ' · time ran out and the exam was submitted automatically'}
            </span>
          </p>
          {wrong.length > 0 ? (
            <>
              <h3 className="mb-3 text-sm font-semibold">Review incorrect answers</h3>
              <ol className="space-y-3">
                {wrong.map((g) => (
                  <li key={g.q.card.id} className="rounded-lg border border-border p-3 text-sm">
                    <MarkdownView source={g.q.card.question} className="font-medium" />
                    <p className="mt-2 flex items-start gap-1.5">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                      <span>
                        <span className="text-muted">Your answer: </span>
                        {g.given.trim() ? g.given : <em className="text-muted">No answer</em>}
                      </span>
                    </p>
                    <div className="mt-1 flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      <div className="min-w-0">
                        <span className="text-muted">Correct answer: </span>
                        <MarkdownView source={g.q.card.answer} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-sm text-success">Perfect score — every answer was correct.</p>
          )}
        </div>
      ),
    });
  };

  useEffect(() => {
    if (!endsAt.current) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (endsAt.current && n >= endsAt.current) {
        window.clearInterval(t);
        submit();
      }
    }, 250);
    return () => window.clearInterval(t);
    // submit reads the latest answers through closure on each tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const q = questions[index];
  if (!q) return null;
  const answeredCount = Object.values(answers).filter((a) => a.trim()).length;
  const remaining = endsAt.current ? Math.max(0, endsAt.current - now) : null;
  const setAnswer = (v: string) => setAnswers((a) => ({ ...a, [index]: v }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold" aria-live="polite">
          Question {index + 1} of {questions.length}
        </span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">
            {answeredCount}/{questions.length} answered
          </span>
          {remaining !== null && (
            <span
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono tabular-nums', remaining < 60_000 ? 'bg-danger/10 text-danger' : 'bg-subtle')}
              role="timer"
              aria-label={`Time remaining ${formatClock(remaining)}`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatClock(remaining)}
            </span>
          )}
        </div>
      </div>

      <nav aria-label="Exam questions" className="mb-4 flex flex-wrap gap-1.5">
        {questions.map((_, i) => {
          const done = !!answers[i]?.trim();
          return (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}`}
              className={cn(
                'h-9 min-w-[36px] rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors',
                i === index ? 'border-accent ring-2 ring-accent/30' : 'border-border',
                done ? 'bg-accent-soft text-accent' : 'bg-surface text-muted hover:text-fg',
              )}
            >
              {i + 1}
              {done && <span aria-hidden> ✓</span>}
            </button>
          );
        })}
      </nav>

      <div className="panel flex min-h-[180px] flex-col items-center justify-center px-5 py-8 sm:px-10">
        <CardFace label={q.type === 'choice' ? 'Multiple choice' : 'Written answer'} text={q.card.question} image={q.card.questionImage} />
      </div>

      <div className="mt-4">
        {q.type === 'choice' && q.choice ? (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Answer options">
            {q.choice.options.map((o, i) => {
              const checked = answers[index] === o.text;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setAnswer(o.text)}
                  className={cn(
                    'flex min-h-[56px] items-start gap-3 rounded-xl border bg-surface p-3.5 text-left text-sm transition-colors',
                    checked ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50',
                  )}
                >
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold', checked ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted')}>
                    {i + 1}
                  </span>
                  <MarkdownView source={o.text} className="min-w-0 flex-1" />
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <label htmlFor={`exam-answer-${index}`} className="sr-only">
              Your answer
            </label>
            <input
              id={`exam-answer-${index}`}
              key={index}
              autoFocus
              value={answers[index] ?? ''}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && index < questions.length - 1) {
                  e.preventDefault();
                  setIndex(index + 1);
                }
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Type your answer"
              className="input-base h-12 text-base"
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setIndex(index - 1)} disabled={index === 0}>
            Previous
          </Button>
          <Button variant="outline" onClick={() => setIndex(index + 1)} disabled={index >= questions.length - 1}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <Button icon={<Send className="h-4 w-4" />} onClick={() => (answeredCount < questions.length ? setConfirmOpen(true) : submit())}>
          Submit exam
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        title="Submit with unanswered questions?"
        description={`${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? ' is' : 's are'} still unanswered and will be marked incorrect.`}
        confirmLabel="Submit exam"
      />
    </div>
  );
}
