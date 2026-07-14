import { fetchYouTubeVideoMetadataBatch } from "./listeningTranscription";
import {
  getListeningRssSourcesForLanguage,
  getYouTubeRssFeedUrl,
} from "../src/shared/listeningRssSources";
import type { ListeningVideoCandidateInput } from "../src/shared/types";
import { normalizeBridgeNumber } from "./bridgeInputUtils";
import type { YouTubeVideoMetadata } from "./listeningTranscription";

export type YouTubeRssEntry = {
  videoId: string;
  title: string;
  url: string;
  channelName: string;
  publishedAt?: string;
};

export const LISTENING_RSS_MAX_DURATION_SECONDS = 10 * 60;

type RssFetchResponse = {
  ok: boolean;
  text(): Promise<string>;
};

type RssFetch = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<RssFetchResponse>;

export async function fetchListeningRssCandidates(
  fetchImpl: RssFetch = fetch,
  languageCode?: string,
  fetchMetadataBatch: (
    urls: string[],
    signal?: AbortSignal
  ) => Promise<Map<string, YouTubeVideoMetadata>> = (urls, signal) =>
    fetchYouTubeVideoMetadataBatch(urls, 20_000, signal),
  signal?: AbortSignal
): Promise<ListeningVideoCandidateInput[]> {
  throwIfRssFetchAborted(signal);
  const fetchedAt = new Date().toISOString();
  const sources = getListeningRssSourcesForLanguage(languageCode);
  const results = await Promise.all(
    sources.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7_000);
      const abortFromParent = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abortFromParent, { once: true });
      try {
        const response = await fetchImpl(getYouTubeRssFeedUrl(source.channelId), {
          signal: controller.signal,
          headers: {
            Accept: "application/atom+xml, application/xml, text/xml"
          }
        });
        if (!response.ok) {
          return [];
        }
        const xml = await response.text();
        return parseYouTubeRssEntries(xml, source.channelName)
          .slice(0, 4)
          .map((entry): ListeningVideoCandidateInput => ({
            videoId: entry.videoId,
            url: entry.url,
            title: entry.title,
            sourceType: "youtube_rss",
            languageCode: source.languageCode,
            channelName: entry.channelName || source.channelName,
            thumbnailUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
            collectedAt: fetchedAt,
            metadata: {
              rssSourceId: source.id,
              rssSourceLabel: source.label,
              topicLabel: source.topicLabel,
              languageCode: source.languageCode,
              publishedAt: entry.publishedAt
            }
          }));
      } catch {
        throwIfRssFetchAborted(signal);
        return [];
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromParent);
      }
    })
  );

  const unique = new Map<string, ListeningVideoCandidateInput>();
  for (const candidate of results.flat()) {
    if (!unique.has(candidate.videoId)) {
      unique.set(candidate.videoId, candidate);
    }
  }
  const enrichedCandidates = await enrichListeningRssCandidateDurations(
    Array.from(unique.values()).slice(0, 30),
    fetchMetadataBatch,
    signal
  );
  return enrichedCandidates.filter(isListeningRssCandidateWithinDurationLimit);
}

export async function enrichListeningRssCandidateDurations(
  candidates: ListeningVideoCandidateInput[],
  fetchMetadataBatch: (
    urls: string[],
    signal?: AbortSignal
  ) => Promise<Map<string, YouTubeVideoMetadata>> = (urls, signal) =>
    fetchYouTubeVideoMetadataBatch(urls, 20_000, signal),
  signal?: AbortSignal
): Promise<ListeningVideoCandidateInput[]> {
  throwIfRssFetchAborted(signal);
  const metadataByVideoId = await fetchMetadataBatch(
    candidates
      .filter((candidate) => !candidate.durationSeconds)
      .map((candidate) => candidate.url),
    signal
  );
  throwIfRssFetchAborted(signal);
  if (metadataByVideoId.size === 0) {
    return candidates;
  }

  const durationFetchedAt = new Date().toISOString();
  return candidates.map((candidate) => {
    const metadata = metadataByVideoId.get(candidate.videoId);
    if (!metadata) {
      return candidate;
    }

    return {
      ...candidate,
      channelName: candidate.channelName || metadata.channelName,
      thumbnailUrl: candidate.thumbnailUrl || metadata.thumbnailUrl,
      durationSeconds: candidate.durationSeconds ?? metadata.durationSeconds,
      metadata: {
        ...candidate.metadata,
        durationSeconds: metadata.durationSeconds,
        durationSource: metadata.durationSeconds ? metadata.durationSource ?? "youtube-page" : undefined,
        durationFetchedAt,
        metadataTitle: metadata.title,
        metadataUrl: metadata.webpageUrl
      }
    };
  });
}

function throwIfRssFetchAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Listening RSS refresh was canceled.");
  error.name = "AbortError";
  throw error;
}

export function isListeningRssCandidateWithinDurationLimit(
  candidate: ListeningVideoCandidateInput
) {
  if (candidate.sourceType !== "youtube_rss") {
    return true;
  }
  const durationSeconds = normalizeBridgeNumber(
    candidate.durationSeconds ?? candidate.metadata?.durationSeconds ?? candidate.metadata?.duration
  );
  return durationSeconds === undefined || durationSeconds <= LISTENING_RSS_MAX_DURATION_SECONDS;
}

export function parseYouTubeRssEntries(
  xml: string,
  fallbackChannelName: string
): YouTubeRssEntry[] {
  const entries: YouTubeRssEntry[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entryXml = match[1] ?? "";
    const videoId = extractXmlText(entryXml, "yt:videoId");
    const title = extractXmlText(entryXml, "title");
    if (!videoId || !title) {
      continue;
    }
    entries.push({
      videoId,
      title,
      url: extractXmlAttribute(entryXml, "link", "href") || `https://www.youtube.com/watch?v=${videoId}`,
      channelName: extractXmlText(entryXml, "name") || fallbackChannelName,
      publishedAt: extractXmlText(entryXml, "published") || undefined
    });
  }
  return entries;
}

function extractXmlText(xml: string, tagName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escapedTagName}[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`));
  return match?.[1] ? decodeXmlText(match[1].trim()) : "";
}

function extractXmlAttribute(xml: string, tagName: string, attributeName: string) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escapedTagName}[^>]*\\s${escapedAttributeName}="([^"]*)"`, "i")
  );
  return match?.[1] ? decodeXmlText(match[1]) : "";
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
