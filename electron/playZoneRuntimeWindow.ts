import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindowConstructorOptions } from "electron";
import type {
  PlayZoneDiamondAction,
  PlayZoneRuntimeAuthorization
} from "../src/shared/types";

export type PlayZoneRuntimeWindowInput = {
  runtimeId?: unknown;
  cartridgeId?: unknown;
  title?: unknown;
  entryUrl?: unknown;
  walletBalance?: unknown;
  diamondActions?: unknown;
};

export const PLAY_ZONE_RUNTIME_PARTITION = "playzone-runtime";

type PlayZoneRuntimeWindow = {
  loadURL(url: string): Promise<unknown>;
  loadFile(filePath: string, options?: { query?: Record<string, string> }): Promise<unknown>;
  show(): void;
  focus(): void;
  destroy?(): void;
  on?(event: "closed", listener: () => void): void;
  webContents?: {
    on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
    on(
      event: "will-frame-navigate",
      listener: (details: { preventDefault(): void; url: string; isMainFrame: boolean }) => void
    ): void;
    setWindowOpenHandler(handler: () => { action: "deny" }): void;
    session?: {
      webRequest: {
        onBeforeRequest(
          filter: { urls: string[] },
          listener: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void
        ): void;
      };
    };
  };
};

export type PlayZoneRuntimeWindowDependencies = {
  additionalArguments: string[];
  appLocale: "ko" | "en";
  createWindow(options: BrowserWindowConstructorOptions): PlayZoneRuntimeWindow;
  devServerUrl?: string;
  distIndexPath: string;
  preloadPath: string;
  resolveEntryAuthorization(entryUrl: string): PlayZoneRuntimeAuthorization | null;
  notifyWalletChanged?(): void;
  runtimePageLoadTimeoutMs?: number;
};

export const PLAY_ZONE_RUNTIME_PAGE_LOAD_TIMEOUT_MS = 15_000;

type HeaderPatchDetails = {
  requestHeaders: Record<string, string>;
};

type HeaderPatchCallback = (response: { requestHeaders: Record<string, string> }) => void;

type HeaderPatchSession = {
  webRequest: {
    onBeforeSendHeaders(
      filter: { urls: string[] },
      listener: (details: HeaderPatchDetails, callback: HeaderPatchCallback) => void
    ): void;
  };
};

let youtubeEmbedHeaderPatchRegistered = false;

export function isAllowedPlayZoneRuntimeWindowUrl(
  rawUrl: string,
  dependencies: Pick<PlayZoneRuntimeWindowDependencies, "devServerUrl" | "distIndexPath">
) {
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.searchParams.get("playZoneRuntime") !== "cartridge") {
      return false;
    }

    if (dependencies.devServerUrl) {
      return parsedUrl.origin === new URL(dependencies.devServerUrl).origin;
    }

    if (parsedUrl.protocol !== "file:") {
      return false;
    }

    return path.normalize(fileURLToPath(parsedUrl)) === path.normalize(dependencies.distIndexPath);
  } catch {
    return false;
  }
}

export function createPlayZoneRuntimeWindowOptions(
  dependencies: Pick<PlayZoneRuntimeWindowDependencies, "additionalArguments" | "preloadPath">
): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a",
    title: "PlayZone Game",
    autoHideMenuBar: true,
    webPreferences: {
      preload: dependencies.preloadPath,
      additionalArguments: dependencies.additionalArguments,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PLAY_ZONE_RUNTIME_PARTITION,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  };
}

export function registerYouTubeEmbedRequestHeaders(electronSession: HeaderPatchSession) {
  if (youtubeEmbedHeaderPatchRegistered) {
    return;
  }
  youtubeEmbedHeaderPatchRegistered = true;

  electronSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "https://www.youtube.com/*",
        "https://www.youtube-nocookie.com/*",
        "https://*.googlevideo.com/*"
      ]
    },
    (details, callback) => {
      callback({ requestHeaders: createYouTubeEmbedRequestHeaders(details.requestHeaders) });
    }
  );
}

