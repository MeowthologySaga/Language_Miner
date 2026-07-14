import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../i18n";
import { defaultSettings } from "../appSettings";
import type { LocalEnglishMinerApi } from "../data/api";
import type { StudyCard } from "../shared/types";
import { calculateVirtualListWindow } from "../shared/virtualList";
import { CardsPage } from "./CardsPage";
import {
  CARD_LIST_DEFAULT_VIEWPORT_HEIGHT,
  CARD_LIST_VIRTUAL_OVERSCAN,
  CARD_LIST_VIRTUAL_ROW_HEIGHT,
  getScrollTopForVirtualCardIndex,
  getVirtualCardNavigationIndex
} from "./cardsPageVirtualization";

describe("CardsPage large-list virtualization", () => {
  it("does not mount 1,000 card options at once", () => {
    const cards = Array.from({ length: 1_000 }, (_, index) => createCard(index));
    const html = renderToStaticMarkup(
      <CardsPage
        api={createCardsPageApi()}
        cards={cards}
        settings={defaultSettings}
        onCardsChanged={async () => undefined}
        onSettingsChange={() => undefined}
      />
    );

    const mountedCardOptions = html.match(/data-card-list-item="true"/g) ?? [];
    expect(mountedCardOptions.length).toBeGreaterThan(0);
    expect(mountedCardOptions.length).toBeLessThan(40);
    expect(html).toContain('aria-setsize="1000"');
    expect(html).toContain("cards-list-virtual-spacer");
  });

  it("scrolls the virtual window far enough to bring the selected final card into view", () => {
    const selectedIndex = getVirtualCardNavigationIndex({
      key: "End",
      currentIndex: 0,
      itemCount: 1_000,
      pageSize: 6
    });
    expect(selectedIndex).toBe(999);

    const scrollTop = getScrollTopForVirtualCardIndex({
      index: selectedIndex!,
      itemCount: 1_000,
      rowHeight: CARD_LIST_VIRTUAL_ROW_HEIGHT,
      viewportHeight: CARD_LIST_DEFAULT_VIEWPORT_HEIGHT,
      currentScrollTop: 0
    });
    const selectedWindow = calculateVirtualListWindow({
      itemCount: 1_000,
      rowHeight: CARD_LIST_VIRTUAL_ROW_HEIGHT,
      scrollTop,
      viewportHeight: CARD_LIST_DEFAULT_VIEWPORT_HEIGHT,
      overscan: CARD_LIST_VIRTUAL_OVERSCAN
    });

    expect(selectedWindow.startIndex).toBeLessThanOrEqual(selectedIndex!);
    expect(selectedWindow.endIndex).toBeGreaterThan(selectedIndex!);
  });

  it("does not render an absolute sync-folder path in the default card UI", () => {
    const privatePath = "C:\\Users\\Alice\\OneDrive\\Language Miner";
    const html = renderToStaticMarkup(
      <CardsPage
        api={createCardsPageApi()}
        cards={[createCard(0)]}
        settings={{ ...defaultSettings, cardSyncFolderPath: privatePath }}
        onCardsChanged={async () => undefined}
        onSettingsChange={() => undefined}
      />
    );

    expect(html).not.toContain(privatePath);
  });
});

function createCard(index: number): StudyCard {
  return {
    id: `card-${index}`,
    profileId: "default",
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence: `Source sentence ${index}`,
    frontText: `Source sentence ${index}`,
    naturalTranslationKo: `Translation ${index}`,
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: "2026-07-13T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    }
  };
}

function createCardsPageApi() {
  return {
    cards: {
      delete: async () => true,
      save: async (card: StudyCard) => card
    },
    cardSync: {}
  } as unknown as LocalEnglishMinerApi;
}
