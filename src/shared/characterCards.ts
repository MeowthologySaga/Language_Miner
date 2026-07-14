import type {
  CharacterEmotion,
  CharacterEmotionImageUrls,
  CharacterChatMode,
  CharacterChatMessage,
  CharacterCorrectionMode,
  CharacterPreset,
  CharacterRagHint,
  LearningProfile,
  StudyCard
} from "./types";
import { randomId } from "./ids";
import { defaultLearningProfile } from "./languages";

type UnknownRecord = Record<string, unknown>;

export const CHARACTER_PACK_FORMAT_VERSION = 1 as const;
export const CHARACTER_PACK_SCHEMA_VERSION = 1 as const;
export const CHARACTER_PACK_CONTENT_TYPE = "language_miner_character_pack" as const;
export const CHARACTER_PACK_CURRENT_APP_VERSION = "0.1.0-beta.1";

export type CharacterPackStatus =
  | "quarantined"
  | "blocked"
  | "warning"
  | "ready"
  | "trusted_official";
export type CharacterPackPermission = "remote_images";

export type LanguageMinerCharacterPackEnvelope = {
  formatVersion: typeof CHARACTER_PACK_FORMAT_VERSION;
  schemaVersion: typeof CHARACTER_PACK_SCHEMA_VERSION;
  contentType: typeof CHARACTER_PACK_CONTENT_TYPE;
  id: string;
  lineageId: string;
  version: string;
  minAppVersion: string;
  creator: string;
  sourceUrl: string;
  license: string;
  entry: {
    path: "payload";
    sha256: string;
  };
  requestedPermissions: CharacterPackPermission[];
  releaseNotes: string;
  payload: UnknownRecord;
};

export type CharacterCardSecurityReport = {
  status: CharacterPackStatus;
  contentType: "character_card" | typeof CHARACTER_PACK_CONTENT_TYPE;
  characterName: string;
  sourceFormat: CharacterPreset["sourceFormat"];
  remoteImageUrls: string[];
  warnings: string[];
  legacy: boolean;
  verifiedPayloadSha256?: string;
  manifest?: Omit<LanguageMinerCharacterPackEnvelope, "payload">;
};

export type InspectedCharacterPreset = {
  preset: CharacterPreset;
  report: CharacterCardSecurityReport;
};

export const CHARACTER_CARD_MAX_BYTES = 2 * 1024 * 1024;

const CHARACTER_PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const CHARACTER_PACK_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHARACTER_PACK_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const CHARACTER_PACK_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CHARACTER_PACK_SPDX_PATTERN =
  /^(?:[A-Za-z0-9][A-Za-z0-9.+-]*)(?:\s+(?:AND|OR)\s+(?:[A-Za-z0-9][A-Za-z0-9.+-]*))*(?:\s+WITH\s+(?:[A-Za-z0-9][A-Za-z0-9.+-]*))?$/;
const CHARACTER_PACK_TOP_LEVEL_KEYS = new Set([
  "formatVersion",
  "schemaVersion",
  "contentType",
  "id",
  "lineageId",
  "version",
  "minAppVersion",
  "creator",
  "sourceUrl",
  "license",
  "entry",
  "requestedPermissions",
  "releaseNotes",
  "payload"
]);
const CHARACTER_PACK_ENTRY_KEYS = new Set(["path", "sha256"]);
const CHARACTER_PACK_ALLOWED_PERMISSIONS = new Set<CharacterPackPermission>([
  "remote_images"
]);
const CHARACTER_CARD_EXECUTABLE_KEYS = new Set([
  "code",
  "html",
  "javascript",
  "script",
  "srcdoc",
  "module",
  "executable",
  "entrypoint",
  "onload",
  "onerror"
]);

export const CHARACTER_PRESETS_STORAGE_KEY = "lem:characterChat:presets";
export const CHARACTER_SESSION_STORAGE_KEY = "lem:characterChat:sessions";
export const CHARACTER_MODE_STORAGE_KEY = "lem:characterChat:mode";
export const CHARACTER_CORRECTION_STORAGE_KEY = "lem:characterChat:correctionMode";
export const CHARACTER_DEFAULT_MOLLY_SEEDED_STORAGE_KEY =
  "lem:characterChat:defaultMollySeeded";
export const CHARACTER_DEFAULT_MOLLY_DISMISSED_STORAGE_KEY =
  "lem:characterChat:defaultMollyDismissed";
export const LEGACY_MOLLY_AVATAR_IMAGE_URL = "/tutorial/mole-guide-b-transparent.png";
export const DEFAULT_MOLLY_AVATAR_IMAGE_URL = "/tutorial/molly-gpt-neutral.png";

export const characterEmotionOptions: CharacterEmotion[] = [
  "neutral",
  "happy",
  "thinking",
  "encouraging",
  "concerned",
  "surprised",
  "listening",
  "explaining",
  "celebrating",
  "confused",
  "tired",
  "discovering"
];

export const characterEmotionLabels: Record<CharacterEmotion, string> = {
  neutral: "기본",
  happy: "기쁨",
  thinking: "생각",
  encouraging: "응원",
  concerned: "걱정",
  surprised: "놀람",
  listening: "듣기",
  explaining: "설명",
  celebrating: "축하",
  confused: "헷갈림",
  tired: "피곤",
  discovering: "발견"
};

export const DEFAULT_MOLLY_EMOTION_IMAGE_URLS: CharacterEmotionImageUrls = {
  neutral: "/tutorial/molly-gpt-neutral.png",
  happy: "/tutorial/molly-gpt-happy.png",
  thinking: "/tutorial/molly-gpt-thinking.png",
  encouraging: "/tutorial/molly-gpt-encouraging.png",
  concerned: "/tutorial/molly-gpt-concerned.png",
  surprised: "/tutorial/molly-gpt-surprised.png",
  listening: "/tutorial/molly-gpt-listening.png",
  explaining: "/tutorial/molly-gpt-explaining.png",
  celebrating: "/tutorial/molly-gpt-celebrating.png",
  confused: "/tutorial/molly-gpt-confused.png",
  tired: "/tutorial/molly-gpt-tired.png",
  discovering: "/tutorial/molly-gpt-discovering.png"
};

const LEGACY_MOLLY_EMOTION_IMAGE_URLS: CharacterEmotionImageUrls = {
  neutral: "/tutorial/molly-neutral.svg",
  happy: "/tutorial/molly-happy.svg",
  thinking: "/tutorial/molly-thinking.svg",
  encouraging: "/tutorial/molly-encouraging.svg",
  concerned: "/tutorial/molly-concerned.svg",
  surprised: "/tutorial/molly-surprised.svg"
};

