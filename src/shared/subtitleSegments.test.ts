import { describe, expect, it } from "vitest";
import { mergeSubtitleSegmentsIntoSentences } from "./subtitleSegments";
import type { ListeningTranscriptSegment } from "./types";

function segment(
  index: number,
  start: number,
  end: number,
  text: string
): ListeningTranscriptSegment {
  return {
    id: `cue-${index}`,
    speaker: "Speaker",
    start,
    end,
    text
  };
}

describe("mergeSubtitleSegmentsIntoSentences", () => {
  it("merges adjacent subtitle cue fragments until a full sentence ends", () => {
    const merged = mergeSubtitleSegmentsIntoSentences(
      [
        segment(1, 3.904, 5.839, "MAN: Kids, I'm gonna tell you"),
        segment(2, 5.873, 6.94, "an incredible story;"),
        segment(3, 6.974, 8.576, "the story of how"),
        segment(4, 8.609, 10.278, "I met your mother."),
        segment(5, 10.311, 11.612, "Are we being punished for something?"),
        segment(6, 11.645, 12.546, "No.")
      ],
      { idPrefix: "sentence" }
    );

    expect(merged.map((item) => item.text)).toEqual([
      "MAN: Kids, I'm gonna tell you an incredible story; the story of how I met your mother.",
      "Are we being punished for something?",
      "No."
    ]);
    expect(merged[0]).toMatchObject({
      id: "sentence-1",
      start: 3.904,
      end: 10.278
    });
  });

  it("splits multiple sentences in one cue before merging the next unfinished sentence", () => {
    const merged = mergeSubtitleSegmentsIntoSentences(
      [
        segment(1, 14, 16, "Yes. 25 years ago,"),
        segment(2, 16, 18, "before I was Dad,"),
        segment(3, 18, 20, "I had this whole other life.")
      ],
      { idPrefix: "sentence" }
    );

    expect(merged.map((item) => item.text)).toEqual([
      "Yes.",
      "25 years ago, before I was Dad, I had this whole other life."
    ]);
    expect(merged[1]).toMatchObject({
      id: "sentence-2",
      end: 20
    });
  });
});
