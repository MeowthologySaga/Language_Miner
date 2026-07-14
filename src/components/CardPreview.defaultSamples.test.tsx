import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CardPreview } from "./CardPreview";
import { createDefaultSampleCards } from "../shared/defaultSampleCards";

describe("CardPreview finalized default cards", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("bundles exactly three finalized cards for each deck", () => {
    const cards = createDefaultSampleCards("default", new Date("2026-07-12T00:00:00.000Z"));

    expect(cards).toHaveLength(9);
    expect(cards.filter((card) => card.deckType === "input")).toHaveLength(3);
    expect(cards.filter((card) => card.deckType === "input-listening")).toHaveLength(3);
    expect(cards.filter((card) => card.deckType === "output")).toHaveLength(3);
    expect(cards.every((card) => card.tags?.includes("기본카드"))).toBe(true);
    expect(cards.every((card) => card.tags?.includes("시작가이드"))).toBe(true);
    expect(cards.every((card) => !card.id.includes("prototype"))).toBe(true);
    expect(cards.every((card) => !card.id.includes("mock"))).toBe(true);
    expect(
      cards
        .filter((card) => card.deckType === "input")
        .every((card) => Boolean(card.readingStructure))
    ).toBe(true);
    expect(
      cards
        .filter((card) => card.deckType === "input-listening")
        .every((card) => Boolean(card.listeningStudyGuide) && !card.listeningStudyGuide?.prototype)
    ).toBe(true);
    expect(
      cards
        .filter((card) => card.deckType === "output")
        .every((card) => Boolean(card.outputStudyGuide) && !card.outputStudyGuide?.prototype)
    ).toBe(true);
  });

  it("models single-word, phrasal-verb, and multi-highlight reading selections", () => {
    const readingCards = createDefaultSampleCards("default").filter(
      (card) => card.deckType === "input"
    );

    expect(readingCards.map((card) => card.highlightMappings.length)).toEqual([1, 1, 2]);
    expect(readingCards[0].sourceSentence).toBe("I’m running a little late.");
    expect(readingCards[0].highlightMappings[0].sourceText).toBe("running a little late");
    expect(readingCards[1].highlightMappings[0].sourceText).toBe("put off");
    expect(readingCards[2].highlightMappings.map((mapping) => mapping.sourceText)).toEqual([
      "carefully compared",
      "drawing a conclusion"
    ]);
  });

  it("keeps every input highlight mapped to exact visible text", () => {
    const inputCards = createDefaultSampleCards("default").filter(
      (card) => card.deckType !== "output"
    );

    for (const card of inputCards) {
      for (const mapping of card.highlightMappings) {
        expect(card.sourceSentence).toContain(mapping.sourceText);
        if (mapping.literalKo) {
          expect(card.literalTranslationKo).toContain(mapping.literalKo);
        }
        if (mapping.naturalKo) {
          expect(card.naturalTranslationKo).toContain(mapping.naturalKo);
        }
      }
    }
  });

  it("uses the finalized reading order and sentence structure", () => {
    const card = createDefaultSampleCards("default").find((item) => item.deckType === "input")!;
    const frontHtml = renderToStaticMarkup(<CardPreview card={card} />);
    const backHtml = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(card.readingStructure?.segments).toHaveLength(4);
    expect(card.readingStructure?.groups.map((group) => group.titleKo)).toEqual([
      "한 문장 · 현재 늦어지는 상황"
    ]);
    expect(frontHtml).toContain("reading-front-hero");
    expect(backHtml.indexOf("자연스러운 뜻")).toBeLessThan(backHtml.indexOf("어휘 상세"));
    expect(backHtml.indexOf("어휘 상세")).toBeLessThan(
      backHtml.indexOf("reading-structure-primary")
    );
    expect(backHtml.indexOf("reading-structure-primary")).toBeLessThan(
      backHtml.indexOf("비슷한 표현 비교")
    );
    expect(backHtml.match(/reading-sentence-segment/g)).toHaveLength(4);
    expect(backHtml).not.toContain("오늘 가져갈 것");
    expect(backHtml).not.toContain("한 문장 재구성");
  });

  it("uses the finalized listening flow without legacy duplicate sections", () => {
    const card = createDefaultSampleCards("default").find(
      (item) => item.deckType === "input-listening"
    )!;
    const frontHtml = renderToStaticMarkup(<CardPreview card={card} />);
    const backHtml = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(card.listeningStudyGuide?.prototype).toBeUndefined();
    expect(card.listeningStudyGuide?.chunks).toHaveLength(3);
    expect(card.sourceSentence).toBe("Could you send it to me when you get a chance?");
    expect(frontHtml).not.toContain(card.sourceSentence);
    expect(frontHtml).toContain("/samples/listening/onboarding-office-send.png");
    expect(frontHtml).not.toContain(".wav");
    expect(frontHtml).toContain("input-listening-frame-image");
    expect(frontHtml).toContain("기기 TTS 미리듣기");
    expect(stripTags(backHtml)).toContain(card.sourceSentence);
    expect(backHtml).toContain("소리 덩어리로 다시 듣기");
    expect(backHtml).toContain("전체 듣기");
    expect(backHtml).toContain("놓친 이유");
    expect(backHtml).toContain("짧게 확인하기");
    expect(backHtml.match(/listening-flow-heading/g)).toHaveLength(3);
    expect(backHtml).not.toContain("input-listening-sound-points");
    expect(backHtml).not.toContain("input-vocab-section");
  });

  it("gives every listening starter card a distinct fictional scene and runtime TTS", () => {
    const cards = createDefaultSampleCards("default").filter(
      (card) => card.deckType === "input-listening"
    );

    expect(cards.map((card) => card.listeningMedia?.frameImage?.fileUrl)).toEqual([
      "/samples/listening/onboarding-office-send.png",
      "/samples/listening/onboarding-roommate-minute.png",
      "/samples/listening/onboarding-restaurant-order.png"
    ]);
    expect(cards.every((card) => card.listeningMedia?.audioClip === undefined)).toBe(true);
    expect(
      cards.every(
        (card) =>
          card.listeningMedia?.runtimeTts?.generatedOnDevice === true &&
          card.listeningMedia.runtimeTts.text === card.sourceSentence &&
          card.listeningMedia.runtimeTts.languageCode === "en"
      )
    ).toBe(true);
  });

  it("uses the finalized message-style output card with target-language pronunciation", () => {
    const card = createDefaultSampleCards("default").find((item) => item.deckType === "output")!;
    const frontHtml = renderToStaticMarkup(<CardPreview card={card} />);
    const backHtml = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(card.outputStudyGuide?.prototype).toBeUndefined();
    expect(card.outputStudyGuide?.dialogue).toHaveLength(2);
    expect(card.outputStudyGuide?.dialogue[1]).toMatchObject({
      en: "Could you speak a little more slowly?",
      ko: "조금만 더 천천히 말해줄래?",
      pronunciationKo: "쿠쥬 스피크 어 리를 모어 슬로울리?",
      ipa: "/kəd juː spiːk ə ˈlɪɾəl mɔːr ˈsloʊli/"
    });
    expect(frontHtml).toContain("adaptive-message-app");
    expect(frontHtml).not.toContain("내 차례");
    expect(backHtml).toContain("영어로 다시 보기");
    expect(backHtml.match(/>소리내어 읽기<\/span>/g)).toHaveLength(2);
    expect(backHtml).toContain("핵심 청크");
    expect(backHtml).toContain("내 실수 교정");
    expect(backHtml).toContain("미니 말하기 연습");
    expect(backHtml).not.toContain("자연스러운 정답");
  });

  it("renders every default card on both sides", () => {
    for (const card of createDefaultSampleCards("default")) {
      const frontHtml = renderToStaticMarkup(<CardPreview card={card} />);
      const backHtml = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);
      expect(frontHtml).toContain("앞면");
      expect(backHtml).toContain("뒷면");
      expect(stripTags(frontHtml + backHtml)).toContain(card.sourceSentence.slice(0, 8));
    }
  });
});

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}
