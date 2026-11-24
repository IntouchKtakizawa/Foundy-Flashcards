import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, BookOpen, Copy, Download, FileJson, FileText, Pencil, Trash2 } from 'lucide-react';
import type { Deck } from '@/types';
import { deleteDeck, duplicateDeck, setDeckArchived, updateDeck } from '@/db/repo';
import { exportDeck, type DeckExportFormat } from '@/lib/backup/exportDeck';
import { studyHref } from '@/lib/study/links';
import { useToast } from '@/state/toast';
import { usePreferences } from '@/state/preferences';
import type { MenuItem } from '@/components/ui/Menu';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { DeckForm, deckToValues, type DeckFormValues } from './DeckForm';

/**
 * Shared deck actions (menu items + the dialogs they open) so the deck list
 * and the deck detail page behave identically.
 */
export function useDeckActions() {
  const toast = useToast();
  const navigate = useNavigate();
  const { prefs } = usePreferences();
  const [editing, setEditing] = useState<Deck | null>(null);
  const [values, setValues] = useState<DeckFormValues>(deckToValues());
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async (deck: Deck, format: DeckExportFormat) => {
    try {
      await exportDeck(deck.id, format);
      toast.success(`Exported “${deck.name}”`, `Saved as ${format.toUpperCase()} to your downloads.`);
    } catch (e) {
      toast.error('Export failed', (e as Error).message);
    }
  };

  const itemsFor = (deck: Deck, opts: { includeOpen?: boolean } = {}): MenuItem[] => [
    ...(opts.includeOpen ? [{ label: 'Open deck', icon: <BookOpen className="h-4 w-4" />, onSelect: () => navigate(`/decks/${deck.id}`) }] : []),
    { label: 'Study', icon: <BookOpen className="h-4 w-4" />, onSelect: () => navigate(studyHref({ deckIds: [deck.id], mode: prefs.defaultStudyMode })) },
    {
      label: 'Edit details',
      icon: <Pencil className="h-4 w-4" />,
      onSelect: () => {
        setValues(deckToValues(deck));
        setNameError(null);
        setEditing(deck);
      },
    },
    {
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      onSelect: async () => {
        const copy = await duplicateDeck(deck.id);
        if (copy) toast.success('Deck duplicated', `“${copy.name}” has fresh study progress.`, { label: 'Open', onClick: () => navigate(`/decks/${copy.id}`) });
      },
    },
    {
      label: deck.archived ? 'Unarchive' : 'Archive',
      icon: deck.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />,
      onSelect: async () => {
        await setDeckArchived(deck.id, !deck.archived);
        toast.success(deck.archived ? 'Deck restored from archive' : 'Deck archived', deck.archived ? undefined : 'Archived decks are hidden from study suggestions.', {
          label: 'Undo',
          onClick: () => setDeckArchived(deck.id, !!deck.archived),
        });
      },
    },
    { label: 'Export as Foundy JSON', icon: <FileJson className="h-4 w-4" />, onSelect: () => doExport(deck, 'json'), separatorBefore: true },
    { label: 'Export as CSV', icon: <Download className="h-4 w-4" />, onSelect: () => doExport(deck, 'csv') },
    { label: 'Export as TXT', icon: <FileText className="h-4 w-4" />, onSelect: () => doExport(deck, 'txt') },
    { label: 'Delete deck', icon: <Trash2 className="h-4 w-4" />, danger: true, separatorBefore: true, onSelect: () => setDeleting(deck) },
  ];

  const saveEdit = async () => {
    if (!editing) return;
    if (!values.name.trim()) {
      setNameError('Give the deck a name.');
      return;
    }
    setBusy(true);
    try {
      await updateDeck(editing.id, { ...values, name: values.name.trim(), description: values.description.trim() });
      toast.success('Deck updated');
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit deck"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={saveEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <DeckForm values={values} onChange={setValues} nameError={nameError} />
          <button type="submit" hidden />
        </form>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        destructive
        title="Delete deck?"
        confirmLabel="Delete permanently"
        loading={busy}
        description={
          <>
            <strong className="text-fg">“{deleting?.name}”</strong> and all of its cards and study history will be permanently removed from this device. This can’t be undone — export it first if you might need it.
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await deleteDeck(deleting.id);
            toast.success('Deck deleted');
            setDeleting(null);
            if (window.location.hash.includes(deleting.id)) navigate('/decks');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );

  return { itemsFor, dialogs };
}
