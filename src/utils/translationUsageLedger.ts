import type { AppSettings, TranslationUsageEvent } from "../shared/types";
import {
  assessTranslationUsageBudget,
  DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
  type TranslationUsageBudgetAssessment,
  type TranslationUsageBudgetRequest
} from "../shared/translationUsage";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";

const usageLedgerKey = "lem:translationUsageEvents";
export const usageUpdatedEventName = "lem:translation-usage-updated";

const pendingBudgetReservations = new Map<
  string,
  { profileId: string; request: TranslationUsageBudgetRequest }
>();

type BudgetSettings = Pick<
  AppSettings,
  | "profileId"
  | "dailyAppTokenLimit"
  | "monthlySpendLimitKrw"
  | "stopOnFreeTierLimit"
  | "stopOnMonthlyLimit"
>;

export class TranslationUsageLimitError extends Error {
  readonly assessment: TranslationUsageBudgetAssessment;

  constructor(assessment: TranslationUsageBudgetAssessment) {
    super(assessment.reasons.join(" ") || "설정한 사용량 한도를 초과합니다.");
    this.name = "TranslationUsageLimitError";
    this.assessment = assessment;
  }
}

export function previewTranslationUsageBudget(
  settings: BudgetSettings,
  request: TranslationUsageBudgetRequest
): TranslationUsageBudgetAssessment {
  const summary = summarizeAppTranslationUsage(settings);
  const pending = [...pendingBudgetReservations.values()]
    .reduce(
      (total, reservation) => ({
        estimatedTokens: total.estimatedTokens + reservation.request.estimatedTokens,
        estimatedCostKrw: total.estimatedCostKrw + reservation.request.estimatedCostKrw
      }),
      { estimatedTokens: 0, estimatedCostKrw: 0 }
    );

  return assessTranslationUsageBudget({
    request,
    current: {
      todayTokens: summary.todayTokens + pending.estimatedTokens,
      monthCostKrw: summary.monthCostKrw + pending.estimatedCostKrw
    },
    settings
  });
}

/** Reserve the estimated budget until the request settles, preventing concurrent calls
 * from independently passing the same remaining allowance. */
