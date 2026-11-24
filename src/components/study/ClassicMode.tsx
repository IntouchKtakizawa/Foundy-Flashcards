import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Flag, Lightbulb, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/misc';
import { logReview, setCardFlag } from '@/db/repo';
import { usePreferences } from '@/state/preferences';
import { cn, shuffle } from '@/lib/utils';
import type { Flashcard } from '@/types';
import { CardFace, Explanation, HintBox, ModeProgress } from './CardFace';
import { useStudyKeys } from './useStudyKeys';
import type { ModeProps } from './types';

export function ClassicMode({ cards, sessionId, onComplete }: ModeProps) {
  const { reducedMotion, prefs } = usePreferences();
  const [order, setOrder] = useState<Flashcard[]>(cards);
  const [shuffled, setShuffled] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [assess, setAssess] = useState<Record<string, boolean>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(cards.map((c) => [c.id, !!c.flagged])));
  const viewStart = useRef(Date.now());
  const viewed = useRef(new Set<string>());

  const card = order[index];

  useEffect(() => {
    setFlipped(false);
    setShowHint(false);
    viewStart.current = Date.now();
    if (card) viewed.current.add(card.id);
  }, [index, order, card]);

  const finishWith = (map: Record<string, boolean>) => {
    const ids = Object.keys(map);
    const correct = ids.filter((id) => map[id]).length;
    onComplete({
      total: Math.max(ids.length, viewed.current.size),
      correct,
      incorrect: ids.length - correct,
      missedCardIds: ids.filter((id) => !map[id]),
    });
  };

  const go = (delta: number) => setIndex((i) => Math.min(order.length - 1, Math.max(0, i + delta)));
  const flip = () => setFlipped((f) => !f);

  const toggleShuffle = () => {
    const next = !shuffled;
    setShuffled(next);
    setOrder(next ? shuffle(cards) : cards);
    setIndex(0);
  };

  const toggleFlag = async () => {
    const next = !flags[card.id];
    setFlags((f) => ({ ...f, [card.id]: next }));
    await setCardFlag(card.id, next);
  };

  const rate = (ok: boolean) => {
    const first = !(card.id in assess);
    const map = { ...assess, [card.id]: ok };
    setAssess(map);
    if (first) {
      void logReview({ cardId: card.id, deckId: card.deckId, sessionId, mode: 'classic', correct: ok, durationMs: Date.now() - viewStart.current });
    }
    if (index < order.length - 1) setIndex(index + 1);
    else if (Object.keys(map).length >= order.length) finishWith(map);
  };

  useStudyKeys((e) => {
    if (!card) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flip();
    } else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (k === 'f') void toggleFlag();
    else if (k === 'h' && card.hint) setShowHint(true);
    else if (flipped && e.key === '1') rate(false);
    else if (flipped && e.key === '2') rate(true);
  });

  if (!card) return null;

  const front = reversed ? { label: 'Answer', text: card.answer, image: card.answerImage } : { label: 'Question', text: card.question, image: card.questionImage };
  const back = reversed ? { label: 'Question', text: card.question, image: card.questionImage } : { label: 'Answer', text: card.answer, image: card.answerImage };

  const assessed = Object.keys(assess).length;
  const faceClass = 'flex min-h-[260px] flex-col items-center justify-center px-5 py-8 sm:min-h-[320px] sm:px-10';
  const cardLabel = flipped ? `${back.label} side. Activate to show the ${front.label.toLowerCase()}.` : `${front.label} side. Activate to reveal the ${back.label.toLowerCase()}.`;

  const onCardKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  };

  return (
    <div>
      <ModeProgress
        current={index}
        total={order.length}
        right={
          <span>
            {assessed} assessed{flags[card.id] && <span className="ml-2 text-warning">· Marked for revision</span>}
          </span>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={shuffled ? 'soft' : 'outline'} icon={<Shuffle className="h-3.5 w-3.5" />} onClick={toggleShuffle} aria-pressed={shuffled}>
          Shuffle
        </Button>
        <Button size="sm" variant={reversed ? 'soft' : 'outline'} icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => setReversed((r) => !r)} aria-pressed={reversed}>
          Answer first
        </Button>
        <Button size="sm" variant={flags[card.id] ? 'soft' : 'outline'} icon={<Flag className="h-3.5 w-3.5" />} onClick={toggleFlag} aria-pressed={!!flags[card.id]}>
          {flags[card.id] ? 'Marked for revision' : 'Mark for revision'}
        </Button>
      </div>

      {reducedMotion ? (
        <div role="button" tabIndex={0} aria-label={cardLabel} onClick={flip} onKeyDown={onCardKey} className="panel cursor-pointer select-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${card.id}-${flipped}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className={faceClass}>
              {flipped ? (
                <CardFace label={back.label} text={back.text} image={back.image}>
                  <Explanation text={card.explanation} />
                </CardFace>
              ) : (
                <CardFace label={front.label} text={front.text} image={front.image} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="flip-scene">
          <div role="button" tabIndex={0} aria-label={cardLabel} onClick={flip} onKeyDown={onCardKey} className={cn('flip-card grid cursor-pointer select-none rounded-xl', flipped && 'is-flipped')}>
            <div className={cn('flip-face panel [grid-area:1/1]', faceClass)} aria-hidden={flipped}>
              <CardFace label={front.label} text={front.text} image={front.image} />
            </div>
            <div className={cn('flip-face flip-back panel [grid-area:1/1]', faceClass)} aria-hidden={!flipped}>
              <CardFace label={back.label} text={back.text} image={back.image}>
                <Explanation text={card.explanation} />
              </CardFace>
            </div>
          </div>
        </div>
      )}

      {showHint && card.hint && <HintBox text={card.hint} />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous card">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => go(1)} disabled={index >= order.length - 1} aria-label="Next card">
            <ChevronRight className="h-5 w-5" />
          </Button>
          {card.hint && !showHint && (
            <Button variant="ghost" size="sm" icon={<Lightbulb className="h-4 w-4" />} onClick={() => setShowHint(true)}>
              Hint
            </Button>
          )}
        </div>

        {flipped ? (
          <div className="flex flex-1 flex-wrap justify-end gap-2" aria-label="How did you do?">
            <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => rate(false)} className="min-w-[140px]">
              Still learning
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => rate(true)} className="min-w-[140px]">
              Got it
            </Button>
          </div>
        ) : (
          <Button onClick={flip} className="min-w-[160px]">
            Show {back.label.toLowerCase()}
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {prefs.keyboardShortcuts ? (
          <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:flex">
            <span><Kbd>Space</Kbd> flip</span>
            <span><Kbd>←</Kbd> <Kbd>→</Kbd> navigate</span>
            <span><Kbd>1</Kbd> still learning</span>
            <span><Kbd>2</Kbd> got it</span>
            <span><Kbd>F</Kbd> mark</span>
            <span><Kbd>H</Kbd> hint</span>
          </p>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={() => finishWith(assess)}>
          Finish session
        </Button>
      </div>
    </div>
  );
}
