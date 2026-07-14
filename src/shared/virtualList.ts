export type VirtualListWindow = {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
};

export function calculateVirtualListWindow(input: {
  itemCount: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}): VirtualListWindow {
  const itemCount = finiteInteger(input.itemCount, 0);
  const rowHeight = Math.max(1, finiteNumber(input.rowHeight, 1));
  const viewportHeight = Math.max(1, finiteNumber(input.viewportHeight, rowHeight));
  const scrollTop = Math.max(0, finiteNumber(input.scrollTop, 0));
  const overscan = finiteInteger(input.overscan ?? 4, 0);
  const firstVisible = Math.min(itemCount, Math.floor(scrollTop / rowHeight));
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount, firstVisible + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    totalHeight: itemCount * rowHeight
  };
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: number, minimum: number) {
  return Math.max(minimum, Math.floor(finiteNumber(value, minimum)));
}
