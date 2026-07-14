import { describe, expect, it } from "vitest";
import {
  CARD_LIST_PAGE_SIZE,
  getNextVisibleCardLimit,
  getVisibleCardPage
} from "./cardsPagePagination";

describe("cardsPagePagination", () => {
  it("caps the initial DOM list at one page", () => {
    const cards = Array.from({ length: 250 }, (_, index) => index);
    expect(getVisibleCardPage(cards, CARD_LIST_PAGE_SIZE)).toHaveLength(100);
  });

  it("reveals one bounded page at a time without exceeding the result count", () => {
    expect(getNextVisibleCardLimit(100, 250)).toBe(200);
    expect(getNextVisibleCardLimit(200, 250)).toBe(250);
  });
});