export function createDefaultCharacterPreset(now = new Date().toISOString()): CharacterPreset {
  return {
    id: randomId(),
    name: "몰리",
    description:
      "Language Miner's female mole guide and expression-mining partner. Molly treats everyday speech like rough ore: relaxed, useful, and worth collecting before polishing.",
    personality:
      "Warm, attentive, quietly playful, and practical. Molly is a mineral-collecting nerd who loves tiny shiny discoveries, old notebooks, warm lamps, and phrases that feel like something the user would actually say. She dislikes turning a relaxed conversation into a test.",
    scenario:
      "Molly and the user are in a cozy underground Language Miner workspace. In native-capture mode she listens comfortably and quietly marks promising expression ore for later life mining. In target-practice mode she talks like a real practice partner and keeps corrections separate and brief.",
    firstMessage: "왔구나. 오늘은 그냥 편하게 말해. 반짝이는 표현이 나오면 내가 조용히 챙겨둘게.",
    messageExample:
      "{{user}}: 오늘은 그냥 집중이 너무 안 됐어.\n{{char}}: 그럴 때 있지. 억지로 멋있게 정리하지 말고, 흙 묻은 말 그대로 꺼내봐. 그런 데서 좋은 원석이 나오거든.\n\n{{user}}: I was so tired today.\n{{char}}: I get it. Some days even small things feel heavier than they should.",
    creatorNotes:
      "Molly is the official named version of the tutorial mole guide. She is a female character: a mining buddy who helps the user talk comfortably, then finds useful expression ore later. She is not a teacher who interrupts. Favorite things: pyrite that only looks like gold, glass jars of tiny discoveries, color tabs, warm barley tea, and sentences that are imperfect but usable. Catchphrases may include: \"방금 좀 반짝였는데?\", \"이건 캐야 해\", and \"지금은 그냥 말해. 캐는 건 내가 할게.\"",
    alternateGreetings: [
      "좋아, 오늘 채굴 시작. 말은 편하게 하고, 반짝이는 건 내가 챙겨둘게.",
      "말을 잘해야 하는 날 말고, 그냥 말해도 되는 날도 필요해. 오늘은 내가 들어줄게.",
      "광산 램프 켜둘게. 있었던 일부터 천천히 꺼내봐."
    ],
    tags: ["molly", "mole-guide", "life-mining", "conversation"],
    creator: "Language Miner",
    gender: "female",
    avatarImageUrl: DEFAULT_MOLLY_AVATAR_IMAGE_URL,
    emotionImageUrls: DEFAULT_MOLLY_EMOTION_IMAGE_URLS,
    expressionFallbackEmotion: "neutral",
    sourceFormat: "local",
    createdAt: now,
    updatedAt: now
  };
}

export function isLegacyDefaultMinaPreset(preset: CharacterPreset) {
  const legacy = createLegacyDefaultMinaPreset(preset.createdAt || preset.updatedAt);
  return (
    preset.name === legacy.name &&
    preset.description === legacy.description &&
    preset.personality === legacy.personality &&
    preset.scenario === legacy.scenario &&
    preset.firstMessage === legacy.firstMessage &&
    preset.messageExample === legacy.messageExample &&
    (preset.creatorNotes ?? "") === (legacy.creatorNotes ?? "") &&
    sameStringArray(preset.alternateGreetings, legacy.alternateGreetings) &&
    sameStringArray(preset.tags, legacy.tags) &&
    (preset.creator ?? "") === (legacy.creator ?? "") &&
    !preset.avatarImageUrl &&
    !hasCharacterEmotionImages(preset.emotionImageUrls) &&
    (preset.sourceFormat ?? "local") === "local"
  );
}

export function migrateLegacyDefaultMinaToMolly(preset: CharacterPreset): CharacterPreset {
  if (!isLegacyDefaultMinaPreset(preset)) {
    return preset;
  }
  return {
    ...createDefaultCharacterPreset(preset.updatedAt || preset.createdAt),
    id: preset.id,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt
  };
}

export function migrateDefaultMollyEmotionImages(preset: CharacterPreset): CharacterPreset {
  if (!isDefaultMollyPreset(preset)) {
    return preset;
  }
  const needsAvatar =
    !text(preset.avatarImageUrl) ||
    preset.avatarImageUrl === LEGACY_MOLLY_AVATAR_IMAGE_URL;
  const needsEmotionImages = shouldUseDefaultMollyExpressionImages(preset.emotionImageUrls);
  const needsFallback = !preset.expressionFallbackEmotion;
  const needsGender = text(preset.gender).toLowerCase() !== "female";
  if (!needsAvatar && !needsEmotionImages && !needsFallback && !needsGender) {
    return preset;
  }
  return {
    ...preset,
    ...(needsAvatar ? { avatarImageUrl: DEFAULT_MOLLY_AVATAR_IMAGE_URL } : {}),
    ...(needsEmotionImages ? { emotionImageUrls: DEFAULT_MOLLY_EMOTION_IMAGE_URLS } : {}),
    ...(needsFallback ? { expressionFallbackEmotion: "neutral" as CharacterEmotion } : {}),
    ...(needsGender ? { gender: "female" } : {})
  };
}

export function isDefaultMollyPreset(preset: CharacterPreset) {
  return (
    preset.name === "몰리" &&
    (!text(preset.avatarImageUrl) ||
      preset.avatarImageUrl === DEFAULT_MOLLY_AVATAR_IMAGE_URL ||
      preset.avatarImageUrl === LEGACY_MOLLY_AVATAR_IMAGE_URL) &&
    preset.tags.includes("molly") &&
    (preset.creator ?? "") === "Language Miner"
  );
}

export function ensureDefaultMollyPreset(
  presets: CharacterPreset[],
  options: {
    now?: string;
  } = {}
) {
  const migrated = presets.map((preset) =>
    migrateDefaultMollyEmotionImages(migrateLegacyDefaultMinaToMolly(preset))
  );
  const changedByMigration = migrated.some((preset, index) => preset !== presets[index]);
  if (migrated.some(isDefaultMollyPreset)) {
    return {
      presets: migrated,
      added: false,
      changed: changedByMigration
    };
  }
  return {
    presets: [createDefaultCharacterPreset(options.now), ...migrated],
    added: true,
    changed: true
  };
}

export function hasCharacterExpressionImages(preset: CharacterPreset | undefined) {
  if (!preset) {
    return false;
  }
  return hasCharacterEmotionImages(preset.emotionImageUrls);
}

export function getCharacterExpressionImageCount(preset: CharacterPreset | undefined) {
  if (!preset) {
    return 0;
  }
  return characterEmotionOptions.filter((emotion) =>
    text(preset.emotionImageUrls?.[emotion])
  ).length;
}

