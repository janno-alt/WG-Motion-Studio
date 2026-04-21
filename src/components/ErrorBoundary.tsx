import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught", error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-surface-0 p-8">
          <div className="max-w-lg space-y-4 rounded-card border border-border bg-surface-1 p-6 shadow-panel">
            <h1 className="text-base font-semibold text-danger">Something went wrong.</h1>
            <pre className="selectable max-h-64 overflow-auto rounded-default bg-surface-0 p-3 font-mono text-2xs text-text-secondary">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
            <button
              type="button"
              onClick={this.reset}
              className="rounded-default bg-accent-primary px-3 py-1.5 text-sm font-medium text-surface-0 hover:bg-accent-primary-hover"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
