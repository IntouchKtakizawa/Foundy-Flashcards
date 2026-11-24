import { useEffect, useRef } from 'react';
import { usePreferences } from '@/state/preferences';
import { isTypingTarget } from '@/lib/utils';

/**
 * Global keyboard shortcuts for study modes. Ignored while typing, when a
 * modifier key is held, when shortcuts are disabled in Settings, and for
 * Space/Enter when a button or link has focus (so native activation wins).
 */
export function useStudyKeys(handler: (e: KeyboardEvent) => void, enabled = true): void {
  const { prefs } = usePreferences();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled || !prefs.keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"], [role="radio"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, prefs.keyboardShortcuts]);
}
