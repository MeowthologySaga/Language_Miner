import type {
  AppSettings,
  CloudProviderConsentRecord,
  CloudProviderName,
  TranslationProviderName
} from "./types";

export const CLOUD_PROVIDER_CONSENT_VERSION = 1 as const;

export type CloudConsentStorage = Pick<Storage, "getItem" | "setItem">;

export type CloudOperationConsentProvider = CloudProviderName | "remoteOllama";

export type CloudOperationConsentRecord = {
  version: typeof CLOUD_PROVIDER_CONSENT_VERSION;
  provider: CloudOperationConsentProvider;
  acceptedAt: string;
};

export class CloudProviderConsentRequiredError extends Error {
  readonly code = "CLOUD_PROVIDER_CONSENT_REQUIRED";

  constructor(readonly provider: CloudProviderName) {
    super(`Cloud provider consent is required before using ${provider}.`);
    this.name = "CloudProviderConsentRequiredError";
  }
}

export function getCloudProviderConsentStorageKey(provider: CloudProviderName) {
  return `lem:cloudConsent:v${CLOUD_PROVIDER_CONSENT_VERSION}:${provider}`;
}

export function getCloudOperationConsentStorageKey(provider: CloudOperationConsentProvider) {
  return `lem:cloudConsent:v${CLOUD_PROVIDER_CONSENT_VERSION}:operation:${provider}`;
}

export function createCloudProviderConsentRecord(input: {
  provider: CloudProviderName;
  keyStorage: CloudProviderConsentRecord["keyStorage"];
  acceptedAt?: string;
}): CloudProviderConsentRecord {
  return {
    version: CLOUD_PROVIDER_CONSENT_VERSION,
    provider: input.provider,
    acceptedAt: input.acceptedAt ?? new Date().toISOString(),
    keyStorage: input.keyStorage,
    costAcknowledged: true,
    externalTransferAcknowledged: true
  };
}

export function isValidCloudProviderConsentRecord(
  value: unknown,
  provider?: CloudProviderName
): value is CloudProviderConsentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<CloudProviderConsentRecord>;
  return (
    record.version === CLOUD_PROVIDER_CONSENT_VERSION &&
    (record.provider === "gemini" || record.provider === "google") &&
    (!provider || record.provider === provider) &&
    typeof record.acceptedAt === "string" &&
    Number.isFinite(Date.parse(record.acceptedAt)) &&
    (record.keyStorage === "safeStorage" || record.keyStorage === "session") &&
    record.costAcknowledged === true &&
    record.externalTransferAcknowledged === true
  );
}

export function readCloudProviderConsent(
  storage: Pick<CloudConsentStorage, "getItem">,
  provider: CloudProviderName
): CloudProviderConsentRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(getCloudProviderConsentStorageKey(provider)) ?? "null");
    return isValidCloudProviderConsentRecord(parsed, provider) ? parsed : null;
  } catch {
    return null;
  }
}

export function readRendererCloudProviderConsent(
  provider: CloudProviderName
): CloudProviderConsentRecord | null {
  if (typeof window === "undefined") return null;
  return readCloudProviderConsent(window.localStorage, provider);
}

export function recordCloudProviderConsent(
  storage: CloudConsentStorage,
  input: {
    provider: CloudProviderName;
    keyStorage: CloudProviderConsentRecord["keyStorage"];
    acceptedAt?: string;
  }
) {
  const record = createCloudProviderConsentRecord(input);
  storage.setItem(getCloudProviderConsentStorageKey(input.provider), JSON.stringify(record));
  return record;
}

export function recordCloudOperationConsent(
  storage: CloudConsentStorage,
  provider: CloudOperationConsentProvider,
  acceptedAt = new Date().toISOString()
) {
  const record: CloudOperationConsentRecord = {
    version: CLOUD_PROVIDER_CONSENT_VERSION,
    provider,
    acceptedAt
  };
  storage.setItem(getCloudOperationConsentStorageKey(provider), JSON.stringify(record));
  return record;
}

export function assertCloudProviderConsent(
  provider: CloudProviderName,
  record: unknown
): asserts record is CloudProviderConsentRecord {
  if (!isValidCloudProviderConsentRecord(record, provider)) {
    throw new CloudProviderConsentRequiredError(provider);
  }
}

export function getCloudProviderForTranslation(
  providerName: TranslationProviderName
): CloudProviderName | null {
  return providerName === "gemini" || providerName === "google" ? providerName : null;
}

export function attachRendererCloudConsent<T extends { providerName: TranslationProviderName }>(
  input: T
): T & { cloudConsent?: CloudProviderConsentRecord } {
  const provider = getCloudProviderForTranslation(input.providerName);
  if (!provider) return input;
  const cloudConsent = readRendererCloudProviderConsent(provider);
  assertCloudProviderConsent(provider, cloudConsent);
  return { ...input, cloudConsent };
}

export function disconnectLegacyCloudSettings(
  settings: AppSettings,
  storage: Pick<CloudConsentStorage, "getItem">
): AppSettings {
  const hasGeminiConsent = Boolean(readCloudProviderConsent(storage, "gemini"));
  const hasGoogleConsent = Boolean(readCloudProviderConsent(storage, "google"));
  const providerName = settings.providerName === "gemini" && !hasGeminiConsent
    ? "mock"
    : settings.providerName;
  const translationProviderName =
    settings.translationProviderName === "gemini" && !hasGeminiConsent
      ? "localMt"
      : settings.translationProviderName === "google" && !hasGoogleConsent
        ? "localMt"
        : settings.translationProviderName;

  return providerName === settings.providerName &&
    translationProviderName === settings.translationProviderName
    ? settings
    : { ...settings, providerName, translationProviderName };
}
