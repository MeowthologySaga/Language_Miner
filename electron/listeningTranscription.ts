import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ListeningCardMediaClipInput,
  ListeningCardMediaClipResult,
  ListeningLocalVideoFile,
  ListeningToolStatus,
  ListeningLocalTranscriptInput,
  ListeningTranscript,
  ListeningTranscriptSegment,
  ListeningVideoCandidate
} from "../src/shared/types";
import {
  EMBEDDED_SUBTITLE_SENTENCE_MODEL,
  mergeSubtitleSegmentsIntoSentences
} from "../src/shared/subtitleSegments";

const DEFAULT_ENGLISH_WHISPER_MODEL = "tiny.en";
const DEFAULT_MULTILINGUAL_WHISPER_MODEL = "tiny";
const COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const DIRECT_PLAYBACK_EXTENSIONS = new Set([".mp4", ".m4v", ".webm"]);

type GenerateListeningTranscriptOptions = {
  workRoot: string;
  modelName?: string;
  signal?: AbortSignal;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

type SubtitleStreamInfo = {
  index: number;
  mapSpec: string;
  codecName: string;
  language?: string;
  title?: string;
};

export type YouTubeVideoMetadata = {
  videoId: string;
  title?: string;
  channelName?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  durationSource?: "youtube-page" | "yt-dlp";
  webpageUrl?: string;
};

export async function createListeningCardMediaClip(
  input: ListeningCardMediaClipInput,
  options: { workRoot: string; signal?: AbortSignal }
): Promise<ListeningCardMediaClipResult> {
  throwIfListeningOperationAborted(options.signal);
  const toolStatus = await getListeningToolStatus(options.signal);
  if (!toolStatus.ffmpegAvailable) {
    return {
      ok: false,
      toolStatus,
      message: "리스닝 카드 원본 오디오를 만들려면 ffmpeg가 필요합니다."
    };
  }

  const sourcePath = input.sourcePath?.trim() ?? "";
  const sourceStat = sourcePath ? await fs.stat(sourcePath).catch(() => null) : null;
  if (!sourceStat?.isFile()) {
    return {
      ok: false,
      toolStatus,
      message: "원본 오디오를 만들 소스 파일을 찾지 못했습니다."
    };
  }

  const start = Math.max(0, Number.isFinite(input.start) ? input.start - 0.25 : 0);
  const rawEnd = Number.isFinite(input.end) ? input.end : input.start + 1;
  const end = Math.max(start + 0.5, rawEnd + 0.25);
  const duration = Math.max(0.5, end - start);
  const now = new Date().toISOString();
  const outputDir = path.join(
    options.workRoot,
    sanitizeFileName(input.profileId || "default"),
    sanitizeFileName(input.cardId)
  );
  throwIfListeningOperationAborted(options.signal);
  await fs.mkdir(outputDir, { recursive: true });

  const audioPath = path.join(outputDir, "audio.m4a");
  await extractListeningAudioClip(
    toolStatus.ffmpegCommand,
    sourcePath,
    audioPath,
    start,
    duration,
    options.signal
  );

  const media: NonNullable<ListeningCardMediaClipResult["media"]> = {
    audioClip: {
      filePath: audioPath,
      fileUrl: pathToFileURL(audioPath).toString(),
      mimeType: "audio/mp4",
      start,
      end,
      sourceType: input.sourceType,
      createdAt: now
    }
  };

  if (input.includeFrameImage) {
    const frameSourcePath = input.frameSourcePath?.trim() ?? "";
    const frameSourceStat = frameSourcePath ? await fs.stat(frameSourcePath).catch(() => null) : null;
    if (frameSourceStat?.isFile()) {
      const framePath = path.join(outputDir, "frame.jpg");
      try {
        await runCommand(
          toolStatus.ffmpegCommand,
          [
            "-hide_banner",
            "-y",
            "-ss",
            Math.max(0, input.start).toFixed(3),
            "-i",
            frameSourcePath,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "5",
            framePath
          ],
          {
            extraPathDirs: getExtraPathDirs(toolStatus.ffmpegCommand),
            signal: options.signal
          }
        );
        media.frameImage = {
          filePath: framePath,
          fileUrl: pathToFileURL(framePath).toString(),
          mimeType: "image/jpeg",
          capturedAt: Math.max(0, input.start),
          createdAt: now
        };
      } catch {
        throwIfListeningOperationAborted(options.signal);
        // Frame capture is optional. Keep the audio clip if it was created successfully.
      }
    }
  }

  return {
    ok: true,
    media,
    toolStatus,
    message: media.frameImage
      ? "리스닝 카드 원본 오디오와 장면 이미지를 만들었습니다."
      : "리스닝 카드 원본 오디오를 만들었습니다."
  };
}

async function extractListeningAudioClip(
  ffmpegCommand: string,
  sourcePath: string,
  audioPath: string,
  start: number,
  duration: number,
  signal?: AbortSignal
) {
  const extraPathDirs = getExtraPathDirs(ffmpegCommand);
  const outputArgs = [
    "-vn",
    "-sn",
    "-dn",
    "-ac",
    "1",
    "-ar",
    "24000",
    "-b:a",
    "48k",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    audioPath
  ];
  const startArg = start.toFixed(3);
  const durationArg = duration.toFixed(3);
  const attempts = [
    [
      "-hide_banner",
      "-y",
      "-ss",
      startArg,
      "-t",
      durationArg,
      "-i",
      sourcePath,
      "-map",
      "0:a:0?",
      ...outputArgs
    ],
    [
      "-hide_banner",
      "-y",
      "-i",
      sourcePath,
      "-ss",
      startArg,
      "-t",
      durationArg,
      ...outputArgs
    ],
    [
      "-hide_banner",
      "-y",
      "-ss",
      startArg,
      "-t",
      durationArg,
      "-i",
      sourcePath,
      ...outputArgs
    ]
  ];

  let lastMessage = "";
  for (const args of attempts) {
    throwIfListeningOperationAborted(signal);
    await fs.rm(audioPath, { force: true }).catch(() => undefined);
    try {
      await runCommand(ffmpegCommand, args, { extraPathDirs, signal });
      const outputStat = await fs.stat(audioPath).catch(() => null);
      if (outputStat?.isFile() && outputStat.size > 0) {
        return;
      }
      lastMessage = "ffmpeg가 빈 오디오 파일을 만들었습니다.";
    } catch (caught) {
      throwIfListeningOperationAborted(signal);
      lastMessage = caught instanceof Error ? caught.message : String(caught);
    }
  }

  throw new Error(`원본 오디오 추출 실패: ${summarizeCommandError(lastMessage)}`);
}

export async function getListeningToolStatus(signal?: AbortSignal): Promise<ListeningToolStatus> {
  throwIfListeningOperationAborted(signal);
  const [ytDlpCommand, ffmpegCommand, whisperCommand] = await Promise.all([
    findCommandPath("yt-dlp", signal),
    findCommandPath("ffmpeg", signal),
    findCommandPath("whisper", signal)
  ]);
  const ytDlpAvailable = Boolean(ytDlpCommand);
  const ffmpegAvailable = Boolean(ffmpegCommand);
  const whisperAvailable = Boolean(whisperCommand);
  const missing = [
    ytDlpAvailable ? "" : "yt-dlp",
    ffmpegAvailable ? "" : "ffmpeg",
    whisperAvailable ? "" : "whisper"
  ].filter(Boolean);

  return {
    ytDlpAvailable,
    ffmpegAvailable,
    whisperAvailable,
    ytDlpCommand: ytDlpCommand || "yt-dlp",
    ffmpegCommand: ffmpegCommand || "ffmpeg",
    whisperCommand: whisperCommand || "whisper",
    message:
      missing.length === 0
        ? "Whisper 자막 생성 준비 완료"
        : `필요 도구가 없습니다: ${missing.join(", ")}`
  };
}

export async function prepareLocalVideoPlaybackFile(
  input: Pick<ListeningLocalVideoFile, "filePath" | "fileName" | "title" | "fileUrl">,
  workRoot: string,
  options: { signal?: AbortSignal } = {}
): Promise<ListeningLocalVideoFile> {
  throwIfListeningOperationAborted(options.signal);
  const filePath = input.filePath.trim();
  const extension = path.extname(filePath).toLowerCase();
  if (!filePath || DIRECT_PLAYBACK_EXTENSIONS.has(extension)) {
    return {
      ...input,
      originalFileUrl: input.fileUrl,
      playbackFilePath: filePath,
      playbackSource: "original"
    };
  }

  const toolStatus = await getListeningToolStatus(options.signal);
  if (!toolStatus.ffmpegAvailable) {
    return {
      ...input,
      originalFileUrl: input.fileUrl,
      playbackFilePath: filePath,
      playbackSource: "original",
      playbackMessage:
        "이 형식은 앱 내 플레이어가 직접 재생하지 못할 수 있습니다. ffmpeg를 설치하면 재생용 MP4를 자동으로 준비합니다."
    };
  }

  const remuxDir = path.join(workRoot, "video-reader-playback");
  throwIfListeningOperationAborted(options.signal);
  await fs.mkdir(remuxDir, { recursive: true });
  const outputPath = path.join(remuxDir, `${sanitizeFileName(filePath)}.mp4`);
  const sourceStat = await fs.stat(filePath);
  const outputStat = await fs.stat(outputPath).catch(() => null);
  if (!outputStat || outputStat.mtimeMs < sourceStat.mtimeMs || outputStat.size === 0) {
    await remuxLocalVideoForPlayback(
      toolStatus.ffmpegCommand,
      filePath,
      outputPath,
      options.signal
    );
  }

  return {
    ...input,
    fileUrl: pathToFileURL(outputPath).toString(),
    originalFileUrl: input.fileUrl,
    playbackFilePath: outputPath,
    playbackSource: "remuxed",
    playbackMessage: "MKV/AVI/MOV 파일을 앱 재생용 MP4 컨테이너로 준비했습니다. 전사는 원본 파일 기준으로 진행됩니다."
  };
}

async function remuxLocalVideoForPlayback(
  ffmpegCommand: string,
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal
) {
  const extraPathDirs = getExtraPathDirs(ffmpegCommand);
  const baseArgs = [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-movflags",
    "+faststart"
  ];
  try {
    await runCommand(
      ffmpegCommand,
      [...baseArgs, "-c", "copy", outputPath],
      { extraPathDirs, signal }
    );
    return;
  } catch {
    throwIfListeningOperationAborted(signal);
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
  }

  await runCommand(
    ffmpegCommand,
    [...baseArgs, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", outputPath],
    { extraPathDirs, signal }
  );
}

export async function fetchYouTubeVideoMetadataBatch(
  urls: string[],
  timeoutMs = 20_000,
  signal?: AbortSignal
): Promise<Map<string, YouTubeVideoMetadata>> {
  throwIfListeningOperationAborted(signal);
  const uniqueUrls = [...new Set(urls.map((url) => url.trim()).filter(Boolean))].slice(0, 30);
  const metadataById = new Map<string, YouTubeVideoMetadata>();
  if (uniqueUrls.length === 0) {
    return metadataById;
  }

  const pageMetadataById = await fetchYouTubePageMetadataBatch(
    uniqueUrls,
    Math.min(timeoutMs, 12_000),
    signal
  );
  for (const metadata of pageMetadataById.values()) {
    mergeYouTubeMetadata(metadataById, metadata);
  }

  const missingDurationUrls = uniqueUrls.filter((url) => {
    const videoId = getYouTubeVideoIdFromUrl(url);
    return !videoId || !metadataById.get(videoId)?.durationSeconds;
  });
  if (missingDurationUrls.length === 0) {
    return metadataById;
  }

  const embedMetadataById = await fetchYouTubeEmbedMetadataBatch(
    missingDurationUrls,
    Math.min(timeoutMs, 12_000),
    signal
  );
  for (const metadata of embedMetadataById.values()) {
    mergeYouTubeMetadata(metadataById, metadata);
  }

  const ytDlpDurationUrls = uniqueUrls.filter((url) => {
    const videoId = getYouTubeVideoIdFromUrl(url);
    return !videoId || !metadataById.get(videoId)?.durationSeconds;
  });
  if (ytDlpDurationUrls.length === 0) {
    return metadataById;
  }

  const ytDlpCommand = await findCommandPath("yt-dlp", signal);
  if (!ytDlpCommand) {
    return metadataById;
  }

  try {
    const result = await runCommand(
      ytDlpCommand,
      [
        "--ignore-errors",
        "--no-playlist",
        "--skip-download",
        "--dump-json",
        "--no-warnings",
        "--socket-timeout",
        "8",
        ...ytDlpDurationUrls
      ],
      { timeoutMs, signal }
    );
    for (const line of result.stdout.split(/\r?\n/)) {
      const metadata = parseYtDlpMetadataLine(line);
      if (metadata?.videoId) {
        mergeYouTubeMetadata(metadataById, metadata);
      }
    }
  } catch {
    throwIfListeningOperationAborted(signal);
    return metadataById;
  }

  return metadataById;
}

export async function generateListeningTranscript(
  candidate: ListeningVideoCandidate,
  options: GenerateListeningTranscriptOptions
): Promise<ListeningTranscript> {
  throwIfListeningOperationAborted(options.signal);
  const modelName = options.modelName?.trim() || getDefaultListeningWhisperModel(candidate.languageCode);
  const now = new Date().toISOString();
  const toolStatus = await getListeningToolStatus(options.signal);
  if (!toolStatus.ytDlpAvailable || !toolStatus.ffmpegAvailable || !toolStatus.whisperAvailable) {
    throw new Error(toolStatus.message);
  }

  const workDir = path.join(options.workRoot, sanitizeFileName(candidate.id));
  throwIfListeningOperationAborted(options.signal);
  await fs.mkdir(workDir, { recursive: true });

  const audioPath = await downloadYouTubeAudio(candidate, workDir, options.signal);
  const vttPath = await runWhisper(
    audioPath,
    workDir,
    modelName,
    candidate.languageCode,
    options.signal
  );
  throwIfListeningOperationAborted(options.signal);
  const vttText = await fs.readFile(vttPath, "utf8");
  throwIfListeningOperationAborted(options.signal);
  const segments = parseWhisperVtt(vttText);
  if (segments.length === 0) {
    throw new Error("Whisper 결과에서 문장 구간을 찾지 못했습니다.");
  }

  return {
    id: `transcript:${candidate.id}`,
    candidateId: candidate.id,
    videoId: candidate.videoId,
    title: candidate.title,
    channelName: candidate.channelName,
    languageCode: candidate.languageCode,
    status: "ready",
    segments,
    audioPath,
    modelName,
    createdAt: now,
    updatedAt: now
  };
}

export async function generateLocalFileListeningTranscript(
  input: ListeningLocalTranscriptInput,
  options: GenerateListeningTranscriptOptions
): Promise<ListeningTranscript> {
  throwIfListeningOperationAborted(options.signal);
  const modelName = options.modelName?.trim() || getDefaultListeningWhisperModel(input.languageCode);
  const now = new Date().toISOString();
  const toolStatus = await getListeningToolStatus(options.signal);
  if (!toolStatus.ffmpegAvailable || !toolStatus.whisperAvailable) {
    const missing = [
      toolStatus.ffmpegAvailable ? "" : "ffmpeg",
      toolStatus.whisperAvailable ? "" : "whisper"
    ].filter(Boolean);
    throw new Error(`필요 도구가 없습니다: ${missing.join(", ")}`);
  }

  const filePath = input.filePath.trim();
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`영상 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const title = input.title?.trim() || path.basename(filePath, path.extname(filePath));
  const candidateId = `local-file:${filePath}`;
  const workDir = path.join(options.workRoot, sanitizeFileName(candidateId));
  throwIfListeningOperationAborted(options.signal);
  await fs.mkdir(workDir, { recursive: true });

  const vttPath = await runWhisper(
    filePath,
    workDir,
    modelName,
    input.languageCode,
    options.signal
  );
  throwIfListeningOperationAborted(options.signal);
  const vttText = await fs.readFile(vttPath, "utf8");
  throwIfListeningOperationAborted(options.signal);
  const segments = parseWhisperVtt(vttText);
  if (segments.length === 0) {
    throw new Error("Whisper 결과에서 문장 구간을 찾지 못했습니다.");
  }

  return {
    id: `transcript:${candidateId}`,
    candidateId,
    videoId: `local:${path.basename(filePath)}`,
    title,
    channelName: "Local file",
    languageCode: input.languageCode,
    status: "ready",
    segments,
    audioPath: filePath,
    modelName,
    createdAt: now,
    updatedAt: now
  };
}

export async function extractLocalEmbeddedSubtitleTranscript(
  input: ListeningLocalTranscriptInput,
  options: GenerateListeningTranscriptOptions
): Promise<ListeningTranscript> {
  throwIfListeningOperationAborted(options.signal);
  const now = new Date().toISOString();
  const toolStatus = await getListeningToolStatus(options.signal);
  if (!toolStatus.ffmpegAvailable) {
    throw new Error("내장 자막을 확인하려면 ffmpeg가 필요합니다.");
  }

  const filePath = input.filePath.trim();
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`영상 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const title = input.title?.trim() || path.basename(filePath, path.extname(filePath));
  const candidateId = `local-file:${filePath}`;
  const workDir = path.join(options.workRoot, sanitizeFileName(`${candidateId}:embedded-subtitle`));
  throwIfListeningOperationAborted(options.signal);
  await fs.mkdir(workDir, { recursive: true });
  const vttPath = path.join(workDir, "embedded-subtitle.vtt");

  const streams = await listEmbeddedSubtitleStreams(
    filePath,
    toolStatus.ffmpegCommand,
    options.signal
  );
  if (streams.length === 0) {
    throw new Error("영상 안에서 내장 자막 스트림을 찾지 못했습니다. SRT/VTT 파일을 불러오거나 Whisper 전사를 실행하세요.");
  }

  const orderedStreams = orderSubtitleStreams(streams, input.languageCode);
  let lastError = "";
  let sawImageSubtitle = false;
  let segments: ListeningTranscriptSegment[] = [];
  for (const stream of orderedStreams) {
    throwIfListeningOperationAborted(options.signal);
    if (isImageSubtitleCodec(stream.codecName)) {
      sawImageSubtitle = true;
      continue;
    }
    await fs.rm(vttPath, { force: true }).catch(() => undefined);
    try {
      await extractSubtitleStreamToVtt(
        toolStatus.ffmpegCommand,
        filePath,
        stream.mapSpec,
        vttPath,
        options.signal
      );
      throwIfListeningOperationAborted(options.signal);
      const vttText = await fs.readFile(vttPath, "utf8").catch(() => "");
      throwIfListeningOperationAborted(options.signal);
      segments = mergeSubtitleSegmentsIntoSentences(parseWhisperVtt(vttText), {
        idPrefix: "embedded-subtitle"
      });
      if (segments.length > 0) {
        break;
      }
      lastError = "내장 자막 스트림에서 문장 구간을 찾지 못했습니다.";
    } catch (caught) {
      throwIfListeningOperationAborted(options.signal);
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes("Subtitle encoding currently only possible from text to text")) {
        sawImageSubtitle = true;
      }
      lastError = message;
    }
  }

  if (segments.length === 0) {
    throw new Error(
      sawImageSubtitle
        ? "이미지 기반 내장 자막이거나 텍스트로 변환할 수 없는 자막입니다. SRT/VTT 파일을 불러오거나 Whisper 전사를 실행하세요."
        : `${summarizeCommandError(lastError) || "텍스트 내장 자막을 찾지 못했습니다."} SRT/VTT 파일을 불러오거나 Whisper 전사를 실행하세요.`
    );
  }

  return {
    id: `transcript:${candidateId}`,
    candidateId,
    videoId: `local:${path.basename(filePath)}`,
    title,
    channelName: "Local file",
    languageCode: input.languageCode,
    status: "ready",
    segments,
    audioPath: filePath,
    modelName: EMBEDDED_SUBTITLE_SENTENCE_MODEL,
    createdAt: now,
    updatedAt: now
  };
}

async function listEmbeddedSubtitleStreams(
  filePath: string,
  ffmpegCommand: string,
  signal?: AbortSignal
): Promise<SubtitleStreamInfo[]> {
  throwIfListeningOperationAborted(signal);
  const ffprobeCommand = await findFfprobeCommand(ffmpegCommand, signal);
  if (!ffprobeCommand) {
    return [createLegacySubtitleStreamFallback()];
  }

  try {
    const result = await runCommand(
      ffprobeCommand,
      [
        "-v",
        "error",
        "-select_streams",
        "s",
        "-show_entries",
        "stream=index,codec_name:stream_tags=language,title",
        "-of",
        "json",
        filePath
      ],
      {
        extraPathDirs: getExtraPathDirs(ffmpegCommand),
        timeoutMs: 30_000,
        signal
      }
    );
    throwIfListeningOperationAborted(signal);
    const parsed = JSON.parse(result.stdout) as { streams?: unknown[] };
    if (!Array.isArray(parsed.streams)) {
      return [];
    }
    return parsed.streams
      .map((stream) => parseSubtitleStreamInfo(stream))
      .filter((stream): stream is SubtitleStreamInfo => Boolean(stream));
  } catch {
    throwIfListeningOperationAborted(signal);
    return [createLegacySubtitleStreamFallback()];
  }
}

function parseSubtitleStreamInfo(stream: unknown): SubtitleStreamInfo | null {
  if (!stream || typeof stream !== "object") {
    return null;
  }
  const record = stream as {
    index?: unknown;
    codec_name?: unknown;
    tags?: Record<string, unknown>;
  };
  const index = Number(record.index);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const tags = record.tags && typeof record.tags === "object" ? record.tags : {};
  const language = typeof tags.language === "string" ? tags.language : undefined;
  const title = typeof tags.title === "string" ? tags.title : undefined;
  return {
    index,
    mapSpec: `0:${index}`,
    codecName: typeof record.codec_name === "string" ? record.codec_name : "",
    language,
    title
  };
}

function orderSubtitleStreams(
  streams: SubtitleStreamInfo[],
  languageCode?: string
): SubtitleStreamInfo[] {
  const targetLanguage = normalizeSubtitleLanguageCode(languageCode);
  return [...streams].sort((left, right) => {
    const leftLanguage = normalizeSubtitleLanguageCode(left.language);
    const rightLanguage = normalizeSubtitleLanguageCode(right.language);
    const leftLanguageScore = targetLanguage && leftLanguage === targetLanguage ? 0 : 1;
    const rightLanguageScore = targetLanguage && rightLanguage === targetLanguage ? 0 : 1;
    if (leftLanguageScore !== rightLanguageScore) {
      return leftLanguageScore - rightLanguageScore;
    }
    const leftCodecScore = isImageSubtitleCodec(left.codecName) ? 1 : 0;
    const rightCodecScore = isImageSubtitleCodec(right.codecName) ? 1 : 0;
    if (leftCodecScore !== rightCodecScore) {
      return leftCodecScore - rightCodecScore;
    }
    return left.index - right.index;
  });
}

function normalizeSubtitleLanguageCode(languageCode?: string) {
  const normalized = normalizeListeningLanguageCode(languageCode);
  const iso639Map: Record<string, string> = {
    eng: "en",
    jpn: "ja",
    kor: "ko",
    zho: "zh",
    chi: "zh",
    fra: "fr",
    fre: "fr",
    deu: "de",
    ger: "de",
    spa: "es",
    ita: "it",
    por: "pt",
    rus: "ru"
  };
  return iso639Map[normalized] ?? normalized;
}

function isImageSubtitleCodec(codecName: string) {
  return new Set(["dvd_subtitle", "hdmv_pgs_subtitle", "xsub", "dvb_subtitle"]).has(
    codecName.trim().toLowerCase()
  );
}

async function extractSubtitleStreamToVtt(
  ffmpegCommand: string,
  filePath: string,
  mapSpec: string,
  vttPath: string,
  signal?: AbortSignal
) {
  await runCommand(
    ffmpegCommand,
    [
      "-y",
      "-i",
      filePath,
      "-map",
      mapSpec,
      "-c:s",
      "webvtt",
      vttPath
    ],
    {
      extraPathDirs: getExtraPathDirs(ffmpegCommand),
      timeoutMs: 5 * 60 * 1000,
      signal
    }
  );
}

async function findFfprobeCommand(ffmpegCommand: string, signal?: AbortSignal) {
  throwIfListeningOperationAborted(signal);
  const siblingName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  if (ffmpegCommand && ffmpegCommand !== "ffmpeg") {
    const siblingPath = path.join(path.dirname(ffmpegCommand), siblingName);
    const stat = await fs.stat(siblingPath).catch(() => null);
    if (stat?.isFile()) {
      return siblingPath;
    }
  }
  return findCommandPath("ffprobe", signal);
}

function createLegacySubtitleStreamFallback(): SubtitleStreamInfo {
  return {
    index: 0,
    mapSpec: "0:s:0",
    codecName: "",
    language: undefined,
    title: undefined
  };
}

export function getDefaultListeningWhisperModel(languageCode?: string) {
  return normalizeListeningLanguageCode(languageCode) === "en"
    ? DEFAULT_ENGLISH_WHISPER_MODEL
    : DEFAULT_MULTILINGUAL_WHISPER_MODEL;
}

function normalizeListeningLanguageCode(languageCode?: string) {
  return String(languageCode ?? "")
    .trim()
    .toLowerCase()
    .split("-")[0];
}

async function downloadYouTubeAudio(
  candidate: ListeningVideoCandidate,
  workDir: string,
  signal?: AbortSignal
) {
  throwIfListeningOperationAborted(signal);
  const toolStatus = await getListeningToolStatus(signal);
  const extraPathDirs = getExtraPathDirs(toolStatus.ffmpegCommand);
  const outputTemplate = path.join(workDir, "audio.%(ext)s");
  await runCommand(
    toolStatus.ytDlpCommand,
    [
      "--no-playlist",
      "--force-overwrites",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--output",
      outputTemplate,
      candidate.url
    ],
    { extraPathDirs, signal }
  );

  throwIfListeningOperationAborted(signal);
  const audioPath = await findFirstExistingFile(workDir, [
    "audio.mp3",
    "audio.m4a",
    "audio.webm",
    "audio.opus",
    "audio.wav"
  ]);
  if (!audioPath) {
    throw new Error("yt-dlp가 오디오 파일을 만들지 못했습니다.");
  }
  return audioPath;
}

export function getWhisperLanguageArgs(languageCode?: string) {
  const normalizedLanguageCode = normalizeListeningLanguageCode(languageCode);
  return normalizedLanguageCode ? ["--language", normalizedLanguageCode] : [];
}

async function runWhisper(
  audioPath: string,
  workDir: string,
  modelName: string,
  languageCode?: string,
  signal?: AbortSignal
) {
  throwIfListeningOperationAborted(signal);
  const toolStatus = await getListeningToolStatus(signal);
  await runCommand(
    toolStatus.whisperCommand,
    [
      audioPath,
      "--model",
      modelName,
      ...getWhisperLanguageArgs(languageCode),
      "--output_format",
      "vtt",
      "--output_dir",
      workDir
    ],
    { extraPathDirs: getExtraPathDirs(toolStatus.ffmpegCommand), signal }
  );

  throwIfListeningOperationAborted(signal);
  const entries = await fs.readdir(workDir, { withFileTypes: true });
  const vttFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".vtt"))
    .map((entry) => path.join(workDir, entry.name));
  if (vttFiles.length === 0) {
    throw new Error("Whisper가 VTT 자막 파일을 만들지 못했습니다.");
  }
  return vttFiles[0];
}

