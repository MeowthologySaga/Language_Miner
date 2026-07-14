import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "unused" }
}));

import { synthesizeTts } from "./ttsService";

describe("TTS managed-data cancellation", () => {
  it("rejects before creating cache files when already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("privacy deletion"));

    await expect(
      synthesizeTts(
        {
          text: "Hello",
          languageCode: "en",
          providerName: "system",
          model: "windows-system"
        },
        { signal: controller.signal }
      )
    ).rejects.toThrow("privacy deletion");
  });
});
