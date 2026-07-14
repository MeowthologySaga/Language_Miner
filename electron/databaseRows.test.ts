import { describe, expect, it } from "vitest";
import {
  cardFromRow,
  getTranslationCacheKey,
  lifeLogFromRow,
  listeningTranscriptFromRow,
  listeningVideoCandidateFromRow,
  mergeListeningCandidateMetadata,
  normalizeOptionalNumber,
  normalizeOptionalText,
  parseLifeLogMetadata,
  type CardRow,
  type LifeLogRow,
  type ListeningTranscriptRow,
  type ListeningVideoCandidateRow
} from "./databaseRows";
import type { StudyCard } from "../src/shared/types";

describe("database row mappers", () => {
  it("maps card rows while taking persisted SRS fields from columns", () => {
    const storedCard: StudyCard = {
      id: "card-1",
      cardType: "reading",
      deckType: "input",
      direction: "en_to_ko",
      sourceSentence: "hello",
      frontText: "hello",
      highlightMappings: [],
      vocabularyItems: [],
      srs: {
        dueAt: "old",
        intervalDays: 0,
        easeFactor: 2.5,
        reviewCount: 0,
        lapseCount: 0
      }
    };
    const row: CardRow = {
      id: "card-1",
      profile_id: null,
      card_type: "reading",
      source_sentence: "hello",
      target_text: null,
      front_text: "hello",
      literal_translation_ko: null,
      natural_translation_ko: null,
      structure_note: null,
      card_json: JSON.stringify(storedCard),
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      due_at: "2026-01-03T00:00:00.000Z",
      interval_days: 3,
      ease_factor: 2.7,
      review_count: 4,
      lapse_count: 1,
      last_reviewed_at: "2026-01-02T12:00:00.000Z"
    };

    expect(cardFromRow(row)).toMatchObject({
      id: "card-1",
      profileId: "profile-english",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      srs: {
        dueAt: "2026-01-03T00:00:00.000Z",
        intervalDays: 3,
        easeFactor: 2.7,
        reviewCount: 4,
        lapseCount: 1,
        lastReviewedAt: "2026-01-02T12:00:00.000Z"
      }
    });
  });

  it("parses life log metadata through the same allow-list rules", () => {
    const metadata = parseLifeLogMetadata(
      JSON.stringify({
        title: "Chat",
        captured: true,
        skippedNumber: 2,
        skippedObject: { nested: true },
        processedProfileIds: ["profile-english", "", 7],
        messages: [{ role: "user", raw_content: "hello" }]
      })
    );

    expect(metadata).toMatchObject({
      title: "Chat",
      captured: true,
      processedProfileIds: ["profile-english"],
      messages: [{ role: "user", raw_content: "hello" }]
    });
    expect(metadata?.skippedNumber).toBeUndefined();
    expect(metadata?.skippedObject).toBeUndefined();
    expect(parseLifeLogMetadata("{")).toBeUndefined();
  });

  it("maps life log rows with optional fields normalized", () => {
    const row: LifeLogRow = {
      id: "life-1",
      text: "hello",
      before_context: null,
      after_context: "after",
      app_name: null,
      metadata_json: JSON.stringify({ url: "https://example.com" }),
      source_type: "browser_extension",
      processed: 1,
      created_at: "2026-01-01T00:00:00.000Z"
    };

    expect(lifeLogFromRow(row)).toEqual({
      id: "life-1",
      text: "hello",
      beforeContext: undefined,
      afterContext: "after",
      appName: undefined,
      metadata: { url: "https://example.com" },
      sourceType: "browser_extension",
      processed: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
  });

  it("maps listening rows and drops non-primitive candidate metadata", () => {
    const candidateRow: ListeningVideoCandidateRow = {
      id: "candidate-1",
      source_type: "youtube_extension",
      video_id: "abc123def45",
      url: "https://www.youtube.com/watch?v=abc123def45",
      title: "Sample",
      language_code: "en",
      channel_name: null,
      channel_url: "https://youtube.com/@sample",
      thumbnail_url: null,
      duration_seconds: 120,
      watched_seconds: null,
      progress_ratio: 0.5,
      last_position_seconds: null,
      metadata_json: JSON.stringify({
        primitive: "yes",
        enabled: false,
        nested: { ignored: true }
      }),
      first_seen_at: "2026-01-01T00:00:00.000Z",
      last_seen_at: "2026-01-02T00:00:00.000Z",
      watch_count: 2
    };
    const transcriptRow: ListeningTranscriptRow = {
      id: "transcript-1",
      candidate_id: "candidate-1",
      video_id: "abc123def45",
      title: "Sample",
      channel_name: null,
      language_code: "en",
      status: "ready",
      segments_json: JSON.stringify([{ id: "s1", speaker: "A", start: 1, end: 2, text: "hi" }]),
      error_message: null,
      audio_path: null,
      model_name: "whisper",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    };

    expect(listeningVideoCandidateFromRow(candidateRow)).toMatchObject({
      channelName: undefined,
      metadata: {
        primitive: "yes",
        enabled: false
      }
    });
    expect(listeningTranscriptFromRow(transcriptRow)).toMatchObject({
      status: "ready",
      segments: [{ id: "s1", speaker: "A", start: 1, end: 2, text: "hi" }]
    });
  });

  it("normalizes cache keys and listening candidate inputs", () => {
    expect(
      getTranslationCacheKey({
        profileId: "",
        providerName: "gemini",
        sourceLang: "",
        targetLang: "",
        model: "",
        promptVersion: "",
        contextHash: "",
        text: " hello \n world "
      })
    ).toBe(
      getTranslationCacheKey({
        providerName: "gemini",
        targetLang: "ko",
        text: "hello world"
      })
    );
    expect(normalizeOptionalText("  title  ")).toBe("title");
    expect(normalizeOptionalText("   ")).toBeUndefined();
    expect(normalizeOptionalNumber(-5)).toBe(0);
    expect(normalizeOptionalNumber(Number.NaN)).toBeUndefined();
    expect(
      mergeListeningCandidateMetadata(
        { old: "value", removed: "previous" },
        { removed: undefined, next: 2, ignored: undefined }
      )
    ).toEqual({
      old: "value",
      next: 2
    });
  });
});
