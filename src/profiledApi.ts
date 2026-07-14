import type { LocalEnglishMinerApi } from "./data/api";
import {
  assessCardInputLanguage,
  assessInputLanguagePolicy,
  withInputLanguageMetadata
} from "./shared/inputLanguagePolicy";
import { DEFAULT_PROFILE_ID } from "./shared/profiles";
import { attachRendererCloudConsent } from "./shared/cloudProviderConsent";
import { isDefaultSampleCardId } from "./shared/defaultSampleCards";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage,
  scaleTranslationUsageBudgetRequestForAttempts,
  scaleTranslationUsageTotalsForAttempts,
  toTranslationUsageBudgetRequest,
  type TranslationUsageBudgetRequest
} from "./shared/translationUsage";
import {
  GEMINI_MAX_ATTEMPTS_PER_REQUEST,
  GEMINI_PDF_BATCH_MAX_REMOTE_CALLS
} from "./shared/translationRequestLimits";
import type {
  AppSettings,
  ProfileId,
  StudyCard,
  TranslationConnectionTestInput,
  TranslationUsageEvent
} from "./shared/types";
import { prepareCardTtsAudio } from "./utils/cardTts";
import {
  recordTranslationUsageEvent,
  reserveTranslationUsageBudget
} from "./utils/translationUsageLedger";

type ProfiledApiOptions = {
  switchToLanguageProfile?: (languageCode: string) => boolean;
  resolveInputLanguageMismatch?: (
    request: InputLanguageMismatchRequest
  ) => Promise<InputLanguageMismatchDecision>;
};

export type InputLanguageMismatchDecision = "cancel" | "override" | "switch";

export type InputLanguageMismatchRequest = {
  card: StudyCard;
  message: string;
  expectedLanguageCode: string;
  detectedLanguageCode: string;
};

export function createProfiledApi(
  api: LocalEnglishMinerApi,
  profileId: ProfileId,
  settings: AppSettings,
  options: ProfiledApiOptions = {}
): LocalEnglishMinerApi {
  const normalizedProfileId = profileId || DEFAULT_PROFILE_ID;
  return {
    ...api,
    cards: {
      ...api.cards,
      list: () => api.cards.list(normalizedProfileId),
      listPage: (_profileId?: ProfileId, offset?: number, limit?: number) =>
        api.cards.listPage(normalizedProfileId, offset, limit),
      listDue: (nowIso?: string) => api.cards.listDue(nowIso, normalizedProfileId),
      save: async (card: StudyCard) => {
        const guardedCard = await resolveCardLanguagePolicyForSave(card, settings, options);
        const preparedCard = isDefaultSampleCardId(guardedCard.id)
          ? guardedCard
          : await prepareCardTtsAudio(guardedCard, settings, api);
        return api.cards.save(preparedCard, normalizedProfileId);
      }
    },
    wallet: {
      ...api.wallet
    },
    missions: {
      ...api.missions,
      getToday: () => api.missions.getToday(normalizedProfileId),
      recordEvent: (event) =>
        api.missions.recordEvent({
          ...event,
          profileId: event.profileId ?? normalizedProfileId
        }),
      claimReward: (missionId) => api.missions.claimReward(missionId, normalizedProfileId),
      claimDailyBonus: () => api.missions.claimDailyBonus(normalizedProfileId)
    },
    cardSync: {
      ...api.cardSync,
      upload: (settings) => api.cardSync.upload(settings, normalizedProfileId),
      download: (settings) => api.cardSync.download(settings, normalizedProfileId),
      sync: (settings) => api.cardSync.sync(settings, normalizedProfileId)
    },
    lifeLogs: {
      ...api.lifeLogs,
      markProcessed: (id, nextProfileId) =>
        api.lifeLogs.markProcessed(id, nextProfileId ?? normalizedProfileId)
    },
    documents: {
      ...api.documents,
      exportBilingualPdf: (input) =>
        api.documents.exportBilingualPdf({
          ...input,
          profileId: normalizedProfileId
        }),
      listExportRecords: () => api.documents.listExportRecords(normalizedProfileId),
      saveExportRecord: (record) =>
        api.documents.saveExportRecord({
          ...record,
          profileId: normalizedProfileId
        })
    },
    translations: {
      ...api.translations,
      getCached: (input) =>
        api.translations.getCached({
          ...input,
          profileId: normalizedProfileId
        }),
      saveCached: (input) =>
        api.translations.saveCached({
          ...input,
          profileId: normalizedProfileId
        }),
      testConnection: async (input) => {
        const consentSafeInput = attachRendererCloudConsent(input);
        const usageEvent = createTranslationConnectionUsageEvent(
          consentSafeInput,
          settings,
          normalizedProfileId
        );
        const reservation = usageEvent
          ? reserveTranslationUsageBudget(settings, toBudgetRequest(usageEvent))
          : null;
        try {
          const result = await api.translations.testConnection(consentSafeInput);
          if (result.ok && consentSafeInput.providerName !== "gemini") {
            recordTranslationUsageEvent(usageEvent);
          }
          return result;
        } finally {
          reservation?.release();
        }
      },
      translate: async (input) => {
        const consentSafeInput = attachRendererCloudConsent(input);
        const reservation = reserveTranslationUsageBudget(
          settings,
          estimateTranslationBudgetRequest(
            [consentSafeInput.text],
            consentSafeInput,
            settings,
            "text"
          )
        );
        try {
          const result = await api.translations.translate({
            ...consentSafeInput,
            profileId: normalizedProfileId
          });
          recordTranslationUsageEvent(result.usage);
          return result;
        } finally {
          reservation.release();
        }
      },
      translatePdfSegments: async (input) => {
        const consentSafeInput = attachRendererCloudConsent(input);
        const reservation = reserveTranslationUsageBudget(
          settings,
          estimateTranslationBudgetRequest(
            consentSafeInput.segments.map((segment) => segment.text),
            consentSafeInput,
            settings,
            "pdf"
          )
        );
        try {
          const result = await api.translations.translatePdfSegments({
            ...consentSafeInput,
            profileId: normalizedProfileId
          });
          recordTranslationUsageEvent(result.usage);
          return result;
        } finally {
          reservation.release();
        }
      }
    }
  };
}

