export const CARD_LIST_VIRTUALIZATION_THRESHOLD = 120;
export const CARD_LIST_VIRTUAL_ROW_HEIGHT = 112;
export const CARD_LIST_VIRTUAL_OVERSCAN = 4;
export const CARD_LIST_DEFAULT_VIEWPORT_HEIGHT = 640;

export type CardListNavigationKey =
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | "PageDown"
  | "PageUp";

export function getVirtualCardNavigationIndex(input: {
  key: string;
  currentIndex: number;
  itemCount: number;
  pageSize: number;
}) {
  const itemCount = Math.max(0, Math.floor(finiteNumber(input.itemCount, 0)));
  if (itemCount === 0 || !isCardListNavigationKey(input.key)) {
    return null;
  }

  const currentIndex = Math.min(
    itemCount - 1,
    Math.max(0, Math.floor(finiteNumber(input.currentIndex, 0)))
  );
  const pageSize = Math.max(1, Math.floor(finiteNumber(input.pageSize, 1)));
  const targetIndex =
    input.key === "ArrowDown"
      ? currentIndex + 1
      : input.key === "ArrowUp"
        ? currentIndex - 1
        : input.key === "Home"
          ? 0
          : input.key === "End"
            ? itemCount - 1
            : input.key === "PageDown"
              ? currentIndex + pageSize
              : currentIndex - pageSize;

  return Math.min(itemCount - 1, Math.max(0, targetIndex));
}

export function getScrollTopForVirtualCardIndex(input: {
  index: number;
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  currentScrollTop: number;
}) {
  const itemCount = Math.max(0, Math.floor(finiteNumber(input.itemCount, 0)));
  if (itemCount === 0) {
    return 0;
  }

  const rowHeight = Math.max(1, finiteNumber(input.rowHeight, 1));
  const viewportHeight = Math.max(1, finiteNumber(input.viewportHeight, rowHeight));
  const index = Math.min(
    itemCount - 1,
    Math.max(0, Math.floor(finiteNumber(input.index, 0)))
  );
  const maximumScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight);
  const currentScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, finiteNumber(input.currentScrollTop, 0))
  );
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;

  if (rowTop < currentScrollTop) {
    return Math.min(maximumScrollTop, rowTop);
  }
  if (rowBottom > currentScrollTop + viewportHeight) {
    return Math.min(maximumScrollTop, rowBottom - viewportHeight);
  }
  return currentScrollTop;
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function isCardListNavigationKey(key: string): key is CardListNavigationKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "Home" ||
    key === "End" ||
    key === "PageDown" ||
    key === "PageUp"
  );
}