function parseWhisperVtt(vttText: string): ListeningTranscriptSegment[] {
  const blocks = vttText.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const parsed: ListeningTranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) {
      continue;
    }

    const timeMatch = lines[timeLineIndex].match(
      /([\d:.]+)\s+-->\s+([\d:.]+)(?:\s|$)/
    );
    if (!timeMatch) {
      continue;
    }

    const start = parseVttTime(timeMatch[1]);
    const end = parseVttTime(timeMatch[2]);
    const text = lines
      .slice(timeLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || end <= start) {
      continue;
    }
    parsed.push(...splitTranscriptSegment(start, end, text));
  }

  return parsed.map((segment, index) => ({
    ...segment,
    id: `whisper-${index + 1}`
  }));
}

function splitTranscriptSegment(
  start: number,
  end: number,
  text: string
): ListeningTranscriptSegment[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    return [
      {
        id: "",
        speaker: "Speaker",
        start,
        end,
        text
      }
    ];
  }

  const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  let cursor = start;
  return sentences.map((sentence, index) => {
    const isLast = index === sentences.length - 1;
    const duration = end - start;
    const nextEnd = isLast
      ? end
      : cursor + duration * Math.max(0.05, sentence.length / Math.max(1, totalLength));
    const segment = {
      id: "",
      speaker: "Speaker",
      start: cursor,
      end: Math.min(end, nextEnd),
      text: sentence
    };
    cursor = segment.end;
    return segment;
  });
}

