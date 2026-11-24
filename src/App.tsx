import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { PreferencesProvider, usePreferences } from '@/state/preferences';
import { ToastProvider } from '@/state/toast';
import { Skeleton } from '@/components/ui/misc';
import { DashboardPage } from '@/pages/Dashboard';
import { DecksPage } from '@/pages/Decks';

// Heavier screens are code-split so the first load stays small.
const DeckDetailPage = lazy(() => import('@/pages/DeckDetail').then((m) => ({ default: m.DeckDetailPage })));
const CreateDeckPage = lazy(() => import('@/pages/CreateDeck').then((m) => ({ default: m.CreateDeckPage })));
const CardEditorPage = lazy(() => import('@/pages/CardEditor').then((m) => ({ default: m.CardEditorPage })));
const ImportPage = lazy(() => import('@/pages/Import').then((m) => ({ default: m.ImportPage })));
const StudyHubPage = lazy(() => import('@/pages/study/StudyHub').then((m) => ({ default: m.StudyHubPage })));
const StudySessionPage = lazy(() => import('@/pages/study/StudySession').then((m) => ({ default: m.StudySessionPage })));
const StatisticsPage = lazy(() => import('@/pages/Statistics').then((m) => ({ default: m.StatisticsPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));
const AboutPage = lazy(() => import('@/pages/About').then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}

function RoutedContent() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="decks" element={<DecksPage />} />
            <Route path="decks/new" element={<CreateDeckPage />} />
            <Route path="decks/:deckId" element={<DeckDetailPage />} />
            <Route path="decks/:deckId/cards/new" element={<CardEditorPage />} />
            <Route path="decks/:deckId/cards/:cardId" element={<CardEditorPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="study" element={<StudyHubPage />} />
            <Route path="study/session" element={<StudySessionPage />} />
            <Route path="stats" element={<StatisticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

/** Framer Motion follows the in-app motion preference (or the OS when set to "system"). */
function MotionPreference({ children }: { children: React.ReactNode }) {
  const { prefs } = usePreferences();
  const mode = prefs.motion === 'reduced' ? 'always' : prefs.motion === 'full' ? 'never' : 'user';
  return <MotionConfig reducedMotion={mode}>{children}</MotionConfig>;
}

export default function App() {
  return (
    <PreferencesProvider>
      <MotionPreference>
      <ToastProvider>
        {/* HashRouter: deep links work on GitHub Pages / Cloudflare Pages without server rewrites. */}
        <HashRouter>
          <RoutedContent />
        </HashRouter>
      </ToastProvider>
      </MotionPreference>
    </PreferencesProvider>
  );
}
