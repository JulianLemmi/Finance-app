// Boundary de errores de React. Captura excepciones en el subárbol y muestra
// un fallback con botón de reintento. Después de MAX_RESETS intentos fallidos,
// deja de ofrecer el reintento para no ciclar indefinidamente.
import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

const MAX_RESETS = 3;

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (props: { error: Error | null; reset: () => void }) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetCount: number;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => {
    this.setState((s) => ({
      hasError: false,
      error: null,
      resetCount: s.resetCount + 1,
    }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    const exhausted = this.state.resetCount >= MAX_RESETS;

    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-900/40 bg-rose-950/20 px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
        </div>
        <div className="text-sm font-medium text-rose-200">
          {exhausted ? "Esta sección no se puede mostrar" : "Algo salió mal"}
        </div>
        <div className="mt-1 max-w-md text-xs leading-relaxed text-rose-300/70">
          {exhausted
            ? "El error sigue apareciendo después de varios intentos. Cambiá de tab o recargá la página."
            : this.state.error?.message || "Ocurrió un error inesperado en esta sección."}
        </div>
        {!exhausted && (
          <button
            onClick={this.reset}
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-700/40 bg-rose-900/30 px-4 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-900/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        )}
      </div>
    );
  }
}