export function reserveTranslationUsageBudget(
  settings: BudgetSettings,
  request: TranslationUsageBudgetRequest
): { assessment: TranslationUsageBudgetAssessment; release: () => void } {
  const assessment = previewTranslationUsageBudget(settings, request);
  if (!assessment.allowed) {
    throw new TranslationUsageLimitError(assessment);
  }

  const id = `budget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  pendingBudgetReservations.set(id, {
    profileId: settings.profileId || DEFAULT_PROFILE_ID,
    request
  });
  let released = false;
  return {
    assessment,
    release() {
      if (released) {
        return;
      }
      released = true;
      pendingBudgetReservations.delete(id);
    }
  };
}

export type TranslationUsageLedgerSummary = {
  todayTokens: number;
  todayCostKrw: number;
  todayRequestCount: number;
  todayLocalElectricityKrw: number;
  todayLocalElectricityKwh: number;
  todayLocalRuntimeMinutes: number;
  todayCacheHitCount: number;
  todayCacheMissCount: number;
  monthTokens: number;
  monthCostKrw: number;
  monthRequestCount: number;
  monthLocalElectricityKrw: number;
  monthLocalElectricityKwh: number;
  monthLocalRuntimeMinutes: number;
  monthCacheHitCount: number;
  monthCacheMissCount: number;
  monthlyLimitKrw: number;
  monthlySpendPercent: number;
  monthLabel: string;
};

export function recordTranslationUsageEvent(event: TranslationUsageEvent | undefined) {
  if (!event || typeof localStorage === "undefined") {
    return;
  }

  const entries = readTranslationUsageEvents();
  const nextEvent = {
    ...event,
    id: event.id ?? `usage-${Date.now()}-${Math.random().toString(16).slice(2)}`
  };
  const dedupedEntries = entries.filter((entry) => entry.id !== nextEvent.id);
  const currentMonthKey = toLocalMonthKey(new Date());
  const allEntries = [nextEvent, ...dedupedEntries];
  // Never truncate the active month: the hard budget gate must not under-count a busy month.
  // Retain a bounded tail only for older history.
  const nextEntries = [
    ...allEntries.filter(
      (entry) => toLocalMonthKey(new Date(entry.createdAt)) === currentMonthKey
    ),
    ...allEntries
      .filter((entry) => toLocalMonthKey(new Date(entry.createdAt)) !== currentMonthKey)
      .slice(0, 500)
  ];
  localStorage.setItem(usageLedgerKey, JSON.stringify(nextEntries));
  window.dispatchEvent(new CustomEvent(usageUpdatedEventName));
}

export function readTranslationUsageEvents() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(usageLedgerKey);
    const parsed = raw ? (JSON.parse(raw) as TranslationUsageEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function summarizeTranslationUsage(
  settings: Pick<AppSettings, "monthlySpendLimitKrw" | "profileId">
): TranslationUsageLedgerSummary {
  const activeProfileId = settings.profileId || DEFAULT_PROFILE_ID;
  const profileEvents = readTranslationUsageEvents().filter(
    (entry) =>
      !entry.profileDeleted &&
      (entry.profileId || DEFAULT_PROFILE_ID) === activeProfileId
  );
  return summarizeUsageEvents(settings, profileEvents);
}

/**
 * Summarize usage across every learning profile. Hard daily/monthly limits are app-wide,
 * so profile switching must not reset the amount counted by a budget check.
 */
export function summarizeAppTranslationUsage(
  settings: Pick<AppSettings, "monthlySpendLimitKrw">
): TranslationUsageLedgerSummary {
  return summarizeUsageEvents(settings, readTranslationUsageEvents());
}

function summarizeUsageEvents(
  settings: Pick<AppSettings, "monthlySpendLimitKrw">,
  events: TranslationUsageEvent[]
): TranslationUsageLedgerSummary {
  const monthlyLimitKrw = Math.max(
    0,
    settings.monthlySpendLimitKrw ?? DEFAULT_MONTHLY_SPEND_LIMIT_KRW
  );
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const monthKey = toLocalMonthKey(now);
  const todayEvents = events.filter(
    (entry) =>
      toLocalDateKey(new Date(entry.createdAt)) === todayKey
  );
  const monthEvents = events.filter(
    (entry) =>
      toLocalMonthKey(new Date(entry.createdAt)) === monthKey
  );
  const todayTokens = todayEvents.reduce((sum, entry) => sum + entry.usage.totalTokens, 0);
  const todayCostKrw = todayEvents.reduce((sum, entry) => sum + entry.estimatedCostKrw.max, 0);
  const todayRequestCount = todayEvents.reduce((sum, entry) => sum + entry.usage.requestCount, 0);
  const todayElectricity = estimateLocalElectricity(todayEvents);
  const todayCacheHitCount = todayEvents.reduce((sum, entry) => sum + entry.usage.cacheHitCount, 0);
  const todayCacheMissCount = todayEvents.reduce((sum, entry) => sum + entry.usage.cacheMissCount, 0);
  const monthTokens = monthEvents.reduce((sum, entry) => sum + entry.usage.totalTokens, 0);
  const monthCostKrw = monthEvents.reduce((sum, entry) => sum + entry.estimatedCostKrw.max, 0);
  const monthRequestCount = monthEvents.reduce((sum, entry) => sum + entry.usage.requestCount, 0);
  const monthElectricity = estimateLocalElectricity(monthEvents);
  const monthCacheHitCount = monthEvents.reduce((sum, entry) => sum + entry.usage.cacheHitCount, 0);
  const monthCacheMissCount = monthEvents.reduce((sum, entry) => sum + entry.usage.cacheMissCount, 0);
  return {
    todayTokens,
    todayCostKrw,
    todayRequestCount,
    todayLocalElectricityKrw: todayElectricity.krw,
    todayLocalElectricityKwh: todayElectricity.kwh,
    todayLocalRuntimeMinutes: todayElectricity.runtimeMinutes,
    todayCacheHitCount,
    todayCacheMissCount,
    monthTokens,
    monthCostKrw,
    monthRequestCount,
    monthLocalElectricityKrw: monthElectricity.krw,
    monthLocalElectricityKwh: monthElectricity.kwh,
    monthLocalRuntimeMinutes: monthElectricity.runtimeMinutes,
    monthCacheHitCount,
    monthCacheMissCount,
    monthlyLimitKrw,
    monthlySpendPercent:
      monthlyLimitKrw > 0
        ? Math.min(100, Math.round((monthCostKrw / monthlyLimitKrw) * 100))
        : 0,
    monthLabel: `${now.getMonth() + 1}월`
  };
}

function estimateLocalElectricity(events: TranslationUsageEvent[]) {
  const systemWatts = 350;
  const krwPerKwh = 200;
  const runtimeSeconds = events
    .filter((entry) => isLocalUsageProvider(entry.providerName))
    .reduce((sum, entry) => sum + estimateLocalRuntimeSeconds(entry), 0);
  const kwh = (systemWatts / 1000) * (runtimeSeconds / 3600);
  return {
    kwh: Math.round(kwh * 1000) / 1000,
    krw: Math.round(kwh * krwPerKwh * 10) / 10,
    runtimeMinutes: Math.round((runtimeSeconds / 60) * 10) / 10
  };
}

function estimateLocalRuntimeSeconds(event: TranslationUsageEvent) {
  const totalTokens = Math.max(0, event.usage.totalTokens);
  const requestCount = Math.max(0, event.usage.requestCount);
  const tokensPerSecond =
    event.providerName === "local" ? 18 : event.providerName === "localMt" ? 90 : 70;
  return totalTokens / tokensPerSecond + requestCount * 0.8;
}

function isLocalUsageProvider(providerName: TranslationUsageEvent["providerName"]) {
  return providerName === "local" || providerName === "localMt" || providerName === "browser";
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
