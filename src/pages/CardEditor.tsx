import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Eye, HelpCircle, Layers, Save, Trash2 } from 'lucide-react';
import { useCard, useDeck } from '@/state/data';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import { createCard, deleteCards, duplicateCard, updateCard, type CardInput } from '@/db/repo';
import { stripMarkdown } from '@/lib/markdown/render';
import { cn, parseTags } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, Kbd, Segmented, Skeleton } from '@/components/ui/misc';
import { MarkdownView } from '@/components/card/MarkdownView';
import { ImageField } from '@/components/card/ImageField';
import { DeckGlyph } from '@/components/deck/deckVisuals';

interface FormState {
  question: string;
  answer: string;
  hint: string;
  explanation: string;
  tags: string;
  aliases: string;
  questionImage: string | null;
  answerImage: string | null;
}

const EMPTY: FormState = { question: '', answer: '', hint: '', explanation: '', tags: '', aliases: '', questionImage: null, answerImage: null };

function toInput(f: FormState): CardInput {
  return {
    question: f.question.trim(),
    answer: f.answer.trim(),
    hint: f.hint.trim(),
    explanation: f.explanation.trim(),
    tags: parseTags(f.tags),
    aliases: f.aliases
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    questionImage: f.questionImage,
    answerImage: f.answerImage,
  };
}

