import { Info } from "lucide-react";
import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { CardGenerationUsageEstimate as CardGenerationUsageEstimateData } from "../shared/cardGenerationUsage";

type CardGenerationUsageEstimateProps = {
  estimate: CardGenerationUsageEstimateData | null;
  variant?: "grid" | "badge";
  align?: "start" | "end";
  className?: string;
};

export function CardGenerationUsageEstimate({
  align = "end",
  className = "",
  estimate,
  variant = "grid"
}: CardGenerationUsageEstimateProps) {
  const { i18n, t } = useTranslation();
  const tooltipId = useId();
  if (!estimate) {
    return null;
  }

  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en")
    ? "en-US"
    : "ko-KR";
  const integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const isManualChatGpt = estimate.noteKey === "chatgptWebManual";
  const costLabel = isManualChatGpt
    ? t("manualChatGptBridge.noApiCharge")
    : estimate.costKrw === undefined
    ? estimate.costLabel
    : formatEstimatedKrw(estimate.costKrw, locale, t("cardGenerationUsage.values.lessThanOneWon"));
  const electricityLabel = isManualChatGpt
    ? t("manualChatGptBridge.noAppElectricity")
    : estimate.electricityKrw === undefined
    ? estimate.electricityLabel
    : formatEstimatedKrw(
        estimate.electricityKrw,
        locale,
        t("cardGenerationUsage.values.lessThanOneWon")
      );
  const tokenLabel = isManualChatGpt
    ? t("manualChatGptBridge.webHandled")
    : estimate.tokenCount === undefined
    ? estimate.tokenLabel
    : t("cardGenerationUsage.values.tokens", {
        formattedCount: integerFormatter.format(Math.ceil(Math.max(0, estimate.tokenCount)))
      });
  const requestLabel = isManualChatGpt
    ? t("manualChatGptBridge.oneManualRound")
    : estimate.requestCount === undefined
    ? estimate.requestLabel
    : t("cardGenerationUsage.values.requests", {
        count: Math.ceil(Math.max(0, estimate.requestCount)),
        formattedCount: integerFormatter.format(Math.ceil(Math.max(0, estimate.requestCount)))
      });
  const runtimeLabel = estimate.runtimeSeconds === undefined
    ? estimate.runtimeLabel
    : formatRuntime(estimate.runtimeSeconds, locale, t);
  const localizedNote = getLocalizedNote(estimate.noteKey, t);
  const rows = [
    { label: t("cardGenerationUsage.labels.cost"), value: costLabel },
    { label: t("cardGenerationUsage.labels.electricity"), value: electricityLabel },
    { label: t("cardGenerationUsage.labels.tokens"), value: tokenLabel },
    { label: t("cardGenerationUsage.labels.requests"), value: requestLabel }
  ];
  const note = [runtimeLabel, localizedNote ?? estimate.note].filter(Boolean).join(" · ");
  const disclaimer = isManualChatGpt
    ? t("manualChatGptBridge.usageDisclaimer")
    : t("cardGenerationUsage.disclaimer");

  if (variant === "badge") {
    return (
      <span
        className={`card-generation-usage-inline tooltip-align-${align} ${className}`.trim()}
        data-qa="card-generation-usage-estimate"
      >
        <button
          aria-describedby={tooltipId}
          aria-label={t("cardGenerationUsage.estimateAria", { cost: costLabel })}
          className="card-generation-usage-badge"
          type="button"
        >
          {t("cardGenerationUsage.estimateBadge", { cost: costLabel })}
          <Info aria-hidden="true" size={12} />
        </button>
        <span className="card-generation-usage-tooltip" id={tooltipId} role="tooltip">
          <span className="card-generation-usage-tooltip-title">{t("cardGenerationUsage.estimateTitle")}</span>
          {rows.map((row) => (
            <span className="card-generation-usage-tooltip-row" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </span>
          ))}
          {note ? <span className="card-generation-usage-tooltip-note">{note}</span> : null}
          <span className="card-generation-usage-tooltip-note">{disclaimer}</span>
        </span>
      </span>
    );
  }

  return (
    <div className="card-generation-usage-estimate" data-qa="card-generation-usage-estimate">
      <dl className="card-generation-usage-metrics">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p>{note}</p> : null}
      <p>{disclaimer}</p>
    </div>
  );
}

function getLocalizedNote(
  noteKey: CardGenerationUsageEstimateData["noteKey"],
  t: TFunction
) {
  if (noteKey === "mock") return t("cardGenerationUsage.notes.mock");
  if (noteKey === "chatgptWebManual") return t("manualChatGptBridge.usageNote");
  if (noteKey === "geminiFreeConservative") {
    return t("cardGenerationUsage.notes.geminiFreeConservative");
  }
  if (noteKey === "cloudBillingGuard") {
    return t("cardGenerationUsage.notes.cloudBillingGuard");
  }
  if (noteKey === "ollamaLocal") return t("cardGenerationUsage.notes.ollamaLocal");
  return undefined;
}

function formatEstimatedKrw(
  value: number,
  locale: "ko-KR" | "en-US",
  lessThanOneLabel: string
) {
  const normalized = Math.max(0, value);
  if (normalized > 0 && normalized < 1) {
    return lessThanOneLabel;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "KRW",
    currencyDisplay: "symbol",
    maximumFractionDigits: 0
  }).format(Math.ceil(normalized));
}

function formatRuntime(
  seconds: number,
  locale: "ko-KR" | "en-US",
  t: TFunction
) {
  if (seconds <= 0) return undefined;
  if (seconds < 60) {
    return t("cardGenerationUsage.values.localSeconds", {
      formattedCount: new Intl.NumberFormat(locale).format(Math.max(1, Math.round(seconds)))
    });
  }
  return t("cardGenerationUsage.values.localMinutes", {
    formattedCount: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      Math.round((seconds / 60) * 10) / 10
    )
  });
}
