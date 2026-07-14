import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfiles,
  localizeBuiltInProfileNames,
  normalizeProfiles
} from "./profiles";

describe("built-in profile localization", () => {
  it("seeds built-in profile names in the current app locale", () => {
    expect(createDefaultProfiles(undefined, "en")[0]?.name).toBe("English Basics");
    expect(createDefaultProfiles(undefined, "ko")[0]?.name).toBe("영어 기본");
  });

  it("localizes only recognized built-in seed names", () => {
    const [builtIn, temporary] = createDefaultProfiles(undefined, "ko");
    const customDefault = { ...builtIn, name: "My English" };

    expect(localizeBuiltInProfileNames([builtIn, temporary], "en").map(({ name }) => name)).toEqual([
      "English Basics",
      "Temporary Japanese"
    ]);
    expect(localizeBuiltInProfileNames([customDefault, temporary], "en")[0]?.name).toBe(
      "My English"
    );
  });

  it("migrates a legacy untouched default without changing custom profiles", () => {
    const legacyDefault = createDefaultProfiles(undefined, "ko")[0];
    const custom = {
      ...legacyDefault,
      id: "profile-custom",
      name: "한국 여행 영어"
    };
    const normalized = normalizeProfiles([legacyDefault, custom], undefined, "en");

    expect(normalized.find(({ id }) => id === DEFAULT_PROFILE_ID)?.name).toBe("English Basics");
    expect(normalized.find(({ id }) => id === custom.id)?.name).toBe("한국 여행 영어");
  });
});
