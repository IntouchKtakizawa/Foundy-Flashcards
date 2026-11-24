import { bulkAddCards, createDeck } from '@/db/repo';
import { parseQuickImport } from '@/lib/parser/quickImport';

/**
 * Optional starter deck the user can create from onboarding. It is real,
 * editable user data (created only when the user asks) — not fake stats.
 */
const SAMPLE = `QUESTION: What does Foundy's spaced repetition do?
ANSWER: Schedules each card just before you are likely to forget it, using the FSRS algorithm.
TAGS: Getting started

QUESTION: How do you reveal the answer in classic mode?
ANSWER: Click the card or press **Space**.
TAGS: Getting started

QUESTION: What format does QuickImport understand?
ANSWER: \`QUESTION:\` followed by \`ANSWER:\`, with a blank line between cards.
HINT: Two markers.
TAGS: Getting started

QUESTION: What is osmosis?
ANSWER: The net movement of water molecules through a partially permeable membrane.
TAGS: Biology

QUESTION: What is the formula for force?
ANSWER: $F = ma$
EXPLANATION: Newton's second law: force equals mass times acceleration.
TAGS: Physics

QUESTION: What is the charge of a sulfate ion?
ANSWER: 2-
ALIASES: -2 | 2−
TAGS: Chemistry

QUESTION: Solve for $x$: $x^2 = 9$
ANSWER: $x = \\pm 3$
ALIASES: 3 or -3 | +/-3 | ±3
TAGS: Maths

QUESTION: Where is your data stored?
ANSWER: Only on this device, in your browser's IndexedDB. Export backups regularly.
TAGS: Getting started
`;

export async function createSampleDeck(): Promise<string> {
  const deck = await createDeck({
    name: 'Welcome to Foundy',
    description: 'A short starter deck that shows Markdown, maths and QuickImport. Edit or delete it any time.',
    color: 'orange',
    icon: 'graduation-cap',
    tags: ['Getting started'],
  });
  const parsed = parseQuickImport(SAMPLE);
  await bulkAddCards(
    deck.id,
    parsed.cards
      .filter((c) => c.status === 'valid')
      .map((c) => ({ question: c.question, answer: c.answer, hint: c.hint, explanation: c.explanation, tags: c.tags, aliases: c.aliases })),
  );
  return deck.id;
}
