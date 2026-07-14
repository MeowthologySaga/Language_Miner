import { defaultLearningProfile, languagePresets, normalizeLearningProfile } from "./languages";
import type { AppLocale } from "../appLocale";
import type { LearningProfile, LearningProfileRecord, ProfileId } from "./types";

export const DEFAULT_PROFILE_ID = "profile-english";
export const TEMP_JAPANESE_PROFILE_ID = "profile-japanese-temp";

const initialCreatedAt = "2026-01-01T00:00:00.000Z";

const builtInProfileNames: Record<
  typeof DEFAULT_PROFILE_ID | typeof TEMP_JAPANESE_PROFILE_ID,
  Record<AppLocale, string>
> = {
  [DEFAULT_PROFILE_ID]: {
    ko: "영어 기본",
    en: "English Basics"
  },
  [TEMP_JAPANESE_PROFILE_ID]: {
    ko: "일본어 임시",
    en: "Temporary Japanese"
  }
};

export function createDefaultProfiles(
  savedLearningProfile: Partial<LearningProfile> | undefined,
  appLocale: AppLocale = "ko"
): LearningProfileRecord[] {
  return [
    {
      id: DEFAULT_PROFILE_ID,
      name: builtInProfileNames[DEFAULT_PROFILE_ID][appLocale],
      learningProfile: normalizeLearningProfile(savedLearningProfile),
      createdAt: initialCreatedAt,
      updatedAt: initialCreatedAt
    },
    {
      id: TEMP_JAPANESE_PROFILE_ID,
      name: builtInProfileNames[TEMP_JAPANESE_PROFILE_ID][appLocale],
      learningProfile: {
        targetLanguage: languagePresets.find((language) => language.code === "ja") ?? {
          code: "ja",
          nameKo: "일본어",
          nameEn: "Japanese"
        },
        nativeLanguage: languagePresets.find((language) => language.code === "ko") ?? {
          code: "ko",
          nameKo: "한국어",
          nameEn: "Korean"
        }
      },
      createdAt: initialCreatedAt,
      updatedAt: initialCreatedAt
    }
  ];
}

export function normalizeProfiles(
  value: unknown,
  savedLearningProfile: Partial<LearningProfile> | undefined,
  appLocale: AppLocale = "ko"
): LearningProfileRecord[] {
  const fallbackProfiles = createDefaultProfiles(savedLearningProfile, appLocale);
  if (!Array.isArray(value)) {
    return fallbackProfiles;
  }

  const profileMap = new Map<ProfileId, LearningProfileRecord>();
  for (const fallback of fallbackProfiles) {
    profileMap.set(fallback.id, fallback);
  }

  for (const item of value) {
    const candidate = normalizeProfileRecord(item);
    if (candidate) {
      profileMap.set(candidate.id, candidate);
    }
  }

  return localizeBuiltInProfileNames(Array.from(profileMap.values()), appLocale);
}

export function localizeBuiltInProfileNames(
  profiles: LearningProfileRecord[],
  appLocale: AppLocale
): LearningProfileRecord[] {
  let changed = false;
  const localized = profiles.map((profile) => {
    if (profile.id !== DEFAULT_PROFILE_ID && profile.id !== TEMP_JAPANESE_PROFILE_ID) {
      return profile;
    }
    const names = builtInProfileNames[profile.id];
    if (!Object.values(names).includes(profile.name)) {
      return profile;
    }
    const name = names[appLocale];
    if (name === profile.name) {
      return profile;
    }
    changed = true;
    return { ...profile, name };
  });
  return changed ? localized : profiles;
}

export function normalizeActiveProfileId(
  value: unknown,
  profiles: LearningProfileRecord[]
): ProfileId {
  const profileId = typeof value === "string" ? value.trim() : "";
  if (profileId && profiles.some((profile) => profile.id === profileId)) {
    return profileId;
  }
  return profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}

export function getProfileLabel(profile: LearningProfileRecord) {
  const { targetLanguage, nativeLanguage } = profile.learningProfile;
  return `${profile.name} · ${targetLanguage.nameKo} / ${nativeLanguage.nameKo}`;
}

function normalizeProfileRecord(value: unknown): LearningProfileRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LearningProfileRecord>;
  const id = candidate.id?.trim();
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    name: candidate.name?.trim() || id,
    learningProfile: normalizeLearningProfile(candidate.learningProfile ?? defaultLearningProfile),
    createdAt: candidate.createdAt || now,
    updatedAt: candidate.updatedAt || now
  };
}
