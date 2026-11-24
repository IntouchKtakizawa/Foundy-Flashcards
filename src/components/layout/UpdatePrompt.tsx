import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Service-worker lifecycle UI. Updates only replace cached app files — user
 * data lives in IndexedDB and is never touched by an update.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for updates hourly while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  if (!needRefresh && !offlineReady) return null;

  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-[55] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-border bg-elevated p-3.5 shadow-pop md:bottom-6">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          {needRefresh ? (
            <>
              <p className="font-medium">A new version of Foundy is available.</p>
              <p className="mt-0.5 text-xs text-muted">Your decks and progress are kept — updating only refreshes the app.</p>
            </>
          ) : (
            <>
              <p className="font-medium">Ready to work offline.</p>
              <p className="mt-0.5 text-xs text-muted">Foundy is cached on this device and can be installed as an app.</p>
            </>
          )}
          {needRefresh && (
            <Button size="sm" className="mt-2" onClick={() => updateServiceWorker(true)}>
              Update now
            </Button>
          )}
        </div>
        <button
          className="rounded p-0.5 text-muted hover:text-fg"
          aria-label="Dismiss"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
