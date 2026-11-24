import type { ReactNode } from 'react';
import type { Flashcard } from '@/types';

/** Outcome a study mode reports when the learner finishes (or ends early). */
export interface ModeResult {
  total: number;
  correct: number;
  incorrect: number;
  missedCardIds: string[];
  /** Mode-specific summary rendered on the results screen. */
  details?: ReactNode;
}

export interface ModeProps {
  /** Cards to study, already filtered and ordered by the session. */
  cards: Flashcard[];
  /** Every card in the selected decks (used for distractors). */
  pool: Flashcard[];
  deckIds: string[];
  sessionId: string | null;
  onComplete: (result: ModeResult) => void;
}
