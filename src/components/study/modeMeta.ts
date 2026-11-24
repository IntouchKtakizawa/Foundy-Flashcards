import { Brain, Layers, ListChecks, PenLine, Puzzle, Timer, type LucideIcon } from 'lucide-react';
import type { StudyMode } from '@/types';

export interface ModeMeta {
  mode: StudyMode;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const MODE_META: Record<StudyMode, ModeMeta> = {
  srs: { mode: 'srs', label: 'Spaced repetition', description: 'Review what is due, scheduled by FSRS for long-term memory.', icon: Brain },
  classic: { mode: 'classic', label: 'Classic flashcards', description: 'Flip through cards at your own pace.', icon: Layers },
  written: { mode: 'written', label: 'Written answers', description: 'Type each answer and check it against the card.', icon: PenLine },
  choice: { mode: 'choice', label: 'Multiple choice', description: 'Pick the right answer from options drawn from your deck.', icon: ListChecks },
  match: { mode: 'match', label: 'Match', description: 'Pair questions with answers against the clock.', icon: Puzzle },
  exam: { mode: 'exam', label: 'Exam', description: 'A timed test with results and a review of mistakes.', icon: Timer },
};

export const MODE_ORDER: StudyMode[] = ['srs', 'classic', 'written', 'choice', 'match', 'exam'];
