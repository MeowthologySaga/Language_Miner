export const VIDEO_TRANSCRIPT_VIRTUALIZE_THRESHOLD = 120;
export const VIDEO_TRANSCRIPT_OVERSCAN = 6;
export const VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT = 82;
export const VIDEO_TRANSCRIPT_FULLSCREEN_ROW_HEIGHT = 126;

export function getVideoTranscriptScrollTopForIndex(input: {
  index: number;
  itemCount: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}) {
  const itemCount = Math.max(0, finiteInteger(input.itemCount, 0));
  if (itemCount === 0) return 0;

  const rowHeight = Math.max(1, finiteNumber(input.rowHeight, 1));
  const viewportHeight = Math.max(rowHeight, finiteNumber(input.viewportHeight, rowHeight));
  const maxScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight);
  const currentScrollTop = clamp(finiteNumber(input.scrollTop, 0), 0, maxScrollTop);
  const index = clamp(finiteInteger(input.index, 0), 0, itemCount - 1);
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;

  if (rowTop < currentScrollTop) {
    return clamp(rowTop, 0, maxScrollTop);
  }
  if (rowBottom > currentScrollTop + viewportHeight) {
    return clamp(rowBottom - viewportHeight, 0, maxScrollTop);
  }
  return currentScrollTop;
}

export function getVideoTranscriptKeyboardIndex(input: {
  key: string;
  currentIndex: number;
  itemCount: number;
  pageSize: number;
}): number | null {
  const itemCount = Math.max(0, finiteInteger(input.itemCount, 0));
  if (itemCount === 0) return null;

  const currentIndex = clamp(finiteInteger(input.currentIndex, 0), 0, itemCount - 1);
  const pageSize = Math.max(1, finiteInteger(input.pageSize, 1));
  switch (input.key) {
    case "ArrowUp":
    case "ArrowLeft":
    case "a":
    case "A":
      return Math.max(0, currentIndex - 1);
    case "ArrowDown":
    case "ArrowRight":
    case "d":
    case "D":
      return Math.min(itemCount - 1, currentIndex + 1);
    case "PageUp":
      return Math.max(0, currentIndex - pageSize);
    case "PageDown":
      return Math.min(itemCount - 1, currentIndex + pageSize);
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: number, fallback: number) {
  return Math.floor(finiteNumber(value, fallback));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