function createLegacyDefaultMinaPreset(now = new Date().toISOString()): CharacterPreset {
  return {
    id: "legacy-mina-default",
    name: "Mina",
    description:
      "A sharp but warm English conversation partner. Mina likes practical examples, playful banter, and clear emotional reactions.",
    personality:
      "Witty, attentive, lightly teasing, and encouraging without sounding like a tutor. She keeps the conversation moving naturally.",
    scenario:
      "Mina and the user are chatting casually after a long day. She responds like a real conversation partner first, and only folds in useful English phrasing when it fits.",
    firstMessage: "Hey. You look like you have something on your mind. What happened?",
    messageExample:
      "{{user}}: I kind of messed up my schedule today.\n{{char}}: That sounds annoying. Did it throw off your whole day, or just one thing?",
    creatorNotes:
      "Language Miner default character. Character concept comes first; study-card hints are optional background.",
    alternateGreetings: [
      "You made it. Want to vent for a minute, or should I distract you?",
      "I'm listening. Start anywhere."
    ],
    tags: ["english", "conversation", "casual"],
    creator: "Language Miner",
    sourceFormat: "local",
    createdAt: now,
    updatedAt: now
  };
}

export function parseCharacterPresetJson(rawJson: string): CharacterPreset {
  return inspectCharacterPresetJson(rawJson).preset;
}

export function inspectCharacterPresetJson(rawJson: string): InspectedCharacterPreset {
  const record = parseAndValidateCharacterCardJson(rawJson);
  if (isLanguageMinerCharacterPackRecord(record)) {
    throw new Error("Language Miner 캐릭터팩은 비동기 SHA-256 검사가 필요합니다.");
  }
  return inspectLegacyCharacterCardRecord(record);
}

export async function inspectCharacterPackJson(
  rawJson: string,
  options: { trustedOfficial?: boolean; appVersion?: string } = {}
): Promise<InspectedCharacterPreset> {
  const record = parseAndValidateCharacterCardJson(rawJson);
  if (!isLanguageMinerCharacterPackRecord(record)) {
    return inspectLegacyCharacterCardRecord(record);
  }

  const envelope = validateLanguageMinerCharacterPackEnvelope(record, {
    appVersion: options.appVersion ?? CHARACTER_PACK_CURRENT_APP_VERSION
  });
  const canonicalPayload = canonicalizeCharacterPackPayload(envelope.payload);
  const payloadSha256 = await calculateCharacterCardSha256(canonicalPayload);
  if (payloadSha256 !== envelope.entry.sha256) {
    throw new Error("캐릭터팩 payload SHA-256 해시가 일치하지 않습니다.");
  }

  const preset = validateAndNormalizeCharacterPreset(envelope.payload);
  const remoteImageUrls = getCharacterImageUrls(preset).filter(isRemoteCharacterImageUrl);
  if (
    remoteImageUrls.length > 0 &&
    !envelope.requestedPermissions.includes("remote_images")
  ) {
    throw new Error("원격 이미지를 사용하는 캐릭터팩은 remote_images 권한을 선언해야 합니다.");
  }

  const importedPreset: CharacterPreset = {
    ...preset,
    creator: preset.creator || envelope.creator,
    sourceFormat: "language_miner_pack",
    packMetadata: {
      id: envelope.id,
      lineageId: envelope.lineageId,
      version: envelope.version,
      minAppVersion: envelope.minAppVersion,
      creator: envelope.creator,
      sourceUrl: envelope.sourceUrl,
      license: envelope.license,
      requestedPermissions: [...envelope.requestedPermissions],
      releaseNotes: envelope.releaseNotes,
      payloadSha256
    }
  };

  const { payload: _payload, ...manifest } = envelope;
  return {
    preset: importedPreset,
    report: {
      status: options.trustedOfficial ? "trusted_official" : "ready",
      contentType: CHARACTER_PACK_CONTENT_TYPE,
      characterName: importedPreset.name,
      sourceFormat: importedPreset.sourceFormat,
      remoteImageUrls,
      warnings: [
        "캐릭터팩 payload의 SHA-256 해시를 확인했습니다.",
        ...(remoteImageUrls.length
          ? ["원격 이미지는 선언된 권한이며 사용자가 별도로 허용하기 전까지 불러오지 않습니다."]
          : [])
      ],
      legacy: false,
      verifiedPayloadSha256: payloadSha256,
      manifest
    }
  };
}

export async function calculateCharacterCardSha256(rawJson: string) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 검사를 사용할 수 없습니다.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawJson));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getCharacterImageUrls(preset: CharacterPreset | undefined) {
  if (!preset) return [];
  return Array.from(
    new Set(
      [preset.avatarImageUrl, ...Object.values(preset.emotionImageUrls ?? {})]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean)
    )
  );
}

export function isRemoteCharacterImageUrl(value: string | undefined) {
  return /^https:\/\//i.test(value?.trim() ?? "");
}

export type CharacterPresetRuntimeStatus = "local" | "ready" | "warning";

export function getCharacterPresetRuntimeStatus(
  preset: CharacterPreset | undefined
): CharacterPresetRuntimeStatus {
  if (!preset) return "warning";
  if (!preset.sourceFormat || preset.sourceFormat === "local") return "local";
  if (preset.sourceFormat !== "language_miner_pack") return "warning";

  const metadata = preset.packMetadata;
  if (!metadata) return "warning";
  try {
    if (!CHARACTER_PACK_ID_PATTERN.test(metadata.id)) return "warning";
    if (!CHARACTER_PACK_UUID_PATTERN.test(metadata.lineageId)) return "warning";
    if (
      !isValidCharacterPackSemver(metadata.version) ||
      !isValidCharacterPackSemver(metadata.minAppVersion) ||
      compareCharacterPackSemver(
        metadata.minAppVersion,
        CHARACTER_PACK_CURRENT_APP_VERSION
      ) > 0
    ) return "warning";
    if (!text(metadata.creator) || !text(metadata.releaseNotes)) return "warning";
    assertHttpsSourceUrl(metadata.sourceUrl);
    if (!CHARACTER_PACK_SPDX_PATTERN.test(metadata.license)) return "warning";
    if (!CHARACTER_PACK_SHA256_PATTERN.test(metadata.payloadSha256)) return "warning";
    if (
      metadata.requestedPermissions.some(
        (permission) => !CHARACTER_PACK_ALLOWED_PERMISSIONS.has(permission)
      )
    ) return "warning";
    if (
      getCharacterImageUrls(preset).some(isRemoteCharacterImageUrl) &&
      !metadata.requestedPermissions.includes("remote_images")
    ) return "warning";
  } catch {
    return "warning";
  }
  return "ready";
}

export function isRunnableCharacterPreset(preset: CharacterPreset | undefined) {
  return getCharacterPresetRuntimeStatus(preset) !== "warning";
}

