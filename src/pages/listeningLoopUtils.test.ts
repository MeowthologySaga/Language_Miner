import { describe, expect, it } from "vitest";
import type {
  ListeningTranscript,
  ListeningVideoCandidate
} from "../shared/types";
import i18n from "../i18n";
import {
  buildDailyRoutineSeed,
  formatDuration,
  formatVideoDuration,
  getBatchSummary,
  getCandidateDuration,
  getCandidateDurationInfo,
  getCandidateTranscriptLabel,
  getDailyRoutineClipCount,
  getEntranceFilterLabel,
  getEntranceStats,
  getListeningSourceKey,
  getTranscriptSeedId,
  getVisibleListeningVideoCandidates,
  hasCandidateVideoDuration,
  isListeningRssCandidateWithinDurationLimit,
  localizeListeningLoopSeedDisplay,
  matchesKnownLearningLanguage,
  matchesLearningLanguage,
  matchesEntranceQueueFilter,
  normalizeDurationSeconds,
  transcriptsToSeeds,
  upsertTranscript
} from "./listeningLoopUtils";

function makeCandidate(
  id: string,
  input: Partial<ListeningVideoCandidate> = {}
): ListeningVideoCandidate {
  return {
    id,
    videoId: `video-${id}`,
    url: `https://www.youtube.com/watch?v=video-${id}`,
    title: `Video ${id}`,
    sourceType: "youtube_extension",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    watchCount: 1,
    ...input
  };
}

function makeTranscript(
  id: string,
  input: Partial<ListeningTranscript> = {}
): ListeningTranscript {
  return {
    id,
    candidateId: `candidate-${id}`,
    videoId: `video-${id}`,
    title: `Transcript ${id}`,
    status: "ready",
    modelName: "whisper",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    segments: [
      {
        id: "s1",
        speaker: "A",
        start: 2,
        end: 8,
        text: "First sentence.",
        translationKo: "첫 문장."
      }
    ],
    ...input
  };
}

function makeTranscriptSegments(count: number, prefix: string, startAt = 0, duration = 5) {
  return Array.from({ length: count }, (_, index) => {
    const start = startAt + index * duration;
    return {
      id: `${prefix}-${index + 1}`,
      speaker: "A",
      start,
      end: start + duration,
      text: `${prefix} natural phrase ${index + 1}?`,
      translationKo: `${prefix} 번역 ${index + 1}.`
    };
  });
}

