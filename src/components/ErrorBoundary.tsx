import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in the fallback, e.g. the page/section name that crashed. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defense against an uncaught render-time error — for
 * example, a page reading `window.nexus` before checking it's actually
 * there. Contains the crash to whatever it wraps instead of blanking
 * the entire app, and never fabricates a recovery: the user has to
 * explicitly retry, and nothing here claims the underlying problem is
 * fixed on its own.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error(`[NEXUS] ${this.props.label ?? "A page"} crashed:`, error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-nexus-danger/40 bg-nexus-danger/10 p-5">
        <p className="text-sm font-medium text-nexus-danger">
          {this.props.label ? `${this.props.label} failed to load.` : "Something went wrong."}
        </p>
        <p className="text-xs text-nexus-text-muted">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text"
        >
          Try again
        </button>
      </div>
    );
  }
}
