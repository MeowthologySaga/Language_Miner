export const CARD_LIST_PAGE_SIZE = 100;

export function getVisibleCardPage<T>(cards: T[], visibleLimit: number) {
  return cards.slice(0, normalizeVisibleCardLimit(visibleLimit));
}

export function getNextVisibleCardLimit(currentLimit: number, totalCount: number) {
  return Math.min(
    Math.max(0, Math.floor(totalCount)),
    normalizeVisibleCardLimit(currentLimit) + CARD_LIST_PAGE_SIZE
  );
}

function normalizeVisibleCardLimit(value: number) {
  return Math.max(CARD_LIST_PAGE_SIZE, Math.floor(Number(value) || 0));
}
