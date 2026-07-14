import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { createInitialSrs } from "../shared/srs";
import type { StudyCard } from "../shared/types";
import { CardPreview } from "./CardPreview";

const card: StudyCard = {
  id: "localized-card-preview",
  cardType: "reading",
  deckType: "input",
  direction: "target_to_native",
  sourceSentence: "Could you take a quick look at this?",
  targetText: "Could you take a quick look at this?",
  frontText: "Could you take a quick look at this?",
  literalTranslationKo: "이것을 빠르게 봐줄 수 있나요?",
  naturalTranslationKo: "이거 잠깐 봐줄래요?",
  highlightMappings: [],
  vocabularyItems: [],
  confusingComparisons: [],
  pumpPrompts: [],
  srs: createInitialSrs(new Date("2026-07-13T00:00:00.000Z")),
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("CardPreview localization", () => {
  it("renders controls, deck labels, and back sections in English", async () => {
    await i18n.changeLanguage("en");

    const front = renderToStaticMarkup(<CardPreview card={card} />);
    const back = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(front).toContain("Reading Card preview");
    expect(front).toContain("Show answer");
    expect(front).toContain("Listen to sentence");
    expect(front).not.toContain("답 보기");
    expect(back).toContain("Literal meaning");
    expect(back).toContain("Natural meaning");
    expect(back).toContain("Hide answer");
  });
});
