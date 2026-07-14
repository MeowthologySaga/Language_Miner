import type { LocalEnglishMinerApi } from "../data/api";
import {
  createCardTtsInput,
  createTtsCacheId,
  getCardTtsLanguageCode,
  getCachedCardTtsAudio,
  getDefaultTtsSettings,
  normalizeTtsText
} from "../shared/tts";
import type { AppSettings, StudyCard, TtsSynthesisInput } from "../shared/types";
import { languagePresets, normalizeLearningProfile } from "../shared/languages";
import i18n from "../i18n";

let activeAudio: HTMLAudioElement | null = null;

export async function prepareCardTtsAudio(
  card: StudyCard,
  settings: AppSettings,
  api: LocalEnglishMinerApi
): Promise<StudyCard> {
  if (!settings.preGenerateCardTts) {
    return card;
  }

  const input = createCardTtsInput(card, settings);
  if (!input || getCachedCardTtsAudio(card, input)) {
    return card;
  }
  if (input.providerName === "browser" || input.providerName === "piper") {
    return card;
  }

  try {
    const result = await api.tts?.synthesize(input);
    if (!result?.audioDataUrl || !result.mimeType) {
      return card;
    }

    return {
      ...card,
      ttsAudio: [
        ...(card.ttsAudio ?? []),
        {
          id: createTtsCacheId(input),
          text: input.text,
          languageCode: input.languageCode,
          providerName: result.providerName,
          model: result.model,
          voiceName: result.voiceName,
          mimeType: result.mimeType,
          audioDataUrl: result.audioDataUrl,
          createdAt: result.createdAt
        }
      ]
    };
  } catch {
    return card;
  }
}

export async function playCardTts(card: StudyCard, settings?: AppSettings) {
  const ttsSettings = settings ?? readStoredTtsSettings(card);
  const input = createCardTtsInput(card, ttsSettings);
  if (!input) {
    return i18n.t("ttsStatus.noText");
  }

  const cached = getCachedCardTtsAudio(card, input);
  if (cached?.audioDataUrl) {
    await playAudioDataUrl(cached.audioDataUrl);
    return i18n.t("ttsStatus.cached");
  }

  return playTtsInput(input);
}

export async function playTextTts(card: StudyCard, text: string, settings?: AppSettings) {
  const ttsSettings = settings ?? readStoredTtsSettings(card);
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) {
    return i18n.t("ttsStatus.noText");
  }

  const input = {
    text: normalizedText,
    languageCode: getCardTtsLanguageCode(card, ttsSettings),
    providerName: ttsSettings.ttsProviderName,
    model: ttsSettings.ttsModel,
    voiceName: normalizeTtsText(ttsSettings.ttsVoiceName || "") || undefined,
    rate: Number.isFinite(ttsSettings.ttsRate) ? ttsSettings.ttsRate : 0
  };
  const cached = getCachedCardTtsAudio(card, input);
  if (cached?.audioDataUrl) {
    await playAudioDataUrl(cached.audioDataUrl);
    return i18n.t("ttsStatus.cached");
  }

  return playTtsInput(input);
}

/**
 * Speaks UI-owned sample text without persisting or shipping a generated audio file.
 * Electron uses the installed Windows voice; the browser speech API is the fallback.
 */
export async function playStandaloneTts(
  text: string,
  languageCode = "en",
  settings?: AppSettings
) {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) {
    return i18n.t("ttsStatus.noText");
  }

  const ttsSettings = settings ?? readStoredTtsSettings();
  return playTtsInput({
    text: normalizedText,
    languageCode,
    providerName: ttsSettings.ttsProviderName,
    model: ttsSettings.ttsModel,
    voiceName: normalizeTtsText(ttsSettings.ttsVoiceName || "") || undefined,
    rate: Number.isFinite(ttsSettings.ttsRate) ? ttsSettings.ttsRate : 0
  });
}

export function stopActiveTts() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel();
  }
}

async function playTtsInput(input: TtsSynthesisInput) {
  if (input.providerName === "browser") {
    stopActiveTts();
    speakWithBrowser(input.text, input.languageCode, input.rate, input.voiceName);
    return i18n.t("ttsStatus.browser");
  }

  try {
    const result = await window.localEnglishMiner?.tts?.synthesize(input);
    if (result?.audioDataUrl) {
      await playAudioDataUrl(result.audioDataUrl);
      return i18n.t("ttsStatus.generated");
    }
  } catch {
    // Fall through to speechSynthesis when the Electron bridge or selected voice is unavailable.
  }

  stopActiveTts();
  speakWithBrowser(input.text, input.languageCode, input.rate, input.voiceName);
  return input.providerName === "piper"
    ? i18n.t("ttsStatus.piperFallback")
    : i18n.t("ttsStatus.browser");
}

