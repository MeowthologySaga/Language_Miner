import { describe, expect, it } from "vitest";
import {
  buildCharacterChatSystemPrompt,
  createDefaultCharacterPreset,
  DEFAULT_MOLLY_AVATAR_IMAGE_URL,
  DEFAULT_MOLLY_EMOTION_IMAGE_URLS,
  ensureDefaultMollyPreset,
  exportCharacterPresetAsLanguageMinerPack,
  exportCharacterPresetAsTavernV2,
  getCharacterPresetRuntimeStatus,
  getCharacterExpressionImageCount,
  hasCharacterExpressionImages,
  migrateDefaultMollyEmotionImages,
  migrateLegacyDefaultMinaToMolly,
  parseCharacterPresetJson,
  inspectCharacterPresetJson,
  inspectCharacterPackJson,
  isRunnableCharacterPreset,
  isRemoteCharacterImageUrl,
  parseCharacterChatReply
} from "./characterCards";
import type { CharacterPreset } from "./types";

describe("characterCards chat modes", () => {
  it("uses Molly as the default character with the tutorial mole avatar", () => {
    const preset = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");

    expect(preset.name).toBe("몰리");
    expect(preset.gender).toBe("female");
    expect(preset.avatarImageUrl).toBe(DEFAULT_MOLLY_AVATAR_IMAGE_URL);
    expect(preset.emotionImageUrls).toEqual(DEFAULT_MOLLY_EMOTION_IMAGE_URLS);
    expect(preset.emotionImageUrls?.listening).toBe("/tutorial/molly-gpt-listening.png");
    expect(preset.emotionImageUrls?.discovering).toBe("/tutorial/molly-gpt-discovering.png");
    expect(preset.expressionFallbackEmotion).toBe("neutral");
    expect(preset.description).toContain("female mole guide");
    expect(preset.personality).toContain("mineral-collecting nerd");
    expect(preset.creatorNotes).toContain("female character");
    expect(preset.firstMessage).toContain("반짝이는 표현");
  });

  it("migrates only the untouched legacy Mina default to Molly", () => {
    const legacyMina = makeLegacyMinaDefault();
    const migrated = migrateLegacyDefaultMinaToMolly(legacyMina);

    expect(migrated.id).toBe(legacyMina.id);
    expect(migrated.name).toBe("몰리");
    expect(migrated.avatarImageUrl).toBe(DEFAULT_MOLLY_AVATAR_IMAGE_URL);

    const customizedMina = {
      ...legacyMina,
      personality: `${legacyMina.personality} Customized.`
    };

    expect(migrateLegacyDefaultMinaToMolly(customizedMina)).toBe(customizedMina);
  });

  it("adds emotion image defaults to an existing saved Molly preset", () => {
    const molly = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");
    const savedBeforeEmotionImages = {
      ...molly,
      emotionImageUrls: undefined,
      expressionFallbackEmotion: undefined
    };

    const migrated = migrateDefaultMollyEmotionImages(savedBeforeEmotionImages);
    expect(migrated.emotionImageUrls).toEqual(DEFAULT_MOLLY_EMOTION_IMAGE_URLS);
    expect(migrated.expressionFallbackEmotion).toBe("neutral");
  });

  it("upgrades the old placeholder Molly expression images to generated PNG sprites", () => {
    const molly = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");
    const savedWithPlaceholderImages = {
      ...molly,
      avatarImageUrl: "/tutorial/mole-guide-b-transparent.png",
      emotionImageUrls: {
        neutral: "/tutorial/molly-neutral.svg",
        happy: "/tutorial/molly-happy.svg",
        thinking: "/tutorial/molly-thinking.svg",
        encouraging: "/tutorial/molly-encouraging.svg",
        concerned: "/tutorial/molly-concerned.svg",
        surprised: "/tutorial/molly-surprised.svg"
      }
    };

    const migrated = migrateDefaultMollyEmotionImages(savedWithPlaceholderImages);
    expect(migrated.avatarImageUrl).toBe(DEFAULT_MOLLY_AVATAR_IMAGE_URL);
    expect(migrated.emotionImageUrls).toEqual(DEFAULT_MOLLY_EMOTION_IMAGE_URLS);
  });

  it("does not repeatedly migrate an already current Molly preset", () => {
    const molly = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");

    expect(migrateDefaultMollyEmotionImages(molly)).toBe(molly);
    expect(ensureDefaultMollyPreset([molly])).toEqual({
      presets: [molly],
      added: false,
      changed: false
    });
  });

  it("keeps default Molly seeded in an existing custom preset list", () => {
    const customPreset = {
      ...createDefaultCharacterPreset("2026-07-04T00:00:00.000Z"),
      id: "custom-character",
      name: "Custom",
      tags: [],
      avatarImageUrl: "",
      emotionImageUrls: undefined
    };
    const seeded = ensureDefaultMollyPreset([customPreset], {
      now: "2026-07-04T01:00:00.000Z"
    });

    expect(seeded.added).toBe(true);
    expect(seeded.changed).toBe(true);
    expect(seeded.presets[0].name).toBe("몰리");
    expect(seeded.presets[1]).toBe(customPreset);

    const reseeded = ensureDefaultMollyPreset([customPreset], {
      now: "2026-07-04T01:00:00.000Z"
    });

    expect(reseeded.added).toBe(true);
    expect(reseeded.presets[0].name).toBe("몰리");
    expect(reseeded.presets[1]).toBe(customPreset);
  });

  it("distinguishes expression image characters from text-only characters", () => {
    const molly = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");
    const textOnly = {
      ...molly,
      avatarImageUrl: "",
      emotionImageUrls: undefined
    };

    expect(hasCharacterExpressionImages(molly)).toBe(true);
    expect(getCharacterExpressionImageCount(molly)).toBe(12);
    expect(hasCharacterExpressionImages(textOnly)).toBe(false);
    expect(getCharacterExpressionImageCount(textOnly)).toBe(0);
  });

  it("preserves avatar image urls through native import and Tavern export", () => {
    const imported = parseCharacterPresetJson(
      JSON.stringify({
        name: "Imported",
        description: "desc",
        personality: "persona",
        scenario: "scenario",
        firstMessage: "hi",
        messageExample: "",
        alternateGreetings: [],
        tags: [],
        gender: "female",
        assets: {
          avatar: "/characters/imported.png",
          emotions: {
            neutral: "/characters/imported-neutral.png",
            happy: "/characters/imported-happy.png"
          }
        },
        extensions: {
          local_english_miner: {
            expression_fallback_emotion: "happy"
          }
        }
      })
    );

    expect(imported.avatarImageUrl).toBe("/characters/imported.png");
    expect(imported.gender).toBe("female");
    expect(imported.emotionImageUrls?.neutral).toBe("/characters/imported-neutral.png");
    expect(imported.emotionImageUrls?.happy).toBe("/characters/imported-happy.png");
    expect(imported.expressionFallbackEmotion).toBe("happy");

    const exported = exportCharacterPresetAsTavernV2(imported);
    expect(exported.data.gender).toBe("female");
    expect(exported.data.assets).toEqual({
      avatar: "/characters/imported.png",
      emotions: {
        neutral: "/characters/imported-neutral.png",
        happy: "/characters/imported-happy.png"
      }
    });
    expect(exported.data.extensions.local_english_miner.avatar_image_url).toBe(
      "/characters/imported.png"
    );
    expect(exported.data.extensions.local_english_miner.gender).toBe("female");
    expect(exported.data.extensions.local_english_miner.expression_fallback_emotion).toBe(
      "happy"
    );
    expect(exported.data.extensions.local_english_miner.emotion_image_urls).toEqual({
      neutral: "/characters/imported-neutral.png",
      happy: "/characters/imported-happy.png"
    });
  });

  it("validates imported character cards as data-only content", () => {
    const inspected = inspectCharacterPresetJson(
      JSON.stringify({
        spec: "chara_card_v2",
        data: {
          name: "Remote Tutor",
          description: "A patient tutor.",
          avatar: "https://cdn.example.com/tutor.png"
        }
      })
    );
    expect(inspected.report.status).toBe("warning");
    expect(inspected.report.legacy).toBe(true);
    expect(inspected.report.remoteImageUrls).toEqual(["https://cdn.example.com/tutor.png"]);
    expect(isRemoteCharacterImageUrl(inspected.preset.avatarImageUrl)).toBe(true);
    expect(isRunnableCharacterPreset(inspected.preset)).toBe(false);
  });

  it("allows only local or verified-manifest character presets to run", () => {
    const local = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");
    expect(getCharacterPresetRuntimeStatus(local)).toBe("local");
    expect(isRunnableCharacterPreset(local)).toBe(true);
    expect(isRunnableCharacterPreset({ ...local, sourceFormat: undefined })).toBe(true);

    for (const sourceFormat of [
      "tavern_v1",
      "tavern_v2",
      "tavern_v3",
      "generic_json",
      "unknown"
    ] as const) {
      const legacy = { ...local, sourceFormat };
      expect(getCharacterPresetRuntimeStatus(legacy)).toBe("warning");
      expect(isRunnableCharacterPreset(legacy)).toBe(false);
    }

    expect(
      isRunnableCharacterPreset({ ...local, sourceFormat: "language_miner_pack" })
    ).toBe(false);
  });

  it("blocks executable, cleartext, SVG, and path-traversal image references", () => {
    for (const avatar of [
      "javascript:alert(1)",
      "http://example.com/avatar.png",
      "https://example.com/avatar.svg",
      "/characters/../private.png"
    ]) {
      expect(() =>
        inspectCharacterPresetJson(
          JSON.stringify({ name: "Unsafe", description: "blocked", avatarImageUrl: avatar })
        )
      ).toThrow(/캐릭터 이미지|SVG/);
    }
  });

  it("exports and verifies a current Language Miner character-pack round trip", async () => {
    const preset = {
      ...createDefaultCharacterPreset("2026-07-04T00:00:00.000Z"),
      id: "fd938278-a2b4-4dbe-8fbd-eb2aa48bfa92",
      name: "Round Trip Tutor",
      creator: "Example Creator"
    };
    const pack = await exportCharacterPresetAsLanguageMinerPack(preset, {
      creator: "Example Creator",
      sourceUrl: "https://github.com/example/round-trip-tutor/releases/tag/v1.0.0",
      license: "CC-BY-4.0",
      releaseNotes: "Initial public release."
    });
    expect(() => inspectCharacterPresetJson(JSON.stringify(pack))).toThrow(/비동기 SHA-256/);
    const inspected = await inspectCharacterPackJson(JSON.stringify(pack));

    expect(inspected.report.status).toBe("ready");
    expect(inspected.report.legacy).toBe(false);
    expect(inspected.report.verifiedPayloadSha256).toBe(pack.entry.sha256);
    expect(inspected.report.manifest?.lineageId).toBe(preset.id);
    expect(inspected.preset.name).toBe(preset.name);
    expect(inspected.preset.sourceFormat).toBe("language_miner_pack");
    expect(getCharacterPresetRuntimeStatus(inspected.preset)).toBe("ready");
    expect(isRunnableCharacterPreset(inspected.preset)).toBe(true);
    expect(inspected.preset.packMetadata).toMatchObject({
      id: pack.id,
      lineageId: preset.id,
      license: "CC-BY-4.0",
      payloadSha256: pack.entry.sha256
    });
    const trustedInspection = await inspectCharacterPackJson(JSON.stringify(pack), {
      trustedOfficial: true
    });
    expect(trustedInspection.report.status).toBe("trusted_official");

    const reexported = await exportCharacterPresetAsLanguageMinerPack(inspected.preset);
    expect(reexported.id).toBe(pack.id);
    expect(reexported.lineageId).toBe(pack.lineageId);
    expect(reexported.version).toBe(pack.version);
    expect(reexported.entry.sha256).toBe(pack.entry.sha256);
  });

  it("blocks a character pack when the asynchronous payload hash does not match", async () => {
    const pack = await makeCharacterPack();
    pack.entry.sha256 = `${pack.entry.sha256.slice(0, -1)}${pack.entry.sha256.endsWith("0") ? "1" : "0"}`;

    await expect(inspectCharacterPackJson(JSON.stringify(pack))).rejects.toThrow(/SHA-256.*일치/);
  });

  it.each([
    ["version", "1.0", /semver/],
    ["version", "1.0.0-01", /semver/],
    ["lineageId", "not-a-uuid", /UUID/],
    ["license", "not a license!", /SPDX/],
    ["sourceUrl", "http://example.com/card.json", /HTTPS/],
    ["id", "Invalid Character ID", /id/]
  ])("blocks malformed character-pack %s metadata", async (field, value, pattern) => {
    const pack = await makeCharacterPack();
    (pack as unknown as Record<string, unknown>)[field] = value;

    await expect(inspectCharacterPackJson(JSON.stringify(pack))).rejects.toThrow(pattern);
  });

  it("blocks executable fields even when they are nested in a character payload", async () => {
    const pack = await makeCharacterPack();
    (pack.payload as Record<string, unknown>).script = "alert(document.cookie)";

    await expect(inspectCharacterPackJson(JSON.stringify(pack))).rejects.toThrow(/실행 가능한 콘텐츠/);
  });

  it("requires a declared remote_images permission for remote raster images", async () => {
    const pack = await makeCharacterPack({ avatarImageUrl: "https://cdn.example.com/tutor.webp" });
    expect(pack.requestedPermissions).toContain("remote_images");
    pack.requestedPermissions = [];

    await expect(inspectCharacterPackJson(JSON.stringify(pack))).rejects.toThrow(/remote_images/);
  });

  it("uses semver prerelease ordering for minimum app compatibility", async () => {
    const olderPack = await makeCharacterPack({}, { minAppVersion: "0.1.0-beta.0" });
    await expect(
      inspectCharacterPackJson(JSON.stringify(olderPack), { appVersion: "0.1.0-beta.1" })
    ).resolves.toMatchObject({ report: { status: "ready" } });

    const stableOnlyPack = await makeCharacterPack();
    stableOnlyPack.minAppVersion = "0.1.0";
    await expect(
      inspectCharacterPackJson(JSON.stringify(stableOnlyPack), { appVersion: "0.1.0-beta.1" })
    ).rejects.toThrow(/0\.1\.0 이상/);

    const oldStablePack = await makeCharacterPack({}, { minAppVersion: "0.0.9" });
    await expect(
      inspectCharacterPackJson(JSON.stringify(oldStablePack), { appVersion: "0.1.0-beta.1" })
    ).resolves.toMatchObject({ report: { status: "ready" } });
  });

  it("keeps native capture mode relaxed and correction-free", () => {
    const prompt = buildCharacterChatSystemPrompt({
      character: createDefaultCharacterPreset("2026-07-04T00:00:00.000Z"),
      ragHints: [],
      chatMode: "native_capture",
      correctionMode: "instant",
      learningProfile: {
        targetLanguage: { code: "en", nameKo: "영어", nameEn: "English" },
        nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
      }
    });

    expect(prompt).toContain("Conversation mode: native_capture.");
    expect(prompt).toContain("Gender: female");
    expect(prompt).toContain("Reply primarily in the learner's native language");
    expect(prompt).toContain("Do not force target-language practice");
    expect(prompt).toContain("[EMOTION]neutral[/EMOTION]");
    expect(prompt).not.toContain("[CORRECTION_KO]");
  });

  it("asks for separate correction blocks in target practice mode", () => {
    const prompt = buildCharacterChatSystemPrompt({
      character: createDefaultCharacterPreset("2026-07-04T00:00:00.000Z"),
      ragHints: [],
      chatMode: "target_practice",
      correctionMode: "instant",
      learningProfile: {
        targetLanguage: { code: "en", nameKo: "영어", nameEn: "English" },
        nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
      }
    });

    expect(prompt).toContain("Conversation mode: target_practice.");
    expect(prompt).toContain("Use English for the character's main reply");
    expect(prompt).toContain("[CORRECTION_KO]");
    expect(prompt).toContain("[SUGGESTED_TARGET]");
    expect(prompt).toContain("Allowed display emotions");
  });

  it("parses correction metadata out of the character reply", () => {
    const parsed = parseCharacterChatReply(
      [
        "I get what you mean.",
        "",
        "[CORRECTION_KO]",
        "had better than have in this sentence.",
        "[/CORRECTION_KO]",
        "[SUGGESTED_TARGET]",
        "I had a rough day.",
        "[/SUGGESTED_TARGET]",
        "[EMOTION]concerned[/EMOTION]"
      ].join("\n")
    );

    expect(parsed.content).toBe("I get what you mean.");
    expect(parsed.feedbackKo).toBe("had better than have in this sentence.");
    expect(parsed.suggestedTargetText).toBe("I had a rough day.");
    expect(parsed.emotion).toBe("concerned");
  });
});

async function makeCharacterPack(
  presetPatch: Partial<CharacterPreset> = {},
  options: Parameters<typeof exportCharacterPresetAsLanguageMinerPack>[1] = {}
) {
  const preset: CharacterPreset = {
    ...createDefaultCharacterPreset("2026-07-04T00:00:00.000Z"),
    id: "0e819cb5-c595-49f2-92ea-6ffcb05d2066",
    name: "Pack Tutor",
    creator: "Example Creator",
    ...presetPatch
  };
  return exportCharacterPresetAsLanguageMinerPack(preset, {
    creator: "Example Creator",
    sourceUrl: "https://github.com/example/pack-tutor/releases/tag/v1.0.0",
    license: "CC-BY-4.0",
    releaseNotes: "Initial public release.",
    ...options
  });
}

function makeLegacyMinaDefault(): CharacterPreset {
  const now = "2026-07-04T00:00:00.000Z";
  return {
    id: "legacy-mina",
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
