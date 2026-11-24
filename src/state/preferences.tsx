import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { savePreferences } from '@/db/repo';
import { DEFAULT_PREFERENCES, type Preferences } from '@/types';

interface PreferencesApi {
  prefs: Preferences;
  ready: boolean;
  update: (patch: Partial<Preferences>) => Promise<void>;
  /** True when animations should be minimised. */
  reducedMotion: boolean;
}

const PreferencesContext = createContext<PreferencesApi | null>(null);

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
function systemReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * User preferences live in IndexedDB (so they are part of backups) and are
 * mirrored to localStorage only for the few values needed before first paint
 * (theme, accent, motion) — see public/theme-init.js.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  // undefined = loading, false = no saved preferences yet.
  const record = useLiveQuery(async () => (await db.preferences.get('preferences')) ?? false, []);
  const ready = record !== undefined;
  const prefs = useMemo<Preferences>(() => {
    if (!record) return DEFAULT_PREFERENCES;
    const { id: _id, ...rest } = record;
    return { ...DEFAULT_PREFERENCES, ...rest };
  }, [record]);

  const [sysDark, setSysDark] = useState(systemDark());
  const [sysReduced, setSysReduced] = useState(systemReducedMotion());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mq2 = window.matchMedia('(prefers-reduced-motion: reduce)');
    const a = () => setSysDark(mq.matches);
    const b = () => setSysReduced(mq2.matches);
    mq.addEventListener('change', a);
    mq2.addEventListener('change', b);
    return () => {
      mq.removeEventListener('change', a);
      mq2.removeEventListener('change', b);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && sysDark);
    root.classList.toggle('dark', dark);
    if (prefs.accent === 'foundy') delete root.dataset.accent;
    else root.dataset.accent = prefs.accent;
    if (prefs.motion === 'system') delete root.dataset.motion;
    else root.dataset.motion = prefs.motion;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', dark ? '#0b0b10' : '#faf8f1');
    try {
      localStorage.setItem('foundy:theme', prefs.theme);
      localStorage.setItem('foundy:accent', prefs.accent === 'foundy' ? '' : prefs.accent);
      localStorage.setItem('foundy:motion', prefs.motion);
    } catch {
      /* storage unavailable */
    }
  }, [prefs.theme, prefs.accent, prefs.motion, sysDark]);

  const update = useCallback(async (patch: Partial<Preferences>) => {
    await savePreferences(patch);
  }, []);

  const reducedMotion = prefs.motion === 'reduced' || (prefs.motion === 'system' && sysReduced);

  const value = useMemo(() => ({ prefs, ready, update, reducedMotion }), [prefs, ready, update, reducedMotion]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesApi {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
