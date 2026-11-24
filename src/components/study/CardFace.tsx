import type { ReactNode } from 'react';
import { MarkdownView } from '@/components/card/MarkdownView';
import { cn } from '@/lib/utils';

/** One side of a card: small label, rendered Markdown/math, optional image. */
export function CardFace({ label, text, image, children, className }: { label: string; text: string; image?: string | null; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex w-full flex-col items-center text-center', className)}>
      <span className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <MarkdownView source={text} image={image} imageAlt={`${label} image`} className="w-full max-w-2xl text-lg font-medium leading-relaxed sm:text-xl" />
      {children}
    </div>
  );
}

export function Explanation({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mt-4 w-full max-w-2xl rounded-lg border border-border bg-subtle/60 px-4 py-3 text-left">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Explanation</span>
      <MarkdownView source={text} className="text-sm text-fg/90" />
    </div>
  );
}

export function HintBox({ text }: { text: string }) {
  return (
    <div role="note" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-left text-sm">
      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-warning">Hint</span>
      <MarkdownView source={text} />
    </div>
  );
}

/** Small "N of M" + progress header shared by modes. */
export function ModeProgress({ current, total, label, right }: { current: number; total: number; label?: string; right?: ReactNode }) {
  const pctValue = total ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-muted">
        <span aria-live="polite">
          {label ?? 'Card'} {Math.min(current + 1, total)} of {total}
        </span>
        {right}
      </div>
      <div role="progressbar" aria-label="Session progress" aria-valuenow={pctValue} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pctValue}%` }} />
      </div>
    </div>
  );
}
