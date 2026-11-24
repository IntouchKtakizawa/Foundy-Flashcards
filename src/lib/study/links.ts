import type { StudyMode } from '@/types';

export interface StudyLinkOptions {
  deckIds: string[];
  mode: StudyMode;
  /** Restrict the session to these cards (e.g. "revise incorrect cards"). */
  cardIds?: string[];
  /** Only cards marked for additional revision. */
  flaggedOnly?: boolean;
}

/**
 * Canonical URL for a study session:
 *   /study/session?decks=a,b&mode=srs[&cards=x,y][&flagged=1]
 */
export function studyHref({ deckIds, mode, cardIds, flaggedOnly }: StudyLinkOptions): string {
  const p = new URLSearchParams();
  p.set('decks', deckIds.join(','));
  p.set('mode', mode);
  if (cardIds?.length) p.set('cards', cardIds.join(','));
  if (flaggedOnly) p.set('flagged', '1');
  return `/study/session?${p.toString()}`;
}

export function parseStudyParams(search: URLSearchParams): StudyLinkOptions {
  const modes: StudyMode[] = ['classic', 'srs', 'written', 'choice', 'match', 'exam'];
  const m = search.get('mode') as StudyMode | null;
  return {
    deckIds: (search.get('decks') ?? '').split(',').filter(Boolean),
    mode: m && modes.includes(m) ? m : 'srs',
    cardIds: (search.get('cards') ?? '').split(',').filter(Boolean),
    flaggedOnly: search.get('flagged') === '1',
  };
}
