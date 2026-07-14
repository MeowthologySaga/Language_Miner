import { describe, expect, it } from "vitest";
import {
  dismissDefaultSampleCard,
  readDismissedDefaultSampleCardIds
} from "./defaultSampleCardDismissal";

describe("default sample card dismissal", () => {
  it("persists deleted sample ids per profile without duplicates", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    } as unknown as Storage;
    dismissDefaultSampleCard(storage, "profile-a", "sample-1");
    dismissDefaultSampleCard(storage, "profile-a", "sample-1");
    expect([...readDismissedDefaultSampleCardIds(storage, "profile-a")]).toEqual(["sample-1"]);
    expect(readDismissedDefaultSampleCardIds(storage, "profile-b").size).toBe(0);
  });
});
