import type { ImportFormat } from '@/types';

export type CardErrorCode =
  | 'missing-question'
  | 'missing-answer'
  | 'empty-question'
  | 'empty-answer'
  | 'orphan-metadata'
  | 'field-too-long'
  | 'malformed';

export interface CardIssue {
  code: CardErrorCode;
  message: string;
}

export type ParsedCardStatus = 'valid' | 'invalid' | 'duplicate';

export interface ParsedCard {
  /** Temporary id used by the review UI. */
  id: string;
  /** 1-based order of the block in the source. */
  index: number;
  question: string;
  answer: string;
  hint: string;
  explanation: string;
  tags: string[];
  aliases: string[];
  /** Human-readable location, e.g. "Lines 4–7" or "Row 12". */
  location: string;
  startLine: number | null;
  endLine: number | null;
  /** Original source text for this block (used for "copy skipped content"). */
  raw: string;
  errors: CardIssue[];
  warnings: string[];
  status: ParsedCardStatus;
  /** id of the card this duplicates, or "existing" for a card already in the deck. */
  duplicateOf: string | null;
  /** Fields present in the source (not just non-empty), used for validation. */
  hasQuestionField: boolean;
  hasAnswerField: boolean;
}

export type DocumentIssueCode =
  | 'empty-document'
  | 'no-cards-found'
  | 'unrecognised-content'
  | 'unsupported-format'
  | 'extraction-failed'
  | 'scanned-pdf'
  | 'file-too-large'
  | 'invalid-json'
  | 'truncated';

export interface DocumentIssue {
  code: DocumentIssueCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  /** Source text that was not turned into a card. */
  content?: string;
}

export interface ParseStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

export interface ParseResult {
  cards: ParsedCard[];
  issues: DocumentIssue[];
  stats: ParseStats;
  /** Suggested deck name (from a JSON deck file or the file name). */
  suggestedDeckName?: string;
  suggestedDeckDescription?: string;
  format: ImportFormat;
  source: string;
}

export interface ParseOptions {
  /** Keys (see duplicateKey) of cards already in the target deck. */
  existingKeys?: Set<string>;
  /** Allow the short `Q:` / `A:` markers. Default: auto-detect. */
  shortMarkers?: boolean | 'auto';
  /** Hard cap on cards processed from one document. */
  maxCards?: number;
}

export const MAX_FIELD_LENGTH = 20_000;
export const MAX_CARDS_PER_IMPORT = 10_000;
