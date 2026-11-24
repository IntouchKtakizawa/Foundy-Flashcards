import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, ClipboardCopy, FileDown, FileUp, Info, Layers, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { db } from '@/db/database';
import { bulkAddCards, createDeck, recordImport } from '@/db/repo';
import { useDecks } from '@/state/data';
import { useToast } from '@/state/toast';
import { usePreferences } from '@/state/preferences';
import { parseQuickImport } from '@/lib/parser/quickImport';
import { ACCEPT_ATTR, importFile } from '@/lib/parser/extractors';
import { computeStats, duplicateKey, revalidate } from '@/lib/parser/validate';
import type { DocumentIssue, ParseResult, ParsedCard } from '@/lib/parser/types';
import { studyHref } from '@/lib/study/links';
import { cn, copyText, downloadText, plural } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, PageHeader, Segmented, Stat } from '@/components/ui/misc';
import { FormatGuide } from '@/components/import/FormatGuide';
import { ReviewCardRow, type CardEdit } from '@/components/import/ReviewCardRow';

type Step = 'source' | 'review' | 'done';
type Filter = 'all' | 'valid' | 'invalid' | 'duplicate';
const PAGE = 100;

interface DoneSummary {
  deckId: string;
  deckName: string;
  imported: number;
  skipped: number;
  source: string;
}

