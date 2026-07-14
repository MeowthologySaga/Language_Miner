import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";
import { documentTechnicalError } from "../shared/documentPresentation";
import { announceAppRendererReady } from "../startupLifecycle";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
  title?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    announceAppRendererReady();
    console.error(i18n.t("app.routeErrorLog"), {
      name: error.name || "Error",
      componentStack: documentTechnicalError(info.componentStack)
    });
  }

  componentDidUpdate(previous: AppErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const technicalDetail = documentTechnicalError(this.state.error);

    return (
      <section className="app-route-error" role="alert">
        <strong>{this.props.title ?? i18n.t("app.routeError")}</strong>
        <p>{i18n.t("app.routeErrorDescription")}</p>
        <button className="button primary" type="button" onClick={this.retry}>
          {i18n.t("common.retry")}
        </button>
        {technicalDetail ? (
          <details className="document-technical-disclosure">
            <summary>{i18n.t("documents.technicalDetails")}</summary>
            <code>{technicalDetail}</code>
          </details>
        ) : null}
      </section>
    );
  }
}
