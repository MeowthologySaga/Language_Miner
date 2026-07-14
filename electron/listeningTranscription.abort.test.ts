import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createListeningCardMediaClip,
  generateLocalFileListeningTranscript,
  prepareLocalVideoPlaybackFile
} from "./listeningTranscription";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function abortedSignal() {
  const controller = new AbortController();
  controller.abort(new Error("privacy deletion"));
  return controller.signal;
}

describe("listening managed-data cancellation", () => {
  it("fails before creating transcript work paths when already aborted", async () => {
    const root = path.join(os.tmpdir(), `lem-listening-abort-${Date.now()}-${Math.random()}`);
    roots.push(root);

    await expect(
      generateLocalFileListeningTranscript(
        { filePath: path.join(root, "source.mkv"), languageCode: "en" },
        { workRoot: root, signal: abortedSignal() }
      )
    ).rejects.toThrow("privacy deletion");
    expect(fs.existsSync(root)).toBe(false);
  });

  it("fails before creating media clip paths when already aborted", async () => {
    const root = path.join(os.tmpdir(), `lem-clip-abort-${Date.now()}-${Math.random()}`);
    roots.push(root);

    await expect(
      createListeningCardMediaClip(
        {
          cardId: "card-1",
          sourceType: "local-video",
          sourcePath: path.join(root, "source.mkv"),
          start: 1,
          end: 2
        },
        { workRoot: root, signal: abortedSignal() }
      )
    ).rejects.toThrow("privacy deletion");
    expect(fs.existsSync(root)).toBe(false);
  });

  it("fails before remuxing local video when already aborted", async () => {
    const root = path.join(os.tmpdir(), `lem-video-abort-${Date.now()}-${Math.random()}`);
    roots.push(root);

    await expect(
      prepareLocalVideoPlaybackFile(
        {
          filePath: path.join(root, "source.mkv"),
          fileName: "source.mkv",
          title: "Source",
          fileUrl: "file:///source.mkv"
        },
        root,
        { signal: abortedSignal() }
      )
    ).rejects.toThrow("privacy deletion");
    expect(fs.existsSync(root)).toBe(false);
  });
});
