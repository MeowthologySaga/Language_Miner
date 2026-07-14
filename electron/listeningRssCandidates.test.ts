import { describe, expect, it } from "vitest";
import {
  fetchListeningRssCandidates,
  enrichListeningRssCandidateDurations,
  isListeningRssCandidateWithinDurationLimit,
  parseYouTubeRssEntries
} from "./listeningRssCandidates";
import { getListeningRssSourcesForLanguage } from "../src/shared/listeningRssSources";
import type { ListeningVideoCandidateInput } from "../src/shared/types";
import type { YouTubeVideoMetadata } from "./listeningTranscription";

function createCandidate(
  overrides: Partial<ListeningVideoCandidateInput> = {}
): ListeningVideoCandidateInput {
  return {
    videoId: "video12345",
    url: "https://www.youtube.com/watch?v=video12345",
    title: "Test video",
    sourceType: "youtube_rss",
    collectedAt: "2026-06-25T00:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

describe("listeningRssCandidates", () => {
  it("parses YouTube Atom RSS entries and decodes XML text", () => {
    const entries = parseYouTubeRssEntries(
      `
      <feed>
        <entry>
          <yt:videoId>abcDEF_1234</yt:videoId>
          <title><![CDATA[English &amp; Korean phrases]]></title>
          <author><name>Channel &quot;A&quot;</name></author>
          <link rel="alternate" href="https://www.youtube.com/watch?v=abcDEF_1234"/>
          <published>2026-06-24T10:00:00+00:00</published>
        </entry>
        <entry>
          <title>Missing ID</title>
        </entry>
      </feed>`,
      "Fallback Channel"
    );

    expect(entries).toEqual([
      {
        videoId: "abcDEF_1234",
        title: "English & Korean phrases",
        url: "https://www.youtube.com/watch?v=abcDEF_1234",
        channelName: 'Channel "A"',
        publishedAt: "2026-06-24T10:00:00+00:00"
      }
    ]);
  });

  it("filters long RSS candidates but keeps non-RSS candidates", () => {
    expect(
      isListeningRssCandidateWithinDurationLimit(createCandidate({ durationSeconds: 600 }))
    ).toBe(true);
    expect(
      isListeningRssCandidateWithinDurationLimit(createCandidate({ durationSeconds: 601 }))
    ).toBe(false);
    expect(
      isListeningRssCandidateWithinDurationLimit(
        createCandidate({ sourceType: "browser_history", durationSeconds: 9999 })
      )
    ).toBe(true);
  });

  it("enriches RSS candidates with fetched YouTube metadata", async () => {
    const metadata: YouTubeVideoMetadata = {
      videoId: "video12345",
      title: "Metadata title",
      webpageUrl: "https://www.youtube.com/watch?v=video12345",
      channelName: "Metadata channel",
      thumbnailUrl: "https://img.youtube.com/vi/video12345/hqdefault.jpg",
      durationSeconds: 321,
      durationSource: "youtube-page"
    };

    const [enriched] = await enrichListeningRssCandidateDurations(
      [createCandidate()],
      async () => new Map([[metadata.videoId, metadata]])
    );

    expect(enriched).toMatchObject({
      channelName: "Metadata channel",
      thumbnailUrl: "https://img.youtube.com/vi/video12345/hqdefault.jpg",
      durationSeconds: 321,
      metadata: {
        durationSeconds: 321,
        durationSource: "youtube-page",
        metadataTitle: "Metadata title",
        metadataUrl: "https://www.youtube.com/watch?v=video12345"
      }
    });
  });

  it("fetches only RSS sources matching the requested learning language", async () => {
    const requestedUrls: string[] = [];
    const result = await fetchListeningRssCandidates(
      async (url) => {
        requestedUrls.push(url);
        const videoId = `video-${requestedUrls.length}`;
        return {
          ok: true,
          text: async () => `
            <feed>
              <entry>
                <yt:videoId>${videoId}</yt:videoId>
                <title>日本語ニュース ${requestedUrls.length}</title>
                <author><name>Japanese Channel</name></author>
                <link rel="alternate" href="https://www.youtube.com/watch?v=${videoId}"/>
              </entry>
            </feed>`
        };
      },
      "ja",
      async () => new Map()
    );

    expect(requestedUrls).toHaveLength(getListeningRssSourcesForLanguage("ja").length);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((candidate) => candidate.languageCode === "ja")).toBe(true);
    expect(requestedUrls.some((url) => url.includes("UCsooa4yRKGN_zEE8iknghZA"))).toBe(false);
  });
});