function parseVttTime(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number(value) || 0;
}

function parseYtDlpMetadataLine(line: string): YouTubeVideoMetadata | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  const videoId = normalizeMetadataText(payload.id);
  if (!videoId) {
    return null;
  }

  return {
    videoId,
    title: normalizeMetadataText(payload.title) || undefined,
    channelName:
      normalizeMetadataText(payload.channel) ||
      normalizeMetadataText(payload.uploader) ||
      undefined,
    thumbnailUrl: normalizeMetadataText(payload.thumbnail) || undefined,
    durationSeconds:
      normalizeMetadataDuration(payload.duration) ??
      normalizeMetadataDuration(payload.duration_string),
    durationSource: "yt-dlp",
    webpageUrl: normalizeMetadataText(payload.webpage_url) || undefined
  };
}

async function fetchYouTubePageMetadataBatch(
  urls: string[],
  timeoutMs: number,
  signal?: AbortSignal
) {
  throwIfListeningOperationAborted(signal);
  const metadataById = new Map<string, YouTubeVideoMetadata>();
  const results = await mapWithConcurrency(urls, 6, (url) =>
    fetchYouTubePageMetadata(url, timeoutMs, signal)
  );
  throwIfListeningOperationAborted(signal);
  for (const metadata of results) {
    if (metadata?.videoId) {
      mergeYouTubeMetadata(metadataById, metadata);
    }
  }
  return metadataById;
}

