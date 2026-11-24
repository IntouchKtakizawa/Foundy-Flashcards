import { Link } from 'react-router-dom';
import { Archive, Ellipsis } from 'lucide-react';
import type { Deck } from '@/types';
import type { DeckSummary } from '@/lib/analytics/stats';
import { formatRelative, plural, cn } from '@/lib/utils';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { Badge, Checkbox, Progress } from '@/components/ui/misc';
import { DeckGlyph } from './deckVisuals';

interface Props {
  deck: Deck;
  summary: DeckSummary;
  folderName?: string;
  menuItems: MenuItem[];
  selected: boolean;
  onSelect: (v: boolean) => void;
  view: 'grid' | 'list';
}

function MenuButton({ items, name }: { items: MenuItem[]; name: string }) {
  return (
    <Menu
      label={`Actions for ${name}`}
      items={items}
      trigger={(p) => (
        <button {...p} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg">
          <Ellipsis className="h-4 w-4" aria-hidden />
        </button>
      )}
    />
  );
}

export function DeckCard({ deck, summary, folderName, menuItems, selected, onSelect, view }: Props) {
  const meta = (
    <div className="flex flex-wrap items-center gap-1.5">
      {summary.due > 0 && <Badge tone="accent">{summary.due} due</Badge>}
      {summary.newCount > 0 && <Badge>{summary.newCount} new</Badge>}
      {deck.archived ? (
        <Badge tone="warning">
          <Archive className="h-3 w-3" aria-hidden /> Archived
        </Badge>
      ) : null}
      {folderName && <Badge>{folderName}</Badge>}
      {deck.tags.slice(0, 3).map((t) => (
        <Badge key={t}>#{t}</Badge>
      ))}
    </div>
  );

  if (view === 'list') {
    return (
      <div className={cn('flex items-center gap-3 px-4 py-3 transition-colors', selected && 'bg-accent-soft/60')}>
        <Checkbox checked={selected} onChange={onSelect} label={`Select ${deck.name}`} />
        <DeckGlyph icon={deck.icon} color={deck.color} size="sm" />
        <div className="min-w-0 flex-1">
          <Link to={`/decks/${deck.id}`} className="block truncate text-sm font-medium hover:text-accent">
            {deck.name}
          </Link>
          <div className="mt-1 hidden sm:block">{meta}</div>
        </div>
        <div className="hidden w-28 md:block">
          <Progress value={summary.masteryPct} label={`${deck.name} mastery`} size="sm" />
          <p className="mt-1 text-[11px] text-muted">{summary.masteryPct}% mastered</p>
        </div>
        <span className="hidden w-20 text-right text-xs tabular-nums text-muted sm:block">{plural(summary.total, 'card')}</span>
        <span className="hidden w-24 text-right text-xs text-muted lg:block">{formatRelative(deck.lastStudiedAt)}</span>
        <MenuButton items={menuItems} name={deck.name} />
      </div>
    );
  }

  return (
    <div className={cn('panel group relative flex flex-col p-4 transition-shadow hover:shadow-pop', selected && 'ring-2 ring-accent')}>
      <div className="flex items-start justify-between gap-2">
        <DeckGlyph icon={deck.icon} color={deck.color} />
        <div className="relative z-[2] flex items-center gap-1">
          <Checkbox checked={selected} onChange={onSelect} label={`Select ${deck.name}`} className="opacity-70 group-hover:opacity-100" />
          <MenuButton items={menuItems} name={deck.name} />
        </div>
      </div>
      <Link to={`/decks/${deck.id}`} className="mt-3 block after:absolute after:inset-0 after:rounded-xl after:content-['']" aria-label={`Open ${deck.name}`}>
        <h3 className="line-clamp-1 text-[15px] font-semibold">{deck.name}</h3>
      </Link>
      <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{deck.description || 'No description'}</p>
      <div className="relative z-[1] mt-3 pointer-events-none">{meta}</div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{summary.masteryPct}% mastered</span>
          <span className="tabular-nums">{plural(summary.total, 'card')}</span>
        </div>
        <Progress value={summary.masteryPct} label={`${deck.name} mastery`} size="sm" />
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>Revision progress {summary.progressPct}%</span>
          <span>Studied {formatRelative(deck.lastStudiedAt).toLowerCase()}</span>
        </div>
      </div>
    </div>
  );
}
