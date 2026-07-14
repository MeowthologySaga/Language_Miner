import "../styles/playZone.css";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../components/Dialog";
import type { PlayZoneDiamondAction, PlayZonePermissions } from "../shared/types";
import "./PlayZoneRuntimePage.css";

type PlayZoneRuntimeId = "cartridge";

type PlayZoneRuntimePayload = {
  runtimeId: PlayZoneRuntimeId | null;
  cartridgeId: string;
  title: string;
  entryUrl: string | null;
  permissions: PlayZonePermissions;
  diamondActions: PlayZoneDiamondAction[];
};

const PLAY_ZONE_ENTRY_PROTOCOL = "lem-playzone:";

type HostRequestMessage = {
  type: "lem.game.host.request";
  requestId: string;
  method: string;
  payload?: unknown;
};

type HostSpendResult =
  | { ok: true; transactionId: string; balanceAfter: number; idempotentReplay?: boolean }
  | { ok: false; code: string; message: string; balance?: number };

type RuntimeConfirmation = {
  id: number;
  title: string;
  message: string;
  resolve: (confirmed: boolean) => void;
};

type FrameLoadState = "loading" | "loaded" | "error";

const PLAY_ZONE_FRAME_LOAD_TIMEOUT_MS = 12_000;

type RuntimeText = {
  actionNotAllowed: string;
  cancelled: string;
  confirmFallbackMessage: string;
  confirmFallbackTitle: string;
  hostUnavailable: string;
  hostError: string;
  idempotencyRequired: string;
  permissionDenied: (permission: keyof PlayZonePermissions) => string;
  unknownMethod: (method: string) => string;
  spendMessage: (reason: string, amount: number, balance: number) => string;
};