async function fetchYouTubeEmbedMetadataBatch(
  urls: string[],
  timeoutMs: number,
  signal?: AbortSignal
) {
  const embedUrls = urls
    .map((url) => getYouTubeVideoIdFromUrl(url))
    .filter(Boolean)
    .map((videoId) => `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
  return fetchYouTubePageMetadataBatch(embedUrls, timeoutMs, signal);
}

async function fetchYouTubePageMetadata(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
) {
  throwIfListeningOperationAborted(signal);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromParent, { once: true });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.youtube.com",
        Referer: "https://www.youtube.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      }
    });
    if (!response.ok) {
      return null;
    }
    return parseYouTubePageMetadata(await response.text(), url);
  } catch {
    throwIfListeningOperationAborted(signal);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function parseYouTubePageMetadata(html: string, url: string): YouTubeVideoMetadata | null {
  const searchable = html.replace(/\\"/g, '"');
  const videoId =
    getYouTubeVideoIdFromUrl(url) ||
    firstRegexGroup(searchable, [/"videoId"\s*:\s*"([^"]+)"/, /"video_id"\s*:\s*"([^"]+)"/]);
  if (!videoId) {
    return null;
  }

  const lengthSeconds = firstRegexGroup(searchable, [/"lengthSeconds"\s*:\s*"?(\d+)"?/]);
  const approxDurationMs = firstRegexGroup(searchable, [/"approxDurationMs"\s*:\s*"?(\d+)"?/]);
  const isoDuration =
    extractHtmlMetaContent(searchable, "duration") ||
    firstRegexGroup(searchable, [/"duration"\s*:\s*"(PT[^"]+)"/]);
  const durationSeconds =
    normalizeMetadataDuration(lengthSeconds) ??
    normalizeMetadataDurationMs(approxDurationMs) ??
    parseIso8601Duration(isoDuration);

  return {
    videoId,
    title: extractHtmlMetaContent(searchable, "og:title") || undefined,
    channelName:
      decodeMetadataText(
        firstRegexGroup(searchable, [
          /"ownerChannelName"\s*:\s*"([^"]+)"/,
          /"author"\s*:\s*"([^"]+)"/
        ]) ?? ""
      ) || undefined,
    thumbnailUrl: extractHtmlMetaContent(searchable, "og:image") || undefined,
    durationSeconds,
    durationSource: durationSeconds ? "youtube-page" : undefined,
    webpageUrl: url
  };
}

function mergeYouTubeMetadata(
  metadataById: Map<string, YouTubeVideoMetadata>,
  metadata: YouTubeVideoMetadata
) {
  const existing = metadataById.get(metadata.videoId);
  metadataById.set(metadata.videoId, {
    videoId: metadata.videoId,
    title: metadata.title ?? existing?.title,
    channelName: metadata.channelName ?? existing?.channelName,
    thumbnailUrl: metadata.thumbnailUrl ?? existing?.thumbnailUrl,
    durationSeconds: metadata.durationSeconds ?? existing?.durationSeconds,
    durationSource: metadata.durationSource ?? existing?.durationSource,
    webpageUrl: metadata.webpageUrl ?? existing?.webpageUrl
  });
}

function normalizeMetadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMetadataDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return normalizeMetadataDuration(Number(trimmed));
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    return undefined;
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function normalizeMetadataDurationMs(value: unknown) {
  const milliseconds = normalizeMetadataDuration(value);
  return milliseconds === undefined ? undefined : Math.max(1, Math.round(milliseconds / 1000));
}

function parseIso8601Duration(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) {
    return undefined;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return totalSeconds > 0 ? totalSeconds : undefined;
}

function extractHtmlMetaContent(html: string, key: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (
      !new RegExp(`\\b(?:property|name|itemprop)=["']${escapeRegExp(key)}["']`, "i").test(tag)
    ) {
      continue;
    }
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) {
      return decodeMetadataText(content);
    }
  }
  return "";
}

