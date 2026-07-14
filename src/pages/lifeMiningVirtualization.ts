import { calculateVirtualListWindow, type VirtualListWindow } from "../shared/virtualList";

export const LIFE_LOG_VIRTUALIZATION_THRESHOLD = 120;
export const LIFE_LOG_VIRTUAL_ROW_HEIGHT = 380;
export const LIFE_LOG_VIRTUAL_OVERSCAN = 4;
export const LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT = 640;

export type LifeLogVirtualWindow = VirtualListWindow & {
  columnCount: number;
  rowCount: number;
  startItemIndex: number;
  endItemIndex: number;
};

export function calculateLifeLogVirtualWindow(input: {
  itemCount: number;
  columnCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight?: number;
  overscan?: number;
}): LifeLogVirtualWindow {
  const itemCount = nonNegativeInteger(input.itemCount);
  const columnCount = positiveInteger(input.columnCount);
  const rowCount = Math.ceil(itemCount / columnCount);
  const rowWindow = calculateVirtualListWindow({
    itemCount: rowCount,
    rowHeight: input.rowHeight ?? LIFE_LOG_VIRTUAL_ROW_HEIGHT,
    scrollTop: input.scrollTop,
    viewportHeight: input.viewportHeight,
    overscan: input.overscan ?? LIFE_LOG_VIRTUAL_OVERSCAN
  });

  return {
    ...rowWindow,
    columnCount,
    rowCount,
    startItemIndex: Math.min(itemCount, rowWindow.startIndex * columnCount),
    endItemIndex: Math.min(itemCount, rowWindow.endIndex * columnCount)
  };
}

export function getLifeLogNavigationIndex(input: {
  key: string;
  currentIndex: number;
  itemCount: number;
  columnCount: number;
  pageRowCount: number;
}) {
  const itemCount = nonNegativeInteger(input.itemCount);
  if (itemCount === 0 || !isLifeLogNavigationKey(input.key)) {
    return null;
  }

  const currentIndex = clampIndex(input.currentIndex, itemCount);
  const columnCount = positiveInteger(input.columnCount);
  const pageItemCount = positiveInteger(input.pageRowCount) * columnCount;
  const targetIndex =
    input.key === "ArrowDown"
      ? currentIndex + columnCount
      : input.key === "ArrowUp"
        ? currentIndex - columnCount
        : input.key === "ArrowRight"
          ? currentIndex + 1
          : input.key === "ArrowLeft"
            ? currentIndex - 1
            : input.key === "Home"
              ? 0
              : input.key === "End"
                ? itemCount - 1
                : input.key === "PageDown"
                  ? currentIndex + pageItemCount
                  : currentIndex - pageItemCount;

  return clampIndex(targetIndex, itemCount);
}

export function getScrollTopForVirtualLifeLogIndex(input: {
  index: number;
  itemCount: number;
  columnCount: number;
  rowHeight?: number;
  viewportHeight: number;
  currentScrollTop: number;
}) {
  const itemCount = nonNegativeInteger(input.itemCount);
  if (itemCount === 0) {
    return 0;
  }

  const columnCount = positiveInteger(input.columnCount);
  const rowHeight = positiveNumber(input.rowHeight ?? LIFE_LOG_VIRTUAL_ROW_HEIGHT);
  const viewportHeight = positiveNumber(input.viewportHeight);
  const rowCount = Math.ceil(itemCount / columnCount);
  const rowIndex = Math.floor(clampIndex(input.index, itemCount) / columnCount);
  const maximumScrollTop = Math.max(0, rowCount * rowHeight - viewportHeight);
  const currentScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, finiteNumber(input.currentScrollTop, 0))
  );
  const rowTop = rowIndex * rowHeight;
  const rowBottom = rowTop + rowHeight;

  if (rowTop < currentScrollTop) {
    return Math.min(maximumScrollTop, rowTop);
  }
  if (rowBottom > currentScrollTop + viewportHeight) {
    return Math.min(maximumScrollTop, rowBottom - viewportHeight);
  }
  return currentScrollTop;
}

function isLifeLogNavigationKey(key: string) {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "ArrowRight" ||
    key === "ArrowLeft" ||
    key === "Home" ||
    key === "End" ||
    key === "PageDown" ||
    key === "PageUp"
  );
}

function clampIndex(value: number, itemCount: number) {
  return Math.min(itemCount - 1, Math.max(0, nonNegativeInteger(value)));
}

function positiveInteger(value: number) {
  return Math.max(1, Math.floor(finiteNumber(value, 1)));
}

function nonNegativeInteger(value: number) {
  return Math.max(0, Math.floor(finiteNumber(value, 0)));
}

function positiveNumber(value: number) {
  return Math.max(1, finiteNumber(value, 1));
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
