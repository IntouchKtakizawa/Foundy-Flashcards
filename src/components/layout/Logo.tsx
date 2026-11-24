import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#ec6741" />
      <rect x="19" y="13" width="32" height="23" rx="4" fill="white" fillOpacity="0.55" transform="rotate(-10 35 24.5)" />
      <rect x="13" y="23" width="33" height="24" rx="4" fill="white" transform="rotate(3.5 29.5 35)" />
      <rect x="17" y="30.5" width="17" height="2.6" rx="1.3" fill="#ec6741" transform="rotate(3.5 25.5 31.8)" />
      <rect x="17" y="36" width="13" height="2.6" rx="1.3" fill="#ec6741" transform="rotate(3.5 23.5 37.3)" />
    </svg>
  );
}

export function Wordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">Foundy</span>
          <span className="block text-[11px] font-medium text-muted">Flashcards</span>
        </span>
      )}
    </span>
  );
}
