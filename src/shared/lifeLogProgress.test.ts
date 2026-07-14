import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_ID, TEMP_JAPANESE_PROFILE_ID } from "./profiles";
import {
  isLifeLogProcessedForProfile,
  markLifeLogMetadataProcessedForProfile
} from "./lifeLogProgress";
import type { LifeLog } from "./types";

function createLifeLog(overrides: Partial<LifeLog> = {}): LifeLog {
  return {
    id: "life-log-1",
    text: "요즘 테스트가 너무 느린 것 같아",
    sourceType: "browser_extension",
    processed: false,
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides
  };
}

describe("lifeLogProgress", () => {
  it("marks a life log as processed only for the selected profile", () => {
    const metadata = markLifeLogMetadataProcessedForProfile(undefined, DEFAULT_PROFILE_ID);
    const log = createLifeLog({ metadata, processed: true });

    expect(isLifeLogProcessedForProfile(log, DEFAULT_PROFILE_ID)).toBe(true);
    expect(isLifeLogProcessedForProfile(log, TEMP_JAPANESE_PROFILE_ID)).toBe(false);
  });

  it("keeps duplicate profile ids out of metadata", () => {
    const metadata = markLifeLogMetadataProcessedForProfile(
      { processedProfileIds: [DEFAULT_PROFILE_ID] },
      DEFAULT_PROFILE_ID
    );

    expect(metadata.processedProfileIds).toEqual([DEFAULT_PROFILE_ID]);
  });

  it("treats legacy global processed logs as completed only in the default profile", () => {
    const legacyLog = createLifeLog({
      metadata: { url: "https://chatgpt.com" },
      processed: true
    });

    expect(isLifeLogProcessedForProfile(legacyLog, DEFAULT_PROFILE_ID)).toBe(true);
    expect(isLifeLogProcessedForProfile(legacyLog, TEMP_JAPANESE_PROFILE_ID)).toBe(false);
  });
});
