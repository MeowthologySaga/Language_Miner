import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const desktopOcrMocks = vi.hoisted(() => ({
  windows: [] as Array<any>,
  nextLoad: null as null | Promise<void>,
  execMode: "success" as "success" | "pending",
  execCalls: [] as Array<{ abortObserved: boolean; settled: boolean }>,
  userDataPath: ""
}));

vi.mock("electron", () => {
  class MockBrowserWindow {
    readonly options: Record<string, unknown>;
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly setAlwaysOnTop = vi.fn();
    readonly close = vi.fn();
    readonly destroy = vi.fn(() => {
      if (this.destroyed) return;
      this.emitClosed();
    });
    readonly loadURL = vi.fn(() => {
      const pendingLoad = desktopOcrMocks.nextLoad;
      desktopOcrMocks.nextLoad = null;
      return pendingLoad ?? Promise.resolve();
    });

    private destroyed = false;
    private readonly listeners = new Map<string, Array<() => void>>();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      desktopOcrMocks.windows.push(this);
    }

    on(event: string, listener: () => void) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    isDestroyed() {
      return this.destroyed;
    }

    emitClosed() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const listener of this.listeners.get("closed") ?? []) listener();
    }
  }

  const thumbnail = {
    isEmpty: () => false,
    getSize: () => ({ width: 800, height: 600 }),
    crop: () => ({ toPNG: () => Buffer.from("desktop-ocr-test-png", "utf8") })
  };

  return {
    app: { getPath: () => desktopOcrMocks.userDataPath },
    BrowserWindow: MockBrowserWindow,
    desktopCapturer: {
      getSources: vi.fn(async () => [{ display_id: "1", thumbnail }])
    },
    globalShortcut: {
      isRegistered: vi.fn(() => false),
      register: vi.fn(() => true),
      unregister: vi.fn()
    },
    screen: {
      getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 10 })),
      getDisplayNearestPoint: vi.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        scaleFactor: 1
      }))
    }
  };
});

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      _file: string,
      _args: string[],
      options: { signal?: AbortSignal },
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      const call = { abortObserved: false, settled: false };
      desktopOcrMocks.execCalls.push(call);

      if (desktopOcrMocks.execMode === "pending") {
        options.signal?.addEventListener(
          "abort",
          () => {
            if (call.settled) return;
            call.abortObserved = true;
            call.settled = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            callback(error, "", "");
          },
          { once: true }
        );
      } else {
        queueMicrotask(() => {
          if (call.settled) return;
          call.settled = true;
          callback(null, "recognized text", "");
        });
      }

      return { kill: vi.fn() };
    }
  )
}));

import {
  closeDesktopOcrCaptureWindow,
  closeDesktopOcrWindowsForPrivacyDeletion,
  finishDesktopOcrSelection,
  showDesktopOcrResultWindow,
  startDesktopOcrCapture
} from "./desktopOcr";

const tempDirectories: string[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function resultFixture(id: string) {
  return {
    id,
    imageDataUrl: "data:image/png;base64,dGVzdA==",
    text: "recognized text",
    message: "complete",
    rect: { x: 10, y: 10, width: 100, height: 80 },
    createdAt: "2026-07-14T00:00:00.000Z"
  };
}

beforeEach(() => {
  closeDesktopOcrWindowsForPrivacyDeletion();
  desktopOcrMocks.windows.length = 0;
  desktopOcrMocks.execCalls.length = 0;
  desktopOcrMocks.nextLoad = null;
  desktopOcrMocks.execMode = "success";
  desktopOcrMocks.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-ocr-window-"));
  tempDirectories.push(desktopOcrMocks.userDataPath);
});

afterEach(() => {
  closeDesktopOcrWindowsForPrivacyDeletion();
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop OCR window ownership", () => {
  it("does not let an old result window's late closed event detach the current window", async () => {
    await showDesktopOcrResultWindow(resultFixture("result-a"), "en");
    const resultA = desktopOcrMocks.windows[0];

    const loadB = deferred();
    desktopOcrMocks.nextLoad = loadB.promise;
    const controller = new AbortController();
    const openingB = showDesktopOcrResultWindow(
      resultFixture("result-b"),
      "en",
      controller.signal
    );
    const resultB = desktopOcrMocks.windows[1];

    expect(resultA.close).toHaveBeenCalledOnce();
    resultA.emitClosed();
    controller.abort(new Error("privacy deletion"));
    closeDesktopOcrWindowsForPrivacyDeletion();

    expect(resultB.destroy).toHaveBeenCalledOnce();
    loadB.resolve();
    await expect(openingB).rejects.toThrow("privacy deletion");
    expect(resultB.show).not.toHaveBeenCalled();
    expect(resultB.focus).not.toHaveBeenCalled();
  });

  it("does not let an old capture window's late closed event detach the current window", async () => {
    await startDesktopOcrCapture("en");
    const captureA = desktopOcrMocks.windows[0];
    closeDesktopOcrCaptureWindow();

    await startDesktopOcrCapture("en");
    const captureB = desktopOcrMocks.windows[1];
    captureA.emitClosed();
    closeDesktopOcrWindowsForPrivacyDeletion();

    expect(captureB.destroy).toHaveBeenCalledOnce();
  });

  it.runIf(process.platform === "win32")(
    "aborts an in-flight OCR process and never creates a result window during privacy deletion",
    async () => {
      desktopOcrMocks.execMode = "pending";
      await startDesktopOcrCapture("en");
      const controller = new AbortController();
      const finishing = finishDesktopOcrSelection(
        { x: 10, y: 10, width: 100, height: 80 },
        "en",
        controller.signal
      );

      await vi.waitFor(() => expect(desktopOcrMocks.execCalls).toHaveLength(1), {
        timeout: 2_000
      });
      controller.abort(new Error("privacy deletion"));
      closeDesktopOcrWindowsForPrivacyDeletion();

      await expect(finishing).rejects.toThrow("privacy deletion");
      expect(desktopOcrMocks.execCalls[0]).toEqual({ abortObserved: true, settled: true });
      expect(
        desktopOcrMocks.windows.filter((window) => window.options.frame !== false)
      ).toHaveLength(0);
    }
  );
});
