import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

/**
 * Accessible dropdown menu (button + role="menu"). Arrow keys move focus,
 * Home/End jump, Escape or Tab closes and returns focus to the trigger.
 */
export function Menu({ trigger, items, label, align = 'end' }: { trigger: (props: { ref: React.Ref<HTMLButtonElement>; onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string; 'aria-label': string }) => ReactNode; items: MenuItem[]; label: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 208;
    const left = align === 'end' ? Math.max(8, r.right - width) : Math.min(window.innerWidth - width - 8, r.left);
    const estimatedHeight = items.length * 38 + 12;
    const top = r.bottom + estimatedHeight + 8 > window.innerHeight ? Math.max(8, r.top - estimatedHeight - 4) : r.bottom + 4;
    setPos({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const idx = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(idx + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(idx - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <>
      {trigger({ ref: btnRef, onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id, 'aria-label': label })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[65] w-52 rounded-xl border border-border bg-elevated p-1 shadow-pop"
          >
            {items.map((item) => (
              <div key={item.label}>
                {item.separatorBefore && <div className="my-1 h-px bg-border" role="separator" />}
                <button
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors disabled:opacity-40',
                    item.danger ? 'text-danger hover:bg-danger/10 focus:bg-danger/10' : 'hover:bg-subtle focus:bg-subtle',
                  )}
                >
                  {item.icon && <span className="flex h-4 w-4 items-center justify-center opacity-80">{item.icon}</span>}
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