export async function openPlayZoneRuntimeWindow(
  input: PlayZoneRuntimeWindowInput,
  dependencies: PlayZoneRuntimeWindowDependencies
) {
  const runtimeId = normalizePlayZoneRuntimeId(input.runtimeId);
  if (!runtimeId) {
    return false;
  }

  const normalizedEntryUrl = normalizePlayZoneRuntimeEntryUrl(input.entryUrl);
  const authorization = normalizedEntryUrl
    ? dependencies.resolveEntryAuthorization(normalizedEntryUrl)
    : null;
  const entryUrl = normalizePlayZoneRuntimeEntryUrl(authorization?.entryUrl);
  if (!authorization || !entryUrl) {
    return false;
  }

  const cartridgeId = normalizePlayZoneRuntimeText(authorization.cartridgeId, "external-cartridge");
  const title = normalizePlayZoneRuntimeText(authorization.title, "PlayZone Game");

  const walletBalance = normalizePlayZoneWalletBalance(input.walletBalance);
  const appLocale = normalizePlayZoneRuntimeLocale(dependencies.appLocale);
  const diamondActions = authorization.permissions.walletSpend
    ? normalizePlayZoneDiamondActions(authorization.diamondActions)
    : [];
  const gameWindow = dependencies.createWindow(createPlayZoneRuntimeWindowOptions(dependencies));
  applyPlayZoneRuntimeNetworkDeny(gameWindow, dependencies.devServerUrl);
  gameWindow.webContents?.setWindowOpenHandler(() => ({ action: "deny" }));
  gameWindow.webContents?.on("will-navigate", (event, url) => {
    if (!isAllowedPlayZoneRuntimeWindowUrl(url, dependencies)) event.preventDefault();
  });
  gameWindow.webContents?.on("will-frame-navigate", (details) => {
    if (!details.isMainFrame && !isAllowedPlayZoneCartridgeUrl(details.url, entryUrl)) {
      details.preventDefault();
    }
  });
  gameWindow.on?.("closed", () => {
    dependencies.notifyWalletChanged?.();
  });

  try {
    const loadOperation = dependencies.devServerUrl
      ? (() => {
          const runtimeUrl = new URL(dependencies.devServerUrl);
          runtimeUrl.searchParams.set("playZoneRuntime", runtimeId);
          runtimeUrl.searchParams.set("cartridgeId", cartridgeId);
          runtimeUrl.searchParams.set("title", title);
          runtimeUrl.searchParams.set("entryUrl", entryUrl);
          runtimeUrl.searchParams.set("walletBalance", String(walletBalance));
          runtimeUrl.searchParams.set("appLocale", appLocale);
          runtimeUrl.searchParams.set("diamondActions", JSON.stringify(diamondActions));
          runtimeUrl.searchParams.set("permissions", JSON.stringify(authorization.permissions));
          return gameWindow.loadURL(runtimeUrl.toString());
        })()
      : gameWindow.loadFile(dependencies.distIndexPath, {
          query: {
            playZoneRuntime: runtimeId,
            cartridgeId,
            title,
            entryUrl,
            walletBalance: String(walletBalance),
            appLocale,
            diamondActions: JSON.stringify(diamondActions),
            permissions: JSON.stringify(authorization.permissions)
          }
        });
    await withRuntimePageLoadTimeout(
      loadOperation,
      dependencies.runtimePageLoadTimeoutMs ?? PLAY_ZONE_RUNTIME_PAGE_LOAD_TIMEOUT_MS
    );
  } catch (error) {
    gameWindow.destroy?.();
    throw error;
  }

  gameWindow.show();
  gameWindow.focus();
  return true;
}

function normalizePlayZoneRuntimeLocale(value: unknown): "ko" | "en" {
  return value === "en" ? "en" : "ko";
}

function withRuntimePageLoadTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : PLAY_ZONE_RUNTIME_PAGE_LOAD_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("PlayZone runtime page load timed out. [PLAY_ZONE_RUNTIME_PAGE_LOAD_TIMEOUT]"));
    }, boundedTimeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function isAllowedPlayZoneCartridgeUrl(rawUrl: string, authorizedEntryUrl: string) {
  try {
    const candidate = new URL(rawUrl);
    const authorized = new URL(authorizedEntryUrl);
    return (
      candidate.protocol === "lem-playzone:" &&
      candidate.protocol === authorized.protocol &&
      candidate.hostname === authorized.hostname &&
      candidate.pathname.split("/").slice(0, 3).join("/") ===
        authorized.pathname.split("/").slice(0, 3).join("/")
    );
  } catch {
    return false;
  }
}

function applyPlayZoneRuntimeNetworkDeny(
  gameWindow: PlayZoneRuntimeWindow,
  devServerUrl?: string
) {
  const webRequest = gameWindow.webContents?.session?.webRequest;
  if (!webRequest) return;
  const allowedDevOrigin = devServerUrl ? new URL(devServerUrl).origin : "";
  webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      let allowed = false;
      if (allowedDevOrigin) {
        try {
          allowed = new URL(details.url).origin === allowedDevOrigin;
        } catch {
          allowed = false;
        }
      }
      callback({ cancel: !allowed });
    }
  );
}

export function createYouTubeEmbedRequestHeaders(requestHeaders: Record<string, string>) {
  const normalizedHeaders = { ...requestHeaders };
  const hasReferer = Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === "referer");

  if (!hasReferer) {
    normalizedHeaders.Referer = "https://www.youtube.com/";
  }

  return normalizedHeaders;
}

export function normalizePlayZoneRuntimeId(value: unknown) {
  return value === "cartridge" ? value : null;
}

export function normalizePlayZoneRuntimeText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return normalized || fallback;
}

export function normalizePlayZoneRuntimeEntryUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\0")) {
    return null;
  }
  if (trimmed.replace(/\\/g, "/").split("/").includes("..")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, "app://playzone/");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return null;
    }
    if (parsed.pathname.includes("..")) {
      return null;
    }
  } catch {
    return null;
  }

  return trimmed.slice(0, 2048);
}

export function normalizePlayZoneWalletBalance(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function normalizePlayZoneDiamondActions(value: unknown): PlayZoneDiamondAction[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const actions: PlayZoneDiamondAction[] = [];
  for (const raw of value.slice(0, 64)) {
    if (!raw || typeof raw !== "object") continue;
    const input = raw as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const amount = Math.floor(Number(input.amount));
    const reason = typeof input.reason === "string"
      ? input.reason.trim().replace(/\s+/g, " ").slice(0, 160)
      : "";
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) ||
      seen.has(id) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1_000_000 ||
      !reason
    ) continue;
    seen.add(id);
    actions.push({ id, amount, reason, requiresConfirm: true, repeatable: input.repeatable === true });
  }
  return actions;
}