export function ImportPage() {
  const [params] = useSearchParams();
  const decks = useDecks();
  const toast = useToast();
  const navigate = useNavigate();
  const { prefs } = usePreferences();

  const [step, setStep] = useState<Step>('source');
  const [tab, setTab] = useState<'paste' | 'file'>('paste');
  const [text, setText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<'existing' | 'new'>('new');
  const [deckId, setDeckId] = useState(params.get('deck') ?? '');
  const [newDeckName, setNewDeckName] = useState('');
  const [deckError, setDeckError] = useState<string | null>(null);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<DoneSummary | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeDecks = useMemo(() => (decks ?? []).filter((d) => !d.archived || d.id === deckId).sort((a, b) => a.name.localeCompare(b.name)), [decks, deckId]);

  useEffect(() => {
    if (params.get('deck')) setTarget('existing');
  }, [params]);

  // Duplicate detection against the chosen destination deck.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (target !== 'existing' || !deckId) {
        setExistingKeys(new Set());
        return;
      }
      const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
      if (!cancelled) setExistingKeys(new Set(deckCards.map((c) => duplicateKey(c.question, c.answer))));
    })();
    return () => {
      cancelled = true;
    };
  }, [target, deckId]);

  // Re-run validation whenever the destination changes, keeping user selection sensible.
  useEffect(() => {
    if (step !== 'review') return;
    setCards((prev) => {
      const next = revalidate(prev, existingKeys);
      setSelected((sel) => {
        const s = new Set<string>();
        for (const c of next) {
          const was = prev.find((p) => p.id === c.id);
          if (c.status === 'valid' && (sel.has(c.id) || was?.status !== 'valid')) s.add(c.id);
          if (c.status === 'duplicate' && sel.has(c.id) && was?.status === 'duplicate') s.add(c.id);
        }
        return s;
      });
      return next;
    });
  }, [existingKeys, step]);

  const loadResult = (r: ParseResult) => {
    const validated = revalidate(r.cards, existingKeys);
    setResult(r);
    setCards(validated);
    setSelected(new Set(validated.filter((c) => c.status === 'valid').map((c) => c.id)));
    setFilter(validated.some((c) => c.status === 'invalid') ? 'all' : 'all');
    setLimit(PAGE);
    if (!params.get('deck')) {
      const suggested = r.suggestedDeckName ?? (r.source !== 'Pasted text' ? r.source.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') : '');
      setNewDeckName((n) => n || suggested);
    }
    if (r.cards.length > 0) setStep('review');
  };

  const parseText = () => {
    setProcessing(true);
    // Yield a frame so the spinner renders for very large pastes.
    setTimeout(() => {
      loadResult(parseQuickImport(text, { source: 'Pasted text', format: 'text' }));
      setProcessing(false);
    }, 10);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      loadResult(await importFile(file));
    } finally {
      setProcessing(false);
    }
  };

  const stats = useMemo(() => computeStats(cards), [cards]);
  const indexById = useMemo(() => new Map(cards.map((c) => [c.id, c.index])), [cards]);
  const filtered = useMemo(() => cards.filter((c) => filter === 'all' || c.status === filter), [cards, filter]);
  const docIssues: DocumentIssue[] = result?.issues ?? [];
  const blockingIssue = result && result.cards.length === 0 ? docIssues.find((i) => i.severity === 'error') : undefined;

  const applyEdit = (id: string, edit: CardEdit) => {
    setCards((prev) => {
      const next = revalidate(
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...edit,
                // The user has now explicitly provided both fields, so structural
                // problems (e.g. a missing QUESTION marker) are resolved.
                errors: [],
                hasQuestionField: true,
                hasAnswerField: true,
              }
            : c,
        ),
        existingKeys,
      );
      const edited = next.find((c) => c.id === id);
      setSelected((s) => {
        const n = new Set(s);
        if (edited?.status === 'valid') n.add(id);
        else n.delete(id);
        return n;
      });
      if (edited) {
        if (edited.status === 'valid') toast.success(`Card #${edited.index} is valid now`);
        else if (edited.status === 'duplicate') toast.info(`Card #${edited.index} duplicates another card`, 'Select it to import it anyway.');
        else toast.error(`Card #${edited.index} still needs fixing`, edited.errors.map((e) => e.message).join(' '));
      }
      return next;
    });
  };

  const removeCard = (id: string) => {
    setCards((prev) => revalidate(prev.filter((c) => c.id !== id), existingKeys));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const skippedContent = () => {
    const parts: string[] = [];
    for (const c of cards) if (!selected.has(c.id) && c.raw) parts.push(c.raw);
    for (const i of docIssues) if (i.content) parts.push(i.content);
    return parts.join('\n\n');
  };

  const errorReport = () => {
    const lines = [
      'Foundy Flashcards — QuickImport report',
      `Source: ${result?.source ?? ''}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `Total cards detected: ${stats.total}`,
      `Valid: ${stats.valid}`,
      `Invalid: ${stats.invalid}`,
      `Duplicates: ${stats.duplicates}`,
      `Selected for import: ${selected.size}`,
      '',
    ];
    if (docIssues.length) {
      lines.push('DOCUMENT ISSUES', '---------------');
      for (const i of docIssues) {
        lines.push(`[${i.severity.toUpperCase()}] ${i.location ? `${i.location}: ` : ''}${i.message}`);
        if (i.content) lines.push(i.content.split('\n').map((l) => `    ${l}`).join('\n'));
      }
      lines.push('');
    }
    const problem = cards.filter((c) => c.status !== 'valid' || c.warnings.length);
    if (problem.length) {
      lines.push('CARDS NEEDING ATTENTION', '-----------------------');
      for (const c of problem) {
        lines.push(`#${c.index} (${c.location}) — ${c.status.toUpperCase()}`);
        for (const e of c.errors) lines.push(`  • ${e.message}`);
        for (const w of c.warnings) lines.push(`  • ${w}`);
        if (c.status === 'duplicate') lines.push(`  • ${c.duplicateOf === 'existing' ? 'Already exists in the destination deck' : `Duplicate of #${indexById.get(c.duplicateOf ?? '') ?? '?'}`}`);
        if (c.raw) lines.push(c.raw.split('\n').map((l) => `    ${l}`).join('\n'));
        lines.push('');
      }
    } else lines.push('No card-level problems were found.');
    return lines.join('\n');
  };

  const doImport = async (onlySelected: boolean) => {
    const toImport = cards.filter((c) => (onlySelected ? selected.has(c.id) : c.status === 'valid'));
    if (!toImport.length) {
      toast.error('Nothing to import', onlySelected ? 'Select at least one valid card.' : 'There are no valid cards yet.');
      return;
    }
    let destId = deckId;
    let destName = decks?.find((d) => d.id === deckId)?.name ?? '';
    if (target === 'new') {
      if (!newDeckName.trim()) {
        setDeckError('Name the new deck.');
        document.getElementById('new-deck-name')?.focus();
        return;
      }
    } else if (!deckId) {
      setDeckError('Choose a deck.');
      return;
    }
    setImporting(true);
    try {
      if (target === 'new') {
        const deck = await createDeck({ name: newDeckName.trim(), description: result?.suggestedDeckDescription ?? '', tags: [] });
        destId = deck.id;
        destName = deck.name;
      }
      const n = await bulkAddCards(
        destId,
        toImport.map((c) => ({ question: c.question, answer: c.answer, hint: c.hint, explanation: c.explanation, tags: c.tags, aliases: c.aliases })),
      );
      const skipped = cards.length - n;
      await recordImport({ source: result?.source ?? 'Pasted text', format: result?.format ?? 'text', deckId: destId, imported: n, skipped });
      setDone({ deckId: destId, deckName: destName, imported: n, skipped, source: result?.source ?? 'Pasted text' });
      setStep('done');
      toast.success(`Imported ${plural(n, 'card')}`, `Added to “${destName}”.`);
    } catch (e) {
      toast.error('Import failed', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('source');
    setResult(null);
    setCards([]);
    setSelected(new Set());
    setDone(null);
    setText('');
    setConfirmCancel(false);
  };

  /* ------------------------------- Step: done ------------------------------ */
  if (step === 'done' && done) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="panel p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Import complete</h1>
          <p className="mt-1 text-sm text-muted">
            {plural(done.imported, 'card')} from <span className="font-medium text-fg">{done.source}</span> added to <span className="font-medium text-fg">“{done.deckName}”</span>.
          </p>
          <dl className="mx-auto mt-6 grid max-w-xs grid-cols-2 gap-3 text-left">
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted">Imported</dt>
              <dd className="text-xl font-semibold tabular-nums text-success">{done.imported}</dd>
            </div>
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted">Not imported</dt>
              <dd className="text-xl font-semibold tabular-nums">{done.skipped}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={reset}>
              Import more
            </Button>
            <Button variant="outline" icon={<Layers className="h-4 w-4" />} onClick={() => navigate(`/decks/${done.deckId}`)}>
              Open deck
            </Button>
            <Button icon={<BookOpen className="h-4 w-4" />} onClick={() => navigate(studyHref({ deckIds: [done.deckId], mode: prefs.defaultStudyMode }))}>
              Study now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Step: review ----------------------------- */
  if (step === 'review' && result) {
    const selectedCount = selected.size;
    return (
      <div>
        <button onClick={() => setConfirmCancel(true)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to source
        </button>
        <PageHeader
          eyebrow="Foundy QuickImport"
          title="Review cards before importing"
          description={
            <>
              Source: <span className="font-medium text-fg">{result.source}</span> · {result.format.toUpperCase()}
            </>
          }
        />

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" aria-live="polite">
          <Stat label="Detected" value={stats.total} />
          <Stat label="Valid" value={<span className="text-success">{stats.valid}</span>} />
          <Stat label="Invalid" value={<span className={stats.invalid ? 'text-danger' : ''}>{stats.invalid}</span>} />
          <Stat label="Duplicates" value={<span className={stats.duplicates ? 'text-warning' : ''}>{stats.duplicates}</span>} />
          <Stat label="Warnings" value={docIssues.filter((i) => i.severity !== 'error').length + cards.reduce((n, c) => n + c.warnings.length, 0)} className="col-span-2 md:col-span-1" />
        </div>

        {docIssues.length > 0 && (
          <div className="mb-4 space-y-2">
            {docIssues.map((i, idx) => (
              <details key={idx} className={cn('rounded-xl border px-4 py-3 text-sm', i.severity === 'error' ? 'border-danger/30 bg-danger/5' : i.severity === 'warning' ? 'border-warning/30 bg-warning/5' : 'border-border bg-subtle/50')}>
                <summary className="flex cursor-pointer list-none items-start gap-2">
                  {i.severity === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden /> : <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', i.severity === 'error' ? 'text-danger' : 'text-warning')} aria-hidden />}
                  <span>
                    {i.location && <span className="font-medium">{i.location}: </span>}
                    {i.message}
                    {i.content && <span className="ml-1 text-xs text-accent underline">Show text</span>}
                  </span>
                </summary>
                {i.content && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-mono text-xs text-muted">{i.content}</pre>}
              </details>
            ))}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Detected cards" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented
                size="sm"
                label="Show cards"
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setLimit(PAGE);
                }}
                options={[
                  { value: 'all', label: `All ${stats.total}` },
                  { value: 'valid', label: `Valid ${stats.valid}` },
                  { value: 'invalid', label: `Invalid ${stats.invalid}` },
                  { value: 'duplicate', label: `Duplicates ${stats.duplicates}` },
                ]}
              />
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(cards.filter((c) => c.status === 'valid').map((c) => c.id)))}>
                  Select all valid
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Deselect all
                </Button>
                {stats.duplicates > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setCards((prev) => revalidate(prev.filter((c) => c.status !== 'duplicate'), existingKeys))}>
                    Remove duplicates
                  </Button>
                )}
              </div>
            </div>
            <div className="panel overflow-hidden">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">No cards in this view.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {filtered.slice(0, limit).map((c) => (
                    <ReviewCardRow
                      key={c.id + c.status + c.question.length + c.answer.length}
                      card={c}
                      selected={selected.has(c.id)}
                      duplicateOfIndex={c.duplicateOf && c.duplicateOf !== 'existing' ? indexById.get(c.duplicateOf) ?? null : null}
                      onSelect={(v) => {
                        if (c.status === 'invalid') return;
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(c.id);
                          else n.delete(c.id);
                          return n;
                        });
                      }}
                      onSave={(edit) => applyEdit(c.id, edit)}
                      onRemove={() => removeCard(c.id)}
                    />
                  ))}
                </ol>
              )}
              {filtered.length > limit && (
                <div className="border-t border-border p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length - limit} remaining
                  </Button>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start" aria-label="Import destination">
            <div className="panel space-y-4 p-5">
              <h2 className="text-sm font-semibold">Import into</h2>
              <Segmented
                label="Destination"
                value={target}
                onChange={(v) => {
                  setTarget(v);
                  setDeckError(null);
                }}
                options={[
                  { value: 'new', label: 'New deck' },
                  { value: 'existing', label: 'Existing deck' },
                ]}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
              />
              {target === 'new' ? (
                <Input id="new-deck-name" label="Deck name" value={newDeckName} error={deckError} placeholder="e.g. Biology — Cells" onChange={(e) => { setNewDeckName(e.target.value); setDeckError(null); }} />
              ) : activeDecks.length ? (
                <Select label="Deck" value={deckId} onChange={(e) => { setDeckId(e.target.value); setDeckError(null); }}>
                  <option value="">Choose a deck…</option>
                  {activeDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-muted">You don’t have any decks yet — create a new one.</p>
              )}
              {deckError && target === 'existing' && (
                <p role="alert" className="text-xs font-medium text-danger">
                  {deckError}
                </p>
              )}
              {target === 'existing' && deckId && existingKeys.size > 0 && <p className="text-xs text-muted">Cards already in this deck are flagged as duplicates.</p>}
              <div className="space-y-2 border-t border-border pt-4">
                <Button className="w-full" loading={importing} disabled={!selectedCount} onClick={() => doImport(true)}>
                  Import {plural(selectedCount, 'selected card')}
                </Button>
                <Button className="w-full" variant="outline" disabled={!stats.valid || importing} onClick={() => doImport(false)}>
                  Import all {stats.valid} valid
                </Button>
              </div>
            </div>
            <div className="panel space-y-1 p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                icon={<FileDown className="h-4 w-4" />}
                onClick={() => downloadText(errorReport(), `foundy-import-report-${new Date().toISOString().slice(0, 10)}.txt`)}
              >
                Download error report
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                icon={<ClipboardCopy className="h-4 w-4" />}
                onClick={async () => {
                  const t = skippedContent();
                  if (!t) toast.info('Nothing is being skipped');
                  else if (await copyText(t)) toast.success('Skipped content copied', 'Fix it in your editor and import again.');
                  else toast.error('Copy failed');
                }}
              >
                Copy skipped content
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start text-danger hover:text-danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setConfirmCancel(true)}>
                Cancel import
              </Button>
            </div>
          </aside>
        </div>

        <ConfirmDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          title="Cancel this import?"
          confirmLabel="Discard"
          destructive
          description="Nothing has been imported yet. Any fixes you made in the review will be lost."
          onConfirm={reset}
        />
      </div>
    );
  }

  /* ------------------------------ Step: source ----------------------------- */
  return (
    <div>
      <PageHeader eyebrow="Foundy QuickImport" title="Import cards" description="Turn a whole document into flashcards in one go. Files are processed entirely in your browser." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Segmented
            label="Import source"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'paste', label: 'Paste text', icon: <ClipboardCopy className="h-4 w-4" aria-hidden /> },
              { value: 'file', label: 'Upload file', icon: <FileUp className="h-4 w-4" aria-hidden /> },
            ]}
          />

          {blockingIssue && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="font-medium">{result?.source ? `Couldn’t import from “${result.source}”` : 'Nothing to import'}</p>
                <p className="mt-0.5 text-muted">{blockingIssue.message}</p>
                {docIssues
                  .filter((i) => i !== blockingIssue && i.content)
                  .slice(0, 1)
                  .map((i) => (
                    <pre key="c" className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 font-mono text-xs text-muted">
                      {i.content}
                    </pre>
                  ))}
              </div>
            </div>
          )}

          {tab === 'paste' ? (
            <div className="panel p-5">
              <Textarea
                label="Paste your questions and answers"
                rows={16}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="font-mono text-[13px]"
                placeholder={'QUESTION: What is osmosis?\nANSWER: The net movement of water molecules through a partially permeable membrane.\n\nQUESTION: What is the formula for force?\nANSWER: F = ma'}
                spellCheck={false}
                hint={text ? `${text.split(/\r?\n/).length.toLocaleString()} lines` : 'Tip: ask an AI assistant to format your notes with the prompt on the right.'}
              />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {text && (
                  <Button variant="ghost" onClick={() => setText('')}>
                    Clear
                  </Button>
                )}
                <Button onClick={parseText} loading={processing} disabled={!text.trim()}>
                  Detect cards
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn('panel flex flex-col items-center justify-center border-2 border-dashed p-10 text-center transition-colors', dragOver ? 'border-accent bg-accent-soft/50' : 'border-border')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
            >
              {processing ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
                  <p className="mt-3 text-sm font-medium" role="status">
                    Reading your file…
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <Upload className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="mt-4 text-sm font-medium">Drag and drop a file here</p>
                  <p className="mt-1 text-xs text-muted">TXT, Markdown, Word (.docx), PDF (with selectable text), CSV or Foundy JSON · up to 25 MB</p>
                  <Button className="mt-4" variant="outline" onClick={() => fileRef.current?.click()}>
                    Choose file
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    aria-label="Choose a file to import"
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-subtle/50 p-4 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <p>
              Your documents never leave this device. Text is extracted locally (PDF.js and Mammoth run in your browser) and nothing is uploaded. Scanned PDFs without selectable text need OCR first. You’ll review every card before anything is saved.
            </p>
          </div>
          {decks && decks.length > 0 && params.get('deck') && (
            <p className="text-sm text-muted">
              Importing into <Badge tone="accent">{decks.find((d) => d.id === params.get('deck'))?.name ?? 'selected deck'}</Badge> — you can change this in the next step.
            </p>
          )}
        </div>
        <FormatGuide />
      </div>
    </div>
  );
}
