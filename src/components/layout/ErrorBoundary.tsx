import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary (e.g. on route change). */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

/** Catches render errors so one broken screen never takes down the app (or user data). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Foundy Flashcards error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-base font-semibold">Something went wrong on this screen</h1>
        <p className="mt-1 text-sm text-muted">Your decks and progress are safe — they are stored separately on this device. Try again, or go back to the dashboard.</p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-subtle p-3 text-left text-xs text-muted">{this.state.error.message}</pre>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => this.setState({ error: null })} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong">
            <RotateCcw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <a href="./" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-subtle">
            Dashboard
          </a>
        </div>
      </div>
    );
  }
}
