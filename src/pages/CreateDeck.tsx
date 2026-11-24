import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PenLine, Upload } from 'lucide-react';
import { createDeck } from '@/db/repo';
import { useToast } from '@/state/toast';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/misc';
import { DeckForm, deckToValues, type DeckFormValues } from '@/components/deck/DeckForm';

export function CreateDeckPage() {
  const [values, setValues] = useState<DeckFormValues>(deckToValues());
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'cards' | 'import'>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async (next: 'cards' | 'import') => {
    if (!values.name.trim()) {
      setNameError('Give your deck a name.');
      return;
    }
    setBusy(next);
    try {
      const deck = await createDeck(values);
      toast.success(`“${deck.name}” created`);
      navigate(next === 'cards' ? `/decks/${deck.id}/cards/new` : `/import?deck=${deck.id}`);
    } catch (e) {
      toast.error('Could not create the deck', (e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create a deck" description="Decks hold related flashcards. You can change everything later." />
      <form
        className="panel p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit('cards');
        }}
      >
        <DeckForm values={values} onChange={(v) => { setValues(v); if (v.name.trim()) setNameError(null); }} nameError={nameError} autoFocus />
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button variant="outline" icon={<Upload className="h-4 w-4" />} loading={busy === 'import'} onClick={() => submit('import')}>
            Create & import cards
          </Button>
          <Button type="submit" icon={<PenLine className="h-4 w-4" />} loading={busy === 'cards'}>
            Create & add cards <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}
