# Foundy QuickImport — parser architecture

QuickImport turns a document into flashcards without AI. It is deterministic (the same input always gives the same output), runs entirely in the browser, and is built so that one mistake can never cost the user the rest of their document.

## Pipeline

```text
File / pasted text
   │
   ▼
extractors.ts   detect format → read locally → extract text
   │              txt/md: File.text()      docx: Mammoth (raw text)
   │              pdf: PDF.js (lines rebuilt from text runs)
   │              csv: Papa Parse → csv.ts       json: foundyJson.ts
   ▼
quickImport.ts  normalise → line-based state machine → blocks → ParsedCard[]
   ▼
validate.ts     per-card validation + duplicate detection (pure, re-runnable)
   ▼
Import page     review, fix, select, choose destination → bulkAddCards()
```

Every stage returns data, never throws to the UI: extraction failures, unsupported formats, empty documents, oversized files and scanned PDFs become `DocumentIssue`s with a clear message.

## Normalisation

- Strip a leading BOM, convert `\r\n` and `\r` (and Unicode line/paragraph separators) to `\n`.
- Remove zero-width characters at the start of lines (common in Word exports) and turn non-breaking spaces into spaces.
- Content is otherwise preserved byte-for-byte: Unicode, mathematical symbols, TeX and Markdown are untouched.

## Marker recognition

A line is a marker when it matches:

```text
[list/heading/quote prefix] [emphasis] WORD [number] [emphasis] : [emphasis] rest
```

- `WORD` is one of `QUESTION`, `ANSWER`, `HINT`, `EXPLANATION`/`EXPLAIN`, `TAGS`/`TAG`, `ALIASES`/`ALIAS` — case-insensitive.
- Spaces around the colon are optional; the full-width colon `：` is accepted.
- Prefixes such as `1.`, `-`, `*`, `>`, `##` and emphasis such as `**Question:**` are tolerated so documents exported from Word, Markdown editors or AI chats work unchanged.
- Short `Q:` / `A:` markers are honoured only when the document contains at least one `Q:` line. This prevents an answer like `A: Oxygen` inside a long-form answer from being misread as a marker.
- Any other line — including ordinary sentences with colons such as `Note: …` — is content.

## State machine

The parser walks the document once, line by line, holding at most one *open block*.

| Line | Action |
| --- | --- |
| `QUESTION` | Close the open block; open a new block with this question. |
| `ANSWER` | If the open block has a question and no answer yet, fill it. **Otherwise close the open block and open a new orphan block** containing only this answer. |
| `HINT` / `EXPLANATION` / `TAGS` / `ALIASES` | Attach to the open block. With no open block, open an orphan-metadata block so the text is reported rather than lost. Repeats are merged with a warning. |
| other text | Append to the last field of the open block (multiline support). With no open block, collect it as *unrecognised content* and report it with its line range. |

Key guarantees that follow from these rules:

- **A later answer can never attach to an earlier incomplete question.** A `QUESTION` always closes the previous block, so `QUESTION A / QUESTION B / ANSWER b` yields "A — missing answer" and "B — b".
- **A second answer never overwrites the first.** It becomes its own orphan block (missing question).
- **Malformed blocks are isolated.** Each block is closed independently, so an error affects only that block. A document with 100 cards and 7 broken ones yields 93 valid cards and 7 reported ones.
- **Nothing is silently discarded.** Every line ends up in a card or in an `unrecognised-content` issue, and the raw source of every block is kept for "Copy skipped content" and the error report.

Field values are tidied: trailing whitespace is trimmed per line, leading/trailing blank lines are removed, and runs of blank lines collapse to a single blank line (paragraphs are preserved). Indentation inside a field is kept so code blocks survive.

## Validation (`validate.ts`)

`revalidate(cards, existingKeys)` is pure and runs after parsing, after every edit in the review screen and whenever the destination deck changes.

| Code | Meaning |
| --- | --- |
| `missing-question` | An ANSWER appeared without a QUESTION. |
| `missing-answer` | A QUESTION has no ANSWER. |
| `empty-question` / `empty-answer` | The marker exists but has no text. |
| `orphan-metadata` | HINT/EXPLANATION/TAGS with no question. |
| `field-too-long` | A field exceeds 20,000 characters. |
| `malformed` | A JSON entry is not a card object. |

Cards that pass are `valid`. Duplicates are detected with a normalised key (Unicode NFKC, case-folded, whitespace-collapsed question + answer):

- later copies inside the same document → `duplicate` with `duplicateOf` pointing to the first;
- cards already in the chosen destination deck → `duplicate` with `duplicateOf: "existing"`.

Duplicates are not selected by default but can be imported deliberately. The parser never judges factual correctness.

## Limits and safety

- Files over 25 MB are rejected with an explanation; at most 10,000 cards are processed per document (with a warning).
- PDF.js runs with `isEvalSupported: false`; extracted text is treated as plain text.
- Nothing from an imported document is executed. Rendering goes through `renderMarkdown`, which sanitises with DOMPurify.
- PDFs with no extractable text produce a `scanned-pdf` issue explaining that OCR is required.

## Tests

`src/lib/parser/quickImport.test.ts` and `formats.test.ts` cover: a single card, multiple cards, missing answers between valid cards, missing questions, multiline fields, duplicates (in-file and existing), mixed capitalisation, extra whitespace, Windows/Mac line endings, Unicode and maths, Markdown, empty and marker-less documents, orphan metadata, stray text, short markers, numbered/bold markers, the 100-cards-with-7-errors scenario, revalidation after a fix, text export round-trips, CSV, JSON and file-level failures.
