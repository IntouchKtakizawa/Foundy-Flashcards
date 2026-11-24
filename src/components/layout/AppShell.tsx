import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Ellipsis, PanelLeftClose, PanelLeftOpen, Search, WifiOff } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { Wordmark, LogoMark } from './Logo';
import { GlobalSearch } from './GlobalSearch';
import { UpdatePrompt } from './UpdatePrompt';
import { usePreferences } from '@/state/preferences';
import { cn, isTypingTarget } from '@/lib/utils';
import { Kbd } from '@/components/ui/misc';

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AppShell() {
  const { prefs, update } = usePreferences();
  const collapsed = prefs.sidebarCollapsed;
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const online = useOnline();
  const isSession = location.pathname.startsWith('/study/session');

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && !isTypingTarget(e.target) && prefs.keyboardShortcuts && !isSession) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.keyboardShortcuts, isSession]);

  const mobilePrimary = NAV_ITEMS.filter((n) => ['/', '/decks', '/study', '/import'].includes(n.to));
  const mobileMore = NAV_ITEMS.filter((n) => !mobilePrimary.includes(n));

  return (
    <div className="flex min-h-screen bg-bg">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
        aria-label="Primary"
      >
        <div className={cn('flex h-16 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          <Link to="/" className="rounded-lg" aria-label="Foundy Flashcards home">
            <Wordmark collapsed={collapsed} />
          </Link>
        </div>
        <div className={cn('px-3 pt-3', collapsed && 'px-2')}>
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-bg text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg',
              collapsed ? 'justify-center' : 'px-2.5',
            )}
            aria-label="Search (Ctrl+K)"
            title="Search (Ctrl+K)"
          >
            <Search className="h-4 w-4" aria-hidden />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search</span>
                <Kbd>⌘K</Kbd>
              </>
            )}
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={cn('border-t border-border p-3', collapsed && 'px-2')}>
          {!online && !collapsed && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-2 text-xs font-medium text-warning">
              <WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline — everything still works
            </div>
          )}
          <button
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-subtle hover:text-fg', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
          <Link to="/" className="flex items-center gap-2" aria-label="Foundy Flashcards home">
            <LogoMark className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">Foundy</span>
          </Link>
          <div className="flex items-center gap-1">
            {!online && <WifiOff className="mr-1 h-4 w-4 text-warning" aria-label="Offline" />}
            <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Search">
              <Search className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <div className={cn('mx-auto w-full px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-8', isSession ? 'max-w-5xl' : 'max-w-6xl')}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur safe-bottom md:hidden" aria-label="Mobile navigation">
        <div className="grid grid-cols-5">
          {mobilePrimary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label.replace('My ', '').replace(' Cards', '')}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', moreOpen ? 'text-accent' : 'text-muted')}
            aria-expanded={moreOpen}
            aria-controls="mobile-more"
          >
            <Ellipsis className="h-5 w-5" aria-hidden />
            More
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/30 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)} aria-hidden />
            <motion.div
              id="mobile-more"
              className="fixed inset-x-3 bottom-[72px] z-40 rounded-2xl border border-border bg-elevated p-2 shadow-pop md:hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.15 }}
            >
              {mobileMore.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium', isActive ? 'bg-accent-soft text-accent' : 'hover:bg-subtle')}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <UpdatePrompt />
    </div>
  );
}
