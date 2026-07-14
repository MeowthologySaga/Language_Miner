import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("LocalDatabase full privacy deletion", () => {
  it("clears every learning table and overwrites the durable recovery copy", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-privacy-"));
    tempDirectories.push(userDataPath);
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const canary = "PRIVATE-CANARY-PHRASE-DO-NOT-RETAIN";
    const unsafeDatabase = database as unknown as { exec(sql: string): void };
    unsafeDatabase.exec(`
      INSERT INTO cards (
        id, profile_id, card_type, source_sentence, front_text, card_json,
        created_at, updated_at, due_at
      ) VALUES (
        'card-1', 'profile-a', 'input-reading', '${canary}', '${canary}',
        '{"private":"${canary}"}', '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO vocabulary_items (
        id, card_id, term, normalized_term, basic_meaning_ko, color_key, examples_json
      ) VALUES ('vocab-1', 'card-1', '${canary}', 'private', '${canary}', 'blue', '[]');
      INSERT INTO highlight_mappings (id, card_id, source_text, color_key)
        VALUES ('highlight-1', 'card-1', '${canary}', 'blue');
      INSERT INTO reviews (id, card_id, rating, reviewed_at, previous_due_at, next_due_at)
        VALUES ('review-1', 'card-1', 'good', '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
      INSERT INTO life_logs (id, text, source_type, created_at)
        VALUES ('log-1', '${canary}', 'manual', '2026-01-01T00:00:00.000Z');
      INSERT INTO listening_video_candidates (
        id, source_type, video_id, url, title, first_seen_at, last_seen_at
      ) VALUES (
        'candidate-1', 'local', 'video-1', 'file:///private', '${canary}',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO listening_transcripts (
        id, candidate_id, video_id, title, status, segments_json, model_name,
        created_at, updated_at
      ) VALUES (
        'transcript-1', 'candidate-1', 'video-1', '${canary}', 'ready',
        '[{"text":"${canary}"}]', 'local', '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO translation_cache (
        id, profile_id, cache_key, provider_name, source_lang, target_lang,
        source_hash, source_text, translated_text, created_at, updated_at
      ) VALUES (
        'translation-1', 'profile-a', 'cache-1', 'local', 'en', 'ko', 'hash-1',
        '${canary}', '${canary}', '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO export_records (
        id, profile_id, title, file_path, file_type, page_range, page_count,
        segment_count, provider_label, source_language_label, target_language_label, created_at
      ) VALUES (
        'export-1', 'profile-a', '${canary}', 'C:/private/file.pdf', 'pdf', '1', 1, 1,
        'local', 'English', 'Korean', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO diamond_wallet (id, balance, total_earned, total_spent, updated_at)
        VALUES ('default', 50, 50, 0, '2026-01-01T00:00:00.000Z');
      INSERT INTO diamond_transactions (
        id, transaction_type, amount, balance_after, reason, date_key, created_at
      ) VALUES ('diamond-1', 'earn', 50, 50, '${canary}', '2026-01-01', '2026-01-01T00:00:00.000Z');
      INSERT INTO mission_events (id, date_key, event_type, amount, metadata_json, created_at)
        VALUES ('event-1', '2026-01-01', 'card_created', 1, '{"private":"${canary}"}',
          '2026-01-01T00:00:00.000Z');
      INSERT INTO daily_mission_progress (date_key, mission_id, progress, claimed, updated_at)
        VALUES ('2026-01-01', 'mission-1', 1, 0, '2026-01-01T00:00:00.000Z');
    `);

    const counts = database.deleteAllLearningData();

    expect(counts).toMatchObject({
      cards: 1,
      vocabularyItems: 1,
      highlightMappings: 1,
      lifeLogs: 1,
      listeningVideoCandidates: 1,
      listeningTranscripts: 1,
      reviews: 1,
      translationCacheEntries: 1,
      exportRecords: 1,
      diamondWallets: 1,
      diamondTransactions: 1,
      missionEvents: 1,
      dailyMissionProgress: 1,
      totalRows: 13
    });
    expect(database.exportAppBackupSnapshot().tables.cards).toEqual([]);
    expect(database.getProfileDataSummary("profile-a").translationCacheCount).toBe(0);
    expect(database.getDiamondWallet().balance).toBe(0);
    expect(database.verifyPrivacyDeletion()).toEqual({
      remainingRows: 0,
      freelistPages: 0,
      integrityOk: true,
      durableCopiesVerified: true
    });

    for (const fileName of ["local-english-miner.sqlite", "local-english-miner.sqlite.bak"]) {
      const contents = fs.readFileSync(path.join(userDataPath, fileName));
      expect(contents.includes(Buffer.from(canary, "utf8"))).toBe(false);
    }

    fs.unlinkSync(path.join(userDataPath, "local-english-miner.sqlite"));
    const recovered = new LocalDatabase(userDataPath);
    await recovered.init();
    expect(recovered.exportAppBackupSnapshot().tables.cards).toEqual([]);
    expect(recovered.getProfileDataSummary("profile-a").translationCacheCount).toBe(0);
  });
});
