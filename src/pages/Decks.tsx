import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Combine, Folder, FolderPlus, LayoutGrid, Layers, List, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useAllCards, useDecks, useFolders, groupByDeck } from '@/state/data';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import { summariseCards, type DeckSummary } from '@/lib/analytics/stats';
import { studyHref } from '@/lib/study/links';
import { cn, plural } from '@/lib/utils';
import { createFolder, deleteFolder, mergeDecks, renameFolder } from '@/db/repo';
import type { Deck } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/misc';
import { DeckCard } from '@/components/deck/DeckCard';
import { useDeckActions } from '@/components/deck/useDeckActions';

type SortKey = 'recent' | 'name' | 'created' | 'cards' | 'mastery' | 'due' | 'studied';
type StatusFilter = 'active' | 'due' | 'archived' | 'all';

export function DecksPage() {
  const decks = useDecks();
  const cards = useAllCards();
  const folders = useFolders();
  const { prefs, update } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folderParam = params.get('folder') ?? 'all';
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folderDialog, setFolderDialog] = useState<{ id: string | null; name: string } | null>(null);
  const [folderDelete, setFolderDelete] = useState<{ id: string; name: string } | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const { itemsFor, dialogs } = useDeckActions();

  const summaries = useMemo(() => {
    const m = new Map<string, DeckSummary>();
    if (!cards || !decks) return m;
    const by = groupByDeck(cards);
    const now = Date.now();
    for (const d of decks) m.set(d.id, summariseCards(by.get(d.id) ?? [], now));
    return m;
  }, [cards, decks]);

  const allTags = useMemo(() => [...new Set((decks ?? []).flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b)), [decks]);
  const folderName = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f.name])), [folders]);

  const visible = useMemo(() => {
    if (!decks) return [];
    const q = query.trim().toLowerCase();
    const list = decks.filter((d) => {
      if (status === 'active' && d.archived) return false;
      if (status === 'archived' && !d.archived) return false;
      if (status === 'due' && (d.archived || (summaries.get(d.id)?.due ?? 0) === 0)) return false;
      if (folderParam === 'none' && d.folderId) return false;
      if (folderParam !== 'all' && folderParam !== 'none' && d.folderId !== folderParam) return false;
      if (tag && !d.tags.includes(tag)) return false;
      if (q && ![d.name, d.description, ...d.tags].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    });
    const s = (d: Deck) => summaries.get(d.id)!;
    const sorters: Record<SortKey, (a: Deck, b: Deck) => number> = {
      recent: (a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      created: (a, b) => b.createdAt - a.createdAt,
      cards: (a, b) => s(b).total - s(a).total,
      mastery: (a, b) => s(b).masteryPct - s(a).masteryPct,
      due: (a, b) => s(b).due - s(a).due,
      studied: (a, b) => (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0),
    };
    return list.sort(sorters[sort]);
  }, [decks, query, status, folderParam, tag, sort, summaries]);

  const selectedDecks = (decks ?? []).filter((d) => selected.has(d.id));
  const toggle = (id: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const setFolder = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('folder');
    else next.set('folder', id);
    setParams(next, { replace: true });
  };

  if (!decks || !cards || !folders) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading decks">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const view = prefs.deckView;

  return (
    <div>
      <PageHeader
        title="My Decks"
        description={`${plural(decks.filter((d) => !d.archived).length, 'active deck')} · ${plural(cards.length, 'card')}`}
        actions={
          <>
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/import')}>
              Import
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/decks/new')}>
              New deck
            </Button>
          </>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title="No decks yet"
          description="Create your first deck by hand, or paste a document with QuickImport to generate dozens of cards in seconds."
          action={
            <>
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/decks/new')}>
                Create deck
              </Button>
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/import')}>
                Import cards
              </Button>
            </>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          {/* Folders */}
          <aside aria-label="Folders">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</h2>
              <button onClick={() => setFolderDialog({ id: null, name: '' })} className="rounded p-1 text-muted hover:bg-subtle hover:text-fg" aria-label="New folder" title="New folder">
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {[
                { id: 'all', name: 'All decks', count: decks.length },
                { id: 'none', name: 'Unfiled', count: decks.filter((d) => !d.folderId).length },
              ].map((f) => (
                <li key={f.id} className="shrink-0">
                  <button
                    onClick={() => setFolder(f.id)}
                    aria-current={folderParam === f.id ? 'true' : undefined}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm', folderParam === f.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}
                  >
                    <Layers className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate text-left">{f.name}</span>
                    <span className="text-xs tabular-nums">{f.count}</span>
                  </button>
                </li>
              ))}
              {folders.map((f) => (
                <li key={f.id} className="group flex shrink-0 items-center">
                  <button
                    onClick={() => setFolder(f.id)}
                    aria-current={folderParam === f.id ? 'true' : undefined}
                    className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm', folderParam === f.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}
                  >
                    <Folder className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate text-left">{f.name}</span>
                    <span className="text-xs tabular-nums">{decks.filter((d) => d.folderId === f.id).length}</span>
                  </button>
                  <button onClick={() => setFolderDialog({ id: f.id, name: f.name })} className="rounded p-1 text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100" aria-label={`Rename folder ${f.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setFolderDelete({ id: f.id, name: f.name })} className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={`Delete folder ${f.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section aria-label="Decks">
            {/* Toolbar */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decks" aria-label="Search decks" className="input-base pl-9" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-10 w-auto">
                  <option value="active">Active</option>
                  <option value="due">Has due cards</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </Select>
                {allTags.length > 0 && (
                  <Select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} className="h-10 w-auto">
                    <option value="">All tags</option>
                    {allTags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </Select>
                )}
                <Select aria-label="Sort decks" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-10 w-auto">
                  <option value="recent">Recently opened</option>
                  <option value="studied">Recently studied</option>
                  <option value="name">Name</option>
                  <option value="created">Newest</option>
                  <option value="cards">Most cards</option>
                  <option value="due">Most due</option>
                  <option value="mastery">Mastery</option>
                </Select>
                <Segmented
                  label="View"
                  value={view}
                  onChange={(v) => update({ deckView: v })}
                  options={[
                    { value: 'grid', label: <span className="sr-only">Grid</span>, icon: <LayoutGrid className="h-4 w-4" aria-hidden /> },
                    { value: 'list', label: <span className="sr-only">List</span>, icon: <List className="h-4 w-4" aria-hidden /> },
                  ]}
                />
              </div>
            </div>

            {/* Selection bar */}
            {selected.size > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2" role="region" aria-label="Selected decks">
                <span className="text-sm font-medium text-accent">{plural(selected.size, 'deck')} selected</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" icon={<BookOpen className="h-3.5 w-3.5" />} onClick={() => navigate(studyHref({ deckIds: [...selected], mode: prefs.defaultStudyMode }))}>
                    Study together
                  </Button>
                  <Button size="sm" variant="outline" icon={<Combine className="h-3.5 w-3.5" />} disabled={selected.size < 2} onClick={() => {
                    setMergeTarget([...selected][0]);
                    setMergeOpen(true);
                  }}>
                    Merge
                  </Button>
                  <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {visible.length === 0 ? (
              <EmptyState icon={<Search className="h-5 w-5" />} title="No decks match" description="Try a different search, folder or filter." action={<Button variant="outline" onClick={() => { setQuery(''); setTag(''); setStatus('all'); setFolder('all'); }}>Reset filters</Button>} />
            ) : view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((d) => (
                  <DeckCard key={d.id} view="grid" deck={d} summary={summaries.get(d.id)!} folderName={d.folderId ? folderName.get(d.folderId) : undefined} menuItems={itemsFor(d)} selected={selected.has(d.id)} onSelect={(v) => toggle(d.id, v)} />
                ))}
              </div>
            ) : (
              <div className="panel divide-y divide-border overflow-hidden">
                {visible.map((d) => (
                  <DeckCard key={d.id} view="list" deck={d} summary={summaries.get(d.id)!} folderName={d.folderId ? folderName.get(d.folderId) : undefined} menuItems={itemsFor(d)} selected={selected.has(d.id)} onSelect={(v) => toggle(d.id, v)} />
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-muted">
              Tip: select several decks to study them together in one session. <Link to="/study" className="text-accent hover:underline">More study options</Link>
            </p>
          </section>
        </div>
      )}

      {dialogs}

      <Dialog
        open={!!folderDialog}
        onClose={() => setFolderDialog(null)}
        title={folderDialog?.id ? 'Rename folder' : 'New folder'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!folderDialog?.name.trim()}
              onClick={async () => {
                if (!folderDialog) return;
                if (folderDialog.id) await renameFolder(folderDialog.id, folderDialog.name);
                else {
                  const f = await createFolder(folderDialog.name);
                  setFolder(f.id);
                }
                toast.success(folderDialog.id ? 'Folder renamed' : 'Folder created');
                setFolderDialog(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input label="Folder name" value={folderDialog?.name ?? ''} maxLength={60} onChange={(e) => setFolderDialog((f) => (f ? { ...f, name: e.target.value } : f))} data-autofocus />
      </Dialog>

      <ConfirmDialog
        open={!!folderDelete}
        onClose={() => setFolderDelete(null)}
        title="Delete folder?"
        confirmLabel="Delete folder"
        destructive
        description={<>The folder “{folderDelete?.name}” will be removed. Its decks are kept and moved to Unfiled.</>}
        onConfirm={async () => {
          if (!folderDelete) return;
          await deleteFolder(folderDelete.id);
          if (folderParam === folderDelete.id) setFolder('all');
          toast.success('Folder deleted');
          setFolderDelete(null);
        }}
      />

      <Dialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title="Merge decks"
        description="Cards from the other selected decks move into the deck you choose. The other decks are then deleted. Study history is kept."
        footer={
          <>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const moved = await mergeDecks(mergeTarget, [...selected].filter((id) => id !== mergeTarget));
                toast.success('Decks merged', `${plural(moved, 'card')} moved.`);
                setSelected(new Set());
                setMergeOpen(false);
                navigate(`/decks/${mergeTarget}`);
              }}
            >
              Merge {selected.size} decks
            </Button>
          </>
        }
      >
        <Select label="Keep this deck" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
          {selectedDecks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({summaries.get(d.id)?.total ?? 0} cards)
            </option>
          ))}
        </Select>
      </Dialog>
    </div>
  );
}
