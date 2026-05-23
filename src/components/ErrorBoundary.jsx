import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-900/40 bg-rose-950/20 px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
        </div>
        <div className="text-sm font-medium text-rose-200">Algo salió mal</div>
        <div className="mt-1 max-w-md text-xs leading-relaxed text-rose-300/70">
          {this.state.error?.message || "Ocurrió un error inesperado en esta sección."}
        </div>
        <button
          onClick={this.reset}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-700/40 bg-rose-900/30 px-4 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-900/50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    );
  }
}