function estimateTranslationBudgetRequest(
  texts: string[],
  input: {
    providerName: AppSettings["translationProviderName"];
    sourceLang?: string;
    targetLang: string;
    model?: string;
    geminiModel?: string;
    geminiPlan?: AppSettings["geminiPlan"];
    ollamaModel?: string;
    localMtModel?: string;
  },
  settings: AppSettings,
  operation: "text" | "pdf"
): TranslationUsageBudgetRequest {
  const estimate = estimateTranslationUsage({
    texts: texts.map((text) => ({ text, cacheStatus: "miss" as const })),
    providerName: input.providerName,
    model:
      input.model ||
      (input.providerName === "gemini"
        ? input.geminiModel || settings.geminiModel
        : input.providerName === "local"
          ? input.ollamaModel || settings.ollamaModel
          : input.providerName === "localMt"
            ? input.localMtModel || settings.localMtModel
            : undefined),
    plan: input.geminiPlan ?? settings.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });
  const request = toTranslationUsageBudgetRequest(estimate);
  if (input.providerName !== "gemini") {
    return request;
  }
  return scaleTranslationUsageBudgetRequestForAttempts(
    request,
    operation === "pdf"
      ? GEMINI_PDF_BATCH_MAX_REMOTE_CALLS
      : GEMINI_MAX_ATTEMPTS_PER_REQUEST
  );
}

function toBudgetRequest(event: TranslationUsageEvent): TranslationUsageBudgetRequest {
  return {
    estimatedTokens: Math.max(0, event.usage.totalTokens),
    estimatedCostKrw: Math.max(0, event.estimatedCostKrw.max)
  };
}

function createTranslationConnectionUsageEvent(
  input: TranslationConnectionTestInput,
  settings: AppSettings,
  profileId: ProfileId
): TranslationUsageEvent | undefined {
  if (input.providerName === "browser") {
    return undefined;
  }

  const sourceLang = settings.learningProfile.targetLanguage.code;
  const targetLang = settings.learningProfile.nativeLanguage.code;
  const estimate = estimateTranslationUsage({
    texts: [{ text: "Translation engine connection test.", cacheStatus: "miss" }],
    providerName: input.providerName,
    model: getTranslationConnectionModel(input, settings),
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });

  return createTranslationUsageEvent({
    profileId,
    providerName: input.providerName,
    model: estimate.model,
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    usage: scaleTranslationUsageTotalsForAttempts(
      {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: estimate.billableCharacters,
        requestCount: estimate.requestCount,
        cacheHitCount: estimate.cacheHitCount,
        cacheMissCount: estimate.cacheMissCount
      },
      input.providerName === "gemini" ? GEMINI_MAX_ATTEMPTS_PER_REQUEST : 1
    )
  });
}

function getTranslationConnectionModel(
  input: TranslationConnectionTestInput,
  settings: AppSettings
) {
  if (input.providerName === "gemini") {
    return input.geminiModel || settings.geminiModel;
  }
  if (input.providerName === "local") {
    return input.ollamaModel || settings.ollamaModel;
  }
  if (input.providerName === "localMt") {
    return input.localMtModel || settings.localMtModel;
  }
  return undefined;
}

async function resolveCardLanguagePolicyForSave(
  card: StudyCard,
  settings: AppSettings,
  options: ProfiledApiOptions
): Promise<StudyCard> {
  if (card.cardType !== "reading" || card.deckType === "output") {
    return card;
  }
  if (card.languageMetadata?.policyStatus === "override") {
    return card;
  }

  const assessment = assessCardInputLanguage({
    card,
    settings,
    sourceKind: card.languageMetadata?.sourceKind
  });
  if (!assessment.shouldBlock) {
    return withInputLanguageMetadata(card, assessment);
  }

  const decision =
    (await options.resolveInputLanguageMismatch?.({
      card,
      message: assessment.message,
      expectedLanguageCode: assessment.expectedLanguageCode,
      detectedLanguageCode: assessment.detectedLanguageCode
    })) ?? "cancel";
  if (decision === "switch") {
    if (assessment.detectedLanguageCode !== "unknown") {
      options.switchToLanguageProfile?.(assessment.detectedLanguageCode);
    }
    throw new Error(assessment.message);
  }
  if (decision !== "override") {
    throw new Error(assessment.message);
  }

  return withInputLanguageMetadata(
    card,
    assessInputLanguagePolicy({
      text: card.sourceSentence || card.frontText,
      contextText: card.frontText,
      learningProfile: settings.learningProfile,
      override: true,
      sourceKind: "manual_override"
    })
  );
}
