import { useState } from 'react';
import { Check, FolderPlus } from 'lucide-react';
import { DECK_COLORS, DECK_ICONS, type Deck, type DeckColor, type DeckIcon } from '@/types';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { COLOR_CLASSES, DeckGlyph, ICONS } from './deckVisuals';
import { useFolders } from '@/state/data';
import { createFolder } from '@/db/repo';
import { cn, parseTags } from '@/lib/utils';

export interface DeckFormValues {
  name: string;
  description: string;
  color: DeckColor;
  icon: DeckIcon;
  folderId: string | null;
  tags: string[];
}

export function deckToValues(d?: Deck | null): DeckFormValues {
  return {
    name: d?.name ?? '',
    description: d?.description ?? '',
    color: d?.color ?? 'violet',
    icon: d?.icon ?? 'book',
    folderId: d?.folderId ?? null,
    tags: d?.tags ?? [],
  };
}

/** Shared deck fields used by the Create Deck page and the edit dialog. */
export function DeckForm({ values, onChange, nameError, autoFocus }: { values: DeckFormValues; onChange: (v: DeckFormValues) => void; nameError?: string | null; autoFocus?: boolean }) {
  const folders = useFolders();
  const [tagText, setTagText] = useState(values.tags.join(', '));
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const set = <K extends keyof DeckFormValues>(k: K, v: DeckFormValues[K]) => onChange({ ...values, [k]: v });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <DeckGlyph icon={values.icon} color={values.color} size="lg" className="mt-6" />
        <Input
          wrapClassName="flex-1"
          label="Deck name"
          required
          value={values.name}
          maxLength={120}
          autoFocus={autoFocus}
          error={nameError}
          placeholder="e.g. GCSE Biology — Cells"
          onChange={(e) => set('name', e.target.value)}
          data-autofocus
        />
      </div>
      <Textarea label="Description" value={values.description} maxLength={600} rows={3} placeholder="What does this deck cover? (optional)" onChange={(e) => set('description', e.target.value)} />

      <fieldset>
        <legend className="field-label">Colour</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deck colour">
          {DECK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={values.color === c}
              aria-label={COLOR_CLASSES[c].name}
              title={COLOR_CLASSES[c].name}
              onClick={() => set('color', c)}
              className={cn('flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition', COLOR_CLASSES[c].dot, values.color === c && 'ring-2 ring-fg/60')}
            >
              {values.color === c && <Check className="h-4 w-4 text-white" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">Icon</legend>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-[repeat(16,minmax(0,1fr))]" role="radiogroup" aria-label="Deck icon">
          {DECK_ICONS.map((ic) => {
            const Icon = ICONS[ic];
            return (
              <button
                key={ic}
                type="button"
                role="radio"
                aria-checked={values.icon === ic}
                aria-label={ic.replace('-', ' ')}
                title={ic.replace('-', ' ')}
                onClick={() => set('icon', ic)}
                className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition-colors', values.icon === ic ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:bg-subtle hover:text-fg')}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {newFolder === null ? (
            <div className="flex items-end gap-2">
              <Select wrapClassName="flex-1" label="Folder" value={values.folderId ?? ''} onChange={(e) => set('folderId', e.target.value || null)}>
                <option value="">No folder</option>
                {(folders ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="icon" onClick={() => setNewFolder('')} aria-label="Create a new folder" title="New folder">
                <FolderPlus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Input wrapClassName="flex-1" label="New folder name" value={newFolder} autoFocus maxLength={60} onChange={(e) => setNewFolder(e.target.value)} />
              <Button
                variant="soft"
                disabled={!newFolder.trim()}
                onClick={async () => {
                  const f = await createFolder(newFolder);
                  set('folderId', f.id);
                  setNewFolder(null);
                }}
              >
                Add
              </Button>
              <Button variant="ghost" onClick={() => setNewFolder(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        <Input
          label="Subject tags"
          hint="Separate with commas"
          value={tagText}
          placeholder="Biology, Year 10"
          onChange={(e) => {
            setTagText(e.target.value);
            set('tags', parseTags(e.target.value));
          }}
        />
      </div>
    </div>
  );
}