function firstRegexGroup(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return decodeMetadataText(match[1]);
    }
  }
  return undefined;
}

function decodeMetadataText(value: string) {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function getYouTubeVideoIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
    if (url.hostname.includes("youtube.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery) {
        return fromQuery;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const knownPrefixes = new Set(["embed", "shorts", "live"]);
      if (parts.length >= 2 && knownPrefixes.has(parts[0])) {
        return parts[1];
      }
    }
  } catch {
    // Fall through to a conservative regex.
  }
  const match = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{6,})/);
  return match?.[1] ?? "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
) {
  const results: R[] = [];
  let index = 0;
  async function runNext() {
    const currentIndex = index;
    index += 1;
    if (currentIndex >= items.length) {
      return;
    }
    results[currentIndex] = await worker(items[currentIndex]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findFirstExistingFile(directory: string, fileNames: string[]) {
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        return filePath;
      }
    } catch {
      // Continue trying other extensions.
    }
  }
  return "";
}

async function findCommandPath(command: string, signal?: AbortSignal) {
  throwIfListeningOperationAborted(signal);
  try {
    const result = await runCommand(
      process.platform === "win32" ? "where.exe" : "which",
      [command],
      {
        timeoutMs: 5_000,
        signal
      }
    );
    throwIfListeningOperationAborted(signal);
    const firstLine = result.stdout.split(/\r?\n/).find(Boolean);
    if (firstLine) {
      return firstLine.trim();
    }
  } catch {
    throwIfListeningOperationAborted(signal);
    // Try winget package locations below.
  }

  if (process.platform === "win32") {
    return findWindowsCommand(command, signal);
  }
  return "";
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs?: number; extraPathDirs?: string[]; signal?: AbortSignal } = {}
): Promise<CommandResult> {
  throwIfListeningOperationAborted(options.signal);
  return new Promise((resolve, reject) => {
    const pathValue = process.env.Path ?? process.env.PATH ?? "";
    const envPath = [...(options.extraPathDirs ?? []), pathValue].filter(Boolean).join(path.delimiter);
    execFile(
      command,
      args,
      {
        env: {
          ...process.env,
          PATH: envPath,
          Path: envPath
        },
        timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
        signal: options.signal,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (options.signal?.aborted) {
          reject(createListeningOperationAbortError(options.signal));
          return;
        }
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function summarizeCommandError(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "알 수 없는 ffmpeg 오류";
  }
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 500)}...`;
}

async function findWindowsCommand(command: string, signal?: AbortSignal) {
  throwIfListeningOperationAborted(signal);
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return "";
  }

  const candidateRoots = [
    path.join(localAppData, "Programs", "Python"),
    path.join(localAppData, "Microsoft", "WinGet", "Links"),
    path.join(localAppData, "Microsoft", "WinGet", "Packages")
  ];
  const executableName = `${command}.exe`.toLowerCase();
  for (const root of candidateRoots) {
    throwIfListeningOperationAborted(signal);
    const found = await findFileByName(root, executableName, 8, signal);
    if (found) {
      return found;
    }
  }
  return "";
}

async function findFileByName(
  directory: string,
  lowerCaseFileName: string,
  depth: number,
  signal?: AbortSignal
): Promise<string> {
  throwIfListeningOperationAborted(signal);
  if (depth < 0) {
    return "";
  }
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return "";
  }

  for (const entry of entries) {
    throwIfListeningOperationAborted(signal);
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === lowerCaseFileName) {
      return entryPath;
    }
  }
  for (const entry of entries) {
    throwIfListeningOperationAborted(signal);
    if (!entry.isDirectory()) {
      continue;
    }
    const found = await findFileByName(
      path.join(directory, entry.name),
      lowerCaseFileName,
      depth - 1,
      signal
    );
    if (found) {
      return found;
    }
  }
  return "";
}

function createListeningOperationAbortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Listening operation was canceled.");
  error.name = "AbortError";
  return error;
}

function throwIfListeningOperationAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createListeningOperationAbortError(signal);
  }
}

function getExtraPathDirs(commandPath: string) {
  return path.isAbsolute(commandPath) ? [path.dirname(commandPath)] : [];
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
}