export function CardEditorPage() {
  const { deckId, cardId } = useParams();
  const isEdit = !!cardId;
  const deck = useDeck(deckId);
  const card = useCard(cardId);
  const { prefs } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});
  const [side, setSide] = useState<'question' | 'answer'>('question');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Array<{ id: string; question: string }>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Last carried-over tags so a batch of new cards keeps the same tags.
  const lastTags = useRef('');
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEdit && card && loadedId !== card.id) {
      setForm({
        question: card.question,
        answer: card.answer,
        hint: card.hint,
        explanation: card.explanation,
        tags: card.tags.join(', '),
        aliases: card.aliases.join(' | '),
        questionImage: card.questionImage,
        answerImage: card.answerImage,
      });
      setLoadedId(card.id);
    }
  }, [isEdit, card, loadedId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'question' || k === 'answer') setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.question.trim() && !form.questionImage) e.question = 'Write a question (or add an image).';
    if (!form.answer.trim() && !form.answerImage) e.answer = 'Write an answer (or add an image).';
    setErrors(e);
    if (e.question) questionRef.current?.focus();
    else if (e.answer) document.getElementById('card-answer')?.focus();
    return !e.question && !e.answer;
  };

  const save = async (another: boolean) => {
    if (!deckId || saving || !validate()) return;
    setSaving(true);
    try {
      const input = toInput(form);
      if (isEdit && cardId) {
        await updateCard(cardId, input);
        toast.success('Card saved');
        if (another) {
          navigate(`/decks/${deckId}/cards/new`);
          setForm({ ...EMPTY, tags: form.tags });
        } else navigate(`/decks/${deckId}?card=${cardId}`);
      } else {
        const created = await createCard(deckId, input);
        if (another) {
          lastTags.current = form.tags;
          setAdded((a) => [{ id: created.id, question: stripMarkdown(created.question) || '(image)' }, ...a].slice(0, 8));
          setForm({ ...EMPTY, tags: lastTags.current });
          setSide('question');
          toast.success('Card added', 'Ready for the next one.');
          questionRef.current?.focus();
        } else {
          toast.success('Card added');
          navigate(`/decks/${deckId}`);
        }
      }
    } catch (e) {
      toast.error('Could not save the card', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcuts: Ctrl/⌘+Enter save, Ctrl/⌘+Shift+Enter save & new, Ctrl/⌘+P flip preview.
  useEffect(() => {
    if (!prefs.keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void save(e.shiftKey || !isEdit);
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSide((s) => (s === 'question' ? 'answer' : 'question'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (deck === undefined || (isEdit && card === undefined)) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-busy="true" aria-label="Loading editor">
        <Skeleton className="h-[480px]" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (deck === null || (isEdit && card === null)) {
    return <EmptyState icon={<Layers className="h-5 w-5" />} title={deck === null ? 'Deck not found' : 'Card not found'} description="It may have been deleted." action={<Button onClick={() => navigate('/decks')}>Back to decks</Button>} />;
  }

  const preview = side === 'question' ? { text: form.question, image: form.questionImage } : { text: form.answer, image: form.answerImage };

  return (
    <div>
      <Link to={`/decks/${deck.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {deck.name}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <DeckGlyph icon={deck.icon} color={deck.color} />
          <div>
            <h1 className="text-xl font-semibold">{isEdit ? 'Edit card' : 'New card'}</h1>
            <p className="text-sm text-muted">
              Markdown and maths (<code className="font-mono text-xs">$x^2$</code>) supported.{' '}
              <button onClick={() => setShowHelp((v) => !v)} className="inline-flex items-center gap-1 text-accent hover:underline" aria-expanded={showHelp}>
                <HelpCircle className="h-3.5 w-3.5" aria-hidden /> Formatting help
              </button>
            </p>
          </div>
        </div>
        {isEdit && cardId && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={async () => {
                const copy = await duplicateCard(cardId);
                if (copy) {
                  toast.success('Card duplicated');
                  navigate(`/decks/${deck.id}/cards/${copy.id}`);
                  setLoadedId(null);
                }
              }}
            >
              Duplicate
            </Button>
            <Button variant="outline" size="sm" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {showHelp && (
        <div className="panel mb-6 grid gap-x-8 gap-y-1.5 p-4 text-sm sm:grid-cols-2">
          {[
            ['**bold**', 'bold'],
            ['*italic*', 'italic'],
            ['`code`', 'inline code'],
            ['- item', 'bullet list'],
            ['1. item', 'numbered list'],
            ['$E = mc^2$', 'inline maths'],
            ['$$\\int_0^1 x\\,dx$$', 'display maths'],
            ['[text](https://…)', 'link'],
          ].map(([code, what]) => (
            <div key={code} className="flex items-center justify-between gap-3">
              <code className="font-mono text-xs">{code}</code>
              <span className="text-muted">{what}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save(!isEdit);
          }}
          aria-label={isEdit ? 'Edit card' : 'New card'}
        >
          <Textarea
            ref={questionRef}
            id="card-question"
            label="Question"
            required
            rows={4}
            autoFocus
            value={form.question}
            error={errors.question}
            placeholder="What is the powerhouse of the cell?"
            onFocus={() => setSide('question')}
            onChange={(e) => set('question', e.target.value)}
          />
          <Textarea
            id="card-answer"
            label="Answer"
            required
            rows={4}
            value={form.answer}
            error={errors.answer}
            placeholder="The mitochondrion."
            onFocus={() => setSide('answer')}
            onChange={(e) => set('answer', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Hint" value={form.hint} placeholder="Optional nudge" onChange={(e) => set('hint', e.target.value)} />
            <Input label="Tags" value={form.tags} placeholder="Cells, Organelles" hint="Comma separated" onChange={(e) => set('tags', e.target.value)} />
          </div>
          <Textarea label="Explanation" rows={3} value={form.explanation} placeholder="Shown after the answer is revealed (optional)" onFocus={() => setSide('answer')} onChange={(e) => set('explanation', e.target.value)} />
          <Input
            label="Accepted alternative answers"
            value={form.aliases}
            placeholder="mitochondria | the mitochondria"
            hint="Used by Written mode. Separate alternatives with |"
            onChange={(e) => set('aliases', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField label="Question image" value={form.questionImage} onChange={(v) => set('questionImage', v)} />
            <ImageField label="Answer image" value={form.answerImage} onChange={(v) => set('answerImage', v)} />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="hidden text-xs text-muted sm:block">
              <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> {isEdit ? 'save' : 'save & add another'} · <Kbd>Ctrl</Kbd> + <Kbd>P</Kbd> flip preview
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {isEdit ? (
                <>
                  <Button variant="outline" onClick={() => save(true)} loading={saving}>
                    Save & new card
                  </Button>
                  <Button type="submit" icon={<Save className="h-4 w-4" />} loading={saving}>
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => save(false)} loading={saving}>
                    Save & close
                  </Button>
                  <Button type="submit" icon={<Check className="h-4 w-4" />} loading={saving}>
                    Save & add another
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4 text-muted" aria-hidden /> Live preview
            </h2>
            <Segmented
              size="sm"
              label="Preview side"
              value={side}
              onChange={setSide}
              options={[
                { value: 'question', label: 'Question' },
                { value: 'answer', label: 'Answer' },
              ]}
            />
          </div>
          <div className={cn('panel flex min-h-[260px] flex-col items-center justify-center p-6 text-center shadow-pop', side === 'answer' && 'border-accent/40')} aria-live="polite">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{side}</p>
            {preview.text || preview.image ? (
              <MarkdownView source={preview.text} image={preview.image} className="w-full text-base sm:text-lg" />
            ) : (
              <p className="text-sm text-muted">Start typing to see your card.</p>
            )}
            {side === 'question' && form.hint && <p className="mt-4 text-xs text-muted">Hint available: {form.hint}</p>}
            {side === 'answer' && form.explanation && (
              <div className="mt-4 w-full border-t border-border pt-3 text-left text-sm text-muted">
                <MarkdownView source={form.explanation} />
              </div>
            )}
          </div>
          {added.length > 0 && (
            <div className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Added this session ({added.length})</h2>
              <ul className="space-y-1.5 text-sm">
                {added.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                    <Link to={`/decks/${deck.id}/cards/${a.id}`} className="truncate hover:text-accent">
                      {a.question}
                    </Link>
                  </li>
                ))}
              </ul>
              <Button variant="soft" size="sm" className="mt-3" onClick={() => navigate(`/decks/${deck.id}`)}>
                Done — view deck
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        destructive
        title="Delete card?"
        confirmLabel="Delete"
        description="This card and its study history will be permanently removed."
        onConfirm={async () => {
          if (!cardId) return;
          await deleteCards([cardId]);
          toast.success('Card deleted');
          navigate(`/decks/${deck.id}`);
        }}
      />
    </div>
  );
}
