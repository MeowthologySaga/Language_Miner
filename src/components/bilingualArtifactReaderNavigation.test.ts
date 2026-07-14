import { describe, expect, it } from "vitest";
import {
  clampReaderPage,
  resolveReaderScale,
  resolveWheelPageNavigation
} from "./bilingualArtifactReaderNavigation";

describe("bilingual artifact reader navigation", () => {
  it("clamps page jumps to the loaded document range", () => {
    expect(clampReaderPage(0, 5)).toBe(1);
    expect(clampReaderPage(3.6, 5)).toBe(4);
    expect(clampReaderPage(99, 5)).toBe(5);
    expect(clampReaderPage(1, 0)).toBeNull();
    expect(clampReaderPage(Number.NaN, 5)).toBeNull();
  });

  it("resolves fit-width, fit-page, and fullscreen scales", () => {
    expect(
      resolveReaderScale({
        viewMode: "fit-width",
        customZoom: 1.25,
        isFullscreen: false,
        stageWidth: 1000,
        stageHeight: 800,
        pageWidth: 500,
        pageHeight: 1000
      })
    ).toBeCloseTo(1.904);

    expect(
      resolveReaderScale({
        viewMode: "fit-page",
        customZoom: 1.25,
        isFullscreen: false,
        stageWidth: 1000,
        stageHeight: 800,
        pageWidth: 500,
        pageHeight: 1000
      })
    ).toBeCloseTo(0.752);

    expect(
      resolveReaderScale({
        viewMode: "custom",
        customZoom: 1.25,
        isFullscreen: true,
        stageWidth: 1000,
        stageHeight: 800,
        pageWidth: 500,
        pageHeight: 1000
      })
    ).toBeCloseTo(0.8);
  });

  it("accumulates fullscreen wheel input before moving pages", () => {
    const first = resolveWheelPageNavigation({
      isFullscreen: true,
      hasDocument: true,
      pageCount: 5,
      deltaY: 30,
      timeStamp: 100,
      state: { accumulatedDelta: 0, lastNavigatedAt: 0 }
    });

    expect(first).toMatchObject({
      handled: true,
      pageDelta: 0,
      state: { accumulatedDelta: 30, lastNavigatedAt: 0 }
    });

    const second = resolveWheelPageNavigation({
      isFullscreen: true,
      hasDocument: true,
      pageCount: 5,
      deltaY: 40,
      timeStamp: 300,
      state: first.state
    });

    expect(second).toMatchObject({
      handled: true,
      pageDelta: 1,
      state: { accumulatedDelta: 0, lastNavigatedAt: 300 }
    });
  });

  it("ignores wheel page navigation outside eligible reader state", () => {
    expect(
      resolveWheelPageNavigation({
        isFullscreen: false,
        hasDocument: true,
        pageCount: 5,
        deltaY: 80,
        timeStamp: 300,
        state: { accumulatedDelta: 0, lastNavigatedAt: 0 }
      })
    ).toMatchObject({ handled: false, pageDelta: 0 });

    expect(
      resolveWheelPageNavigation({
        isFullscreen: true,
        hasDocument: true,
        pageCount: 1,
        deltaY: 80,
        timeStamp: 300,
        state: { accumulatedDelta: 0, lastNavigatedAt: 0 }
      })
    ).toMatchObject({ handled: false, pageDelta: 0 });
  });
});
