import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryApi } from "./memoryApi";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";
import { createInitialSrs } from "../shared/srs";
import type { StudyCard } from "../shared/types";

describe("createMemoryApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores life logs when browser localStorage is unavailable", async () => {
    const api = createMemoryApi();
    const text = `fallback log ${crypto.randomUUID()}`;

    const saved = await api.lifeLogs.save({
      text,
      beforeContext: "ChatGPT: This is a QA context.",
      sourceType: "manual"
    });
    const logs = await api.lifeLogs.list();

    expect(saved.text).toBe(text);
    expect(logs.some((log) => log.id === saved.id && log.text === text)).toBe(true);
  });

  it("deletes life logs in the fallback store", async () => {
    const api = createMemoryApi();
    const saved = await api.lifeLogs.save({
      text: `delete fallback log ${crypto.randomUUID()}`,
      sourceType: "manual"
    });

    await expect(api.lifeLogs.delete(saved.id)).resolves.toBe(true);
    const logs = await api.lifeLogs.list();

    expect(logs.some((log) => log.id === saved.id)).toBe(false);
  });

  it("stores cards when browser localStorage is unavailable", async () => {
    const api = createMemoryApi();
    const card = makeCard(`fallback-card-${crypto.randomUUID()}`);

    const saved = await api.cards.save(card);
    const cards = await api.cards.list();

    expect(saved.id).toBe(card.id);
    expect(cards.some((candidate) => candidate.id === card.id)).toBe(true);
  });

  it("records creation missions only for reading input and life mining output cards", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      }
    });
    const api = createMemoryApi();
    const beforeBoard = await api.missions.getToday();

    await api.cards.save(makeCard("reading-input"));
    await api.cards.save(makeListeningCard("listening-input"));
    await api.cards.save(makeLifeMiningCard("life-output"));

    const board = await api.missions.getToday();
    const beforeReadingProgress =
      beforeBoard.missions.find((mission) => mission.id === "card-2")?.progress ?? 0;
    const beforeLifeMiningProgress =
      beforeBoard.missions.find((mission) => mission.id === "life-mining-card-5")?.progress ?? 0;
    const beforeWritingProgress =
      beforeBoard.missions.find((mission) => mission.id === "writing-3")?.progress ?? 0;

    expect((board.missions.find((mission) => mission.id === "card-2")?.progress ?? 0) - beforeReadingProgress).toBe(1);
    expect(
      (board.missions.find((mission) => mission.id === "life-mining-card-5")?.progress ?? 0) -
        beforeLifeMiningProgress
    ).toBe(1);
    expect((board.missions.find((mission) => mission.id === "writing-3")?.progress ?? 0) - beforeWritingProgress).toBe(0);
  });

  it("falls back to session storage when localStorage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked storage");
      },
      setItem: () => {
        throw new Error("blocked storage");
      }
    });
    const api = createMemoryApi();
    const text = `blocked storage log ${crypto.randomUUID()}`;

    const saved = await api.lifeLogs.save({
      text,
      sourceType: "manual"
    });
    const logs = await api.lifeLogs.list();

    expect(logs.some((log) => log.id === saved.id && log.text === text)).toBe(true);
  });

  it("keeps fallback writes readable when only localStorage writes fail", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      }
    });
    const api = createMemoryApi();
    const text = `quota fallback log ${crypto.randomUUID()}`;

    const saved = await api.lifeLogs.save({
      text,
      sourceType: "manual"
    });
    const logs = await api.lifeLogs.list();

    expect(logs.some((log) => log.id === saved.id && log.text === text)).toBe(true);
  });

  it("looks up an already-paid browser fallback spend before replaying it", async () => {
    const storage = new Map<string, string>([
      [
        "lem:fallback:diamondWallet",
        JSON.stringify({
          balance: 100,
          totalEarned: 100,
          totalSpent: 0,
          updatedAt: new Date().toISOString()
        })
      ],
      ["lem:fallback:diamondTransactions", "[]"]
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value))
    });
    const api = createMemoryApi();
    const request = {
      amount: 20,
      reason: "PlayZone recovery test",
      idempotencyKey: "playzone:test:browser-recovery:0001"
    };

    await expect(api.wallet.lookupSpend(request)).resolves.toBeNull();
    await expect(api.wallet.spend(request)).resolves.toMatchObject({ ok: true, balanceAfter: 80 });
    await expect(api.wallet.lookupSpend(request)).resolves.toMatchObject({
      ok: true,
      balanceAfter: 80,
      idempotentReplay: true
    });
    await expect(api.wallet.listTransactions()).resolves.toHaveLength(1);
  });
});

function makeCard(id: string): StudyCard {
  return {
    id,
    profileId: DEFAULT_PROFILE_ID,
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence: "I was wondering if you could check this.",
    targetText: "wondering",
    frontText: "I was wondering if you could check this.",
    literalTranslationKo: "확인해줄 수 있는지 궁금했습니다.",
    naturalTranslationKo: "혹시 이것 좀 확인해줄 수 있을까요?",
    highlightMappings: [],
    vocabularyItems: [],
    srs: createInitialSrs()
  };
}

function makeListeningCard(id: string): StudyCard {
  return {
    ...makeCard(id),
    deckType: "input-listening",
    targetText: "listening:demo:segment-1"
  };
}

function makeLifeMiningCard(id: string): StudyCard {
  return {
    ...makeCard(id),
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: "오늘 회의 조금 미뤄도 돼?",
    targetText: "Could we push the meeting back a bit?",
    frontText: "Me: 오늘 회의 조금 미뤄도 돼?"
  };
}