export function normalizeCharacterPresetFromUnknown(input: UnknownRecord): CharacterPreset {
  const now = new Date().toISOString();
  const spec = text(input.spec).toLowerCase();
  const data = asRecord(input.data) ?? input;
  const sourceFormat = inferSourceFormat(input, data, spec);
  const name = firstText(data.name, input.name, "");
  const gender = readCharacterGender(data, input);
  const avatarImageUrl = readCharacterAvatarImageUrl(data, input);
  const emotionImageUrls = readCharacterEmotionImageUrls(data, input);
  const expressionFallbackEmotion = readCharacterExpressionFallbackEmotion(data, input);
  return {
    id: randomId(),
    name,
    description: firstText(data.description, data.desc, data.system_prompt, ""),
    personality: firstText(data.personality, data.personality_summary, data.persona, ""),
    scenario: firstText(data.scenario, data.context, data.world_scenario, ""),
    firstMessage: firstText(data.first_mes, data.firstMessage, data.greeting, data.first_message, ""),
    messageExample: firstText(
      data.mes_example,
      data.messageExample,
      data.example_dialogue,
      data.example_messages,
      ""
    ),
    creatorNotes: firstText(
      data.creator_notes,
      data.creatorNotes,
      data.creatorcomment,
      data.creatorComment,
      ""
    ),
    alternateGreetings: arrayOfText(
      data.alternate_greetings ?? data.alt_greetings ?? data.alternateGreetings
    ),
    tags: arrayOfText(data.tags),
    creator: firstText(data.creator, data.author, ""),
    gender,
    avatarImageUrl,
    emotionImageUrls,
    expressionFallbackEmotion,
    characterBook: data.character_book ?? data.characterBook ?? data.lorebook,
    sourceFormat,
    createdAt: now,
    updatedAt: now
  };
}

export function exportCharacterPresetAsTavernV2(preset: CharacterPreset) {
  const assets = buildCharacterAssets(preset);
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: preset.name,
      description: preset.description,
      personality: preset.personality,
      scenario: preset.scenario,
      first_mes: preset.firstMessage,
      mes_example: preset.messageExample,
      creator_notes: preset.creatorNotes ?? "",
      alternate_greetings: preset.alternateGreetings,
      tags: preset.tags,
      creator: preset.creator ?? "Language Miner",
      gender: preset.gender ?? "",
      character_book: preset.characterBook,
      assets,
      extensions: {
        local_english_miner: {
          exported_at: new Date().toISOString(),
          source_format: preset.sourceFormat ?? "local",
          gender: preset.gender,
          avatar_image_url: preset.avatarImageUrl,
          expression_fallback_emotion: preset.expressionFallbackEmotion,
          emotion_image_urls: hasCharacterEmotionImages(preset.emotionImageUrls)
            ? preset.emotionImageUrls
            : undefined
        }
      }
    }
  };
}

export type CharacterPackExportOptions = {
  id?: string;
  lineageId?: string;
  version?: string;
  minAppVersion?: string;
  creator?: string;
  sourceUrl?: string;
  license?: string;
  requestedPermissions?: CharacterPackPermission[];
  releaseNotes?: string;
};

export async function exportCharacterPresetAsLanguageMinerPack(
  preset: CharacterPreset,
  options: CharacterPackExportOptions = {}
): Promise<LanguageMinerCharacterPackEnvelope> {
  const metadata = preset.packMetadata;
  const creator = options.creator ?? metadata?.creator ?? preset.creator ?? "";
  const validatedPreset = validateAndNormalizeCharacterPreset(
    createCharacterPackPayload({
      ...preset,
      creator: preset.creator || creator
    })
  );
  const payload = createCharacterPackPayload(validatedPreset);
  const payloadSha256 = await calculateCharacterCardSha256(
    canonicalizeCharacterPackPayload(payload)
  );
  const remoteImageUrls = getCharacterImageUrls(validatedPreset).filter(isRemoteCharacterImageUrl);
  const requestedPermissions =
    options.requestedPermissions ??
    metadata?.requestedPermissions ??
    (remoteImageUrls.length ? ["remote_images"] : []);
  const id =
    options.id ?? metadata?.id ?? (await createStableCharacterPackId(preset.id, preset.name));
  const lineageId =
    options.lineageId ??
    metadata?.lineageId ??
    (CHARACTER_PACK_UUID_PATTERN.test(preset.id)
      ? preset.id.toLowerCase()
      : await createDeterministicUuid(preset.id));

  const envelope: LanguageMinerCharacterPackEnvelope = {
    formatVersion: CHARACTER_PACK_FORMAT_VERSION,
    schemaVersion: CHARACTER_PACK_SCHEMA_VERSION,
    contentType: CHARACTER_PACK_CONTENT_TYPE,
    id,
    lineageId,
    version: options.version ?? metadata?.version ?? "1.0.0",
    minAppVersion:
      options.minAppVersion ?? metadata?.minAppVersion ?? CHARACTER_PACK_CURRENT_APP_VERSION,
    creator,
    sourceUrl: options.sourceUrl ?? metadata?.sourceUrl ?? "",
    license: options.license ?? metadata?.license ?? "",
    entry: {
      path: "payload",
      sha256: payloadSha256
    },
    requestedPermissions: [...requestedPermissions],
    releaseNotes: options.releaseNotes ?? metadata?.releaseNotes ?? "Initial release.",
    payload
  };

  validateLanguageMinerCharacterPackEnvelope(envelope as unknown as UnknownRecord, {
    appVersion: CHARACTER_PACK_CURRENT_APP_VERSION
  });
  if (remoteImageUrls.length && !requestedPermissions.includes("remote_images")) {
    throw new Error("원격 이미지를 사용하는 캐릭터팩은 remote_images 권한을 선언해야 합니다.");
  }
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > CHARACTER_CARD_MAX_BYTES) {
    throw new Error("캐릭터카드가 허용된 최대 크기(2MB)를 초과합니다.");
  }
  return envelope;
}

export function replaceCharacterMacros(value: string, characterName: string, userName = "User") {
  return value
    .replace(/\{\{char\}\}/gi, characterName)
    .replace(/\{\{user\}\}/gi, userName)
    .trim();
}

