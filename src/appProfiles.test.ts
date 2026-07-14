import { describe, expect, it } from "vitest";
import { normalizeProfileRecordForSave } from "./appProfiles";
import { createDefaultProfiles } from "./shared/profiles";

describe("profile persistence localization", () => {
  it("uses the caller's localized fallback only when a profile name is empty", () => {
    const [profile] = createDefaultProfiles(undefined, "en");
    const unnamed = normalizeProfileRecordForSave(
      { ...profile, name: "   " },
      [profile],
      "New profile 1",
      profile.id
    );
    const custom = normalizeProfileRecordForSave(
      { ...profile, name: "내 여행 영어" },
      [profile],
      "New profile 1",
      profile.id
    );

    expect(unnamed.name).toBe("New profile 1");
    expect(custom.name).toBe("내 여행 영어");
  });
});