describe("listeningLoopUtils", () => {
  it("normalizes and formats durations used by candidate cards", () => {
    expect(normalizeDurationSeconds(62.4)).toBe(62);
    expect(normalizeDurationSeconds("1:02")).toBe(62);
    expect(normalizeDurationSeconds("1:02:03")).toBe(3723);
    expect(normalizeDurationSeconds("123")).toBe(123);
    expect(normalizeDurationSeconds("bad")).toBeUndefined();

    expect(formatVideoDuration(62)).toBe("1:02");
    expect(formatVideoDuration(3723)).toBe("1:02:03");
    expect(formatDuration(90500)).toBe("1:30");
  });

  it("derives candidate duration from metadata before falling back to transcript length", () => {
    const candidate = makeCandidate("duration", { metadata: { duration: "12:34" } });
    const transcript = makeTranscript("duration", {
      segments: [{ id: "s1", speaker: "A", start: 0, end: 20, text: "Short." }]
    });

    expect(hasCandidateVideoDuration(candidate)).toBe(true);
    expect(getCandidateDuration(candidate, transcript)).toEqual({ seconds: 754, source: "video" });
    expect(getCandidateDuration(makeCandidate("fallback"), transcript)).toEqual({
      seconds: 20,
      source: "transcript"
    });
  });

  it("labels transcript and duration states for the entrance queue", () => {
    const ready = makeTranscript("ready", {
      segments: [
        { id: "s1", speaker: "A", start: 0, end: 10, text: "One." },
        { id: "s2", speaker: "A", start: 10, end: 20, text: "Two." }
      ]
    });
    const failed = makeTranscript("failed", { status: "failed", segments: [] });

    expect(getCandidateTranscriptLabel(undefined, false)).toBe("Whisper 자막 만들기");
    expect(getCandidateTranscriptLabel(ready, false)).toBe("2문장 루프 열기");
    expect(getCandidateTranscriptLabel(failed, false)).toBe("다시 만들기");
    expect(getCandidateTranscriptLabel(undefined, true)).toBe("Whisper 생성 중");

    expect(getCandidateDurationInfo(makeCandidate("unknown"), undefined)).toMatchObject({
      label: "시간 미확인",
      tone: "unknown"
    });
    expect(getEntranceFilterLabel("short")).toBe("10분 이하");
  });

  it("filters and counts entrance candidates by transcript and duration state", () => {
    const short = makeCandidate("short", { durationSeconds: 300 });
    const long = makeCandidate("long", { durationSeconds: 1200 });
    const readyTranscript = makeTranscript("ready", {
      candidateId: short.id,
      segments: [{ id: "s1", speaker: "A", start: 0, end: 12, text: "Ready." }]
    });
    const transcriptByCandidateId = new Map([[short.id, readyTranscript]]);

    expect(matchesEntranceQueueFilter(short, readyTranscript, "ready")).toBe(true);
    expect(matchesEntranceQueueFilter(long, undefined, "short")).toBe(false);
    expect(matchesEntranceQueueFilter(long, undefined, "needsTranscript")).toBe(true);
    expect(getEntranceStats([short, long, makeCandidate("unknown")], transcriptByCandidateId)).toEqual({
      candidateCount: 3,
      readyCount: 1,
      underTenMinutes: 1,
      unknownDurationCount: 1
    });
  });

  it("converts ready transcripts into loop seeds and preserves transcript upserts", () => {
    const ready = makeTranscript("ready", {
      channelName: "Channel",
      languageCode: "ja",
      segments: [
        {
          id: "long",
          speaker: "A",
          start: 0,
          end: 30,
          text: "First sentence. Second sentence.",
          translationKo: "첫 문장. 둘째 문장."
        }
      ]
    });
    const failed = makeTranscript("failed", { status: "failed", segments: [] });

    expect(transcriptsToSeeds([ready, failed])).toEqual([
      expect.objectContaining({
        id: getTranscriptSeedId(ready),
        channelName: "Channel",
        languageCode: "ja",
        displayCopyKey: "generatedTranscript",
        topicLabel: "",
        recommendedReason: "",
        segments: [
          expect.objectContaining({ text: "First sentence.", start: 0 }),
          expect.objectContaining({ text: "Second sentence.", end: 30 })
        ]
      })
    ]);
    expect(upsertTranscript([failed, ready], { ...ready, title: "Updated" })).toEqual([
      expect.objectContaining({ title: "Updated" }),
      failed
    ]);
  });

  it("localizes generated and persisted daily seed display copy at render time", () => {
    const generated = transcriptsToSeeds([makeTranscript("localized")])[0];
    const englishGenerated = localizeListeningLoopSeedDisplay(
      generated,
      i18n.getFixedT("en"),
      { formatNumber: String }
    );
    const koreanGenerated = localizeListeningLoopSeedDisplay(
      generated,
      i18n.getFixedT("ko"),
      { formatNumber: String }
    );

    expect(englishGenerated).toMatchObject({
      topicLabel: "Automatic transcript",
      recommendedReason: "Sentence segments: 1"
    });
    expect(koreanGenerated).toMatchObject({
      topicLabel: "자동 자막",
      recommendedReason: "1개 문장 구간"
    });

    const persistedLegacyDailySeed = {
      ...generated,
      id: "daily-routine:2026-06-26:en",
      displayCopyKey: undefined,
      title: "오늘 듣기 루틴",
      topicLabel: "영상 클립",
      recommendedReason: "1개 선택 영상 · 1/30개 문장"
    };
    const englishDaily = localizeListeningLoopSeedDisplay(
      persistedLegacyDailySeed,
      i18n.getFixedT("en"),
      {
        dailyTargetSentenceCount: 30,
        dailyUsePartialVideoClips: false,
        formatNumber: String
      }
    );

    expect(englishDaily).toMatchObject({
      title: "Today's listening routine",
      topicLabel: "Video clips",
      recommendedReason: "Selected videos: 1 · Sentences: 1/30"
    });
  });

  it("summarizes batch work and rejects long RSS candidates from auto queue", () => {
    expect(
      getBatchSummary([
        { candidateId: "a", title: "A", status: "done" },
        { candidateId: "b", title: "B", status: "failed" },
        { candidateId: "c", title: "C", status: "running" },
        { candidateId: "d", title: "D", status: "pending" }
      ])
    ).toEqual({ done: 1, failed: 1, pending: 1, running: 1 });

    expect(
      isListeningRssCandidateWithinDurationLimit(
        makeCandidate("rss-short", { sourceType: "youtube_rss", durationSeconds: 600 })
      )
    ).toBe(true);
    expect(
      isListeningRssCandidateWithinDurationLimit(
        makeCandidate("rss-long", { sourceType: "youtube_rss", durationSeconds: 601 })
      )
    ).toBe(false);
  });

  it("matches listening candidates to the active learning language", () => {
    expect(matchesLearningLanguage("en", "ja")).toBe(false);
    expect(matchesLearningLanguage("ja-JP", "ja")).toBe(true);
    expect(matchesLearningLanguage(undefined, "ko")).toBe(true);
    expect(matchesKnownLearningLanguage("en", "ja")).toBe(false);
    expect(matchesKnownLearningLanguage("ja-JP", "ja")).toBe(true);
    expect(matchesKnownLearningLanguage(undefined, "ko")).toBe(false);
  });

  it("builds the visible listening queue from the active learning language only", () => {
    const candidates = [
      makeCandidate("en", { sourceType: "youtube_rss", languageCode: "en" }),
      makeCandidate("ja", { sourceType: "youtube_rss", languageCode: "ja" }),
      makeCandidate("ja-transcript-mismatch", {
        sourceType: "youtube_rss",
        languageCode: "ja"
      }),
      makeCandidate("ko", { sourceType: "youtube_rss", languageCode: "ko" })
    ];
    const transcriptByCandidateId = new Map<string, ListeningTranscript>([
      [
        "ja-transcript-mismatch",
        makeTranscript("ja-transcript-mismatch", {
          candidateId: "ja-transcript-mismatch",
          languageCode: "en"
        })
      ]
    ]);

    expect(
      getVisibleListeningVideoCandidates(candidates, transcriptByCandidateId, "ja").map(
        (candidate) => candidate.id
      )
    ).toEqual(["ja"]);
  });

  it("keeps target-language candidates visible when a legacy failed transcript has another language", () => {
    const candidate = makeCandidate("ja-with-failed-transcript", {
      sourceType: "youtube_rss",
      languageCode: "ja"
    });
    const failedTranscript = makeTranscript("ja-with-failed-transcript", {
      candidateId: candidate.id,
      languageCode: "en",
      status: "failed",
      segments: []
    });

    expect(
      getVisibleListeningVideoCandidates(
        [candidate],
        new Map([[candidate.id, failedTranscript]]),
        "ja"
      ).map((item) => item.id)
    ).toEqual([candidate.id]);
  });

  it("hides learned candidates and same-video duplicates from the visible queue", () => {
    const learnedRss = makeCandidate("learned-rss", {
      sourceType: "youtube_rss",
      languageCode: "ja",
      metadata: { learned: true, learnedAt: "2026-06-26T00:00:00.000Z" }
    });
    const freshRss = makeCandidate("fresh-rss", {
      sourceType: "youtube_rss",
      languageCode: "ja"
    });
    const watchedCandidate = makeCandidate("watched", {
      sourceType: "youtube_extension",
      languageCode: "ja",
      videoId: "same-video",
      metadata: { learned: true }
    });
    const rssDuplicate = makeCandidate("rss-duplicate", {
      sourceType: "youtube_rss",
      languageCode: "ja",
      videoId: "same-video"
    });

    expect(
      getVisibleListeningVideoCandidates(
        [learnedRss, freshRss, watchedCandidate, rssDuplicate],
        new Map(),
        "ja"
      ).map((candidate) => candidate.id)
    ).toEqual([freshRss.id]);
  });

  it("can hide ready transcript loops prepared before today from new routine candidates", () => {
    const oldPrepared = makeCandidate("old-prepared", {
      sourceType: "youtube_rss",
      languageCode: "ja"
    });
    const preparedToday = makeCandidate("prepared-today", {
      sourceType: "youtube_rss",
      languageCode: "ja"
    });
    const transcriptByCandidateId = new Map<string, ListeningTranscript>([
      [
        oldPrepared.id,
        makeTranscript("old-prepared", {
          candidateId: oldPrepared.id,
          videoId: oldPrepared.videoId,
          languageCode: "ja",
          createdAt: "2026-06-26T00:00:00.000Z"
        })
      ],
      [
        preparedToday.id,
        makeTranscript("prepared-today", {
          candidateId: preparedToday.id,
          videoId: preparedToday.videoId,
          languageCode: "ja",
          createdAt: "2026-06-27T00:00:00.000Z"
        })
      ]
    ]);

    const visibleIds = getVisibleListeningVideoCandidates(
      [oldPrepared, preparedToday],
      transcriptByCandidateId,
      "ja",
      { dateKey: "2026-06-27", excludeReadyTranscriptsBeforeDate: true }
    ).map((candidate) => candidate.id);

    expect(visibleIds).not.toContain(oldPrepared.id);
    expect(visibleIds).toContain(preparedToday.id);
  });

  it("builds today's routine from video clips while keeping playback units as sentences", () => {
    const first = makeCandidate("first", { languageCode: "ja" });
    const second = makeCandidate("second", { languageCode: "ja" });
    const firstTranscript = makeTranscript("first", {
      candidateId: first.id,
      videoId: first.videoId,
      title: "First video",
      channelName: "First channel",
      languageCode: "ja",
      segments: makeTranscriptSegments(30, "first")
    });
    const secondTranscript = makeTranscript("second", {
      candidateId: second.id,
      videoId: second.videoId,
      title: "Second video",
      channelName: "Second channel",
      languageCode: "ja",
      segments: makeTranscriptSegments(30, "second")
    });

    const result = buildDailyRoutineSeed({
      candidates: [second, first],
      transcriptByCandidateId: new Map([
        [first.id, firstTranscript],
        [second.id, secondTranscript]
      ]),
      selectedCandidateIds: [first.id, second.id],
      targetLanguageCode: "ja",
      usePartialVideoClips: true,
      dateKey: "2026-06-26"
    });

    expect(result.seed).toMatchObject({
      displayCopyKey: "dailyRoutine",
      title: "",
      topicLabel: "",
      recommendedReason: ""
    });
    expect(getDailyRoutineClipCount(result.seed!)).toBe(5);
    expect(result.seed?.segments).toHaveLength(30);
    expect(new Set(result.seed?.segments.map((segment) => segment.sourceTitle))).toEqual(
      new Set(["First video", "Second video"])
    );
    expect(result.seed?.segments[0]).toMatchObject({
      text: "first natural phrase 1?",
      start: 0,
      end: 5,
      routineClipIndex: 1
    });
    expect(result.seed?.segments[0]).toMatchObject({
      sourceVideoId: first.videoId,
      sourceChannelName: "First channel"
    });
    expect(getListeningSourceKey(result.seed!, result.seed!.segments[0])).toContain(first.videoId);
  });

  it("keeps short selected videos as sentence loops from their available clip", () => {
    const first = makeCandidate("first-short", { languageCode: "ja" });
    const second = makeCandidate("second-long", { languageCode: "ja" });
    const firstTranscript = makeTranscript("first-short", {
      candidateId: first.id,
      videoId: first.videoId,
      title: "Short first",
      languageCode: "ja",
      segments: makeTranscriptSegments(2, "short")
    });
    const secondTranscript = makeTranscript("second-long", {
      candidateId: second.id,
      videoId: second.videoId,
      title: "Long second",
      languageCode: "ja",
      segments: makeTranscriptSegments(30, "long")
    });

    const result = buildDailyRoutineSeed({
      candidates: [first, second],
      transcriptByCandidateId: new Map([
        [first.id, firstTranscript],
        [second.id, secondTranscript]
      ]),
      selectedCandidateIds: [first.id, second.id],
      targetLanguageCode: "ja",
      usePartialVideoClips: true,
      dateKey: "2026-06-26"
    });

    expect(getDailyRoutineClipCount(result.seed!)).toBe(5);
    expect(result.seed?.segments[0]).toMatchObject({
      sourceTitle: "Short first",
      text: "short natural phrase 1?",
      start: 0,
      end: 5
    });
    expect(result.seed?.segments.some((segment) => segment.sourceTitle === "Long second")).toBe(true);
  });

  it("does not chop videos into partial clips unless the setting is enabled", () => {
    const selected = makeCandidate("full-video-mode", { languageCode: "ja" });
    const transcript = makeTranscript("full-video-mode", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Full video mode",
      languageCode: "ja",
      segments: makeTranscriptSegments(30, "full")
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      dateKey: "2026-06-26"
    });

    expect(getDailyRoutineClipCount(result.seed!)).toBe(1);
    expect(result.seed?.displayCopyKey).toBe("dailyRoutine");
    expect(result.seed?.recommendedReason).toBe("");
    expect(result.seed?.segments).toHaveLength(30);
    expect(result.seed?.segments[0]).toMatchObject({
      text: "full natural phrase 1?",
      routineClipStart: 0,
      routineClipEnd: 150
    });
    expect(result.seed?.segments[29]).toMatchObject({
      text: "full natural phrase 30?",
      start: 145,
      end: 150
    });
  });

  it("limits today's routine to the requested sentence target", () => {
    const selected = makeCandidate("target-12", { languageCode: "ja" });
    const transcript = makeTranscript("target-12", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Target sentence count",
      languageCode: "ja",
      segments: makeTranscriptSegments(30, "target")
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      targetSentenceCount: 12,
      dateKey: "2026-06-26"
    });

    expect(result.targetSentenceCount).toBe(12);
    expect(result.preparedSentenceCount).toBe(12);
    expect(
      localizeListeningLoopSeedDisplay(result.seed!, i18n.getFixedT("ko"), {
        dailyTargetSentenceCount: result.targetSentenceCount,
        dailyUsePartialVideoClips: false,
        formatNumber: String
      }).recommendedReason
    ).toBe("1개 선택 영상 · 12/12개 문장");
    expect(result.seed?.segments).toHaveLength(12);
    expect(result.seed?.segments[11].text).toBe("target natural phrase 12?");
    expect(result.reserveSegments[0].text).toBe("target natural phrase 13?");
  });

  it("reports a shortfall when selected videos do not provide enough sentences", () => {
    const selected = makeCandidate("shortfall", { languageCode: "ja" });
    const transcript = makeTranscript("shortfall", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Shortfall video",
      languageCode: "ja",
      segments: makeTranscriptSegments(4, "shortfall")
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      targetSentenceCount: 30,
      dateKey: "2026-06-26"
    });

    expect(result.targetSentenceCount).toBe(30);
    expect(result.preparedSentenceCount).toBe(4);
    expect(
      localizeListeningLoopSeedDisplay(result.seed!, i18n.getFixedT("ko"), {
        dailyTargetSentenceCount: result.targetSentenceCount,
        dailyUsePartialVideoClips: false,
        formatNumber: String
      }).recommendedReason
    ).toBe("1개 선택 영상 · 4/30개 문장");
    expect(result.seed?.segments).toHaveLength(4);
  });

  it("splits manually selected transcript chunks into sentence units for today's routine", () => {
    const selected = makeCandidate("manual-long-segment", { languageCode: "ja" });
    const transcript = makeTranscript("manual-long-segment", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Manual selected video",
      languageCode: "ja",
      segments: [
        {
          id: "long-1",
          speaker: "A",
          start: 12,
          end: 102,
          text: "First sentence. Second sentence. Third sentence.",
          translationKo: "첫 문장. 둘째 문장. 셋째 문장."
        }
      ]
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      dateKey: "2026-06-26"
    });

    expect(result.seed?.segments.map((segment) => segment.text)).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence."
    ]);
    expect(result.seed?.segments.map((segment) => [segment.start, segment.end])).toEqual([
      [12, 41.3],
      [41.3, 72.7],
      [72.7, 102]
    ]);
  });

  it("accepts manually selected target candidates even when the candidate language is unknown", () => {
    const selected = makeCandidate("unknown-language-manual", { languageCode: undefined });
    const transcript = makeTranscript("unknown-language-manual", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Unknown language metadata",
      languageCode: "ja",
      segments: makeTranscriptSegments(2, "unknown", 0, 90)
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      dateKey: "2026-06-26"
    });

    expect(result.seed?.segments).toHaveLength(2);
    expect(result.seed?.segments[0]).toMatchObject({ start: 0, end: 90 });
    expect(result.seed?.segments[1]).toMatchObject({ start: 90, end: 180 });
    expect(result.missingCandidateIds).toEqual([]);
  });

  it("requires transcripts before creating today's routine clips", () => {
    const selected = makeCandidate("empty-transcript-manual", {
      languageCode: "ja",
      durationSeconds: 180
    });
    const transcript = makeTranscript("empty-transcript-manual", {
      candidateId: selected.id,
      videoId: selected.videoId,
      title: "Empty transcript video",
      languageCode: "ja",
      status: "failed",
      segments: []
    });

    const result = buildDailyRoutineSeed({
      candidates: [selected],
      transcriptByCandidateId: new Map([[selected.id, transcript]]),
      selectedCandidateIds: [selected.id],
      targetLanguageCode: "ja",
      dateKey: "2026-06-26"
    });

    expect(result.seed).toBeNull();
    expect(result.missingCandidateIds).toEqual([selected.id]);
  });
});
