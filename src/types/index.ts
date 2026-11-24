/**
 * Core domain types for Foundy Flashcards.
 *
 * All timestamps are epoch milliseconds (numbers) so they can be indexed by
 * IndexedDB and serialised to JSON backups without loss.
 */

export type ID = string;

export const DECK_COLORS = [
  'violet',
  'indigo',
  'blue',
  'sky',
  'teal',
  'emerald',
  'lime',
  'amber',
  'orange',
  'rose',
  'pink',
  'slate',
] as const;
export type DeckColor = (typeof DECK_COLORS)[number];

export const DECK_ICONS = [
  'book',
  'brain',
  'flask',
  'atom',
  'calculator',
  'globe',
  'languages',
  'music',
  'palette',
  'code',
  'landmark',
  'heart-pulse',
  'leaf',
  'scale',
  'sigma',
  'graduation-cap',
] as const;
export type DeckIcon = (typeof DECK_ICONS)[number];

export interface Folder {
  id: ID;
  name: string;
  color: DeckColor;
  createdAt: number;
  updatedAt: number;
}

export interface Deck {
  id: ID;
  name: string;
  description: string;
  color: DeckColor;
  icon: DeckIcon;
  folderId: ID | null;
  tags: string[];
  archived: 0 | 1; // numeric so it can be indexed
  createdAt: number;
  updatedAt: number;
  lastStudiedAt: number | null;
  lastOpenedAt: number | null;
}

/** FSRS scheduling state, mirrored from ts-fsrs with numeric dates. */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: 0 | 1 | 2 | 3;
  lastReview: number | null;
}

export interface Flashcard {
  id: ID;
  deckId: ID;
  question: string;
  answer: string;
  explanation: string;
  hint: string;
  tags: string[];
  /** Accepted alternative answers for written mode. */
  aliases: string[];
  /** Images stored inline as data URLs so they survive offline + backups. */
  questionImage: string | null;
  answerImage: string | null;
  position: number;
  flagged: 0 | 1; // marked for additional revision
  srs: SrsState;
  /** Denormalised for fast "due" queries. */
  due: number;
  createdAt: number;
  updatedAt: number;
}

export type StudyMode = 'classic' | 'srs' | 'written' | 'choice' | 'match' | 'exam';

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  classic: 'Classic flashcards',
  srs: 'Spaced repetition',
  written: 'Written answers',
  choice: 'Multiple choice',
  match: 'Match',
  exam: 'Exam',
};

/** 1 Again, 2 Hard, 3 Good, 4 Easy (matches FSRS Rating). */
export type Grade = 1 | 2 | 3 | 4;

export interface ReviewLog {
  id: ID;
  cardId: ID;
  deckId: ID;
  sessionId: ID | null;
  mode: StudyMode;
  correct: boolean;
  /** Only for spaced-repetition reviews. */
  grade: Grade | null;
  /** Milliseconds spent on the card. */
  durationMs: number;
  reviewedAt: number;
  /** Snapshot of scheduling before the review (srs mode), for analytics. */
  prevState: SrsState['state'] | null;
  scheduledDays: number | null;
}

export interface StudySession {
  id: ID;
  deckIds: ID[];
  mode: StudyMode;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  total: number;
  correct: number;
  incorrect: number;
  missedCardIds: ID[];
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type AccentColor = 'violet' | 'indigo' | 'blue' | 'teal' | 'rose' | 'amber';
export type CardOrder = 'original' | 'shuffled' | 'difficult-first';
export type AnswerSensitivity = 'strict' | 'normal' | 'lenient';
export type MotionPreference = 'system' | 'full' | 'reduced';

export interface Preferences {
  theme: ThemePreference;
  accent: AccentColor;
  defaultStudyMode: StudyMode;
  dailyTarget: number;
  cardOrder: CardOrder;
  answerSensitivity: AnswerSensitivity;
  ignorePunctuation: boolean;
  motion: MotionPreference;
  keyboardShortcuts: boolean;
  desiredRetention: number;
  newCardsPerDay: number;
  deckView: 'grid' | 'list';
  sidebarCollapsed: boolean;
  onboardingDismissed: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  accent: 'violet',
  defaultStudyMode: 'srs',
  dailyTarget: 30,
  cardOrder: 'original',
  answerSensitivity: 'normal',
  ignorePunctuation: true,
  motion: 'system',
  keyboardShortcuts: true,
  desiredRetention: 0.9,
  newCardsPerDay: 20,
  deckView: 'grid',
  sidebarCollapsed: false,
  onboardingDismissed: false,
};

export interface PreferencesRecord extends Preferences {
  id: 'preferences';
}

export interface ImportHistoryEntry {
  id: ID;
  source: string;
  format: ImportFormat;
  deckId: ID;
  imported: number;
  skipped: number;
  createdAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export type ImportFormat = 'text' | 'txt' | 'md' | 'docx' | 'pdf' | 'csv' | 'json';
