import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Element to focus when opened (defaults to first focusable). */
  initialFocus?: React.RefObject<HTMLElement>;
  dismissible?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: role="dialog", aria-modal, labelled by its title,
 * focus is trapped inside and restored to the trigger on close, Escape closes.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', initialFocus, dismissible = true }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, initialFocus]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Tab' && panelRef.current) {
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onKeyDown={onKeyDown}>
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => dismissible && onClose()}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-elevated shadow-pop sm:rounded-2xl',
              widths[size],
            )}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button onClick={onClose} className="-mr-1.5 rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Close dialog">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/60 px-5 py-3 safe-bottom">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Require typing this word to enable the confirm button. */
  confirmPhrase?: string;
  children?: ReactNode;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', destructive, loading, confirmPhrase, children }: ConfirmProps) {
  const inputId = useId();
  const typedRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      initialFocus={confirmPhrase ? (typedRef as React.RefObject<HTMLElement>) : (cancelRef as React.RefObject<HTMLElement>)}
      title={
        <span className="flex items-center gap-2">
          {destructive && <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />}
          {title}
        </span>
      }
      footer={
        <>
          <Button ref={cancelRef} variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={loading}
            onClick={async () => {
              if (confirmPhrase && typedRef.current?.value.trim().toUpperCase() !== confirmPhrase.toUpperCase()) {
                typedRef.current?.focus();
                typedRef.current?.setAttribute('aria-invalid', 'true');
                return;
              }
              await onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <div>{description}</div>
        {children}
        {confirmPhrase && (
          <div>
            <label htmlFor={inputId} className="field-label">
              Type <span className="font-mono font-semibold text-fg">{confirmPhrase}</span> to confirm
            </label>
            <input ref={typedRef} id={inputId} className="input-base" autoComplete="off" spellCheck={false} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
