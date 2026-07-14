import { AlertTriangle, ArrowRight, Cloud, X } from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  buildCloudTranslationPreflight,
  type CloudTranslationPreflightDetails,
  type CloudTranslationPreflightInput
} from "../shared/cloudTranslationPreflight";
import { recordCloudOperationConsent } from "../shared/cloudProviderConsent";
import { summarizeAppTranslationUsage } from "../utils/translationUsageLedger";
import { Dialog } from "./Dialog";
import "../styles/cloudTranslationPreflight.css";

export const TRANSLATION_CANCEL_COPY = {
  get stop() {
    return i18n.t("cloudTranslationPreflight.cancellation.stop");
  },
  get stopping() {
    return i18n.t("cloudTranslationPreflight.cancellation.stopping");
  },
  get canceled() {
    return i18n.t("cloudTranslationPreflight.cancellation.canceled");
  },
  get canceledBeforeStart() {
    return i18n.t("cloudTranslationPreflight.cancellation.canceledBeforeStart");
  }
};

type PendingPreflight = {
  details: CloudTranslationPreflightDetails;
  resolve: (allowed: boolean) => void;
};

export function useCloudTranslationPreflight() {
  const [pending, setPending] = useState<PendingPreflight | null>(null);
  const pendingRef = useRef<PendingPreflight | null>(null);

  const settle = useCallback((allowed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(allowed);
  }, []);

  useEffect(
    () => () => {
      const current = pendingRef.current;
      pendingRef.current = null;
      current?.resolve(false);
    },
    []
  );

  const confirmCloudTranslation = useCallback(
    (input: CloudTranslationPreflightInput): Promise<boolean> => {
      const monthEstimate = summarizeAppTranslationUsage(input.settings).monthCostKrw;
      const details = buildCloudTranslationPreflight(input, monthEstimate);
      if (!details) {
        return Promise.resolve(true);
      }
      pendingRef.current?.resolve(false);
      return new Promise<boolean>((resolve) => {
        const next = { details, resolve };
        pendingRef.current = next;
        setPending(next);
      });
    },
    []
  );

  return {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog: pending ? (
      <CloudTranslationPreflightDialog
        details={pending.details}
        onCancel={() => settle(false)}
        onContinue={() => {
          try {
            recordCloudOperationConsent(window.localStorage, pending.details.providerName);
            settle(true);
          } catch {
            settle(false);
          }
        }}
      />
    ) : null
  };
}

type CloudTranslationPreflightDialogProps = {
  details: CloudTranslationPreflightDetails;
  onCancel: () => void;
  onContinue: () => void;
};

