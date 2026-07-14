import { describe, expect, it } from "vitest";
import {
  calculateLifeLogVirtualWindow,
  getLifeLogNavigationIndex,
  getScrollTopForVirtualLifeLogIndex,
  LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT,
  LIFE_LOG_VIRTUAL_OVERSCAN,
  LIFE_LOG_VIRTUAL_ROW_HEIGHT
} from "./lifeMiningVirtualization";

describe("Life Mining large-list virtualization", () => {
  it("keeps a two-column window bounded for several thousand candidates", () => {
    const itemCount = 8_000;
    const window = calculateLifeLogVirtualWindow({
      itemCount,
      columnCount: 2,
      rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
      scrollTop: LIFE_LOG_VIRTUAL_ROW_HEIGHT * 1_750,
      viewportHeight: LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT,
      overscan: LIFE_LOG_VIRTUAL_OVERSCAN
    });

    expect(window.rowCount).toBe(4_000);
    expect(window.startItemIndex).toBe(3_492);
    expect(window.endItemIndex).toBe(3_512);
    expect(window.endItemIndex - window.startItemIndex).toBeLessThan(30);
    expect(window.totalHeight).toBe(4_000 * LIFE_LOG_VIRTUAL_ROW_HEIGHT);
  });

  it("moves predictably across grid columns and pages without losing the target index", () => {
    expect(
      getLifeLogNavigationIndex({
        key: "ArrowDown",
        currentIndex: 40,
        itemCount: 5_001,
        columnCount: 2,
        pageRowCount: 3
      })
    ).toBe(42);
    expect(
      getLifeLogNavigationIndex({
        key: "PageDown",
        currentIndex: 40,
        itemCount: 5_001,
        columnCount: 2,
        pageRowCount: 3
      })
    ).toBe(46);
    expect(
      getLifeLogNavigationIndex({
        key: "End",
        currentIndex: 40,
        itemCount: 5_001,
        columnCount: 2,
        pageRowCount: 3
      })
    ).toBe(5_000);
  });

  it("scrolls the final candidate into the mounted row window", () => {
    const itemCount = 6_001;
    const finalIndex = itemCount - 1;
    const scrollTop = getScrollTopForVirtualLifeLogIndex({
      index: finalIndex,
      itemCount,
      columnCount: 2,
      rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
      viewportHeight: LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT,
      currentScrollTop: 0
    });
    const window = calculateLifeLogVirtualWindow({
      itemCount,
      columnCount: 2,
      rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
      scrollTop,
      viewportHeight: LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT,
      overscan: LIFE_LOG_VIRTUAL_OVERSCAN
    });

    expect(window.startItemIndex).toBeLessThanOrEqual(finalIndex);
    expect(window.endItemIndex).toBeGreaterThan(finalIndex);
  });
});