export function PlayZoneRuntimePage() {
  const { i18n, t } = useTranslation();
  const runtimeAppLocale = useMemo(readRuntimeAppLocale, []);
  const payload = useMemo(() => readRuntimePayload(t("playZone.runtime.gameFallback")), [t]);
  const initialWalletBalance = useMemo(() => readInitialWalletBalance(), []);
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance);
  const [frameLoadState, setFrameLoadState] = useState<FrameLoadState>("loading");
  const [frameRetryNonce, setFrameRetryNonce] = useState(0);
  const [activeConfirmation, setActiveConfirmation] = useState<RuntimeConfirmation | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const spendResultsRef = useRef(new Map<string, HostSpendResult>());
  const spendInflightRef = useRef(new Map<string, Promise<HostSpendResult>>());
  const confirmationQueueRef = useRef<RuntimeConfirmation[]>([]);
  const activeConfirmationRef = useRef<RuntimeConfirmation | null>(null);
  const confirmationIdRef = useRef(0);

  useLayoutEffect(() => {
    if (i18n.resolvedLanguage !== runtimeAppLocale) {
      void i18n.changeLanguage(runtimeAppLocale);
    }
  }, [i18n, runtimeAppLocale]);

  const showNextConfirmation = useCallback(() => {
    if (activeConfirmationRef.current) return;
    const next = confirmationQueueRef.current.shift() ?? null;
    activeConfirmationRef.current = next;
    setActiveConfirmation(next);
  }, []);

  const requestConfirmation = useCallback(
    (details: { title: string; message: string }) =>
      new Promise<boolean>((resolve) => {
        confirmationQueueRef.current.push({
          id: ++confirmationIdRef.current,
          title: details.title,
          message: details.message,
          resolve
        });
        showNextConfirmation();
      }),
    [showNextConfirmation]
  );

  const finishConfirmation = useCallback(
    (confirmed: boolean) => {
      const current = activeConfirmationRef.current;
      if (!current) return;
      activeConfirmationRef.current = null;
      setActiveConfirmation(null);
      current.resolve(confirmed);
      window.queueMicrotask(showNextConfirmation);
    },
    [showNextConfirmation]
  );

  const runtimeText = useMemo<RuntimeText>(
    () => ({
      actionNotAllowed: t("playZone.runtime.actionNotAllowed"),
      cancelled: t("playZone.runtime.spendCancelled"),
      confirmFallbackMessage: t("playZone.runtime.confirmFallbackMessage"),
      confirmFallbackTitle: t("playZone.runtime.confirmFallbackTitle"),
      hostUnavailable: t("playZone.runtime.walletUnavailable"),
      hostError: t("playZone.runtime.hostError"),
      idempotencyRequired: t("playZone.runtime.idempotencyRequired"),
      permissionDenied: (permission) =>
        t("playZone.runtime.permissionDenied", { permission }),
      unknownMethod: (method) => t("playZone.runtime.unknownMethod", { method }),
      spendMessage: (reason, amount, balance) =>
        t("playZone.runtime.spendMessage", { reason, amount, balance })
    }),
    [t]
  );

  useEffect(() => {
    document.title = payload.title
      ? t("playZone.runtime.windowTitle", { title: payload.title })
      : t("playZone.runtime.gameFallback");
  }, [payload.title, t]);

  useEffect(
    () => () => {
      activeConfirmationRef.current?.resolve(false);
      activeConfirmationRef.current = null;
      for (const pending of confirmationQueueRef.current.splice(0)) {
        pending.resolve(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    if (!payload.permissions.walletSpend) {
      return;
    }

    void window.localEnglishMiner?.wallet
      ?.get()
      .then((wallet) => {
        if (!cancelled) {
          setWalletBalance(wallet.balance);
        }
      })
      .catch(() => {
        // The query value is a safe fallback for web previews without the Electron bridge.
      });

    return () => {
      cancelled = true;
    };
  }, [payload.permissions.walletSpend]);

  useEffect(() => {
    function handleHostMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow || !isHostRequestMessage(event.data)) {
        return;
      }
      void handleHostRequest({
        message: event.data,
        source: event.source,
        payload,
        currentBalance: walletBalance,
        updateBalance: setWalletBalance,
        spendResults: spendResultsRef.current,
        spendInflight: spendInflightRef.current,
        requestConfirmation,
        text: runtimeText
      });
    }

    window.addEventListener("message", handleHostMessage);
    return () => window.removeEventListener("message", handleHostMessage);
  }, [payload, requestConfirmation, runtimeText, walletBalance]);

  const frameUrl = useMemo(() => {
    if (!payload.entryUrl) {
      return null;
    }
    return createCartridgeFrameUrl(
      payload.entryUrl,
      payload.cartridgeId,
      initialWalletBalance,
      frameRetryNonce
    );
  }, [frameRetryNonce, initialWalletBalance, payload.cartridgeId, payload.entryUrl]);

  useEffect(() => {
    if (!frameUrl) return;
    setFrameLoadState("loading");
    const timeoutId = window.setTimeout(() => {
      setFrameLoadState((current) => current === "loading" ? "error" : current);
    }, PLAY_ZONE_FRAME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [frameUrl]);

  if (payload.runtimeId !== "cartridge" || !frameUrl) {
    return (
      <main className="play-zone-runtime-window">
        <div className="play-zone-runtime-window-error">
          <h1>{t("playZone.runtime.entryMissing")}</h1>
          <button type="button" onClick={closeGameWindow}>
            {t("common.close")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="play-zone-runtime-window"
      data-frame-load-state={frameLoadState}
      data-qa="play-zone-runtime-window"
    >
      <h1 className="sr-only">{payload.title}</h1>
      {frameLoadState === "loading" ? (
        <div className="play-zone-runtime-window-loading">
          <Loader2 className="spin" size={24} />
          <span>{t("playZone.runtime.loading")}</span>
        </div>
      ) : null}
      {frameLoadState === "error" ? (
        <div className="play-zone-runtime-window-error" role="alert">
          <h2>{t("playZone.runtime.loadFailedTitle")}</h2>
          <p>{t("playZone.runtime.loadFailedDescription")}</p>
          <div className="play-zone-runtime-window-error-actions">
            <button type="button" onClick={() => setFrameRetryNonce((value) => value + 1)}>
              {t("common.retry")}
            </button>
            <button type="button" onClick={closeGameWindow}>
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : null}
      <iframe
        key={frameUrl}
        ref={iframeRef}
        className="play-zone-runtime-frame"
        title={payload.title}
        src={frameUrl}
        sandbox="allow-scripts allow-pointer-lock allow-top-navigation-to-custom-protocols"
        referrerPolicy="no-referrer"
        onError={() => setFrameLoadState("error")}
        onLoad={() => setFrameLoadState("loaded")}
      />
      {activeConfirmation ? (
        <Dialog
          ariaDescribedBy={`play-zone-runtime-confirm-message-${activeConfirmation.id}`}
          ariaLabelledBy={`play-zone-runtime-confirm-title-${activeConfirmation.id}`}
          backdropClassName="play-zone-runtime-confirm-backdrop"
          className="play-zone-runtime-confirm-dialog"
          closeOnBackdrop={false}
          onClose={() => finishConfirmation(false)}
        >
          <h2 id={`play-zone-runtime-confirm-title-${activeConfirmation.id}`}>
            {activeConfirmation.title}
          </h2>
          <p id={`play-zone-runtime-confirm-message-${activeConfirmation.id}`}>
            {activeConfirmation.message}
          </p>
          <div className="play-zone-runtime-confirm-actions">
            <button className="button secondary" type="button" onClick={() => finishConfirmation(false)}>
              {t("common.cancel")}
            </button>
            <button className="button primary" type="button" onClick={() => finishConfirmation(true)}>
              {t("common.confirm")}
            </button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}

function readRuntimeAppLocale(): "ko" | "en" {
  return new URLSearchParams(window.location.search).get("appLocale") === "en" ? "en" : "ko";
}

async function handleHostRequest(input: {
  message: HostRequestMessage;
  source: MessageEventSource | null;
  payload: PlayZoneRuntimePayload;
  currentBalance: number;
  updateBalance: (balance: number) => void;
  spendResults: Map<string, HostSpendResult>;
  spendInflight: Map<string, Promise<HostSpendResult>>;
  requestConfirmation: (details: { title: string; message: string }) => Promise<boolean>;
  text: RuntimeText;
}) {
  const responsePayload = await resolveHostRequest(input).catch(() => ({
    ok: false,
    code: "host_error",
    message: input.text.hostError
  }));

  const targetWindow = input.source as WindowProxy | null;
  targetWindow?.postMessage(
    {
      type: "lem.game.host.response",
      requestId: input.message.requestId,
      payload: responsePayload
    },
    "*"
  );
}

async function resolveHostRequest(input: {
  message: HostRequestMessage;
  payload: PlayZoneRuntimePayload;
  currentBalance: number;
  updateBalance: (balance: number) => void;
  spendResults: Map<string, HostSpendResult>;
  spendInflight: Map<string, Promise<HostSpendResult>>;
  requestConfirmation: (details: { title: string; message: string }) => Promise<boolean>;
  text: RuntimeText;
}) {
  if (input.message.method === "wallet.getBalance") {
    if (!input.payload.permissions.walletSpend) return permissionDenied("walletSpend", input.text);
    const wallet = await window.localEnglishMiner?.wallet?.get?.();
    const balance = wallet?.balance ?? input.currentBalance;
    input.updateBalance(balance);
    return { balance };
  }

  if (input.message.method === "wallet.spend") {
    if (!input.payload.permissions.walletSpend) return permissionDenied("walletSpend", input.text);
    return spendHostDiamonds(input);
  }

  if (input.message.method === "save.load") {
    if (!input.payload.permissions.storage) return permissionDenied("storage", input.text);
    const payload = readHostPayload<{ fallback?: unknown }>(input.message.payload);
    const api = window.localEnglishMiner?.playZone;
    if (api?.loadSave) {
      return api.loadSave({
        cartridgeId: input.payload.cartridgeId,
        fallback: payload.fallback
      });
    }
    const raw = localStorage.getItem(getPlayZoneSaveKey(input.payload));
    return raw ? JSON.parse(raw) : payload.fallback;
  }

  if (input.message.method === "save.write") {
    if (!input.payload.permissions.storage) return permissionDenied("storage", input.text);
    const payload = readHostPayload<{ value?: unknown }>(input.message.payload);
    const api = window.localEnglishMiner?.playZone;
    if (api?.writeSave) {
      await api.writeSave({
        cartridgeId: input.payload.cartridgeId,
        value: payload.value ?? null
      });
    } else {
      localStorage.setItem(getPlayZoneSaveKey(input.payload), JSON.stringify(payload.value ?? null));
    }
    return undefined;
  }

  if (input.message.method === "save.clear") {
    if (!input.payload.permissions.storage) return permissionDenied("storage", input.text);
    const api = window.localEnglishMiner?.playZone;
    if (api?.clearSave) {
      await api.clearSave({ cartridgeId: input.payload.cartridgeId });
    } else {
      localStorage.removeItem(getPlayZoneSaveKey(input.payload));
    }
    return undefined;
  }

  if (input.message.method === "ui.confirm") {
    const payload = readHostPayload<{ title?: unknown; message?: unknown }>(input.message.payload);
    return input.requestConfirmation({
      title: normalizeHostText(payload.title, input.text.confirmFallbackTitle),
      message: normalizeHostText(payload.message, input.text.confirmFallbackMessage)
    });
  }

  if (input.message.method === "ui.toast") {
    return undefined;
  }

  return {
    ok: false,
    code: "unknown_method",
    message: input.text.unknownMethod(input.message.method)
  };
}

async function spendHostDiamonds(input: {
  message: HostRequestMessage;
  payload: PlayZoneRuntimePayload;
  currentBalance: number;
  updateBalance: (balance: number) => void;
  spendResults: Map<string, HostSpendResult>;
  spendInflight: Map<string, Promise<HostSpendResult>>;
  requestConfirmation: (details: { title: string; message: string }) => Promise<boolean>;
  text: RuntimeText;
}): Promise<HostSpendResult> {
  const request = readHostPayload<{ id?: unknown; idempotencyKey?: unknown }>(
    input.message.payload
  );
  const actionId = normalizeHostActionId(request.id);
  const action = input.payload.diamondActions.find((candidate) => candidate.id === actionId);
  if (!action) {
    return {
      ok: false,
      code: "action_not_allowed",
      message: input.text.actionNotAllowed,
      balance: input.currentBalance
    };
  }
  const callerKey = normalizeHostIdempotencyKey(request.idempotencyKey);
  if (action.repeatable && !callerKey) {
    return {
      ok: false,
      code: "invalid_idempotency_key",
      message: input.text.idempotencyRequired,
      balance: input.currentBalance
    };
  }
  const idempotencyKey = [
    "playzone",
    sanitizeToken(input.payload.cartridgeId),
    action.id,
    action.repeatable ? callerKey : "once"
  ].join(":");
  const cached = input.spendResults.get(idempotencyKey);
  if (cached) return cached.ok ? { ...cached, idempotentReplay: true } : cached;
  const inflight = input.spendInflight.get(idempotencyKey);
  if (inflight) return inflight;

  const operation = (async (): Promise<HostSpendResult> => {
    const spendRequest = {
      amount: action.amount,
      reason: `${input.payload.title || input.payload.cartridgeId}: ${action.reason}`,
      idempotencyKey
    };
    const existing = await window.localEnglishMiner?.wallet?.lookupSpend?.(spendRequest);
    if (existing) {
      input.updateBalance(existing.wallet.balance);
      if (!existing.ok) {
        return {
          ok: false,
          code: existing.code,
          message: existing.message,
          balance: existing.balance
        };
      }
      const replayResult: HostSpendResult = {
        ok: true,
        transactionId: existing.transactionId,
        balanceAfter: existing.balanceAfter,
        idempotentReplay: true
      };
      input.spendResults.set(idempotencyKey, replayResult);
      return replayResult;
    }

    const wallet = await window.localEnglishMiner?.wallet?.get?.();
    const balance = wallet?.balance ?? input.currentBalance;
    input.updateBalance(balance);
    const confirmed = await input.requestConfirmation({
      title: input.payload.title,
      message: input.text.spendMessage(action.reason, action.amount, balance)
    });
    if (!confirmed) {
      return { ok: false, code: "cancelled", message: input.text.cancelled, balance };
    }

    const result = await window.localEnglishMiner?.wallet?.spend?.(spendRequest);
    if (!result) {
      return { ok: false, code: "host_unavailable", message: input.text.hostUnavailable, balance };
    }
    if (!result.ok) {
      input.updateBalance(result.balance);
      return { ok: false, code: result.code, message: result.message, balance: result.balance };
    }
    const spendResult: HostSpendResult = {
      ok: true,
      transactionId: result.transactionId,
      balanceAfter: result.balanceAfter,
      idempotentReplay: result.idempotentReplay
    };
    input.spendResults.set(idempotencyKey, spendResult);
    input.updateBalance(result.wallet.balance);
    return spendResult;
  })();
  input.spendInflight.set(idempotencyKey, operation);
  try {
    return await operation;
  } finally {
    if (input.spendInflight.get(idempotencyKey) === operation) {
      input.spendInflight.delete(idempotencyKey);
    }
  }
}

function isHostRequestMessage(value: unknown): value is HostRequestMessage {
  const candidate = value as Partial<HostRequestMessage>;
  return (
    Boolean(candidate) &&
    candidate.type === "lem.game.host.request" &&
    typeof candidate.requestId === "string" &&
    /^[a-zA-Z0-9._:-]{1,160}$/.test(candidate.requestId) &&
    typeof candidate.method === "string" &&
    /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(candidate.method)
  );
}

function readHostPayload<T extends Record<string, unknown>>(value: unknown): T {
  return value && typeof value === "object" ? (value as T) : ({} as T);
}

function normalizeHostText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function getPlayZoneSaveKey(payload: PlayZoneRuntimePayload) {
  return `lem:playZone:save:${payload.cartridgeId || "external-cartridge"}`;
}

function readRuntimePayload(fallbackTitle: string): PlayZoneRuntimePayload {
  if (typeof window === "undefined") {
    return {
      runtimeId: null,
      cartridgeId: "",
      title: fallbackTitle,
      entryUrl: null,
      permissions: createDeniedPermissions(),
      diamondActions: []
    };
  }

  const params = new URLSearchParams(window.location.search);
  const runtimeId = params.get("playZoneRuntime") === "cartridge" ? "cartridge" : null;
  const cartridgeId = sanitizeToken(params.get("cartridgeId") ?? "external-cartridge");
  const title = sanitizeTitle(params.get("title") ?? fallbackTitle, fallbackTitle);
  const entryUrl = readSafeEntryUrl(params.get("entryUrl"));
  const permissions = readRuntimePermissions(params.get("permissions"));
  const diamondActions = readRuntimeDiamondActions(params.get("diamondActions"));

  return {
    runtimeId,
    cartridgeId,
    title,
    entryUrl,
    permissions,
    diamondActions: permissions.walletSpend ? diamondActions : []
  };
}

function readInitialWalletBalance() {
  if (typeof window === "undefined") {
    return 0;
  }
  const value = Number(new URLSearchParams(window.location.search).get("walletBalance"));
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSafeEntryUrl(value: string | null) {
  if (!value || typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = new URL(value, window.location.href);
    if (parsed.protocol === PLAY_ZONE_ENTRY_PROTOCOL) {
      return parsed.toString();
    }
    if (parsed.protocol === "file:") {
      return parsed.toString();
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin === window.location.origin
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function createCartridgeFrameUrl(
  entryUrl: string,
  cartridgeId: string,
  walletBalance: number,
  retryNonce = 0
) {
  const url = new URL(entryUrl, window.location.href);
  url.searchParams.set("cartridgeId", cartridgeId);
  url.searchParams.set("walletBalance", String(Math.max(0, Math.floor(walletBalance))));
  url.searchParams.set("playZoneHost", "local-english-miner");
  if (retryNonce > 0) {
    url.searchParams.set("runtimeRetry", String(retryNonce));
  }
  return url.toString();
}

function sanitizeToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  return normalized || "external-cartridge";
}

function sanitizeTitle(value: string, fallback = "PlayZone") {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 80) || fallback;
}

function readRuntimeDiamondActions(value: string | null): PlayZoneDiamondAction[] {
  if (!value || value.length > 32_000) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const input = raw as Record<string, unknown>;
      const id = normalizeHostActionId(input.id);
      const amount = Math.floor(Number(input.amount));
      const reason = normalizeHostText(input.reason, "");
      if (!id || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !reason) {
        return [];
      }
      return [{
        id,
        amount,
        reason,
        requiresConfirm: true as const,
        repeatable: input.repeatable === true
      }];
    }).slice(0, 64);
  } catch {
    return [];
  }
}

function readRuntimePermissions(value: string | null): PlayZonePermissions {
  const denied = createDeniedPermissions();
  if (!value || value.length > 2_000) return denied;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      walletSpend: parsed.walletSpend === true,
      storage: parsed.storage === true,
      network: false,
      externalLinks: false,
      cardRead: false
    };
  } catch {
    return denied;
  }
}

function createDeniedPermissions(): PlayZonePermissions {
  return {
    walletSpend: false,
    storage: false,
    network: false,
    externalLinks: false,
    cardRead: false
  };
}

function permissionDenied(permission: keyof PlayZonePermissions, text: RuntimeText) {
  return {
    ok: false,
    code: "permission_denied",
    message: text.permissionDenied(permission)
  };
}

function normalizeHostActionId(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(normalized) ? normalized : "";
}

function normalizeHostIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/.test(normalized) ? normalized : "";
}

function closeGameWindow() {
  window.close();
}