export function CloudTranslationPreflightDialog({
  details,
  onCancel,
  onContinue
}: CloudTranslationPreflightDialogProps) {
  const { i18n: translationInstance, t } = useTranslation();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const idPrefix = useId();
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const warningId = `${idPrefix}-warning`;
  const locale = (translationInstance.resolvedLanguage ?? translationInstance.language).startsWith("en")
    ? "en-US"
    : "ko-KR";
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const providerLabel = getProviderLabel(details.providerName, t);
  const costLabel = details.remoteCostUnknown
    ? t("cloudTranslationPreflight.remoteCostUnknown")
    : formatKrwRange(details.estimatedCostKrw, locale, t);

  return (
    <Dialog
      ariaDescribedBy={`${descriptionId} ${warningId}`}
      ariaLabelledBy={titleId}
      backdropClassName="cloud-preflight-backdrop"
      className="cloud-preflight-dialog"
      data-qa="cloud-translation-preflight"
      initialFocusRef={cancelButtonRef}
      onClose={onCancel}
    >
      <header className="cloud-preflight-header">
        <div className="cloud-preflight-heading">
          <span><Cloud aria-hidden="true" size={16} />{t("cloudTranslationPreflight.eyebrow")}</span>
          <h2 id={titleId}>{t("cloudTranslationPreflight.title")}</h2>
        </div>
        <button
          aria-label={t("cloudTranslationPreflight.close")}
          className="icon-button"
          type="button"
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </header>

      <p className="cloud-preflight-description" id={descriptionId}>
        {t("cloudTranslationPreflight.description")}
      </p>

      <dl className="cloud-preflight-grid">
        <PreflightItem label={t("cloudTranslationPreflight.labels.providerModel")}>
          <strong>{providerLabel}</strong>
          <span>{details.model || t("cloudTranslationPreflight.unknownModel")}</span>
          {details.endpointLabel ? <small>{details.endpointLabel}</small> : null}
        </PreflightItem>
        <PreflightItem label={t("cloudTranslationPreflight.labels.payload")}>
          <strong>
            {details.dataCategories.length > 0
              ? details.dataCategories.join(" · ")
              : t("cloudTranslationPreflight.payloadNotSpecified")}
          </strong>
          <span>{details.scopeLabel}</span>
        </PreflightItem>
        <PreflightItem label={t("cloudTranslationPreflight.labels.scope")}>
          <strong>{t("cloudTranslationPreflight.textCount", {
            formattedCount: numberFormatter.format(details.textCount)
          })}</strong>
          <span>{t("cloudTranslationPreflight.characterCount", {
            formattedCount: numberFormatter.format(details.totalCharacters)
          })}</span>
        </PreflightItem>
        <PreflightItem label={t("cloudTranslationPreflight.labels.calls")}>
          <strong>{t("cloudTranslationPreflight.callRange", {
            estimated: numberFormatter.format(details.estimatedCalls),
            maximum: numberFormatter.format(details.maximumCalls)
          })}</strong>
          <span>{t("cloudTranslationPreflight.callDetails")}</span>
        </PreflightItem>
        <PreflightItem label={t("cloudTranslationPreflight.labels.cost")}>
          <strong>{costLabel}</strong>
          {details.remoteCostUnknown ? <span>{t("cloudTranslationPreflight.remoteCostDetails")}</span> : null}
        </PreflightItem>
        <PreflightItem label={t("cloudTranslationPreflight.labels.month")}>
          <strong>{t("cloudTranslationPreflight.currentMonth", {
            amount: formatKrw(details.currentMonthAppEstimateKrw, locale)
          })}</strong>
          <span>{t("cloudTranslationPreflight.projectedMonth", {
            amount: formatKrw(details.projectedMonthAppEstimateKrw, locale)
          })}</span>
        </PreflightItem>
      </dl>

      <p className="cloud-preflight-warning" id={warningId}>
        <AlertTriangle aria-hidden="true" size={17} />
        {t("cloudTranslationPreflight.disclaimer")}
      </p>
      <footer className="cloud-preflight-actions">
        <button
          ref={cancelButtonRef}
          className="button secondary"
          type="button"
          onClick={onCancel}
        >
          {t("cloudTranslationPreflight.cancel")}
        </button>
        <button
          className="button primary"
          type="button"
          onClick={onContinue}
        >
          {t("cloudTranslationPreflight.continue")}
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </footer>
    </Dialog>
  );
}

function PreflightItem({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="cloud-preflight-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function getProviderLabel(
  providerName: CloudTranslationPreflightDetails["providerName"],
  t: TFunction
) {
  if (providerName === "gemini") {
    return t("cloudTranslationPreflight.providers.gemini");
  }
  if (providerName === "google") {
    return t("cloudTranslationPreflight.providers.google");
  }
  return t("cloudTranslationPreflight.providers.remoteOllama");
}

export function formatKrw(value: number, locale: "ko-KR" | "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "KRW",
    currencyDisplay: "symbol",
    maximumFractionDigits: 0
  }).format(Math.ceil(Math.max(0, value)));
}

export function formatKrwRange(
  range: { min: number; max: number },
  locale: "ko-KR" | "en-US",
  t: TFunction
) {
  const min = formatKrw(range.min, locale);
  const max = formatKrw(range.max, locale);
  return min === max
    ? min
    : t("cloudTranslationPreflight.currencyRange", { min, max });
}
