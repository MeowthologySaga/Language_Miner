import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "unused" },
  BrowserWindow: class {},
  desktopCapturer: {},
  globalShortcut: {},
  screen: {}
}));

import { finishDesktopOcrSelection } from "./desktopOcr";

describe("desktop OCR managed-data cancellation", () => {
  it("rejects before capture work starts when already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("privacy deletion"));

    await expect(
      finishDesktopOcrSelection(
        { x: 0, y: 0, width: 100, height: 100 },
        "en",
        controller.signal
      )
    ).rejects.toThrow("privacy deletion");
  });
});
