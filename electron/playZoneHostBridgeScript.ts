export const PLAY_ZONE_HOST_BRIDGE_SCRIPT = `
(() => {
  "use strict";
  if (window.LEM_GAME_HOST_API) {
    return;
  }

  const pending = new Map();
  let nextRequestId = 1;
  let latestSaveValue = null;
  let hasLatestSaveValue = false;

  function request(method, payload) {
    const requestId = "lem-host-" + Date.now() + "-" + nextRequestId++;
    const requestPayload = payload === undefined ? null : payload;
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        pending.delete(requestId);
        resolve({
          ok: false,
          code: "timeout",
          message: "Language Miner Host API 응답 시간이 초과되었습니다."
        });
      }, 30000);
      pending.set(requestId, { resolve, timeoutId });
      window.parent.postMessage(
        {
          type: "lem.game.host.request",
          requestId,
          method,
          payload: requestPayload
        },
        "*"
      );
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== "lem.game.host.response" || typeof data.requestId !== "string") {
      return;
    }
    const pendingRequest = pending.get(data.requestId);
    if (!pendingRequest) {
      return;
    }
    pending.delete(data.requestId);
    window.clearTimeout(pendingRequest.timeoutId);
    pendingRequest.resolve(data.payload);
  });

  const params = new URLSearchParams(window.location.search);
  window.LEM_GAME_HOST_API = {
    packId: params.get("cartridgeId") || "external-cartridge",
    appVersion: "language-miner-host",
    wallet: {
      getBalance() {
        return request("wallet.getBalance", {});
      },
      spend(input) {
        return request("wallet.spend", input || {});
      }
    },
    save: {
      load(fallback) {
        return request("save.load", { fallback });
      },
      write(value) {
        latestSaveValue = value === undefined ? null : value;
        hasLatestSaveValue = true;
        return request("save.write", { value });
      },
      clear() {
        latestSaveValue = null;
        hasLatestSaveValue = false;
        return request("save.clear", {});
      }
    },
    ui: {
      toast(message) {
        void request("ui.toast", { message });
      },
      confirm(input) {
        return request("ui.confirm", input || {});
      }
    }
  };

  function flushLatestSave() {
    if (!hasLatestSaveValue) {
      return;
    }
    window.parent.postMessage(
      {
        type: "lem.game.host.request",
        requestId: "lem-host-flush-" + Date.now(),
        method: "save.write",
        payload: { value: latestSaveValue }
      },
      "*"
    );
  }

  window.addEventListener("pagehide", flushLatestSave);
  window.addEventListener("beforeunload", flushLatestSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushLatestSave();
    }
  });
})();
`.trim();

export function injectPlayZoneHostBridge(html: string) {
  const scriptTag = `<script>${PLAY_ZONE_HOST_BRIDGE_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${scriptTag}`);
  }
  return `${scriptTag}\n${html}`;
}
