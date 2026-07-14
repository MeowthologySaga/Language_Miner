import { useEffect, useRef } from "react";

type AdaptivePollingOptions = {
  activeIntervalMs: number;
  enabled?: boolean;
  inactiveIntervalMs?: number;
  isActive?: () => boolean;
  runImmediately?: boolean;
};

const MIN_POLL_INTERVAL_MS = 1000;

export function useAdaptivePolling(
  task: () => void | Promise<void>,
  {
    activeIntervalMs,
    enabled = true,
    inactiveIntervalMs = 5000,
    isActive,
    runImmediately = false
  }: AdaptivePollingOptions
) {
  const taskRef = useRef(task);
  const isActiveRef = useRef(isActive);
  taskRef.current = task;
  isActiveRef.current = isActive;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let timer = 0;
    const activeDelay = normalizePollingInterval(activeIntervalMs);
    const inactiveDelay = normalizePollingInterval(inactiveIntervalMs);

    const schedule = (delay: number) => {
      if (!disposed) {
        timer = window.setTimeout(tick, delay);
      }
    };

    const isCurrentlyActive = () =>
      document.visibilityState !== "hidden" && (isActiveRef.current?.() ?? true);

    const tick = async () => {
      if (disposed) {
        return;
      }
      if (!isCurrentlyActive()) {
        schedule(inactiveDelay);
        return;
      }

      try {
        await taskRef.current();
      } catch {
        // Polling is best effort; the next bounded cycle may recover.
      } finally {
        schedule(activeDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      window.clearTimeout(timer);
      void tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (runImmediately) {
      void tick();
    } else {
      schedule(activeDelay);
    }

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeIntervalMs, enabled, inactiveIntervalMs, runImmediately]);
}

export function normalizePollingInterval(intervalMs: number) {
  if (!Number.isFinite(intervalMs)) {
    return MIN_POLL_INTERVAL_MS;
  }
  return Math.max(MIN_POLL_INTERVAL_MS, Math.round(intervalMs));
}

export function isElementActuallyVisible(element: HTMLElement | null) {
  return Boolean(element?.isConnected && element.getClientRects().length > 0);
}
