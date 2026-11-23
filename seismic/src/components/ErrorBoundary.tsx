import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { fallback: (error: Error) => ReactNode; children: ReactNode; onError?: (e: Error, info: ErrorInfo) => void }
interface State { error: Error | null }

/** Isolates failures (e.g. no WebGL) so one panel can't blank the dashboard. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
