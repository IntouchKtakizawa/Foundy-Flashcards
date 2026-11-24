import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Copy,
  Ellipsis,
  Flag,
  FolderInput,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useDeck, useDeckCards, useDecks } from '@/state/data';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import { deleteCards, duplicateCard, moveCardsToDeck, reorderCards, resetCardProgress, setCardFlag, touchDeckOpened } from '@/db/repo';
import { summariseCards } from '@/lib/analytics/stats';
import { masteryLevel, MASTERY_LABELS } from '@/lib/srs/fsrs';
import { studyHref } from '@/lib/study/links';
import { stripMarkdown } from '@/lib/markdown/render';
import { cn, formatRelative, plural } from '@/lib/utils';
import { STUDY_MODE_LABELS, type Flashcard, type StudyMode } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { Badge, Checkbox, EmptyState, Progress, Skeleton, Stat } from '@/components/ui/misc';
import { DeckGlyph } from '@/components/deck/deckVisuals';
import { useDeckActions } from '@/components/deck/useDeckActions';
import { MarkdownView } from '@/components/card/MarkdownView';

type CardFilter = 'all' | 'due' | 'new' | 'flagged' | 'mastered';

const MASTERY_TONE = { new: 'neutral', learning: 'warning', familiar: 'accent', mastered: 'success' } as const;

