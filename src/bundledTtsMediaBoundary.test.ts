import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const retiredGeneratedVoiceFiles = [
  "public/samples/listening/onboarding-office-send.wav",
  "public/samples/listening/onboarding-roommate-minute.wav",
  "public/samples/listening/onboarding-restaurant-order.wav",
  "public/samples/listening/tutorial-room-check.mp4"
];

describe("bundled TTS media release boundary", () => {
  it("keeps maintainer-generated Windows voice output out of the public and packaged tree", () => {
    for (const relativePath of retiredGeneratedVoiceFiles) {
      expect(existsSync(join(process.cwd(), relativePath)), relativePath).toBe(false);
    }
  });

  it("uses runtime device TTS instead of retired audio and video URLs", () => {
    const runtimeSources = [
      "src/shared/defaultSampleCards.ts",
      "src/components/CardPreview.tsx",
      "src/pages/TutorialPage.tsx"
    ].map((relativePath) => readFileSync(join(process.cwd(), relativePath), "utf8"));

    for (const relativePath of retiredGeneratedVoiceFiles) {
      const publicUrl = `/${relativePath.replace(/^public\//, "")}`;
      expect(runtimeSources.every((source) => !source.includes(publicUrl)), publicUrl).toBe(true);
    }

    expect(runtimeSources.join("\n")).toContain("playStandaloneTts");
    expect(runtimeSources.join("\n")).toContain("onPlayTts");
  });
});
