import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TranslationUsageEstimate } from "../shared/translationUsage";

type UsageMeterProps = {
  label: string;
  value: string;
  percent: number;
};

type PdfMakerUsageEstimateProps = {
  estimate: TranslationUsageEstimate | null;
  makerFreeTierLimitBlocked: boolean;
  makerMonthlyLimitBlocked: boolean;
  makerUsageStatus: string;
  providerLabel: string;
};

function UsageMeter({ label, value, percent }: UsageMeterProps) {
  return (
    <div className="usage-meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="usage-meter-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </span>
    </div>
  );
}

export function PdfMakerUsageEstimate({
  estimate,
  makerFreeTierLimitBlocked,
  makerMonthlyLimitBlocked,
  makerUsageStatus,
  providerLabel
}: PdfMakerUsageEstimateProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const compactFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
    [locale]
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "KRW",
        maximumFractionDigits: 0
      }),
    [locale]
  );
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    [locale]
  );
  const formatPercent = (value: number) => percentFormatter.format(value / 100);
  const formatPercentRange = (min: number, max: number) =>
    `${formatPercent(min)}–${formatPercent(max)}`;
  const costLabel = estimate
    ? estimate.estimatedCostKrw.min === 0 && estimate.estimatedCostKrw.max === 0
      ? currencyFormatter.format(0)
      : t("pdfAuthoring.usage.approximate", {
          value:
            Math.abs(estimate.estimatedCostKrw.max - estimate.estimatedCostKrw.min) <= 1
              ? currencyFormatter.format(Math.round(estimate.estimatedCostKrw.max))
              : `${currencyFormatter.format(Math.round(estimate.estimatedCostKrw.min))}–${currencyFormatter.format(Math.round(estimate.estimatedCostKrw.max))}`
        })
    : t("pdfAuthoring.usage.calculating");
  const totalTokens = estimate
    ? `${compactFormatter.format(estimate.totalTokens.min)}–${compactFormatter.format(
        estimate.totalTokens.max
      )}`
    : "-";
  const inputTokens = estimate
    ? `${compactFormatter.format(estimate.inputTokens.min)}–${compactFormatter.format(
        estimate.inputTokens.max
      )}`
    : "-";
  const outputTokens = estimate
    ? `${compactFormatter.format(estimate.outputTokens.min)}–${compactFormatter.format(
        estimate.outputTokens.max
      )}`
    : "-";
  const dailyMax = estimate?.dailyLimitUsagePercent.max ?? 0;
  const retryReserve = estimate ? Math.min(100, Math.max(8, Math.round(dailyMax * 0.1))) : 0;

  return (
    <div className="pdf-maker-usage-card" data-qa="book-maker-usage-estimate">
      <div className="pdf-maker-usage-header">
        <div>
          <span>{t("pdfAuthoring.usage.preflightEstimate")}</span>
          <strong>{costLabel}</strong>
        </div>
        <span className={estimate?.freeTier ? "usage-badge free" : "usage-badge"}>
          {estimate?.freeTier ? t("pdfAuthoring.usage.freeTier") : providerLabel}
        </span>
      </div>
      <div className="pdf-maker-usage-grid">
        <div>
          <span>{t("pdfAuthoring.usage.estimatedTokens")}</span>
          <strong>{totalTokens}</strong>
        </div>
        <div>
          <span>{t("pdfAuthoring.usage.dailyLimitUsage")}</span>
          <strong>
            {estimate
              ? formatPercentRange(
                  estimate.dailyLimitUsagePercent.min,
                  estimate.dailyLimitUsagePercent.max
                )
              : "-"}
          </strong>
        </div>
        <div>
          <span>{t("pdfAuthoring.usage.cacheSavings")}</span>
          <strong>{estimate ? formatPercent(estimate.cacheSavingsPercent) : "-"}</strong>
        </div>
      </div>
      <div className="usage-meter-list">
        <UsageMeter
          label={t("pdfAuthoring.usage.inputTokens")}
          value={inputTokens}
          percent={estimate?.dailyLimitUsagePercent.max ?? 0}
        />
        <UsageMeter
          label={t("pdfAuthoring.usage.outputTokens")}
          value={outputTokens}
          percent={estimate?.dailyLimitUsagePercent.max ?? 0}
        />
        <UsageMeter
          label={t("pdfAuthoring.usage.retryReserve")}
          value={`+${formatPercent(retryReserve)}`}
          percent={retryReserve}
        />
      </div>
      {makerFreeTierLimitBlocked ? (
        <p className="selection-warning compact">{t("pdfAuthoring.usage.freeTierBlocked")}</p>
      ) : null}
      {makerMonthlyLimitBlocked ? (
        <p className="selection-warning compact">{t("pdfAuthoring.usage.monthlyBlocked")}</p>
      ) : null}
      <p className="muted compact">
        {makerUsageStatus || t("pdfAuthoring.workflow.estimateDisclaimer")}
      </p>
    </div>
  );
}
