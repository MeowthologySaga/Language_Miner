import {
  Database,
  Eraser,
  KeyRound,
  LogOut,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalEnglishMinerApi } from "../data/api";
import { clearPrivacyRendererStorage } from "../privacyRendererStorage";
import {
  PRIVACY_ALL_LOCAL_DATA_CONFIRMATION,
  PRIVACY_LEARNING_DATA_CONFIRMATION,
  type PrivacyDataDeleteResult,
  type PrivacyDataDeleteTarget
} from "../shared/privacyData";
type SettingsPrivacyControlsProps = {
  api: LocalEnglishMinerApi;
  className: string;
  deletionInProgress: boolean;
  onDeleteStart: (target: PrivacyDataDeleteTarget) => Promise<void> | void;
  onDeleteResult: (result: PrivacyDataDeleteResult) => void;
  onDeleteError: (target: PrivacyDataDeleteTarget) => void;
};

type DestructiveTarget = "learning_data" | "all_local_data";
type PrivacyApi = NonNullable<LocalEnglishMinerApi["privacy"]>;

export function SettingsPrivacyControls({
  api,
  className,
  deletionInProgress,
  onDeleteStart,
  onDeleteResult,
  onDeleteError
}: SettingsPrivacyControlsProps) {
  const { t } = useTranslation();
  const [pendingTarget, setPendingTarget] = useState<DestructiveTarget | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<PrivacyDataDeleteResult | null>(null);
  const [acknowledgedOperationId, setAcknowledgedOperationId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const privacyApi = api.privacy;
  const lifecycleCallbacksRef = useRef({ onDeleteStart, onDeleteResult, onDeleteError });
  lifecycleCallbacksRef.current = { onDeleteStart, onDeleteResult, onDeleteError };

  const getResultMessage = (nextResult: PrivacyDataDeleteResult) => {
    if (nextResult.ok) return t("settings.privacyControls.resultSuccess");
    if (nextResult.phase === "pending") {
      return t("settings.privacyControls.resultPending");
    }
    return t("settings.privacyControls.resultPartial");
  };

  const deliverResult = async (activePrivacyApi: PrivacyApi, next: PrivacyDataDeleteResult) => {
    setResult(next);
    setStatus(getResultMessage(next));
    if (isTerminalRendererResult(next)) {
      const acknowledged = await activePrivacyApi.acknowledgeDeleteResult(next.operationId!);
      setAcknowledgedOperationId(next.operationId!);
      setResult(acknowledged);
      setStatus(getResultMessage(acknowledged));
      lifecycleCallbacksRef.current.onDeleteResult(acknowledged);
      return acknowledged;
    }
    lifecycleCallbacksRef.current.onDeleteResult(next);
    return next;
  };

  useEffect(() => {
    if (!privacyApi?.getPendingDeleteStatus) return;
    let active = true;
    let activeTarget: PrivacyDataDeleteTarget | null = null;
    let activeOperationId: string | null = null;
    void (async () => {
      try {
        let pending = await privacyApi.getPendingDeleteStatus();
        if (!active || !pending?.operationId) return;
        activeOperationId = pending.operationId;
        activeTarget = pending.target;
        await lifecycleCallbacksRef.current.onDeleteStart(pending.target);
        if (!active) return;
        if (pending.rendererResetRequired) {
          const report = clearPrivacyRendererStorage(
            window.localStorage,
            pending.target === "all_local_data" ? "all" : "learning"
          );
          pending = await privacyApi.completeRendererCleanup({
            operationId: pending.operationId,
            report
          });
        }
        if (!active) return;
        await deliverResult(privacyApi, pending);
      } catch {
        if (active) {
          setStatus(t("settings.privacyControls.statusError", {
            error: t("settings.privacyControls.unknownError")
          }));
          if (activeTarget && !activeOperationId) {
            lifecycleCallbacksRef.current.onDeleteError(activeTarget);
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [privacyApi, t]);

  useEffect(() => {
    const operationId = result?.operationId;
    if (
      !privacyApi ||
      !operationId ||
      acknowledgedOperationId === operationId ||
      result.rendererResetRequired ||
      (result.phase !== "pending" && !isTerminalRendererResult(result))
    ) return;
    let active = true;
    let checking = false;
    const checkStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const next = await privacyApi.getDeleteStatus(operationId);
        if (!active) return;
        await deliverResult(privacyApi, next);
      } catch {
        if (!active) return;
        setStatus(t("settings.privacyControls.statusError", {
          error: t("settings.privacyControls.unknownError")
        }));
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void checkStatus(), 1_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    acknowledgedOperationId,
    privacyApi,
    result?.operationId,
    result?.phase,
    result?.rendererResetRequired,
    t
  ]);

  const actions: Array<{
    target: PrivacyDataDeleteTarget;
    title: string;
    description: string;
    icon: typeof KeyRound;
    destructive?: boolean;
  }> = [
    {
      target: "api_keys",
      title: t("settings.privacyControls.apiKeys"),
      description: t("settings.privacyControls.apiKeysDescription"),
      icon: KeyRound
    },
    {
      target: "web_reader_login",
      title: t("settings.privacyControls.webLogin"),
      description: t("settings.privacyControls.webLoginDescription"),
      icon: LogOut
    },
    {
      target: "electron_cache",
      title: t("settings.privacyControls.cache"),
      description: t("settings.privacyControls.cacheDescription"),
      icon: Eraser
    },
    {
      target: "learning_data",
      title: t("settings.privacyControls.learning"),
      description: t("settings.privacyControls.learningDescription"),
      icon: Database,
      destructive: true
    },
    {
      target: "all_local_data",
      title: t("settings.privacyControls.all"),
      description: t("settings.privacyControls.allDescription"),
      icon: Trash2,
      destructive: true
    }
  ];

  async function deleteData(target: PrivacyDataDeleteTarget, confirmationText?: string) {
    if (!privacyApi) {
      setStatus(t("settings.privacyControls.unavailable"));
      return;
    }
    setIsWorking(true);
    setAcknowledgedOperationId(null);
    setResult(null);
    setStatus(t("settings.privacyControls.working"));
    let deleteResult: PrivacyDataDeleteResult | null = null;
    try {
      await lifecycleCallbacksRef.current.onDeleteStart(target);
      let nextResult = await privacyApi.deleteData({ target, confirmation: confirmationText });
      deleteResult = nextResult;
      if (target === "learning_data" || target === "all_local_data") {
        await deliverResult(privacyApi, nextResult);
        if (!nextResult.operationId) {
          throw new Error(t("settings.privacyControls.missingOperation"));
        }
        const report = clearPrivacyRendererStorage(
          window.localStorage,
          target === "all_local_data" ? "all" : "learning"
        );
        nextResult = await privacyApi.completeRendererCleanup({
          operationId: nextResult.operationId,
          report
        });
        deleteResult = nextResult;
      }
      await deliverResult(privacyApi, nextResult);
      setPendingTarget(null);
      setConfirmation("");
    } catch {
      setStatus(t("settings.privacyControls.statusError", {
        error: t("settings.privacyControls.unknownError")
      }));
      if (deleteResult?.rendererResetRequired && deleteResult.operationId) {
        lifecycleCallbacksRef.current.onDeleteResult(deleteResult);
      } else if (!deleteResult?.operationId) {
        lifecycleCallbacksRef.current.onDeleteError(target);
      }
    } finally {
      setIsWorking(false);
    }
  }

  function beginDestructiveDelete(target: DestructiveTarget) {
    setResult(null);
    setStatus("");
    setConfirmation("");
    setPendingTarget(target);
  }

  async function retryRendererCleanup() {
    if (!privacyApi || !result?.operationId) return;
    setIsWorking(true);
    setStatus(t("settings.privacyControls.working"));
    try {
      const report = clearPrivacyRendererStorage(
        window.localStorage,
        result.target === "all_local_data" ? "all" : "learning"
      );
      const next = await privacyApi.completeRendererCleanup({
        operationId: result.operationId,
        report
      });
      await deliverResult(privacyApi, next);
    } catch {
      setStatus(t("settings.privacyControls.statusError", {
        error: t("settings.privacyControls.unknownError")
      }));
    } finally {
      setIsWorking(false);
    }
  }

  const requiredConfirmation = pendingTarget === "all_local_data"
    ? PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
    : PRIVACY_LEARNING_DATA_CONFIRMATION;

  return (
    <section className={className} data-privacy-delete-controls="true">
      <div className="panel-heading">
        <ShieldAlert aria-hidden="true" size={19} />
        <h2>{t("settings.privacyControls.title")}</h2>
      </div>
      <p className="muted compact">{t("settings.privacyControls.description")}</p>
      {!privacyApi ? (
        <p className="selection-warning">{t("settings.privacyControls.desktopOnly")}</p>
      ) : null}

      <div className="settings-privacy-actions">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <div className="settings-privacy-action" key={action.target}>
              <Icon aria-hidden="true" size={18} />
              <span>
                <strong>{action.title}</strong>
                <small>{action.description}</small>
              </span>
              <button
                className={action.destructive ? "button danger-button" : "button secondary"}
                disabled={!privacyApi || isWorking || deletionInProgress}
                type="button"
                onClick={() => {
                  if (action.destructive) {
                    beginDestructiveDelete(action.target as DestructiveTarget);
                  } else {
                    void deleteData(action.target);
                  }
                }}
              >
                {t("settings.privacyControls.delete")}
              </button>
            </div>
          );
        })}
      </div>

      {pendingTarget ? (
        <div
          className="settings-privacy-confirm"
          role="group"
          aria-label={t("settings.privacyControls.typePhrase")}
        >
          <strong>
            {pendingTarget === "all_local_data"
              ? t("settings.privacyControls.all")
              : t("settings.privacyControls.learning")}
          </strong>
          <p>{t("settings.privacyControls.typePhrase")}</p>
          <code>{requiredConfirmation}</code>
          <label>
            <span className="sr-only">{t("settings.privacyControls.typePhrase")}</span>
            <input
              autoComplete="off"
              spellCheck={false}
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button danger-button"
              disabled={isWorking || deletionInProgress || confirmation !== requiredConfirmation}
              type="button"
              onClick={() => void deleteData(pendingTarget, confirmation)}
            >
              <Trash2 aria-hidden="true" size={16} />
              {isWorking
                ? t("settings.privacyControls.working")
                : t("settings.privacyControls.delete")}
            </button>
            <button
              className="button secondary"
              disabled={isWorking || deletionInProgress}
              type="button"
              onClick={() => setPendingTarget(null)}
            >
              {t("settings.privacyControls.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="settings-privacy-result">
          <p>
            {t("settings.privacyControls.resultCounts", {
              keys: result.counts.apiKeys,
              cookies: result.counts.webReaderCookies,
              rows: result.counts.databaseRows,
              files: result.counts.files,
              rendererKeys: result.counts.rendererStorageKeys,
              queueItems: result.counts.extensionQueueItems,
              bytes: formatBytes(result.counts.bytes)
            })}
          </p>
          {result.verification.managedPathEntriesRemaining > 0 ||
          result.verification.secureSettingsRemaining > 0 ||
          result.verification.webReaderCookiesRemaining > 0 ||
          result.verification.electronCacheBytesRemaining > 0 ||
          (result.verification.database?.remainingRows ?? 0) > 0 ? (
            <p className="selection-warning">
              {t("settings.privacyControls.residualDetected")}
            </p>
          ) : null}
          {result.extensionQueueManualClearRequired ? (
            <div className="selection-warning">
              <p>{t("settings.privacyControls.extensionPending")}</p>
              <p>{t("settings.privacyControls.extensionManual")}</p>
            </div>
          ) : null}
          {result.rendererResetRequired && result.operationId ? (
            <button
              className="button secondary"
              disabled={isWorking}
              type="button"
              onClick={() => void retryRendererCleanup()}
            >
              {t("settings.privacyControls.retryRenderer")}
            </button>
          ) : null}
          {result.restartRecommended ? (
            <p className="muted compact">{t("settings.privacyControls.restart")}</p>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p aria-live="polite" className="status-text" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

function isTerminalRendererResult(result: PrivacyDataDeleteResult) {
  return Boolean(
    result.operationId &&
    result.phase !== "pending" &&
    !result.rendererResetRequired
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
