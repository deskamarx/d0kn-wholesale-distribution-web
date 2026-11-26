import { Component, type ErrorInfo, type ReactNode } from "react";

interface Labels {
  title: string;
  description: string;
  reload: string;
  reset: string;
}

interface Props {
  children: ReactNode;
  labels: Labels;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("D0K@N Global Distribution render error", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <div className="error-boundary-mark">!</div>
          <h2>{this.props.labels.title}</h2>
          <p>{this.props.labels.description}</p>
          <code>{this.state.error.message}</code>
          <div className="actions">
            <button type="button" className="primary" onClick={this.reset}>{this.props.labels.reset}</button>
            <button type="button" onClick={() => window.location.reload()}>{this.props.labels.reload}</button>
          </div>
        </div>
      </div>
    );
  }
}
