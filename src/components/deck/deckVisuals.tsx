import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Code2,
  FlaskConical,
  Globe2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Music,
  Palette,
  Scale,
  Sigma,
  type LucideIcon,
} from 'lucide-react';
import type { DeckColor, DeckIcon } from '@/types';
import { cn } from '@/lib/utils';

export const ICONS: Record<DeckIcon, LucideIcon> = {
  book: BookOpen,
  brain: Brain,
  flask: FlaskConical,
  atom: Atom,
  calculator: Calculator,
  globe: Globe2,
  languages: Languages,
  music: Music,
  palette: Palette,
  code: Code2,
  landmark: Landmark,
  'heart-pulse': HeartPulse,
  leaf: Leaf,
  scale: Scale,
  sigma: Sigma,
  'graduation-cap': GraduationCap,
};

/** Static class maps so Tailwind can see every class at build time. */
export const COLOR_CLASSES: Record<DeckColor, { chip: string; dot: string; bar: string; name: string }> = {
  violet: { chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-300', dot: 'bg-violet-500', bar: 'bg-violet-500', name: 'Violet' },
  indigo: { chip: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300', dot: 'bg-indigo-500', bar: 'bg-indigo-500', name: 'Indigo' },
  blue: { chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', dot: 'bg-blue-500', bar: 'bg-blue-500', name: 'Blue' },
  sky: { chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', bar: 'bg-sky-500', name: 'Sky' },
  teal: { chip: 'bg-teal-500/10 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', bar: 'bg-teal-500', name: 'Teal' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', bar: 'bg-emerald-500', name: 'Emerald' },
  lime: { chip: 'bg-lime-500/15 text-lime-700 dark:text-lime-300', dot: 'bg-lime-500', bar: 'bg-lime-500', name: 'Lime' },
  amber: { chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', bar: 'bg-amber-500', name: 'Amber' },
  orange: { chip: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', bar: 'bg-orange-500', name: 'Orange' },
  rose: { chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-300', dot: 'bg-rose-500', bar: 'bg-rose-500', name: 'Rose' },
  pink: { chip: 'bg-pink-500/10 text-pink-600 dark:text-pink-300', dot: 'bg-pink-500', bar: 'bg-pink-500', name: 'Pink' },
  slate: { chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', dot: 'bg-slate-500', bar: 'bg-slate-500', name: 'Slate' },
};

export function DeckGlyph({ icon, color, size = 'md', className }: { icon: DeckIcon; color: DeckColor; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = ICONS[icon] ?? BookOpen;
  const s = { sm: 'h-7 w-7 rounded-lg', md: 'h-10 w-10 rounded-xl', lg: 'h-12 w-12 rounded-xl' }[size];
  const i = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-6 w-6' }[size];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', s, COLOR_CLASSES[color]?.chip ?? COLOR_CLASSES.violet.chip, className)} aria-hidden>
      <Icon className={i} />
    </span>
  );
}
