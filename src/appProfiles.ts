import { normalizeLearningProfile } from "./shared/languages";
import { normalizeProfiles } from "./shared/profiles";
import type { AppLocale } from "./appLocale";
import type { AppSettings, LearningProfileRecord, ProfileId } from "./shared/types";

export const PROFILES_STORAGE_KEY = "lem:profiles";
export const ACTIVE_PROFILE_STORAGE_KEY = "lem:activeProfileId";

export function readProfiles(
  savedLearningProfile: AppSettings["learningProfile"],
  appLocale: AppLocale = "ko"
) {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    const profiles = normalizeProfiles(raw ? JSON.parse(raw) : null, savedLearningProfile, appLocale);
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    return profiles;
  } catch {
    return normalizeProfiles(null, savedLearningProfile, appLocale);
  }
}

export function normalizeProfileRecordForSave(
  profile: LearningProfileRecord,
  existingProfiles: LearningProfileRecord[],
  fallbackProfileName: string,
  currentId?: ProfileId
): LearningProfileRecord {
  const now = new Date().toISOString();
  const requestedId = profile.id.trim() || `profile-${Date.now()}`;
  let id = requestedId;
  let suffix = 2;
  while (existingProfiles.some((candidate) => candidate.id === id && candidate.id !== currentId)) {
    id = `${requestedId}-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    name: profile.name.trim() || fallbackProfileName.trim(),
    learningProfile: normalizeLearningProfile(profile.learningProfile),
    createdAt: profile.createdAt || now,
    updatedAt: now
  };
}

export function getProfileInitials(profile: LearningProfileRecord | undefined) {
  const code = profile?.learningProfile.targetLanguage.code.trim() || "??";
  return code.slice(0, 2).toUpperCase();
}
