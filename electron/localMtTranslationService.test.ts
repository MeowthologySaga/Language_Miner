import { describe, expect, it } from "vitest";
import path from "node:path";
import { getLocalMtReadyMarkerPath, isLocalMtModelReady } from "./localMtTranslationService";

describe("Local MT readiness marker", () => {
  it("uses a model-specific marker and treats an unprepared model as unavailable", () => {
    const cacheDir = path.join(process.cwd(), ".test-local-mt-cache-that-does-not-exist");
    expect(getLocalMtReadyMarkerPath("model-a", cacheDir)).not.toBe(
      getLocalMtReadyMarkerPath("model-b", cacheDir)
    );
    expect(isLocalMtModelReady("model-a", cacheDir)).toBe(false);
  });
});
