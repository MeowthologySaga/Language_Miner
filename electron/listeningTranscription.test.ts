import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createListeningCardMediaClip,
  getDefaultListeningWhisperModel,
  getListeningToolStatus,
  prepareLocalVideoPlaybackFile,
  getWhisperLanguageArgs
} from "./listeningTranscription";
import { LocalDatabase } from "./database";
import { createInitialSrs } from "../src/shared/srs";
import type { StudyCard } from "../src/shared/types";

describe("getDefaultListeningWhisperModel", () => {
  it("keeps the English-only Whisper model for English", () => {
    expect(getDefaultListeningWhisperModel("en")).toBe("tiny.en");
    expect(getDefaultListeningWhisperModel("en-US")).toBe("tiny.en");
  });

  it("uses the multilingual Whisper model for non-English listening profiles", () => {
    expect(getDefaultListeningWhisperModel("ja")).toBe("tiny");
    expect(getDefaultListeningWhisperModel("ko")).toBe("tiny");
  });

  it("passes the active transcript language to Whisper instead of forcing English", () => {
    expect(getWhisperLanguageArgs("ja-JP")).toEqual(["--language", "ja"]);
    expect(getWhisperLanguageArgs("ko")).toEqual(["--language", "ko"]);
    expect(getWhisperLanguageArgs(undefined)).toEqual([]);
  });

  it("keeps browser-playable local videos on the original file", async () => {
    const prepared = await prepareLocalVideoPlaybackFile(
      {
        filePath: "C:/videos/sample.mp4",
        fileName: "sample.mp4",
        title: "sample",
        fileUrl: "file:///C:/videos/sample.mp4"
      },
      "C:/cache"
    );

    expect(prepared).toMatchObject({
      filePath: "C:/videos/sample.mp4",
      fileUrl: "file:///C:/videos/sample.mp4",
      playbackFilePath: "C:/videos/sample.mp4",
      playbackSource: "original"
    });
  });

  it("extracts a listening audio clip and persists it on the saved card", async () => {
    const toolStatus = await getListeningToolStatus();
    if (!toolStatus.ffmpegAvailable) {
      return;
    }

    const testRoot = path.join(process.cwd(), ".tmp-listening-card-media-test");
    fs.rmSync(testRoot, { recursive: true, force: true });
    fs.mkdirSync(testRoot, { recursive: true });

    try {
      const sourcePath = path.join(testRoot, "source.wav");
      writeTestWavFile(sourcePath, 1.5);

      const mediaResult = await createListeningCardMediaClip(
        {
          profileId: "profile-test",
          cardId: "card-test",
          sourcePath,
          sourceType: "local-video",
          start: 0.2,
          end: 0.9,
          includeFrameImage: false
        },
        { workRoot: path.join(testRoot, "clips") }
      );

      expect(mediaResult.ok).toBe(true);
      expect(mediaResult.media?.audioClip?.filePath).toBeTruthy();
      expect(fs.statSync(mediaResult.media!.audioClip!.filePath).size).toBeGreaterThan(0);

      const database = new LocalDatabase(path.join(testRoot, "db"));
      await database.init();
      const card: StudyCard = {
        id: "card-test",
        profileId: "profile-test",
        cardType: "reading",
        deckType: "input-listening",
        direction: "target_to_native",
        sourceSentence: "Test listening sentence.",
        targetText: "video-reader:local-file:test:segment-1:2",
        frontText: "Test listening sentence.",
        literalTranslationKo: "테스트 듣기 문장.",
        naturalTranslationKo: "테스트 듣기 문장.",
        highlightMappings: [],
        vocabularyItems: [],
        listeningMedia: mediaResult.media,
        srs: createInitialSrs(new Date("2026-06-27T00:00:00.000Z")),
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:00.000Z"
      };

      database.saveCard(card, "profile-test");
      const savedCard = database.listCards("profile-test").find((candidate) => candidate.id === card.id);

      expect(savedCard?.listeningMedia?.audioClip?.filePath).toBe(mediaResult.media?.audioClip?.filePath);
      expect(fs.existsSync(savedCard!.listeningMedia!.audioClip!.filePath)).toBe(true);
    } finally {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });
});

function writeTestWavFile(filePath: string, durationSeconds: number) {
  const sampleRate = 16000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * channelCount * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channelCount * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.floor(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0x3fff);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}
