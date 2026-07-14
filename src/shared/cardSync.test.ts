import { describe, expect, it } from "vitest";
import { createCardSyncSnapshot, mergeCardsForSync, parseCardSyncSnapshot } from "./cardSync";
import type { StudyCard } from "./types";

describe("cardSync", () => {
  it("keeps the newest card version by updatedAt", () => {
    const local = makeCard("same", "2026-06-09T09:00:00.000Z", "local text");
    const remote = makeCard("same", "2026-06-09T10:00:00.000Z", "remote text");

    const result = mergeCardsForSync([local], [remote]);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].frontText).toBe("remote text");
    expect(result.downloadedCardCount).toBe(1);
    expect(result.uploadedCardCount).toBe(0);
  });

  it("adds local-only and remote-only cards without deleting either side", () => {
    const result = mergeCardsForSync(
      [makeCard("local-only", "2026-06-09T09:00:00.000Z")],
      [makeCard("remote-only", "2026-06-09T08:00:00.000Z")]
    );

    expect(result.cards.map((card) => card.id).sort()).toEqual(["local-only", "remote-only"]);
    expect(result.uploadedCardCount).toBe(1);
    expect(result.downloadedCardCount).toBe(1);
  });

  it("keeps a conflict copy when local and remote both changed since last sync", () => {
    const base = makeCard("same", "2026-06-09T08:00:00.000Z", "base text");
    const local = makeCard("same", "2026-06-09T09:00:00.000Z", "local text");
    const remote = makeCard("same", "2026-06-09T10:00:00.000Z", "remote text");

    const result = mergeCardsForSync([local], [remote], {
      baseCards: [base],
      nowIso: "2026-06-09T11:00:00.000Z"
    });

    expect(result.cards).toHaveLength(2);
    expect(result.conflictCount).toBe(1);
    expect(result.cards.some((card) => card.id === "same" && card.frontText === "local text")).toBe(
      true
    );
    const conflictCopy = result.cards.find((card) => card.syncMetadata?.conflict);
    expect(conflictCopy?.frontText).toBe("remote text");
    expect(conflictCopy?.syncMetadata?.originalCardId).toBe("same");
  });

  it("does not create a conflict when only updatedAt differs", () => {
    const base = makeCard("same", "2026-06-09T08:00:00.000Z", "same text");
    const local = makeCard("same", "2026-06-09T09:00:00.000Z", "same text");
    const remote = makeCard("same", "2026-06-09T10:00:00.000Z", "same text");

    const result = mergeCardsForSync([local], [remote], {
      baseCards: [base],
      nowIso: "2026-06-09T11:00:00.000Z"
    });

    expect(result.cards).toHaveLength(1);
    expect(result.conflictCount).toBe(0);
  });

  it("parses snapshots and normalizes missing timestamps", () => {
    const snapshot = parseCardSyncSnapshot({
      cards: [makeCard("a", "")]
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.cards[0].createdAt).toBeTruthy();
    expect(snapshot.cards[0].updatedAt).toBeTruthy();
  });

  it("creates a stable Drive snapshot", () => {
    const snapshot = createCardSyncSnapshot(
      [makeCard("a", "2026-06-09T09:00:00.000Z")],
      "2026-06-09T10:00:00.000Z"
    );

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      appName: "Language Miner",
      exportedAt: "2026-06-09T10:00:00.000Z"
    });
  });
});

function makeCard(id: string, updatedAt: string, frontText = "front"): StudyCard {
  return {
    id,
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence: "source",
    targetText: "target",
    frontText,
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: "2026-06-09T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: updatedAt,
    updatedAt
  };
}