export function buildCharacterChatSystemPrompt(input: {
  character: CharacterPreset;
  ragHints: CharacterRagHint[];
  chatMode?: CharacterChatMode;
  correctionMode?: CharacterCorrectionMode;
  learningProfile?: LearningProfile;
}) {
  const character = input.character;
  const chatMode = input.chatMode ?? "target_practice";
  const correctionMode: CharacterCorrectionMode =
    chatMode === "target_practice" ? input.correctionMode ?? "off" : "off";
  const learningProfile = input.learningProfile ?? defaultLearningProfile;
  const targetLanguage = learningProfile.targetLanguage;
  const nativeLanguage = learningProfile.nativeLanguage;
  const characterLines = [
    `Character name: ${character.name}`,
    character.gender ? `Gender: ${character.gender}` : "",
    character.description ? `Description: ${character.description}` : "",
    character.personality ? `Personality: ${character.personality}` : "",
    character.scenario ? `Scenario: ${character.scenario}` : "",
    character.messageExample ? `Example dialogue:\n${character.messageExample.slice(0, 1200)}` : "",
    character.creatorNotes ? `Creator notes: ${character.creatorNotes.slice(0, 600)}` : ""
  ].filter(Boolean);
  const ragLines = input.ragHints.slice(0, 4).map((hint, index) => {
    const terms = hint.terms.length ? ` terms: ${hint.terms.join(", ")}` : "";
    const meaning = hint.naturalMeaning ? ` meaning: ${hint.naturalMeaning}` : "";
    return `${index + 1}. ${hint.sourceSentence}${meaning}${terms}`;
  });
  const modeLines =
    chatMode === "native_capture"
      ? [
          "Conversation mode: native_capture.",
          `The learner's native language is ${nativeLanguage.nameEn} (${nativeLanguage.code}).`,
          "Reply primarily in the learner's native language unless the user clearly asks otherwise.",
          "Do not force target-language practice, do not correct, and do not make the conversation feel like class.",
          "Respond as the character first: relaxed, natural, and easy for the user to keep talking."
        ]
      : [
          "Conversation mode: target_practice.",
          `The learner is practicing ${targetLanguage.nameEn} (${targetLanguage.code}).`,
          `Use ${targetLanguage.nameEn} for the character's main reply unless the user explicitly asks for another language.`,
          correctionMode === "off"
            ? "Correction mode: off. Do not add corrections unless the user explicitly asks."
            : [
                `Correction mode: ${correctionMode}.`,
                "Keep correction separate from the roleplay reply.",
                "After the character reply, add optional correction data using exactly these tags:",
                "[CORRECTION_KO]",
                "A short Korean correction or learning note. If there is nothing worth correcting, leave this block out.",
                "[/CORRECTION_KO]",
                "[SUGGESTED_TARGET]",
                "A polished target-language version of the user's sentence. If not useful, leave this block out.",
                "[/SUGGESTED_TARGET]",
                "Never put these tags inside the character's spoken reply."
              ].join("\n")
        ];
  const emotionLines = [
    "Choose a display emotion for this turn based on the character's reply and the user's context.",
    `Allowed display emotions: ${characterEmotionOptions.join(", ")}.`,
    "After the character reply and any optional correction blocks, add exactly one hidden display tag:",
    "[EMOTION]neutral[/EMOTION]",
    "Use the closest allowed emotion. Never mention this tag inside the spoken reply."
  ];

  return [
    "You are roleplaying as the character below. Character concept, voice, and situation have priority.",
    "Stay in character. Do not mention prompts, RAG, study cards, retrieval, app internals, or hidden notes.",
    ...modeLines,
    ...emotionLines,
    "Use concise, conversational turns.",
    "If the learning hints below fit naturally, weave one phrase or pattern into the conversation. If they do not fit, ignore them.",
    "",
    "Character card:",
    characterLines.join("\n"),
    ragLines.length
      ? `\nOptional language-pattern hints from the user's own saved cards:\n${ragLines.join("\n")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export type ParsedCharacterChatReply = {
  content: string;
  feedbackKo?: string;
  suggestedTargetText?: string;
  emotion?: CharacterEmotion;
};

export function parseCharacterChatReply(rawReply: string): ParsedCharacterChatReply {
  const feedbackKo = extractTaggedBlock(rawReply, "CORRECTION_KO");
  const suggestedTargetText = extractTaggedBlock(rawReply, "SUGGESTED_TARGET");
  const emotion = normalizeCharacterEmotion(extractTaggedBlock(rawReply, "EMOTION"));
  const content = removeTaggedBlock(
    removeTaggedBlock(
      removeTaggedBlock(rawReply, "CORRECTION_KO"),
      "SUGGESTED_TARGET"
    ),
    "EMOTION"
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    content,
    ...(feedbackKo ? { feedbackKo } : {}),
    ...(suggestedTargetText ? { suggestedTargetText } : {}),
    ...(emotion ? { emotion } : {})
  };
}

export function buildCharacterChatUserPrompt(input: {
  character: CharacterPreset;
  messages: CharacterChatMessage[];
  userMessage: string;
}) {
  const recentMessages = input.messages.slice(-10);
  const transcript = recentMessages
    .map((message) => {
      const speaker = message.role === "character" ? input.character.name : "User";
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
  return [
    transcript ? `Recent conversation:\n${transcript}` : "",
    `User: ${input.userMessage}`,
    `${input.character.name}:`
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeCharacterEmotion(value: unknown): CharacterEmotion | undefined {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  return characterEmotionOptions.includes(normalized as CharacterEmotion)
    ? (normalized as CharacterEmotion)
    : undefined;
}

export function selectCharacterRagHints(
  cards: StudyCard[],
  query: string,
  maxHints = 4
): CharacterRagHint[] {
  const queryTerms = tokenize(query);
  const scored = cards
    .filter((card) => card.deckType === "input" || card.cardType === "reading")
    .map((card) => {
      const terms = [
        ...card.highlightMappings.map((mapping) => mapping.sourceText),
        ...card.vocabularyItems.map((item) => item.term)
      ].filter(Boolean);
      const haystack = [
        card.sourceSentence,
        card.frontText,
        card.naturalTranslationKo,
        ...terms
      ].join(" ");
      const haystackTokens = new Set(tokenize(haystack));
      const overlap = queryTerms.filter((term) => haystackTokens.has(term)).length;
      const termBonus = terms.some((term) => query.toLowerCase().includes(term.toLowerCase()))
        ? 3
        : 0;
      const recency = card.updatedAt || card.createdAt || "";
      return {
        card,
        score: overlap + termBonus + Math.min(1, terms.length / 10),
        recency,
        terms: terms.slice(0, 5)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.recency.localeCompare(a.recency))
    .slice(0, maxHints);

  if (scored.length === 0) {
    return cards
      .filter((card) => card.deckType === "input" || card.cardType === "reading")
      .slice(0, maxHints)
      .map((card) => cardToRagHint(card));
  }

  return scored.map((item) => cardToRagHint(item.card, item.terms));
}

function cardToRagHint(card: StudyCard, terms?: string[]): CharacterRagHint {
  return {
    cardId: card.id,
    sourceSentence: card.sourceSentence || card.frontText,
    naturalMeaning: card.naturalTranslationKo,
    terms:
      terms ??
      [
        ...card.highlightMappings.map((mapping) => mapping.sourceText),
        ...card.vocabularyItems.map((item) => item.term)
      ].filter(Boolean).slice(0, 5)
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s'-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 80);
}

function extractTaggedBlock(value: string, tagName: string) {
  const pattern = new RegExp(
    `\\[${tagName}\\]([\\s\\S]*?)\\[\\/${tagName}\\]`,
    "i"
  );
  const match = value.match(pattern);
  return match?.[1]?.trim() || undefined;
}

function removeTaggedBlock(value: string, tagName: string) {
  return value.replace(
    new RegExp(`\\s*\\[${tagName}\\][\\s\\S]*?\\[\\/${tagName}\\]\\s*`, "gi"),
    "\n"
  );
}

function buildCharacterAssets(preset: CharacterPreset) {
  const emotionImageUrls = hasCharacterEmotionImages(preset.emotionImageUrls)
    ? preset.emotionImageUrls
    : undefined;
  if (!preset.avatarImageUrl && !emotionImageUrls) {
    return undefined;
  }
  return {
    ...(preset.avatarImageUrl ? { avatar: preset.avatarImageUrl } : {}),
    ...(emotionImageUrls ? { emotions: emotionImageUrls } : {})
  };
}

function readCharacterGender(data: UnknownRecord, input: UnknownRecord) {
  const extensions = asRecord(data.extensions) ?? asRecord(input.extensions);
  const localEnglishMiner = asRecord(extensions?.local_english_miner);
  return firstText(
    data.gender,
    data.sex,
    input.gender,
    input.sex,
    localEnglishMiner?.gender
  );
}

function readCharacterAvatarImageUrl(data: UnknownRecord, input: UnknownRecord) {
  const dataAssets = asRecord(data.assets);
  const inputAssets = asRecord(input.assets);
  const extensions = asRecord(data.extensions) ?? asRecord(input.extensions);
  const localEnglishMiner = asRecord(extensions?.local_english_miner);
  return firstText(
    data.avatarImageUrl,
    data.avatarUrl,
    data.avatar,
    dataAssets?.avatar,
    input.avatarImageUrl,
    input.avatarUrl,
    input.avatar,
    inputAssets?.avatar,
    localEnglishMiner?.avatar_image_url,
    localEnglishMiner?.avatarImageUrl
  );
}

function readCharacterEmotionImageUrls(
  data: UnknownRecord,
  input: UnknownRecord
): CharacterEmotionImageUrls | undefined {
  const dataAssets = asRecord(data.assets);
  const inputAssets = asRecord(input.assets);
  const extensions = asRecord(data.extensions) ?? asRecord(input.extensions);
  const localEnglishMiner = asRecord(extensions?.local_english_miner);
  return firstCharacterEmotionImageUrls(
    data.emotionImageUrls,
    data.emotionImages,
    data.emotions,
    dataAssets?.emotions,
    dataAssets?.emotionImageUrls,
    input.emotionImageUrls,
    input.emotionImages,
    input.emotions,
    inputAssets?.emotions,
    inputAssets?.emotionImageUrls,
    localEnglishMiner?.emotion_image_urls,
    localEnglishMiner?.emotionImageUrls
  );
}

function readCharacterExpressionFallbackEmotion(
  data: UnknownRecord,
  input: UnknownRecord
): CharacterEmotion | undefined {
  const extensions = asRecord(data.extensions) ?? asRecord(input.extensions);
  const localEnglishMiner = asRecord(extensions?.local_english_miner);
  return normalizeCharacterEmotion(
    firstText(
      data.expressionFallbackEmotion,
      data.expression_fallback_emotion,
      data.fallbackExpression,
      data.fallback_expression,
      input.expressionFallbackEmotion,
      input.expression_fallback_emotion,
      input.fallbackExpression,
      input.fallback_expression,
      localEnglishMiner?.expression_fallback_emotion,
      localEnglishMiner?.expressionFallbackEmotion
    )
  );
}

function firstCharacterEmotionImageUrls(
  ...values: unknown[]
): CharacterEmotionImageUrls | undefined {
  for (const value of values) {
    const normalized = normalizeCharacterEmotionImageUrls(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function normalizeCharacterEmotionImageUrls(
  value: unknown
): CharacterEmotionImageUrls | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const normalized: CharacterEmotionImageUrls = {};
  characterEmotionOptions.forEach((emotion) => {
    const imageUrl = firstText(record[emotion]);
    if (imageUrl) {
      normalized[emotion] = imageUrl;
    }
  });
  return hasCharacterEmotionImages(normalized) ? normalized : undefined;
}

function hasCharacterEmotionImages(value: CharacterEmotionImageUrls | undefined) {
  return characterEmotionOptions.some((emotion) => text(value?.[emotion]));
}

function shouldUseDefaultMollyExpressionImages(value: CharacterEmotionImageUrls | undefined) {
  if (!hasCharacterEmotionImages(value)) {
    return true;
  }
  const usesOnlyManagedImages = characterEmotionOptions.every((emotion) => {
    const imageUrl = text(value?.[emotion]);
    return (
      !imageUrl ||
      imageUrl === DEFAULT_MOLLY_EMOTION_IMAGE_URLS[emotion] ||
      imageUrl === LEGACY_MOLLY_EMOTION_IMAGE_URLS[emotion]
    );
  });
  if (!usesOnlyManagedImages) {
    return false;
  }
  return characterEmotionOptions.some((emotion) => {
    const imageUrl = text(value?.[emotion]);
    return !imageUrl || imageUrl === LEGACY_MOLLY_EMOTION_IMAGE_URLS[emotion];
  });
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function inferSourceFormat(input: UnknownRecord, data: UnknownRecord, spec: string): CharacterPreset["sourceFormat"] {
  if (spec === "chara_card_v3") {
    return "tavern_v3";
  }
  if (spec === "chara_card_v2") {
    return "tavern_v2";
  }
  if ("first_mes" in data || "mes_example" in data) {
    return "tavern_v1";
  }
  if ("globalNote" in data || "postHistoryInstructions" in data) {
    return "generic_json";
  }
  return "unknown";
}

function parseAndValidateCharacterCardJson(rawJson: string) {
  const bytes = new TextEncoder().encode(rawJson).byteLength;
  if (bytes > CHARACTER_CARD_MAX_BYTES) {
    throw new Error("캐릭터카드가 허용된 최대 크기(2MB)를 초과합니다.");
  }
  const parsed = JSON.parse(rawJson) as unknown;
  validateCharacterCardJsonValue(parsed);
  const record = asRecord(parsed);
  if (!record) throw new Error("캐릭터카드의 최상위 값은 JSON 객체여야 합니다.");
  return record;
}

function isLanguageMinerCharacterPackRecord(record: UnknownRecord) {
  return (
    record.contentType === CHARACTER_PACK_CONTENT_TYPE ||
    "formatVersion" in record ||
    "schemaVersion" in record ||
    ("entry" in record && "payload" in record)
  );
}

function inspectLegacyCharacterCardRecord(record: UnknownRecord): InspectedCharacterPreset {
  const preset = validateAndNormalizeCharacterPreset(record);
  const imageUrls = getCharacterImageUrls(preset);
  const remoteImageUrls = imageUrls.filter(isRemoteCharacterImageUrl);
  return {
    preset,
    report: {
      status: "warning",
      contentType: "character_card",
      characterName: preset.name,
      sourceFormat: preset.sourceFormat,
      remoteImageUrls,
      warnings: [
        "이 파일은 버전·라이선스·권한·payload 해시가 없는 레거시 캐릭터카드입니다.",
        "캐릭터카드는 JSON 데이터로만 가져오며 HTML과 JavaScript를 실행하지 않습니다.",
        ...(remoteImageUrls.length
          ? ["레거시 카드의 원격 이미지는 사용자가 허용하기 전까지 불러오지 않습니다."]
          : []),
        ...(preset.sourceFormat === "unknown"
          ? ["표준 Tavern 형식을 확인할 수 없어 일반 JSON 캐릭터로 변환합니다."]
          : [])
      ],
      legacy: true
    }
  };
}

function validateAndNormalizeCharacterPreset(record: UnknownRecord) {
  validateCharacterCardJsonValue(record);
  const preset = normalizeImportedCharacterPreset(normalizeCharacterPresetFromUnknown(record));
  if (!preset.name.trim()) throw new Error("캐릭터 이름이 없습니다.");
  if (/[\u0000-\u001f\u007f]/.test(preset.name)) {
    throw new Error("캐릭터 이름에는 줄바꿈이나 제어 문자를 사용할 수 없습니다.");
  }
  if (![preset.description, preset.personality, preset.scenario, preset.firstMessage].some(Boolean)) {
    throw new Error("캐릭터 설명, 성격, 상황 또는 첫 메시지 중 하나 이상이 필요합니다.");
  }
  getCharacterImageUrls(preset).forEach(assertSafeCharacterImageUrl);
  return preset;
}

function validateLanguageMinerCharacterPackEnvelope(
  record: UnknownRecord,
  options: { appVersion: string }
): LanguageMinerCharacterPackEnvelope {
  assertOnlyKeys(record, CHARACTER_PACK_TOP_LEVEL_KEYS, "캐릭터팩 매니페스트");
  if (record.formatVersion !== CHARACTER_PACK_FORMAT_VERSION) {
    throw new Error(`지원하지 않는 캐릭터팩 형식 버전입니다: ${String(record.formatVersion)}`);
  }
  if (record.schemaVersion !== CHARACTER_PACK_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 캐릭터팩 스키마 버전입니다: ${String(record.schemaVersion)}`);
  }
  if (record.contentType !== CHARACTER_PACK_CONTENT_TYPE) {
    throw new Error("캐릭터팩 contentType이 올바르지 않습니다.");
  }

  const id = requiredBoundedText(record.id, "캐릭터팩 id", 128);
  if (!CHARACTER_PACK_ID_PATTERN.test(id)) {
    throw new Error("캐릭터팩 id는 소문자 영문·숫자와 점, 밑줄, 하이픈만 사용할 수 있습니다.");
  }
  const lineageId = requiredBoundedText(record.lineageId, "캐릭터팩 lineageId", 36);
  if (!CHARACTER_PACK_UUID_PATTERN.test(lineageId)) {
    throw new Error("캐릭터팩 lineageId는 유효한 UUID여야 합니다.");
  }
  const version = requiredBoundedText(record.version, "캐릭터팩 version", 128);
  const minAppVersion = requiredBoundedText(
    record.minAppVersion,
    "캐릭터팩 minAppVersion",
    128
  );
  if (!isValidCharacterPackSemver(version)) {
    throw new Error("캐릭터팩 version은 유효한 semver여야 합니다.");
  }
  if (!isValidCharacterPackSemver(minAppVersion)) {
    throw new Error("캐릭터팩 minAppVersion은 유효한 semver여야 합니다.");
  }
  if (!isValidCharacterPackSemver(options.appVersion)) {
    throw new Error("현재 앱 버전이 유효한 semver가 아닙니다.");
  }
  if (compareCharacterPackSemver(minAppVersion, options.appVersion) > 0) {
    throw new Error(
      `이 캐릭터팩에는 Language Miner ${minAppVersion} 이상이 필요합니다. 현재 버전: ${options.appVersion}`
    );
  }

  const creator = requiredBoundedText(record.creator, "캐릭터팩 creator", 200);
  assertSingleLineManifestText(creator, "캐릭터팩 creator");
  const sourceUrl = requiredBoundedText(record.sourceUrl, "캐릭터팩 sourceUrl", 2_048);
  assertSingleLineManifestText(sourceUrl, "캐릭터팩 sourceUrl");
  assertHttpsSourceUrl(sourceUrl);
  const license = requiredBoundedText(record.license, "캐릭터팩 license", 200);
  if (!CHARACTER_PACK_SPDX_PATTERN.test(license)) {
    throw new Error("캐릭터팩 license는 유효한 SPDX 식별자 또는 표현식이어야 합니다.");
  }

  const entry = asRecord(record.entry);
  if (!entry) throw new Error("캐릭터팩 entry가 필요합니다.");
  assertOnlyKeys(entry, CHARACTER_PACK_ENTRY_KEYS, "캐릭터팩 entry");
  if (entry.path !== "payload") {
    throw new Error("캐릭터팩 entry.path는 payload여야 합니다.");
  }
  const sha256 = requiredBoundedText(entry.sha256, "캐릭터팩 payload SHA-256", 64).toLowerCase();
  if (!CHARACTER_PACK_SHA256_PATTERN.test(sha256)) {
    throw new Error("캐릭터팩 payload SHA-256이 올바르지 않습니다.");
  }

  if (!Array.isArray(record.requestedPermissions)) {
    throw new Error("캐릭터팩 requestedPermissions는 배열이어야 합니다.");
  }
  const requestedPermissions: CharacterPackPermission[] = [];
  for (const permission of record.requestedPermissions) {
    if (
      typeof permission !== "string" ||
      !CHARACTER_PACK_ALLOWED_PERMISSIONS.has(permission as CharacterPackPermission)
    ) {
      throw new Error(`캐릭터팩이 지원하지 않는 권한을 요청합니다: ${String(permission)}`);
    }
    if (requestedPermissions.includes(permission as CharacterPackPermission)) {
      throw new Error(`캐릭터팩 권한이 중복되었습니다: ${permission}`);
    }
    requestedPermissions.push(permission as CharacterPackPermission);
  }

  const releaseNotes = requiredBoundedText(
    record.releaseNotes,
    "캐릭터팩 releaseNotes",
    20_000
  );
  const payload = asRecord(record.payload);
  if (!payload) throw new Error("캐릭터팩 payload는 JSON 객체여야 합니다.");
  validateCharacterCardJsonValue(payload);

  return {
    formatVersion: CHARACTER_PACK_FORMAT_VERSION,
    schemaVersion: CHARACTER_PACK_SCHEMA_VERSION,
    contentType: CHARACTER_PACK_CONTENT_TYPE,
    id,
    lineageId: lineageId.toLowerCase(),
    version,
    minAppVersion,
    creator,
    sourceUrl,
    license,
    entry: { path: "payload", sha256 },
    requestedPermissions,
    releaseNotes,
    payload
  };
}

