/**
 * QuickImport templates (TXT / CSV / DOCX) and the external-AI prompt.
 * DOCX files are generated in the browser with the `docx` library.
 */

export const AI_PROMPT = `Convert the study material I provide into accurate, concise flashcards. Create one question and answer pair per card. Use the following exact format:
QUESTION: [Question]
ANSWER: [Answer]
Separate each flashcard with a blank line. Do not include introductory text, conclusions or additional commentary. Preserve important terminology, mathematical symbols and scientific notation.`;

export const EXAMPLE_TEXT = `QUESTION: What is osmosis?
ANSWER: The net movement of water molecules through a partially permeable membrane.

QUESTION: What is the charge of a sulfate ion?
ANSWER: 2-

QUESTION: What is the formula for force?
ANSWER: F = ma

QUESTION: What is the function of a ribosome?
ANSWER: Protein synthesis.
HINT: Think about proteins.
EXPLANATION: Ribosomes translate messenger RNA into polypeptide chains.
TAGS: Biology, Cells
`;

export const BLANK_TEXT = `QUESTION:
ANSWER:

QUESTION:
ANSWER:

QUESTION:
ANSWER:
`;

export const EXAMPLE_CSV = `question,answer,hint,explanation,tags
What is osmosis?,The net movement of water molecules through a partially permeable membrane.,,,Biology
What is the charge of a sulfate ion?,2-,,,Chemistry
What is the formula for force?,F = ma,Newton's second law,,Physics
What is the function of a ribosome?,Protein synthesis.,Think about proteins.,Ribosomes translate messenger RNA into polypeptide chains.,"Biology, Cells"
`;

export const BLANK_CSV = `question,answer,hint,explanation,tags
,,,,
`;

export async function buildDocxTemplate(kind: 'blank' | 'example'): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const source = kind === 'example' ? EXAMPLE_TEXT : BLANK_TEXT;
  const paragraphs = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Foundy Flashcards — QuickImport template')] }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Write one card per block. Start each card with QUESTION: and follow it with ANSWER:. HINT:, EXPLANATION: and TAGS: are optional. Leave a blank line between cards. Delete this paragraph and the heading before importing (or leave them — text outside a card is reported and skipped).',
          italics: true,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
    ...source.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })),
  ];
  const doc = new Document({ creator: 'Foundy Flashcards', title: 'QuickImport template', sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}
