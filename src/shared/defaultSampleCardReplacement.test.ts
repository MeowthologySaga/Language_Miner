import { describe, expect, it } from "vitest";
import { createDefaultSampleCards } from "./defaultSampleCards";
import { findReplaceableDefaultSampleCard } from "./defaultSampleCardReplacement";

describe("default sample replacement", () => {
  it("finds an equivalent seeded reading sample before saving a real card", () => {
    const samples = createDefaultSampleCards("default", new Date("2026-01-01T00:00:00.000Z"));
    const incoming = {
      ...samples[0],
      id: "user-card",
      sourceSentence: "I'm running a little late.",
      frontText: "I'm running a little late."
    };
    expect(findReplaceableDefaultSampleCard(samples, incoming)?.id).toBe(samples[0].id);
  });

  it("does not replace a different sentence or a user-owned card", () => {
    const samples = createDefaultSampleCards("default", new Date("2026-01-01T00:00:00.000Z"));
    expect(
      findReplaceableDefaultSampleCard(samples, {
        ...samples[0],
        id: "different",
        sourceSentence: "I arrived right on time.",
        frontText: "I arrived right on time."
      })
    ).toBeNull();
    expect(
      findReplaceableDefaultSampleCard(
        [{ ...samples[0], id: "user-existing" }],
        { ...samples[0], id: "user-incoming" }
      )
    ).toBeNull();
  });
});
