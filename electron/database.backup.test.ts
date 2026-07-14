import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import { createDefaultSampleCards } from "../src/shared/defaultSampleCards";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function createDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "language-miner-backup-db-"));
  tempDirs.push(directory);
  const database = new LocalDatabase(directory);
  await database.init();
  return database;
}

describe("LocalDatabase backup", () => {
  it("exports learning rows without local media or export paths", async () => {
    const database = await createDatabase();
    const card = createDefaultSampleCards("profile-a")[0];
    database.saveCard({
      ...card,
      listeningMedia: {
        audioClip: {
          filePath: "C:\\Users\\test\\clip.wav",
          fileUrl: ["file:///C:", "Users", "test", "clip.wav"].join("/"),
          mimeType: "audio/wav",
          start: 0,
          end: 1,
          sourceType: "transcript-audio",
          createdAt: "2026-07-13T00:00:00.000Z"
        }
      }
    });

    const snapshot = database.exportAppBackupSnapshot();
    expect(snapshot.tables.cards).toHaveLength(1);
    expect(snapshot.tables.cards[0].card_json).not.toContain("C:\\\\Users");
    expect(snapshot.tables.listening_transcripts).toEqual([]);
  });

  it("preserves local paths in the private in-memory rollback snapshot", async () => {
    const database = await createDatabase();
    const timestamp = "2026-07-13T00:00:00.000Z";
    const audioPath = "C:\\Users\\test\\rollback-audio.wav";
    const exportPath = "C:\\Users\\test\\rollback-export.pdf";
    const card = createDefaultSampleCards("profile-a")[0];
    database.saveCard({
      ...card,
      listeningMedia: {
        audioClip: {
          filePath: audioPath,
          fileUrl: ["file:///C:", "Users", "test", "rollback-audio.wav"].join("/"),
          mimeType: "audio/wav",
          start: 0,
          end: 1,
          sourceType: "transcript-audio",
          createdAt: timestamp
        }
      }
    });
    const candidate = database.saveListeningVideoCandidate({
      sourceType: "manual",
      videoId: "rollback-video",
      url: "https://example.com/rollback-video",
      title: "Rollback video"
    });
    database.saveListeningTranscript({
      id: "rollback-transcript",
      candidateId: candidate.id,
      videoId: candidate.videoId,
      title: candidate.title,
      status: "ready",
      segments: [],
      audioPath,
      modelName: "test-model",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    database.saveExportRecord({
      id: "rollback-export",
      profileId: "profile-a",
      title: "Rollback export",
      filePath: exportPath,
      fileType: "pdf",
      pageRange: "1",
      pageCount: 1,
      segmentCount: 1,
      providerLabel: "Local",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      createdAt: timestamp
    });

    const publicSnapshot = database.exportAppBackupSnapshot();
    const rollbackSnapshot = database.exportAppBackupRollbackSnapshot();
    expect(String(publicSnapshot.tables.cards[0].card_json)).not.toContain("C:\\\\Users");
    expect(publicSnapshot.tables.listening_transcripts[0].audio_path).toBeNull();
    expect(publicSnapshot.tables.export_records[0].file_path).toBe("");
    expect(String(rollbackSnapshot.tables.cards[0].card_json)).toContain(
      "C:\\\\Users\\\\test\\\\rollback-audio.wav"
    );
    expect(rollbackSnapshot.tables.listening_transcripts[0].audio_path).toBe(audioPath);
    expect(rollbackSnapshot.tables.export_records[0].file_path).toBe(exportPath);

    const emptyDatabase = await createDatabase();
    database.restoreAppBackupSnapshot(emptyDatabase.exportAppBackupSnapshot(), "replace");
    expect(database.exportAppBackupRollbackSnapshot().tables.cards).toEqual([]);

    database.restoreAppBackupRollbackSnapshot(rollbackSnapshot);
    const restored = database.exportAppBackupRollbackSnapshot();
    expect(String(restored.tables.cards[0].card_json)).toContain(
      "C:\\\\Users\\\\test\\\\rollback-audio.wav"
    );
    expect(restored.tables.listening_transcripts[0].audio_path).toBe(audioPath);
    expect(restored.tables.export_records[0].file_path).toBe(exportPath);
  });

  it("restores cards into a new profile without changing the source snapshot", async () => {
    const source = await createDatabase();
    source.saveCard(createDefaultSampleCards("profile-a")[0]);
    const snapshot = source.exportAppBackupSnapshot();
    const target = await createDatabase();

    const counts = target.restoreAppBackupSnapshot(snapshot, "new_profile", {
      "profile-a": "profile-imported"
    });

    expect(counts.cards).toBe(1);
    expect(target.listCards("profile-imported")).toHaveLength(1);
    expect(source.listCards("profile-a")).toHaveLength(1);
  });

  it("remaps colliding entity ids, foreign keys, and exact JSON references for a new profile", async () => {
    const database = await createDatabase();
    const card = createDefaultSampleCards("profile-a").find(
      (candidate) => candidate.vocabularyItems.length > 0 && candidate.highlightMappings.length > 0
    );
    if (!card) throw new Error("Expected a sample card with vocabulary and highlights.");

    database.saveCard(card);
    database.reviewCard(card.id, "good");
    const lifeLog = database.saveLifeLog({
      text: "I used the imported card today.",
      beforeContext: "Before",
      afterContext: "After",
      appName: "Backup test",
      sourceType: "manual",
      metadata: {
        processedProfileIds: ["profile-a"],
        linkedCardId: card.id
      }
    });
    const candidate = database.saveListeningVideoCandidate({
      sourceType: "manual",
      videoId: "backup-video",
      url: "https://example.com/backup-video",
      title: "Backup video",
      metadata: {
        linkedCardId: card.id,
        linkedLifeLogId: lifeLog.id
      }
    });
    database.updateListeningVideoCandidateMetadata(candidate.id, {
      metadata: {
        candidateId: candidate.id,
        linkedCardId: card.id,
        linkedLifeLogId: lifeLog.id,
        [card.id]: candidate.id
      }
    });
    const timestamp = "2026-07-13T00:00:00.000Z";
    database.saveListeningTranscript({
      id: "backup-transcript",
      candidateId: candidate.id,
      videoId: candidate.videoId,
      title: candidate.title,
      status: "ready",
      segments: [
        {
          id: lifeLog.id,
          speaker: "Narrator",
          start: 0,
          end: 1,
          text: "Linked backup segment"
        }
      ],
      modelName: "test-model",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    database.saveExportRecord({
      id: "backup-export",
      profileId: "profile-a",
      title: "Backup export",
      filePath: "C:\\Users\\test\\backup.pdf",
      fileType: "pdf",
      pageRange: "1",
      pageCount: 1,
      segmentCount: 1,
      providerLabel: "Local",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      createdAt: timestamp
    });

    const snapshot = database.exportAppBackupSnapshot();
    const snapshotBeforeRestore = JSON.parse(JSON.stringify(snapshot));
    const mergeCounts = database.restoreAppBackupSnapshot(snapshot, "merge");
    for (const tableName of [
      "cards",
      "vocabulary_items",
      "highlight_mappings",
      "reviews",
      "life_logs",
      "listening_video_candidates",
      "listening_transcripts",
      "export_records"
    ] as const) {
      expect(mergeCounts[tableName]).toBe(0);
    }

    const counts = database.restoreAppBackupSnapshot(snapshot, "new_profile", {
      "profile-a": "profile-imported"
    });
    expect(snapshot).toEqual(snapshotBeforeRestore);
    for (const tableName of [
      "cards",
      "vocabulary_items",
      "highlight_mappings",
      "reviews",
      "life_logs",
      "listening_video_candidates",
      "listening_transcripts",
      "export_records"
    ] as const) {
      expect(counts[tableName]).toBe(snapshot.tables[tableName].length);
    }

    const restored = database.exportAppBackupSnapshot();
    const sourceCardId = String(snapshot.tables.cards[0].id);
    const importedCard = restored.tables.cards.find(
      (row) => row.profile_id === "profile-imported"
    );
    if (!importedCard) throw new Error("Imported card was not restored.");
    const importedCardId = String(importedCard.id);
    expect(importedCardId).not.toBe(sourceCardId);
    expect(JSON.parse(String(importedCard.card_json))).toMatchObject({
      id: importedCardId,
      profileId: "profile-imported"
    });

    const sourceVocabularyIds = new Set(snapshot.tables.vocabulary_items.map((row) => row.id));
    const importedVocabulary = restored.tables.vocabulary_items.filter(
      (row) => row.card_id === importedCardId
    );
    expect(importedVocabulary).toHaveLength(snapshot.tables.vocabulary_items.length);
    expect(importedVocabulary.every((row) => !sourceVocabularyIds.has(row.id))).toBe(true);

    const sourceHighlightIds = new Set(snapshot.tables.highlight_mappings.map((row) => row.id));
    const importedHighlights = restored.tables.highlight_mappings.filter(
      (row) => row.card_id === importedCardId
    );
    expect(importedHighlights).toHaveLength(snapshot.tables.highlight_mappings.length);
    expect(importedHighlights.every((row) => !sourceHighlightIds.has(row.id))).toBe(true);

    const sourceReviewId = String(snapshot.tables.reviews[0].id);
    const importedReview = restored.tables.reviews.find(
      (row) => row.card_id === importedCardId
    );
    if (!importedReview) throw new Error("Imported review was not restored.");
    expect(importedReview.id).not.toBe(sourceReviewId);

    const sourceLifeLogId = String(snapshot.tables.life_logs[0].id);
    const importedLifeLog = restored.tables.life_logs.find(
      (row) => row.id !== sourceLifeLogId
    );
    if (!importedLifeLog) throw new Error("Imported life log was not restored.");
    const importedLifeLogId = String(importedLifeLog.id);
    expect(JSON.parse(String(importedLifeLog.metadata_json))).toMatchObject({
      processedProfileIds: ["profile-imported"],
      linkedCardId: importedCardId
    });

    const sourceCandidateId = String(snapshot.tables.listening_video_candidates[0].id);
    const importedCandidate = restored.tables.listening_video_candidates.find(
      (row) => row.id !== sourceCandidateId
    );
    if (!importedCandidate) throw new Error("Imported listening candidate was not restored.");
    const importedCandidateId = String(importedCandidate.id);
    const importedCandidateMetadata = JSON.parse(String(importedCandidate.metadata_json));
    expect(importedCandidateMetadata).toMatchObject({
      candidateId: importedCandidateId,
      linkedCardId: importedCardId,
      linkedLifeLogId: importedLifeLogId
    });
    expect(importedCandidateMetadata[importedCardId]).toBe(importedCandidateId);

    const sourceTranscriptId = String(snapshot.tables.listening_transcripts[0].id);
    const importedTranscript = restored.tables.listening_transcripts.find(
      (row) => row.id !== sourceTranscriptId
    );
    if (!importedTranscript) throw new Error("Imported transcript was not restored.");
    expect(importedTranscript.candidate_id).toBe(importedCandidateId);
    expect(JSON.parse(String(importedTranscript.segments_json))[0].id).toBe(importedLifeLogId);

    const sourceExportId = String(snapshot.tables.export_records[0].id);
    const importedExport = restored.tables.export_records.find(
      (row) => row.profile_id === "profile-imported"
    );
    if (!importedExport) throw new Error("Imported export record was not restored.");
    expect(importedExport.id).not.toBe(sourceExportId);
    expect(importedExport.file_path).toBe("");
  });

  it.each(["merge", "new_profile"] as const)(
    "leaves device-global wallet and mission state untouched in %s mode",
    async (mode) => {
      const database = await createDatabase();
      const snapshot = database.exportAppBackupSnapshot();
      const timestamp = "2026-07-13T00:00:00.000Z";
      snapshot.tables.diamond_wallet.push({
        id: "default",
        balance: 100,
        total_earned: 100,
        total_spent: 0,
        updated_at: timestamp
      });
      snapshot.tables.diamond_transactions.push({
        id: "transaction-1",
        transaction_type: "earn",
        amount: 100,
        balance_after: 100,
        reason: "Backup fixture",
        mission_id: "review-10",
        profile_id: "profile-a",
        date_key: "2026-07-13",
        created_at: timestamp,
        idempotency_key: null
      });
      snapshot.tables.mission_events.push({
        id: "mission-event-1",
        date_key: "2026-07-13",
        event_type: "review_completed",
        profile_id: "profile-a",
        amount: 1,
        metadata_json: "{}",
        created_at: timestamp
      });
      snapshot.tables.daily_mission_progress.push({
        date_key: "2026-07-13",
        mission_id: "review-10",
        progress: 1,
        claimed: 0,
        claimed_at: null,
        updated_at: timestamp
      });

      const counts = database.restoreAppBackupSnapshot(snapshot, mode, {
        "profile-a": "profile-imported"
      });

      expect(counts.diamond_wallet).toBe(0);
      expect(counts.diamond_transactions).toBe(0);
      expect(counts.mission_events).toBe(0);
      expect(counts.daily_mission_progress).toBe(0);
      const restored = database.exportAppBackupSnapshot();
      expect(restored.tables.diamond_wallet).toEqual([]);
      expect(restored.tables.diamond_transactions).toEqual([]);
      expect(restored.tables.mission_events).toEqual([]);
      expect(restored.tables.daily_mission_progress).toEqual([]);
    }
  );

  it("rolls back every database change when a restore row fails mid-transaction", async () => {
    const source = await createDatabase();
    source.saveCard(createDefaultSampleCards("profile-a")[0]);
    const snapshot = source.exportAppBackupSnapshot();
    snapshot.tables.cards.push({ id: "invalid-card-with-missing-required-columns" });

    const target = await createDatabase();
    target.saveCard(createDefaultSampleCards("profile-a")[1]);
    const before = target.exportAppBackupRollbackSnapshot();

    expect(() => target.restoreAppBackupSnapshot(snapshot, "replace")).toThrow();
    expect(target.exportAppBackupRollbackSnapshot()).toEqual(before);
  });

  it("keeps current rows when a merge snapshot contains the same primary key", async () => {
    const source = await createDatabase();
    const original = createDefaultSampleCards("profile-a")[0];
    source.saveCard({ ...original, frontText: "backup value" });
    const snapshot = source.exportAppBackupSnapshot();
    const target = await createDatabase();
    target.saveCard({ ...original, frontText: "current value" });

    const counts = target.restoreAppBackupSnapshot(snapshot, "merge");

    expect(counts.cards).toBe(0);
    expect(target.listCards("profile-a")[0].frontText).toBe("current value");
  });
});