function playAudioDataUrl(audioDataUrl: string) {
  return new Promise<void>((resolve, reject) => {
    stopActiveTts();
    const audio = new Audio(audioDataUrl);
    activeAudio = audio;
    audio.onended = () => {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      resolve();
    };
    audio.onerror = () => {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      reject(new Error(i18n.t("ttsStatus.playbackFailed")));
    };
    void audio.play().catch((error) => {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      reject(error);
    });
  });
}

function speakWithBrowser(
  text: string,
  languageCode: string,
  rate = 0,
  voiceName?: string
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error(i18n.t("ttsStatus.unavailable"));
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = normalizeSpeechLanguage(languageCode);
  utterance.rate = Math.min(1.6, Math.max(0.6, 1 + rate * 0.05));
  const voice = resolveBrowserVoice(window.speechSynthesis.getVoices(), utterance.lang, voiceName);
  if (voice) {
    utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
}

export function resolveBrowserVoice<T extends Pick<SpeechSynthesisVoice, "name" | "lang">>(
  voices: T[],
  languageCode: string,
  voiceName?: string
): T | undefined {
  const requestedName = normalizeTtsText(voiceName || "").toLocaleLowerCase();
  if (requestedName) {
    const namedVoice = voices.find((voice) => voice.name.toLocaleLowerCase() === requestedName);
    if (namedVoice) {
      return namedVoice;
    }
  }

  const normalizedLanguage = normalizeSpeechLanguage(languageCode).toLocaleLowerCase();
  const baseLanguage = normalizedLanguage.split("-")[0];
  return voices.find((voice) => voice.lang.toLocaleLowerCase() === normalizedLanguage)
    ?? voices.find((voice) => voice.lang.toLocaleLowerCase().split("-")[0] === baseLanguage);
}

function normalizeSpeechLanguage(languageCode: string) {
  const normalized = languageCode.trim().toLowerCase();
  if (normalized === "en") {
    return "en-US";
  }
  if (normalized === "ko") {
    return "ko-KR";
  }
  if (normalized === "ja") {
    return "ja-JP";
  }
  return languageCode || "en-US";
}

function readStoredTtsSettings(card?: StudyCard): AppSettings {
  const defaults = getDefaultTtsSettings();
  try {
    const stored = JSON.parse(localStorage.getItem("lem:settings") ?? "{}") as Partial<AppSettings>;
    return {
      ...(stored as AppSettings),
      learningProfile: resolveCardTtsLearningProfile(stored, card),
      webReaderCustomSources: stored.webReaderCustomSources ?? [],
      ttsProviderName: stored.ttsProviderName ?? defaults.ttsProviderName,
      ttsModel: normalizeTtsText(stored.ttsModel || defaults.ttsModel),
      ttsVoiceName: stored.ttsVoiceName ?? defaults.ttsVoiceName,
      ttsRate: Number.isFinite(stored.ttsRate) ? Number(stored.ttsRate) : defaults.ttsRate,
      preGenerateCardTts: stored.preGenerateCardTts ?? defaults.preGenerateCardTts
    };
  } catch {
    return {
      learningProfile: resolveCardTtsLearningProfile({}, card),
      webReaderCustomSources: [],
      ...defaults
    } as unknown as AppSettings;
  }
}

function resolveCardTtsLearningProfile(
  stored: Partial<AppSettings>,
  card?: StudyCard
): AppSettings["learningProfile"] {
  const profileLearningProfile = readCardProfileLearningProfile(card?.profileId);
  if (profileLearningProfile) {
    return profileLearningProfile;
  }

  const metadata = card?.languageMetadata;
  if (metadata?.profileTargetLanguageCode) {
    return {
      targetLanguage: getProfileLanguage(metadata.profileTargetLanguageCode, "en"),
      nativeLanguage: getProfileLanguage(metadata.profileNativeLanguageCode, "ko")
    };
  }

  return normalizeLearningProfile(
    stored.learningProfile ?? {
      targetLanguage: getProfileLanguage("en", "en"),
      nativeLanguage: getProfileLanguage("ko", "ko")
    }
  );
}

function readCardProfileLearningProfile(profileId: string | undefined) {
  if (!profileId || typeof localStorage === "undefined") {
    return null;
  }
  try {
    const profiles = JSON.parse(localStorage.getItem("lem:profiles") ?? "[]") as Array<{
      id?: string;
      learningProfile?: Partial<AppSettings["learningProfile"]>;
    }>;
    const profile = profiles.find((candidate) => candidate.id === profileId);
    return profile?.learningProfile ? normalizeLearningProfile(profile.learningProfile) : null;
  } catch {
    return null;
  }
}

function getProfileLanguage(languageCode: string | undefined, fallbackCode: string) {
  const normalizedCode = String(languageCode || fallbackCode)
    .trim()
    .toLowerCase()
    .split("-")[0];
  return (
    languagePresets.find((language) => language.code === normalizedCode) ?? {
      code: normalizedCode || fallbackCode,
      nameKo: normalizedCode || fallbackCode,
      nameEn: normalizedCode || fallbackCode
    }
  );
}
