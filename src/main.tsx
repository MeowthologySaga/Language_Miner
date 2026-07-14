import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import i18n from "./i18n";
import {
  APP_RENDERER_READY_EVENT,
  APP_STARTUP_PAINT_FALLBACK_MS
} from "./startupLifecycle";
import "./styles.css";
import "./styles/appShell.css";
import "./styles/dailyProgress.css";
import "./styles/cardSurfaces.css";
import "./styles/emptyState.css";
import "./styles/settingsProfile.css";
import "./styles/onboarding.css";
import "./styles/accessibility.css";

const rootElement = document.getElementById("root") as HTMLElement;
const startupPaint = document.getElementById("startup-paint");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary title={i18n.t("app.startupError")}>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

if (startupPaint) {
  let finalized = false;
  let startupFallbackTimer: number | undefined;
  const finishStartup = () => {
    if (finalized) return;
    finalized = true;
    if (startupFallbackTimer !== undefined) {
      window.clearTimeout(startupFallbackTimer);
      startupFallbackTimer = undefined;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const markRendererReady = window.localEnglishMiner?.app?.markRendererReady;
        startupPaint.remove();
        if (markRendererReady) {
          void markRendererReady().catch(() => false);
        }
      });
    });
  };

  if (new URLSearchParams(window.location.search).has("playZoneRuntime")) {
    finishStartup();
  } else {
    window.addEventListener(APP_RENDERER_READY_EVENT, finishStartup, { once: true });
    startupFallbackTimer = window.setTimeout(finishStartup, APP_STARTUP_PAINT_FALLBACK_MS);
  }
}
