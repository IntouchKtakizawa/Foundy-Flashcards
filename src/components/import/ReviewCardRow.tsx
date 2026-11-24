import { useState } from 'react';
import { AlertCircle, CheckCircle2, CopyX, Pencil, Trash2 } from 'lucide-react';
import type { ParsedCard } from '@/lib/parser/types';
import { cn, parseTags } from '@/lib/utils';
import { Badge, Checkbox } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { MarkdownView } from '@/components/card/MarkdownView';

export interface CardEdit {
  question: string;
  answer: string;
  hint: string;
  explanation: string;
  tags: string[];
}

interface Props {
  card: ParsedCard;
  selected: boolean;
  duplicateOfIndex: number | null;
  onSelect: (v: boolean) => void;
  onSave: (edit: CardEdit) => void;
  onRemove: () => void;
}

export function ReviewCardRow({ card, selected, duplicateOfIndex, onSelect, onSave, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CardEdit & { tagText: string }>({ question: card.question, answer: card.answer, hint: card.hint, explanation: card.explanation, tags: card.tags, tagText: card.tags.join(', ') });

  const status =
    card.status === 'valid' ? (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Valid
      </Badge>
    ) : card.status === 'duplicate' ? (
      <Badge tone="warning">
        <CopyX className="h-3 w-3" aria-hidden /> Duplicate
      </Badge>
    ) : (
      <Badge tone="danger">
        <AlertCircle className="h-3 w-3" aria-hidden /> Needs fixing
      </Badge>
    );

  const startEdit = () => {
    setDraft({ question: card.question, answer: card.answer, hint: card.hint, explanation: card.explanation, tags: card.tags, tagText: card.tags.join(', ') });
    setEditing(true);
  };

  return (
    <li className={cn('px-4 py-3', card.status === 'invalid' && 'bg-danger/[0.03]', selected && 'bg-accent-soft/40')}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Checkbox
            checked={selected}
            onChange={onSelect}
            label={card.status === 'invalid' ? `Card ${card.index} cannot be imported until fixed` : `Import card ${card.index}`}
            className={card.status === 'invalid' ? 'pointer-events-none opacity-30' : undefined}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-semibold tabular-nums text-fg">#{card.index}</span>
            <span>{card.location}</span>
            {status}
            {card.status === 'duplicate' && <span>{card.duplicateOf === 'existing' ? 'Already in this deck' : duplicateOfIndex ? `Same as #${duplicateOfIndex}` : 'Repeated in this file'}</span>}
          </div>

          {card.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5" aria-label={`Problems with card ${card.index}`}>
              {card.errors.map((e) => (
                <li key={e.code + e.message} className="flex items-center gap-1.5 text-xs font-medium text-danger">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {e.message}
                </li>
              ))}
            </ul>
          )}
          {card.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-warning">
              {w}
            </p>
          ))}

          {editing ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                onSave({ question: draft.question, answer: draft.answer, hint: draft.hint, explanation: draft.explanation, tags: parseTags(draft.tagText) });
                setEditing(false);
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Textarea label="Question" rows={3} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} autoFocus />
                <Textarea label="Answer" rows={3} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
                <Input label="Hint" value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} />
                <Input label="Tags" value={draft.tagText} onChange={(e) => setDraft({ ...draft, tagText: e.target.value })} />
                <Textarea label="Explanation" rows={2} wrapClassName="md:col-span-2" value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Save & revalidate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Question</p>
                {card.question ? <MarkdownView source={card.question} className="line-clamp-6" /> : <p className="italic text-muted">— missing —</p>}
              </div>
              <div className="min-w-0">
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Answer</p>
                {card.answer ? <MarkdownView source={card.answer} className="line-clamp-6" /> : <p className="italic text-muted">— missing —</p>}
              </div>
              {(card.hint || card.explanation || card.tags.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted md:col-span-2">
                  {card.hint && <span>Hint: {card.hint}</span>}
                  {card.explanation && <span>· Has explanation</span>}
                  {card.tags.map((t) => (
                    <Badge key={t}>#{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant={card.status === 'invalid' ? 'soft' : 'ghost'} icon={<Pencil className="h-3.5 w-3.5" />} onClick={startEdit} aria-label={`Edit card ${card.index}`}>
              <span className="hidden sm:inline">{card.status === 'invalid' ? 'Fix' : 'Edit'}</span>
            </Button>
            <button onClick={onRemove} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remove card ${card.index} from import`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
