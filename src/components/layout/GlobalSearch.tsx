import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Folder, Layers, Search } from 'lucide-react';
import { db } from '@/db/database';
import { Dialog } from '@/components/ui/Dialog';
import { DeckGlyph } from '@/components/deck/deckVisuals';
import { stripMarkdown } from '@/lib/markdown/render';
import { cn } from '@/lib/utils';

interface Result {
  kind: 'deck' | 'card' | 'folder';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  deck?: { icon: import('@/types').DeckIcon; color: import('@/types').DeckColor };
}

/** Command-palette style search across decks, cards and folders (⌘K / Ctrl+K or "/"). */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useLiveQuery(async (): Promise<Result[]> => {
    const term = q.trim().toLowerCase();
    if (!open || term.length < 1) return [];
    const [decks, folders] = await Promise.all([db.decks.toArray(), db.folders.toArray()]);
    const deckById = new Map(decks.map((d) => [d.id, d]));
    const out: Result[] = [];
    for (const d of decks) {
      if ([d.name, d.description, ...d.tags].some((s) => s.toLowerCase().includes(term))) {
        out.push({ kind: 'deck', id: d.id, title: d.name, subtitle: d.description || `${d.tags.join(', ') || 'Deck'}${d.archived ? ' · Archived' : ''}`, href: `/decks/${d.id}`, deck: { icon: d.icon, color: d.color } });
      }
    }
    for (const f of folders) {
      if (f.name.toLowerCase().includes(term)) out.push({ kind: 'folder', id: f.id, title: f.name, subtitle: 'Folder', href: `/decks?folder=${f.id}` });
    }
    const cards = await db.cards
      .filter((c) => c.question.toLowerCase().includes(term) || c.answer.toLowerCase().includes(term) || c.tags.some((t) => t.toLowerCase().includes(term)))
      .limit(30)
      .toArray();
    for (const c of cards) {
      const deck = deckById.get(c.deckId);
      out.push({
        kind: 'card',
        id: c.id,
        title: stripMarkdown(c.question).slice(0, 120) || '(empty question)',
        subtitle: `${deck?.name ?? 'Deck'} · ${stripMarkdown(c.answer).slice(0, 80)}`,
        href: `/decks/${c.deckId}?card=${c.id}`,
      });
    }
    return out.slice(0, 40);
  }, [q, open]);

  const list = useMemo(() => results ?? [], [results]);

  useEffect(() => setActive(0), [q]);

  const go = (r: Result) => {
    onClose();
    navigate(r.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && list[active]) {
      e.preventDefault();
      go(list[active]);
    }
  };

  useEffect(() => {
    document.getElementById(`search-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const icon = (r: Result) =>
    r.kind === 'deck' && r.deck ? <DeckGlyph icon={r.deck.icon} color={r.deck.color} size="sm" /> : r.kind === 'folder' ? <Folder className="h-4 w-4 text-muted" /> : <FileText className="h-4 w-4 text-muted" />;

  return (
    <Dialog open={open} onClose={onClose} title="Search" size="lg" initialFocus={inputRef as React.RefObject<HTMLElement>}>
      <div className="-mx-5 -mt-4 border-b border-border px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search decks, cards and folders…"
            className="input-base h-11 pl-9 text-[15px]"
            role="combobox"
            aria-expanded={list.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={list[active] ? `search-opt-${active}` : undefined}
            aria-label="Search decks, cards and folders"
          />
        </div>
      </div>
      <div id="global-search-results" role="listbox" aria-label="Search results" className="-mx-2 mt-2 min-h-[120px]">
        {q.trim() === '' ? (
          <p className="px-3 py-8 text-center text-sm text-muted">Type to search across everything stored on this device.</p>
        ) : list.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">No matches for “{q}”.</p>
        ) : (
          list.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === active ? 'bg-accent-soft' : 'hover:bg-subtle')}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">{icon(r)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-muted">{r.subtitle}</span>
              </span>
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">{r.kind === 'deck' ? <Layers className="h-3.5 w-3.5" aria-label="Deck" /> : r.kind}</span>
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
