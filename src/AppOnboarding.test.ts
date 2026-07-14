import { describe, expect, it } from "vitest";
import {
  APP_ONBOARDING_COMPLETED_KEY,
  LEGACY_APP_ONBOARDING_COMPLETED_KEYS,
  readAppOnboardingCompleted,
  updateAppOnboardingProfileLanguage,
  writeAppOnboardingCompleted
} from "./AppOnboarding";
import { defaultSettings } from "./appSettings";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("app onboarding renderer completion", () => {
  it("recognizes the v1 marker so an existing user does not see v2 onboarding", () => {
    const storage = createStorage({ [LEGACY_APP_ONBOARDING_COMPLETED_KEYS[0]]: "1" });

    expect(readAppOnboardingCompleted(storage)).toBe(true);
    expect(storage.values.has(APP_ONBOARDING_COMPLETED_KEY)).toBe(false);
  });

  it("writes and reads the current completion marker", () => {
    const storage = createStorage();

    expect(readAppOnboardingCompleted(storage)).toBe(false);
    writeAppOnboardingCompleted(storage);
    expect(storage.values.get(APP_ONBOARDING_COMPLETED_KEY)).toBe("1");
    expect(readAppOnboardingCompleted(storage)).toBe(true);
  });

  it("treats unavailable renderer storage as incomplete until the host marker is checked", () => {
    expect(readAppOnboardingCompleted(null)).toBe(false);
    expect(
      readAppOnboardingCompleted({
        getItem() {
          throw new Error("storage unavailable");
        }
      })
    ).toBe(false);
    expect(() => writeAppOnboardingCompleted(null)).not.toThrow();
  });

  it("stores native and learning languages without allowing the same language twice", () => {
    const japaneseTarget = updateAppOnboardingProfileLanguage(
      defaultSettings,
      "targetLanguage",
      "ja"
    );
    expect(japaneseTarget.learningProfile.targetLanguage.code).toBe("ja");
    expect(japaneseTarget.learningProfile.nativeLanguage.code).toBe("ko");

    const swapped = updateAppOnboardingProfileLanguage(
      defaultSettings,
      "nativeLanguage",
      defaultSettings.learningProfile.targetLanguage.code
    );
    expect(swapped.learningProfile.nativeLanguage.code).toBe("en");
    expect(swapped.learningProfile.targetLanguage.code).toBe("ko");
  });
});