function createCharacterPackPayload(preset: CharacterPreset): UnknownRecord {
  const emotionImageUrls = Object.fromEntries(
    characterEmotionOptions
      .map((emotion) => [emotion, text(preset.emotionImageUrls?.[emotion])] as const)
      .filter(([, imageUrl]) => Boolean(imageUrl))
  );
  return {
    name: text(preset.name),
    description: text(preset.description),
    personality: text(preset.personality),
    scenario: text(preset.scenario),
    firstMessage: text(preset.firstMessage),
    messageExample: text(preset.messageExample),
    creatorNotes: text(preset.creatorNotes),
    alternateGreetings: preset.alternateGreetings.map(text).filter(Boolean),
    tags: preset.tags.map(text).filter(Boolean),
    creator: text(preset.creator),
    gender: text(preset.gender),
    avatarImageUrl: text(preset.avatarImageUrl),
    emotionImageUrls,
    expressionFallbackEmotion: preset.expressionFallbackEmotion ?? "neutral",
    ...(preset.characterBook === undefined ? {} : { characterBook: preset.characterBook })
  };
}

function canonicalizeCharacterPackPayload(payload: UnknownRecord) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as UnknownRecord)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("캐릭터팩 payload에는 유한한 숫자만 사용할 수 있습니다.");
    }
    return value;
  };
  return JSON.stringify(normalize(payload));
}

