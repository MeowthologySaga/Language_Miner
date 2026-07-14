export const APP_RENDERER_READY_EVENT = "language-miner:renderer-ready";
export const APP_STARTUP_PAINT_FALLBACK_MS = 8_000;

export function announceAppRendererReady() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_RENDERER_READY_EVENT));
}
