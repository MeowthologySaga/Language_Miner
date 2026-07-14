import { describe, expect, it } from "vitest";
import {
  buildDailyMissionBoard,
  dailyMissionDefinitions,
  findMissionDefinitionsByEventType,
  findMissionByEventType,
  getMissionDateKey,
  getReviewDeckCompletedEventType,
  normalizeDailyMissionBoard
} from "./dailyMissions";
import type { DailyMissionProgress, DiamondTransaction } from "./types";

describe("dailyMissions", () => {
  it("uses local YYYY-MM-DD date keys", () => {
    expect(getMissionDateKey(new Date(2026, 5, 10, 9, 30))).toBe("2026-06-10");
  });

  it("maps learning events to mission definitions", () => {
    expect(findMissionByEventType("review_completed")).toBeNull();
    expect(findMissionByEventType("review_input_reading_deck_completed")?.id).toBe(
      "review-input-reading-deck"
    );
    expect(findMissionByEventType("review_input_listening_deck_completed")?.id).toBe(
      "review-input-listening-deck"
    );
    expect(findMissionByEventType("review_output_deck_completed")?.id).toBe("review-output-deck");
    expect(findMissionByEventType("card_created")?.id).toBe("card-2");
    expect(findMissionByEventType("life_mining_card_created")?.id).toBe("life-mining-card-5");
    expect(findMissionByEventType("writing_practice_completed")?.id).toBe("writing-3");
    expect(findMissionByEventType("listening_sentence_completed")?.id).toBe("listening-30");
  });

  it("defines missions for every daily category", () => {
    expect(dailyMissionDefinitions.filter((mission) => mission.category === "input")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "card-2" }),
        expect.objectContaining({ id: "listening-30" })
      ])
    );
    expect(dailyMissionDefinitions.filter((mission) => mission.category === "output")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "writing-3" }),
        expect.objectContaining({ id: "life-mining-card-5" })
      ])
    );
    expect(dailyMissionDefinitions.filter((mission) => mission.category === "output")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "writing-10" })])
    );
    expect(dailyMissionDefinitions.filter((mission) => mission.category === "review")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "review-input-reading-deck" }),
        expect.objectContaining({ id: "review-input-listening-deck" }),
        expect.objectContaining({ id: "review-output-deck" })
      ])
    );
    expect(dailyMissionDefinitions.filter((mission) => mission.category === "review")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "review-10" }),
        expect.objectContaining({ id: "review-30" })
      ])
    );
  });

  it("maps one learning event to all matching missions", () => {
    expect(findMissionDefinitionsByEventType("review_completed").map((mission) => mission.id)).toEqual(
      []
    );
    expect(
      findMissionDefinitionsByEventType("review_input_reading_deck_completed").map(
        (mission) => mission.id
      )
    ).toEqual(["review-input-reading-deck"]);
    expect(
      findMissionDefinitionsByEventType("review_input_listening_deck_completed").map(
        (mission) => mission.id
      )
    ).toEqual(["review-input-listening-deck"]);
    expect(
      findMissionDefinitionsByEventType("review_output_deck_completed").map(
        (mission) => mission.id
      )
    ).toEqual(["review-output-deck"]);
    expect(
      findMissionDefinitionsByEventType("writing_practice_completed").map((mission) => mission.id)
    ).toEqual(["writing-3"]);
    expect(
      findMissionDefinitionsByEventType("life_mining_card_created").map((mission) => mission.id)
    ).toEqual(["life-mining-card-5"]);
  });

  it("defines listening as a 30 sentence input mission worth 20 diamonds", () => {
    expect(findMissionByEventType("listening_sentence_completed")).toMatchObject({
      id: "listening-30",
      category: "input",
      goal: 30,
      rewardDiamonds: 20
    });
  });

  it("defines reading input card creation as a five-card input mission", () => {
    expect(findMissionByEventType("card_created")).toMatchObject({
      id: "card-2",
      category: "input",
      title: "인풋-리딩 카드 5장 만들기",
      goal: 5,
      rewardDiamonds: 15
    });
  });

  it("defines life mining card creation as a five-card output mission", () => {
    expect(findMissionByEventType("life_mining_card_created")).toMatchObject({
      id: "life-mining-card-5",
      category: "output",
      title: "라이프 마이닝 카드 5개 만들기",
      goal: 5,
      rewardDiamonds: 25
    });
  });

  it("defines one review completion mission for each review deck", () => {
    expect(findMissionByEventType("review_input_reading_deck_completed")).toMatchObject({
      id: "review-input-reading-deck",
      category: "review",
      title: "인풋-리딩덱 복습 끝내기",
      goal: 1,
      rewardDiamonds: 15
    });
    expect(findMissionByEventType("review_input_listening_deck_completed")).toMatchObject({
      id: "review-input-listening-deck",
      category: "review",
      title: "인풋-리스닝덱 복습 끝내기",
      goal: 1,
      rewardDiamonds: 15
    });
    expect(findMissionByEventType("review_output_deck_completed")).toMatchObject({
      id: "review-output-deck",
      category: "review",
      title: "아웃풋덱 복습 끝내기",
      goal: 1,
      rewardDiamonds: 15
    });
  });

  it("maps review deck types to deck completion events", () => {
    expect(getReviewDeckCompletedEventType("input")).toBe("review_input_reading_deck_completed");
    expect(getReviewDeckCompletedEventType("input-listening")).toBe(
      "review_input_listening_deck_completed"
    );
    expect(getReviewDeckCompletedEventType("output")).toBe("review_output_deck_completed");
  });

  it("marks base missions claimable only after goal completion", () => {
    const rows: DailyMissionProgress[] = [
      {
        dateKey: "2026-06-10",
        missionId: "review-input-reading-deck",
        progress: 1,
        claimed: false,
        updatedAt: "2026-06-10T00:00:00.000Z"
      },
      {
        dateKey: "2026-06-10",
        missionId: "card-2",
        progress: 1,
        claimed: false,
        updatedAt: "2026-06-10T00:00:00.000Z"
      }
    ];

    const board = buildDailyMissionBoard("2026-06-10", rows);

    expect(board.missions.find((mission) => mission.id === "review-input-reading-deck")?.claimable).toBe(
      true
    );
    expect(board.missions.find((mission) => mission.id === "card-2")?.claimable).toBe(false);
    expect(board.bonus.claimable).toBe(false);
  });

  it("unlocks the daily bonus after all base rewards are claimed", () => {
    const rows: DailyMissionProgress[] = dailyMissionDefinitions.map((mission) => ({
      dateKey: "2026-06-10",
      missionId: mission.id,
      progress: mission.goal,
      claimed: true,
      claimedAt: "2026-06-10T01:00:00.000Z",
      updatedAt: "2026-06-10T01:00:00.000Z"
    }));

    const board = buildDailyMissionBoard("2026-06-10", rows);

    expect(board.allBaseRewardsClaimed).toBe(true);
    expect(board.bonus.completed).toBe(true);
    expect(board.bonus.claimable).toBe(true);
  });

  it("sums today's earned diamonds from transactions", () => {
    const transactions: DiamondTransaction[] = [
      {
        id: "a",
        type: "earn",
        amount: 20,
        balanceAfter: 20,
        reason: "mission",
        dateKey: "2026-06-10",
        createdAt: "2026-06-10T01:00:00.000Z"
      },
      {
        id: "b",
        type: "earn",
        amount: 15,
        balanceAfter: 35,
        reason: "mission",
        dateKey: "2026-06-09",
        createdAt: "2026-06-09T01:00:00.000Z"
      },
      {
        id: "c",
        type: "spend",
        amount: 5,
        balanceAfter: 15,
        reason: "shop",
        dateKey: "2026-06-10",
        createdAt: "2026-06-10T02:00:00.000Z"
      }
    ];

    expect(buildDailyMissionBoard("2026-06-10", [], transactions).earnedToday).toBe(20);
  });

  it("restores default mission definitions when a stored board has no missions", () => {
    const board = normalizeDailyMissionBoard(
      {
        dateKey: "2026-06-10",
        missions: [],
        bonus: {
          id: "daily-bonus",
          title: "오늘 보너스",
          description: "기본 미션 보상 모두 받기",
          rewardDiamonds: 30,
          completed: false,
          claimable: false,
          claimed: false
        },
        earnedToday: 110,
        allBaseRewardsClaimed: false
      },
      "2026-06-10"
    );

    expect(board.missions.map((mission) => mission.id)).toEqual(
      dailyMissionDefinitions.map((mission) => mission.id)
    );
    expect(board.missions.every((mission) => mission.progress === 0)).toBe(true);
    expect(board.earnedToday).toBe(110);
  });

  it("keeps existing mission progress while normalizing missing mission definitions", () => {
    const board = normalizeDailyMissionBoard(
      {
        dateKey: "2026-06-10",
        missions: [
          {
            ...dailyMissionDefinitions.find((mission) => mission.id === "review-input-reading-deck")!,
            progress: 7,
            completed: false,
            claimed: false,
            claimable: false
          }
        ],
        bonus: {
          id: "daily-bonus",
          title: "오늘 보너스",
          description: "기본 미션 보상 모두 받기",
          rewardDiamonds: 30,
          completed: false,
          claimable: false,
          claimed: false
        },
        earnedToday: 0,
        allBaseRewardsClaimed: false
      },
      "2026-06-10"
    );

    expect(board.missions).toHaveLength(dailyMissionDefinitions.length);
    expect(board.missions.find((mission) => mission.id === "review-input-reading-deck")?.progress).toBe(
      1
    );
    expect(board.missions.find((mission) => mission.id === "card-2")?.progress).toBe(0);
  });
});