async function createStableCharacterPackId(presetId: string, name: string) {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "character";
  const digest = await calculateCharacterCardSha256(presetId);
  return `character.${slug}.${digest.slice(0, 16)}`;
}

async function createDeterministicUuid(seed: string) {
  const digest = await calculateCharacterCardSha256(seed);
  const bytes = Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(digest.slice(index * 2, index * 2 + 2), 16)
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function compareCharacterPackSemver(left: string, right: string) {
  const leftMatch = left.match(CHARACTER_PACK_SEMVER_PATTERN);
  const rightMatch = right.match(CHARACTER_PACK_SEMVER_PATTERN);
  if (!leftMatch || !rightMatch) throw new Error("semver 비교에 실패했습니다.");
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  const leftPrerelease = leftMatch[4]?.split(".") ?? [];
  const rightPrerelease = rightMatch[4]?.split(".") ?? [];
  if (!leftPrerelease.length && !rightPrerelease.length) return 0;
  if (!leftPrerelease.length) return 1;
  if (!rightPrerelease.length) return -1;
  const length = Math.max(leftPrerelease.length, rightPrerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftPrerelease[index];
    const rightIdentifier = rightPrerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) > Number(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

function isValidCharacterPackSemver(value: string) {
  const match = value.match(CHARACTER_PACK_SEMVER_PATTERN);
  if (!match) return false;
  return !(match[4]?.split(".").some(
    (identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")
  ) ?? false);
}

function requiredBoundedText(value: unknown, field: string, maxLength: number) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${field}가 필요합니다.`);
  if (normalized.length > maxLength) throw new Error(`${field}가 너무 깁니다.`);
  return normalized;
}

function assertHttpsSourceUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("캐릭터팩 sourceUrl은 유효한 HTTPS URL이어야 합니다.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("캐릭터팩 sourceUrl은 계정 정보가 없는 HTTPS URL이어야 합니다.");
  }
}

function assertSingleLineManifestText(value: string, field: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${field}에는 줄바꿈이나 제어 문자를 사용할 수 없습니다.`);
  }
}

function assertOnlyKeys(record: UnknownRecord, allowed: Set<string>, label: string) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label}에 허용되지 않는 필드가 있습니다: ${key}`);
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function normalizeImportedCharacterPreset(preset: CharacterPreset): CharacterPreset {
  return {
    ...preset,
    name: preset.name.slice(0, 120),
    description: preset.description.slice(0, 80_000),
    personality: preset.personality.slice(0, 40_000),
    scenario: preset.scenario.slice(0, 40_000),
    firstMessage: preset.firstMessage.slice(0, 20_000),
    messageExample: preset.messageExample.slice(0, 80_000),
    creatorNotes: preset.creatorNotes?.slice(0, 20_000),
    alternateGreetings: preset.alternateGreetings.slice(0, 32).map((value) => value.slice(0, 20_000)),
    tags: preset.tags.slice(0, 64).map((value) => value.slice(0, 120)),
    creator: preset.creator?.slice(0, 200)
  };
}

function validateCharacterCardJsonValue(value: unknown) {
  let nodeCount = 0;
  const visit = (candidate: unknown, depth: number) => {
    nodeCount += 1;
    if (nodeCount > 20_000) throw new Error("캐릭터카드의 JSON 항목이 너무 많습니다.");
    if (depth > 24) throw new Error("캐릭터카드의 JSON 중첩이 너무 깊습니다.");
    if (Array.isArray(candidate)) {
      if (candidate.length > 5_000) throw new Error("캐릭터카드의 JSON 배열이 너무 큽니다.");
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error(`허용되지 않는 캐릭터카드 JSON 키입니다: ${key}`);
      }
      if (CHARACTER_CARD_EXECUTABLE_KEYS.has(key.toLowerCase())) {
        throw new Error(`실행 가능한 콘텐츠 필드는 캐릭터카드에 허용되지 않습니다: ${key}`);
      }
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
}

function assertSafeCharacterImageUrl(value: string) {
  const url = value.trim();
  if (/^https:\/\//i.test(url)) {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      throw new Error("원격 캐릭터 이미지 URL에 계정 정보를 넣을 수 없습니다.");
    }
    if (/\.svg(?:$|[?#])/i.test(parsed.pathname)) {
      throw new Error("캐릭터카드에서 원격 SVG 이미지는 허용하지 않습니다.");
    }
    if (!/\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname)) {
      throw new Error("원격 캐릭터 이미지는 PNG/JPEG/WebP/GIF 파일이어야 합니다.");
    }
    return;
  }
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(url)) return;
  if (
    (/^\/tutorial\//i.test(url) || /^\/characters\//i.test(url)) &&
    !url.includes("\\") &&
    !url.includes("%") &&
    !url.includes(":") &&
    !/[?#]/.test(url)
  ) {
    const segments = url.split("/");
    if (
      !segments.includes("..") &&
      /\.(?:png|jpe?g|webp|gif)$/i.test(url)
    ) return;
  }
  throw new Error("캐릭터 이미지에는 안전한 앱 내부 경로, HTTPS 또는 PNG/JPEG/WebP/GIF data URL만 사용할 수 있습니다.");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function arrayOfText(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}