export function DeckDetailPage() {
  const { deckId } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get('card');
  const deck = useDeck(deckId);
  const cards = useDeckCards(deckId);
  const allDecks = useDecks();
  const { prefs } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const { itemsFor, dialogs } = useDeckActions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CardFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(highlight);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (deckId) void touchDeckOpened(deckId);
  }, [deckId]);

  useEffect(() => {
    if (highlight && cards?.length) {
      setExpanded(highlight);
      setTimeout(() => document.getElementById(`card-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    }
  }, [highlight, cards?.length]);

  const summary = useMemo(() => summariseCards(cards ?? []), [cards]);

  const visible = useMemo(() => {
    if (!cards) return [];
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return cards.filter((c) => {
      const level = masteryLevel(c.srs);
      if (filter === 'due' && (level === 'new' || c.due > now)) return false;
      if (filter === 'new' && level !== 'new') return false;
      if (filter === 'flagged' && !c.flagged) return false;
      if (filter === 'mastered' && level !== 'mastered') return false;
      if (q && ![c.question, c.answer, c.hint, c.explanation, ...c.tags].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [cards, query, filter]);

  const canReorder = filter === 'all' && !query.trim();

  if (deck === undefined || cards === undefined) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading deck">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (deck === null) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="Deck not found"
        description="It may have been deleted or merged into another deck."
        action={<Button onClick={() => navigate('/decks')}>Back to decks</Button>}
      />
    );
  }

  const move = async (index: number, dir: -1 | 1) => {
    const ids = cards.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await reorderCards(deck.id, ids);
  };

  const dropOn = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = cards.map((c) => c.id).filter((id) => id !== dragId);
    const idx = ids.indexOf(targetId);
    ids.splice(idx, 0, dragId);
    setDragId(null);
    await reorderCards(deck.id, ids);
  };

  const toggle = (id: string, v: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const otherDecks = (allDecks ?? []).filter((d) => d.id !== deck.id);
  const modes: StudyMode[] = ['srs', 'classic', 'written', 'choice', 'match', 'exam'];

  return (
    <div>
      <Link to="/decks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> My Decks
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <DeckGlyph icon={deck.icon} color={deck.color} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{deck.name}</h1>
            {deck.description && <p className="mt-1 max-w-2xl text-sm text-muted">{deck.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {deck.archived ? <Badge tone="warning">Archived</Badge> : null}
              {deck.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
              <span className="text-xs text-muted">Last studied {formatRelative(deck.lastStudiedAt).toLowerCase()}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => navigate(`/import?deck=${deck.id}`)}>
            Import
          </Button>
          <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/decks/${deck.id}/cards/new`)}>
            Add card
          </Button>
          <div className="flex">
            <Button className="rounded-r-none" icon={<BookOpen className="h-4 w-4" />} disabled={!cards.length} onClick={() => navigate(studyHref({ deckIds: [deck.id], mode: prefs.defaultStudyMode }))}>
              Study
            </Button>
            <Menu
              label="Choose study mode"
              items={modes.map((m) => ({ label: STUDY_MODE_LABELS[m], onSelect: () => navigate(studyHref({ deckIds: [deck.id], mode: m })) })).concat(
                summary.flagged ? [{ label: `Marked cards only (${summary.flagged})`, onSelect: () => navigate(studyHref({ deckIds: [deck.id], mode: 'classic', flaggedOnly: true })) }] : [],
              )}
              trigger={(p) => (
                <button {...p} disabled={!cards.length} className="inline-flex h-10 items-center rounded-r-lg border-l border-accent-fg/20 bg-accent px-2 text-accent-fg hover:bg-accent-strong disabled:opacity-50">
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              )}
            />
          </div>
          <Menu
            label="Deck actions"
            items={itemsFor(deck)}
            trigger={(p) => (
              <button {...p} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-subtle hover:text-fg">
                <Ellipsis className="h-4 w-4" aria-hidden />
              </button>
            )}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cards" value={summary.total} hint={`${summary.newCount} new`} />
        <Stat label="Due now" value={summary.due} hint={summary.due ? 'Ready for review' : 'Nothing due'} />
        <Stat label="Mastered" value={`${summary.masteryPct}%`} hint={<Progress value={summary.masteryPct} label="Deck mastery" size="sm" className="mt-1" />} />
        <Stat label="Revision progress" value={`${summary.progressPct}%`} hint={`${summary.flagged} marked for revision`} />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-5 w-5" />}
          title="This deck is empty"
          description="Add cards one at a time with the editor, or paste many at once with QuickImport."
          action={
            <>
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/decks/${deck.id}/cards/new`)}>
                Add a card
              </Button>
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => navigate(`/import?deck=${deck.id}`)}>
                QuickImport
              </Button>
            </>
          }
        />
      ) : (
        <section aria-label="Cards">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-base pl-9" placeholder="Search cards in this deck" aria-label="Search cards in this deck" />
            </div>
            <Select aria-label="Filter cards" value={filter} onChange={(e) => setFilter(e.target.value as CardFilter)} className="h-10 w-auto">
              <option value="all">All cards ({cards.length})</option>
              <option value="due">Due ({summary.due})</option>
              <option value="new">New ({summary.newCount})</option>
              <option value="flagged">Marked for revision ({summary.flagged})</option>
              <option value="mastered">Mastered ({summary.mastered})</option>
            </Select>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-subtle/60 px-4 py-2.5 text-xs text-muted">
              <Checkbox
                checked={allVisibleSelected}
                indeterminate={!allVisibleSelected && visible.some((c) => selected.has(c.id))}
                onChange={(v) => setSelected(v ? new Set(visible.map((c) => c.id)) : new Set())}
                label="Select all visible cards"
              />
              {selected.size > 0 ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{selected.size} selected</span>
                  <Button size="sm" variant="ghost" icon={<BookOpen className="h-3.5 w-3.5" />} onClick={() => navigate(studyHref({ deckIds: [deck.id], mode: 'classic', cardIds: [...selected] }))}>
                    Study
                  </Button>
                  <Button size="sm" variant="ghost" icon={<FolderInput className="h-3.5 w-3.5" />} disabled={!otherDecks.length} onClick={() => { setMoveTarget(otherDecks[0]?.id ?? ''); setMoveOpen(true); }}>
                    Move
                  </Button>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => { await resetCardProgress([...selected]); toast.success('Progress reset', `${plural(selected.size, 'card')} will be treated as new.`); }}>
                    Reset progress
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete([...selected])}>
                    Delete
                  </Button>
                </div>
              ) : (
                <span className="flex-1">{canReorder ? 'Drag the handle or use the arrows to reorder cards.' : `${visible.length} of ${cards.length} cards shown`}</span>
              )}
            </div>
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">No cards match this search or filter.</p>
            ) : (
              <ol className="divide-y divide-border">
                {visible.map((card) => {
                  const index = cards.indexOf(card);
                  return (
                    <CardRow
                      key={card.id}
                      card={card}
                      index={index}
                      total={cards.length}
                      selected={selected.has(card.id)}
                      onSelect={(v) => toggle(card.id, v)}
                      expanded={expanded === card.id}
                      highlighted={highlight === card.id}
                      onToggleExpand={() => setExpanded((e) => (e === card.id ? null : card.id))}
                      canReorder={canReorder}
                      onMove={(d) => move(index, d)}
                      dragging={dragId === card.id}
                      onDragStart={() => setDragId(card.id)}
                      onDrop={() => dropOn(card.id)}
                      onEdit={() => navigate(`/decks/${deck.id}/cards/${card.id}`)}
                      onDuplicate={async () => {
                        await duplicateCard(card.id);
                        toast.success('Card duplicated');
                      }}
                      onFlag={() => setCardFlag(card.id, !card.flagged)}
                      onDelete={() => setConfirmDelete([card.id])}
                    />
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}

      {dialogs}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        destructive
        title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} cards?` : 'Delete card?'}
        confirmLabel="Delete"
        description="The card and its study history will be permanently removed. This can’t be undone."
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteCards(confirmDelete);
          toast.success(confirmDelete.length > 1 ? `${confirmDelete.length} cards deleted` : 'Card deleted');
          setSelected((s) => new Set([...s].filter((id) => !confirmDelete.includes(id))));
          setConfirmDelete(null);
        }}
      />

      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={`Move ${plural(selected.size, 'card')}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!moveTarget}
              onClick={async () => {
                await moveCardsToDeck([...selected], moveTarget);
                toast.success('Cards moved', undefined, { label: 'Open deck', onClick: () => navigate(`/decks/${moveTarget}`) });
                setSelected(new Set());
                setMoveOpen(false);
              }}
            >
              Move cards
            </Button>
          </>
        }
      >
        <Select label="Destination deck" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
          {otherDecks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Dialog>
    </div>
  );
}

interface RowProps {
  card: Flashcard;
  index: number;
  total: number;
  selected: boolean;
  onSelect: (v: boolean) => void;
  expanded: boolean;
  highlighted: boolean;
  onToggleExpand: () => void;
  canReorder: boolean;
  onMove: (dir: -1 | 1) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onFlag: () => void;
  onDelete: () => void;
}

function CardRow(p: RowProps) {
  const { card } = p;
  const level = masteryLevel(card.srs);
  const [over, setOver] = useState(false);
  return (
    <li
      id={`card-${card.id}`}
      className={cn('group transition-colors', p.highlighted && 'bg-accent-soft/50', p.dragging && 'opacity-40', over && 'shadow-[inset_0_2px_0_rgb(var(--accent))]')}
      onDragOver={(e) => {
        if (!p.canReorder) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        p.onDrop();
      }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox checked={p.selected} onChange={p.onSelect} label={`Select card ${p.index + 1}`} />
          {p.canReorder && (
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                p.onDragStart();
              }}
              className="hidden cursor-grab text-muted/60 hover:text-muted sm:inline"
              aria-hidden
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
        </div>
        <button onClick={p.onToggleExpand} className="min-w-0 flex-1 text-left" aria-expanded={p.expanded} aria-controls={`card-body-${card.id}`}>
          <div className="flex items-baseline gap-2">
            <span className="w-6 shrink-0 text-xs tabular-nums text-muted">{p.index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{stripMarkdown(card.question) || '(image question)'}</span>
              {!p.expanded && <span className="block truncate text-sm text-muted">{stripMarkdown(card.answer)}</span>}
            </span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {card.flagged ? (
            <Badge tone="warning">
              <Flag className="h-3 w-3" aria-hidden /> Marked
            </Badge>
          ) : null}
          <Badge tone={MASTERY_TONE[level]} className="hidden sm:inline-flex">
            {MASTERY_LABELS[level]}
          </Badge>
          <div className="flex items-center opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
            {p.canReorder && (
              <>
                <button onClick={() => p.onMove(-1)} disabled={p.index === 0} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-30" aria-label="Move card up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => p.onMove(1)} disabled={p.index === p.total - 1} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-fg disabled:opacity-30" aria-label="Move card down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button onClick={p.onFlag} className={cn('rounded p-1.5 hover:bg-subtle', card.flagged ? 'text-warning' : 'text-muted hover:text-fg')} aria-label={card.flagged ? 'Unmark card' : 'Mark card for revision'} aria-pressed={!!card.flagged}>
              <Flag className="h-3.5 w-3.5" />
            </button>
            <button onClick={p.onEdit} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Edit card">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={p.onDuplicate} className="rounded p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Duplicate card">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={p.onDelete} className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete card">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {p.expanded && (
        <div id={`card-body-${card.id}`} className="grid gap-4 border-t border-dashed border-border bg-subtle/30 px-4 py-4 pl-[4.75rem] sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Question</p>
            <MarkdownView source={card.question} image={card.questionImage} className="text-sm" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Answer</p>
            <MarkdownView source={card.answer} image={card.answerImage} className="text-sm" />
          </div>
          {(card.hint || card.explanation || card.tags.length > 0) && (
            <div className="space-y-2 text-sm sm:col-span-2">
              {card.hint && (
                <p>
                  <span className="font-medium">Hint: </span>
                  <span className="text-muted">{card.hint}</span>
                </p>
              )}
              {card.explanation && (
                <div>
                  <span className="font-medium">Explanation</span>
                  <MarkdownView source={card.explanation} className="text-muted" />
                </div>
              )}
              {card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {card.tags.map((t) => (
                    <Badge key={t}>#{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-muted sm:col-span-2">
            {card.srs.reps ? `Reviewed ${card.srs.reps}× · next review ${formatRelative(card.due)}` : 'Not reviewed with spaced repetition yet'} · {card.srs.lapses} lapses
          </p>
        </div>
      )}
    </li>
  );
}
