import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../appSettings";
import { createTranslationUsageEvent } from "../shared/translationUsage";
import {
  readTranslationUsageEvents,
  recordTranslationUsageEvent,
  reserveTranslationUsageBudget,
  summarizeAppTranslationUsage,
  summarizeTranslationUsage,
  TranslationUsageLimitError
} from "./translationUsageLedger";

describe("translation usage budget reservations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks against recorded cumulative usage", () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const settings = {
      ...defaultSettings,
      profileId: "budget-profile",
      dailyAppTokenLimit: 1_000,
      monthlySpendLimitKrw: 10_000,
      stopOnFreeTierLimit: true,
      stopOnMonthlyLimit: true
    };
    recordTranslationUsageEvent(
      createTranslationUsageEvent({
        profileId: settings.profileId,
        providerName: "local",
        model: "local",
        targetLang: "ko",
        usage: {
          inputTokens: 500,
          outputTokens: 300,
          totalTokens: 800,
          billableCharacters: 0,
          requestCount: 1,
          cacheHitCount: 0,
          cacheMissCount: 1
        }
      })
    );

    expect(() =>
      reserveTranslationUsageBudget(settings, {
        estimatedTokens: 250,
        estimatedCostKrw: 0
      })
    ).toThrow(TranslationUsageLimitError);
  });

  it("includes in-flight reservations and releases them idempotently", () => {
    installMemoryLocalStorage();
    const settings = {
      ...defaultSettings,
      profileId: "reservation-profile",
      dailyAppTokenLimit: 500,
      stopOnFreeTierLimit: true
    };
    const first = reserveTranslationUsageBudget(settings, {
      estimatedTokens: 300,
      estimatedCostKrw: 0
    });

    expect(() =>
      reserveTranslationUsageBudget(settings, {
        estimatedTokens: 250,
        estimatedCostKrw: 0
      })
    ).toThrow(TranslationUsageLimitError);

    first.release();
    first.release();
    const second = reserveTranslationUsageBudget(settings, {
      estimatedTokens: 250,
      estimatedCostKrw: 0
    });
    second.release();
  });

  it("cannot bypass the daily app limit by switching profiles", () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const settings = {
      ...defaultSettings,
      profileId: "profile-b",
      dailyAppTokenLimit: 1_000,
      monthlySpendLimitKrw: 10_000,
      stopOnFreeTierLimit: true,
      stopOnMonthlyLimit: true
    };
    recordTranslationUsageEvent(createUsageEvent("profile-a", 800));

    expect(() =>
      reserveTranslationUsageBudget(settings, {
        estimatedTokens: 250,
        estimatedCostKrw: 0
      })
    ).toThrow(TranslationUsageLimitError);
  });

  it("cannot bypass the monthly app limit by switching profiles", () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const settings = {
      ...defaultSettings,
      profileId: "profile-b",
      dailyAppTokenLimit: 10_000,
      monthlySpendLimitKrw: 1_000,
      stopOnFreeTierLimit: true,
      stopOnMonthlyLimit: true
    };
    recordTranslationUsageEvent(createUsageEvent("profile-a", 100, 900));

    expect(() =>
      reserveTranslationUsageBudget(settings, {
        estimatedTokens: 0,
        estimatedCostKrw: 150
      })
    ).toThrow(TranslationUsageLimitError);
  });

  it("counts reservations from every profile against the app budget", () => {
    installMemoryLocalStorage();
    const first = reserveTranslationUsageBudget(
      {
        ...defaultSettings,
        profileId: "profile-a",
        dailyAppTokenLimit: 500,
        stopOnFreeTierLimit: true
      },
      { estimatedTokens: 300, estimatedCostKrw: 0 }
    );

    expect(() =>
      reserveTranslationUsageBudget(
        {
          ...defaultSettings,
          profileId: "profile-b",
          dailyAppTokenLimit: 500,
          stopOnFreeTierLimit: true
        },
        { estimatedTokens: 250, estimatedCostKrw: 0 }
      )
    ).toThrow(TranslationUsageLimitError);
    first.release();
  });

  it("keeps the existing profile summary while exposing an app-wide summary", () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    recordTranslationUsageEvent(createUsageEvent("profile-a", 200, 10));
    recordTranslationUsageEvent(createUsageEvent("profile-b", 300, 20));
    recordTranslationUsageEvent({
      ...createUsageEvent("deleted-profile", 100, 5),
      profileId: undefined,
      profileDeleted: true
    });

    expect(
      summarizeTranslationUsage({
        profileId: "profile-b",
        monthlySpendLimitKrw: 1_000
      })
    ).toMatchObject({ todayTokens: 300, monthCostKrw: 20 });
    expect(summarizeAppTranslationUsage({ monthlySpendLimitKrw: 1_000 })).toMatchObject({
      todayTokens: 600,
      monthCostKrw: 35
    });
  });

  it("does not truncate active-month events used by cumulative limits", () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    for (let index = 0; index < 510; index += 1) {
      recordTranslationUsageEvent(
        createTranslationUsageEvent({
          providerName: "local",
          model: "local",
          targetLang: "ko",
          usage: {
            inputTokens: 1,
            outputTokens: 0,
            totalTokens: 1,
            billableCharacters: 0,
            requestCount: 1,
            cacheHitCount: 0,
            cacheMissCount: 1
          }
        })
      );
    }
    expect(readTranslationUsageEvents()).toHaveLength(510);
  });
});

function createUsageEvent(profileId: string, totalTokens: number, costKrw = 0) {
  return {
    ...createTranslationUsageEvent({
      profileId,
      providerName: "local",
      model: "local",
      targetLang: "ko",
      usage: {
        inputTokens: totalTokens,
        outputTokens: 0,
        totalTokens,
        billableCharacters: 0,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    }),
    estimatedCostKrw: { min: costKrw, max: costKrw }
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  });
}
