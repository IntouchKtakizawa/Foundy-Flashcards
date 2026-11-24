import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Kbd } from '@/components/ui/misc';
import { applySrsReview, setCardFlag } from '@/db/repo';
import { GRADES, GRADE_LABELS, previewIntervals } from '@/lib/srs/fsrs';
import { cn, formatInterval } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import type { Flashcard, Grade } from '@/types';
import { CardFace, Explanation, HintBox, ModeProgress } from './CardFace';
import { useStudyKeys } from './useStudyKeys';
import type { ModeProps } from './types';

/** Cards relearned again within this window are re-shown in the same session. */
const REQUEUE_WINDOW_MS = 20 * 60 * 1000;

const STATE_LABEL = ['New', 'Learning', 'Review', 'Relearning'] as const;

const GRADE_STYLE: Record<Grade, string> = {
  1: 'border-danger/40 text-danger hover:bg-danger/10',
  2: 'border-warning/40 text-warning hover:bg-warning/10',
  3: 'border-success/40 text-success hover:bg-success/10',
  4: 'border-accent/40 text-accent hover:bg-accent-soft',
};

export function SrsMode({ cards, sessionId, onComplete }: ModeProps) {
  const { prefs } = usePreferences();
  const toast = useToast();
  const [queue, setQueue] = useState<Flashcard[]>(cards);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(cards.map((c) => [c.id, !!c.flagged])));
  const firstGrade = useRef(new Map<string, Grade>());
  const lapsed = useRef(new Set<string>());
  const shownAt = useRef(Date.now());

  const card = queue[pos];
  const uniqueTotal = cards.length;

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    setShowHint(false);
  }, [pos]);

  const previews = useMemo(() => (card && revealed ? previewIntervals(card.srs, Date.now(), prefs.desiredRetention) : null), [card, revealed, prefs.desiredRetention]);

  const finish = () => {
    const grades = [...firstGrade.current.values()];
    const incorrect = grades.filter((g) => g === 1).length;
    onComplete({
      total: grades.length,
      correct: grades.length - incorrect,
      incorrect,
      missedCardIds: [...lapsed.current],
    });
  };

  const grade = async (g: Grade) => {
    if (!card || !revealed || busy) return;
    setBusy(true);
    try {
      const updated = await applySrsReview(card, g, { sessionId, durationMs: Date.now() - shownAt.current, retention: prefs.desiredRetention });
      if (!firstGrade.current.has(card.id)) firstGrade.current.set(card.id, g);
      if (g === 1) lapsed.current.add(card.id);
      let next = queue;
      if (updated.due - Date.now() < REQUEUE_WINDOW_MS) {
        next = [...queue, updated];
        setQueue(next);
      }
      if (pos + 1 >= next.length) finish();
      else setPos(pos + 1);
    } catch (e) {
      toast.error('Could not save this review', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const toggleFlag = async () => {
    if (!card) return;
    const next = !flags[card.id];
    setFlags((f) => ({ ...f, [card.id]: next }));
    await setCardFlag(card.id, next);
  };

  useStudyKeys((e) => {
    if (!card) return;
    const k = e.key.toLowerCase();
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      setRevealed(true);
    } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      void grade(Number(e.key) as Grade);
    } else if (revealed && e.key === ' ') {
      e.preventDefault();
      void grade(3);
    } else if (k === 'h' && card.hint) setShowHint(true);
    else if (k === 'f') void toggleFlag();
  });

  if (!card) return null;

  return (
    <div>
      <ModeProgress
        current={Math.min(firstGrade.current.size, uniqueTotal - 1)}
        total={uniqueTotal}
        label="Reviewed"
        right={<span>{queue.length - pos} left in queue</span>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={card.srs.state === 0 ? 'accent' : card.srs.state === 2 ? 'success' : 'warning'}>{STATE_LABEL[card.srs.state]}</Badge>
        {card.srs.lapses > 0 && <Badge tone="danger">{card.srs.lapses} lapse{card.srs.lapses === 1 ? '' : 's'}</Badge>}
        <div className="ml-auto flex gap-2">
          {card.hint && !showHint && (
            <Button variant="ghost" size="sm" icon={<Lightbulb className="h-4 w-4" />} onClick={() => setShowHint(true)}>
              Hint
            </Button>
          )}
          <Button size="sm" variant={flags[card.id] ? 'soft' : 'ghost'} icon={<Flag className="h-3.5 w-3.5" />} onClick={toggleFlag} aria-pressed={!!flags[card.id]}>
            {flags[card.id] ? 'Marked' : 'Mark'}
          </Button>
        </div>
      </div>

      <div className="panel flex min-h-[280px] flex-col items-center justify-center px-5 py-8 sm:px-10">
        <CardFace label="Question" text={card.question} image={card.questionImage} />
        {showHint && card.hint && <HintBox text={card.hint} />}
        {revealed && (
          <div className="mt-6 w-full border-t border-border pt-6" aria-live="polite">
            <CardFace label="Answer" text={card.answer} image={card.answerImage}>
              <Explanation text={card.explanation} />
            </CardFace>
          </div>
        )}
      </div>

      <div className="mt-4">
        {!revealed ? (
          <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="How well did you remember?">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                disabled={busy}
                onClick={() => grade(g)}
                className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-xl border bg-surface px-3 py-2 transition-colors disabled:opacity-50', GRADE_STYLE[g])}
              >
                <span className="text-sm font-semibold">{GRADE_LABELS[g]}</span>
                <span className="text-xs text-muted">
                  {previews ? formatInterval(previews[g].intervalMs) : ''}
                  {prefs.keyboardShortcuts && <span className="ml-1.5 hidden sm:inline">· {g}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {prefs.keyboardShortcuts ? (
          <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:flex">
            <span><Kbd>Space</Kbd> reveal</span>
            <span><Kbd>1</Kbd>–<Kbd>4</Kbd> grade</span>
            <span><Kbd>H</Kbd> hint</span>
            <span><Kbd>F</Kbd> mark</span>
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
