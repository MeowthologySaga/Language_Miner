import { describe, expect, it } from "vitest";
import {
  isDuplicateListeningVideoCapture,
  prepareListeningVideoCandidate
} from "./listeningVideoBridge";
import type { ListeningVideoCandidateInput } from "../src/shared/types";

describe("listening video bridge", () => {
  it("normalizes YouTube candidates and fills safe defaults", () => {
    const candidate = prepareListeningVideoCandidate(
      {
        videoId: "",
        url: "https://www.youtube.com/watch?v=abc123def45",
        title: "  Sample   Video  ",
        sourceType: "youtube_page",
        durationSeconds: "42",
        metadata: {
          topicLabel: "  topic  "
        }
      } as ListeningVideoCandidateInput,
      "youtube_extension"
    );

    expect(candidate).toMatchObject({
      videoId: "abc123def45",
      url: "https://www.youtube.com/watch?v=abc123def45",
      title: "Sample Video",
      sourceType: "youtube_extension",
      durationSeconds: 42,
      thumbnailUrl: "https://i.ytimg.com/vi/abc123def45/hqdefault.jpg",
      metadata: {
        topicLabel: "  topic  "
      }
    });
    expect(candidate?.collectedAt).toBeTruthy();
  });

  it("rejects candidates without a video id or title", () => {
    expect(
      prepareListeningVideoCandidate({
        videoId: "",
        url: "https://example.com/not-youtube",
        title: "Sample",
        sourceType: "youtube_page"
      })
    ).toBeNull();
    expect(
      prepareListeningVideoCandidate({
        videoId: "abc123def45",
        url: "",
        title: "",
        sourceType: "youtube_page"
      })
    ).toBeNull();
  });

  it("detects recent duplicate captures and expires old ones", () => {
    const recent = new Map<string, number>();
    const input: ListeningVideoCandidateInput = {
      videoId: "abc123def45",
      url: "https://www.youtube.com/watch?v=abc123def45",
      title: "Sample",
      sourceType: "youtube_extension"
    };

    expect(isDuplicateListeningVideoCapture(recent, input, 1000, 10_000)).toBe(false);
    expect(isDuplicateListeningVideoCapture(recent, input, 1000, 10_500)).toBe(true);
    expect(isDuplicateListeningVideoCapture(recent, input, 1000, 12_000)).toBe(false);
  });
});
