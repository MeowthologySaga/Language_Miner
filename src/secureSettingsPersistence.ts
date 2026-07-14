import type { SecureSettingsStatus } from "./shared/types";

export type SecureApiKeys = {
  geminiApiKey: string;
  googleTranslateApiKey: string;
};

type SecureSettingsClient = {
  getStatus(): Promise<SecureSettingsStatus>;
  getForSession(): Promise<SecureApiKeys>;
  migrateLegacy(input: Partial<SecureApiKeys>): Promise<SecureSettingsStatus>;
};

type SecureSettingsWriteClient = {
  set(input: Partial<SecureApiKeys>): Promise<SecureSettingsStatus>;
};

export async function prepareSecureSettings(
  client: SecureSettingsClient,
  readLegacyKeys: () => SecureApiKeys
): Promise<
  | { available: false }
  | { available: true; legacyKeys: SecureApiKeys; sessionKeys: SecureApiKeys }
> {
  const status = await client.getStatus();
  if (!status.available) {
    return { available: false };
  }

  const legacyKeys = readLegacyKeys();
  const migrationStatus = await client.migrateLegacy(legacyKeys);
  if (!migrationStatus.available) {
    return { available: false };
  }
  const sessionKeys = await client.getForSession();
  return { available: true, legacyKeys, sessionKeys };
}

export async function persistSecureSettingsSafely<T extends Partial<SecureApiKeys>>(
  client: SecureSettingsWriteClient,
  value: T
): Promise<
  | { encryptionSucceeded: true; localValue: T }
  | { encryptionSucceeded: false; localValue: T; error: unknown }
> {
  try {
    const status = await client.set({
      geminiApiKey: value.geminiApiKey,
      googleTranslateApiKey: value.googleTranslateApiKey
    });
    if (!status.available) {
      return {
        encryptionSucceeded: false,
        localValue: settingsForLocalStorage(value),
        error: new Error(
          "OS encryption is unavailable. API keys are kept for this app session only."
        )
      };
    }
    return {
      encryptionSucceeded: true,
      localValue: settingsForLocalStorage(value)
    };
  } catch (error) {
    return {
      encryptionSucceeded: false,
      localValue: settingsForLocalStorage(value),
      error
    };
  }
}

export function resolveSecureSettingsHydration(
  sessionKeys: SecureApiKeys,
  latestKeysDuringMigration: SecureApiKeys | null
): SecureApiKeys {
  return latestKeysDuringMigration ?? sessionKeys;
}

export function settingsForLocalStorage<T extends Partial<SecureApiKeys>>(
  value: T,
  _encryptionAvailable?: boolean
): T {
  return {
    ...value,
    geminiApiKey: "",
    googleTranslateApiKey: ""
  };
}
