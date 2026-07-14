import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { Database } from "sql.js";
import { normalizeCardDeck } from "../src/shared/cardDeck";
import {
  markLifeLogMetadataProcessedForProfile,
  removeLifeLogProfileProgress
} from "../src/shared/lifeLogProgress";
import {
  buildDailyMissionBoard,
  createEmptyMissionProgress,
  dailyBonusDefinition,
  findMissionDefinitionsByEventType,
  findMissionDefinition,
  getMissionDateKey
} from "../src/shared/dailyMissions";
import { DEFAULT_PROFILE_ID } from "../src/shared/profiles";
import { scheduleCardReview } from "../src/shared/srs";
import {
  APP_BACKUP_SCHEMA_VERSION,
  appBackupTableNames,
  createEmptyAppBackupTables,
  remapBackupProfileId,
  sanitizeAppBackupValue,
  type AppBackupDatabaseSnapshot,
  type AppBackupRestoreMode,
  type AppBackupRow,
  type AppBackupTableName
} from "../src/shared/appBackup";
import type {
  BilingualExportHistoryRecord,
  DailyMissionBoard,
  DailyMissionId,
  DailyMissionProgress,
  DiamondTransaction,
  DiamondWallet,
  DiamondSpendLookupResult,
  DiamondSpendRequest,
  DiamondSpendResult,
  LearningMissionEvent,
  LifeLog,
  ListeningTranscript,
  ListeningVideoCandidate,
  ListeningVideoCandidateInput,
  ProfileId,
  ProfileDataDeleteResult,
  ProfileDataSummary,
  CardPageResult,
  LifeLogPageResult,
  ReviewRating,
  StudyCard,
  TranslationCacheEntry,
  TranslationCacheLookupInput
} from "../src/shared/types";
import type {
  PrivacyDatabaseDeleteCounts,
  PrivacyDatabaseDeleteVerification
} from "../src/shared/privacyData";
import {
  cardFromRow,
  createDefaultWallet,
  diamondTransactionFromRow,
  exportRecordFromRow,
  getListeningVideoCandidateId,
  getTranslationCacheKey,
  hashText,
  lifeLogFromRow,
  listeningTranscriptFromRow,
  listeningVideoCandidateFromRow,
  mergeListeningCandidateMetadata,
  missionProgressFromRow,
  normalizeContextHash,
  normalizeMissionAmount,
  normalizeOptionalNumber,
  normalizeOptionalText,
  normalizeProfileId,
  normalizePromptVersion,
  normalizeSourceLang,
  normalizeTargetLang,
  normalizeTranslationModel,
  normalizeTranslationText,
  parseLifeLogMetadata,
  translationCacheFromRow,
  walletFromRow,
  type CardRow,
  type DiamondTransactionRow,
  type DiamondWalletRow,
  type ExportRecordRow,
  type LifeLogRow,
  type ListeningTranscriptRow,
  type ListeningVideoCandidateRow,
  type MissionProgressRow,
  type SqlValue,
  type TranslationCacheRow
} from "./databaseRows";

const requireForWasm = createRequire(__filename);
const DATABASE_RENAME_RETRY_DELAYS_MS = [10, 20, 40, 80, 160] as const;
const databaseRenameRetrySignal = new Int32Array(new SharedArrayBuffer(4));

function renameDatabaseFileWithRetry(sourcePath: string, destinationPath: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(sourcePath, destinationPath);
      return;
    } catch (error) {
      if (
        !isTransientDatabaseRenameError(error) ||
        attempt >= DATABASE_RENAME_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      Atomics.wait(
        databaseRenameRetrySignal,
        0,
        0,
        DATABASE_RENAME_RETRY_DELAYS_MS[attempt]
      );
    }
  }
}

function isTransientDatabaseRenameError(error: unknown) {
  const code = readFilesystemErrorCode(error);
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

function readFilesystemErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : undefined;
}

function createSafeDatabasePersistenceError(error: unknown) {
  const safeError = new Error("The local database could not be saved safely.");
  safeError.name = "DatabasePersistenceError";
  safeError.stack = `${safeError.name}: ${safeError.message}`;
  const code = readFilesystemErrorCode(error);
  if (code) {
    (safeError as NodeJS.ErrnoException).code = code;
  }
  return safeError;
}

export class LocalDatabase {
  private db: Database | null = null;

  private readonly dbPath: string;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, "local-english-miner.sqlite");
  }

  async init() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const wasmPath = requireForWasm.resolve("sql.js/dist/sql-wasm.wasm");
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    ) as ArrayBuffer;
    const SQL = await initSqlJs({ wasmBinary });

    if (fs.existsSync(this.dbPath)) {
      try {
        this.db = new SQL.Database(new Uint8Array(fs.readFileSync(this.dbPath)));
      } catch (primaryError) {
        const backupPath = `${this.dbPath}.bak`;
        if (!fs.existsSync(backupPath)) throw primaryError;
        this.db = new SQL.Database(new Uint8Array(fs.readFileSync(backupPath)));
        console.warn("Recovered the local database from its last durable backup.");
      }
    } else if (fs.existsSync(`${this.dbPath}.bak`)) {
      this.db = new SQL.Database(new Uint8Array(fs.readFileSync(`${this.dbPath}.bak`)));
    } else {
      this.db = new SQL.Database();
    }

    this.applySchema();
    this.persist();
  }

  listCards(profileId: ProfileId = DEFAULT_PROFILE_ID): StudyCard[] {
    const rows = this.all<CardRow>(
      `SELECT * FROM cards
       WHERE profile_id = ?
       ORDER BY datetime(created_at) DESC`,
      [normalizeProfileId(profileId)]
    );
    return rows.map(cardFromRow);
  }

  listCardsPage(
    profileId: ProfileId = DEFAULT_PROFILE_ID,
    offsetInput = 0,
    limitInput = 100
  ): CardPageResult {
    const normalizedProfileId = normalizeProfileId(profileId);
    const offset = normalizePageOffset(offsetInput);
    const limit = normalizePageLimit(limitInput);
    const total = this.all<{ count: number }>(
      "SELECT COUNT(*) AS count FROM cards WHERE profile_id = ?",
      [normalizedProfileId]
    )[0]?.count ?? 0;
    const items = this.all<CardRow>(
      `SELECT * FROM cards WHERE profile_id = ?
       ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
      [normalizedProfileId, limit, offset]
    ).map(cardFromRow);
    return { items, total, offset, limit };
  }

  getProfileDataSummary(
    profileId: ProfileId = DEFAULT_PROFILE_ID,
    nowIso = new Date().toISOString()
  ): ProfileDataSummary {
    const normalizedProfileId = normalizeProfileId(profileId);
    const count = (sql: string, params: SqlValue[]) =>
      this.all<{ count: number }>(sql, params)[0]?.count ?? 0;
    return {
      profileId: normalizedProfileId,
      cardCount: count("SELECT COUNT(*) AS count FROM cards WHERE profile_id = ?", [normalizedProfileId]),
      dueCardCount: count(
        "SELECT COUNT(*) AS count FROM cards WHERE profile_id = ? AND datetime(due_at) <= datetime(?)",
        [normalizedProfileId, nowIso]
      ),
      translationCacheCount: count(
        "SELECT COUNT(*) AS count FROM translation_cache WHERE profile_id = ?",
        [normalizedProfileId]
      ),
      exportRecordCount: count(
        "SELECT COUNT(*) AS count FROM export_records WHERE profile_id = ?",
        [normalizedProfileId]
      )
    };
  }

  listDueCards(
    nowIso = new Date().toISOString(),
    profileId: ProfileId = DEFAULT_PROFILE_ID
  ): StudyCard[] {
    const rows = this.all<CardRow>(
      `SELECT * FROM cards
       WHERE profile_id = ?
         AND datetime(due_at) <= datetime(?)
       ORDER BY datetime(due_at) ASC, datetime(created_at) ASC`,
      [normalizeProfileId(profileId), nowIso]
    );
    return rows.map(cardFromRow);
  }

  saveCard(card: StudyCard, profileId: ProfileId = DEFAULT_PROFILE_ID): StudyCard {
    return this.writeCard({ ...card, profileId: card.profileId ?? profileId }, { preserveTimestamps: false });
  }

  importCards(cards: StudyCard[], profileId: ProfileId = DEFAULT_PROFILE_ID): StudyCard[] {
    const imported = cards.map((card) =>
      this.writeCard(
        { ...card, profileId: card.profileId ?? profileId },
        { preserveTimestamps: true }
      )
    );
    this.persist();
    return imported;
  }

  exportAppBackupSnapshot(): AppBackupDatabaseSnapshot {
    return this.createAppBackupDatabaseSnapshot(true);
  }

  /** Internal rollback state only. Never pass this snapshot to public backup serialization. */
  exportAppBackupRollbackSnapshot(): AppBackupDatabaseSnapshot {
    return this.createAppBackupDatabaseSnapshot(false);
  }

  private createAppBackupDatabaseSnapshot(sanitizeForPublicBackup: boolean) {
    const tables = createEmptyAppBackupTables();
    for (const tableName of appBackupTableNames) {
      const rows = this.all<Record<string, SqlValue>>(`SELECT * FROM ${tableName}`);
      tables[tableName] = rows.map((row) =>
        sanitizeForPublicBackup
          ? sanitizeBackupDatabaseRow(tableName, row)
          : copyBackupDatabaseRow(tableName, row)
      );
    }
    return {
      schemaVersion: APP_BACKUP_SCHEMA_VERSION,
      tables
    };
  }

  restoreAppBackupSnapshot(
    snapshot: AppBackupDatabaseSnapshot,
    mode: AppBackupRestoreMode,
    profileIdMap: Record<string, string> = {}
  ): Record<AppBackupTableName, number> {
    return this.restoreAppBackupSnapshotInternal(snapshot, mode, profileIdMap, true);
  }

  /** Restores an exact in-memory snapshot captured by exportAppBackupRollbackSnapshot. */
  restoreAppBackupRollbackSnapshot(
    snapshot: AppBackupDatabaseSnapshot
  ): Record<AppBackupTableName, number> {
    const counts = this.restoreAppBackupSnapshotInternal(snapshot, "replace", {}, false);
    // The first persist restores the primary file; the second also replaces the
    // durable .bak recovery copy so a later recovery cannot resurrect failed data.
    this.persist();
    return counts;
  }

  private restoreAppBackupSnapshotInternal(
    snapshot: AppBackupDatabaseSnapshot,
    mode: AppBackupRestoreMode,
    profileIdMap: Record<string, string>,
    sanitizeForPublicBackup: boolean
  ): Record<AppBackupTableName, number> {
    if (snapshot.schemaVersion !== APP_BACKUP_SCHEMA_VERSION) {
      throw new Error("지원하지 않는 데이터베이스 백업 버전입니다.");
    }
    const counts = Object.fromEntries(appBackupTableNames.map((name) => [name, 0])) as Record<
      AppBackupTableName,
      number
    >;
    const entityIdMap =
      mode === "new_profile" ? createNewProfileBackupEntityIdMap(snapshot) : new Map<string, string>();
    this.transaction(() => {
      if (mode === "replace") {
        for (const tableName of appBackupDeleteOrder) {
          this.run(`DELETE FROM ${tableName}`);
        }
      }
      for (const tableName of appBackupInsertOrder) {
        // Wallet, rewards, and daily mission progress are device-global state rather
        // than profile-scoped learning data. Non-replace restores leave them untouched,
        // so their initialized return counts remain an accurate zero.
        if (mode !== "replace" && appBackupGlobalStateTables.has(tableName)) {
          continue;
        }
        for (const sourceRow of snapshot.tables[tableName] ?? []) {
          const row = prepareBackupRowForRestore(
            tableName,
            sourceRow,
            profileIdMap,
            entityIdMap,
            sanitizeForPublicBackup
          );
          const columns = appBackupTableColumns[tableName].filter((column) => column in row);
          if (!columns.length) continue;
          const placeholders = columns.map(() => "?").join(", ");
          const insertMode = mode === "replace" ? "REPLACE" : "IGNORE";
          this.run(
            `INSERT OR ${insertMode} INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
            columns.map((column) => row[column] ?? null)
          );
          counts[tableName] += this.ensureDb().getRowsModified();
        }
      }
    });
    this.persist();
    return counts;
  }

  hasCard(id: string) {
    const rows = this.all<{ id: string }>(`SELECT id FROM cards WHERE id = ? LIMIT 1`, [id]);
    return rows.length > 0;
  }

  getDiamondWallet(): DiamondWallet {
    const row = this.all<DiamondWalletRow>(
      `SELECT * FROM diamond_wallet WHERE id = 'default' LIMIT 1`
    )[0];
    if (!row) {
      return createDefaultWallet();
    }
    return walletFromRow(row);
  }

  listDiamondTransactions(): DiamondTransaction[] {
    return this.all<DiamondTransactionRow>(
      `SELECT * FROM diamond_transactions ORDER BY datetime(created_at) DESC`
    ).map(diamondTransactionFromRow);
  }

  spendDiamonds(input: DiamondSpendRequest): DiamondSpendResult {
    const now = new Date().toISOString();
    const amount = Math.floor(Number(input.amount));
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const reason = normalizeSpendReason(input.reason);
    const profileId = normalizeProfileId(input.profileId);
    const wallet = this.getDiamondWallet();
    const existing = this.lookupDiamondSpend(input);
    if (existing) return existing;
    if (wallet.balance < amount) {
      return spendFailure("insufficient_balance", "There are not enough diamonds.", wallet);
    }

    const nextWallet: DiamondWallet = {
      balance: wallet.balance - amount,
      totalEarned: wallet.totalEarned,
      totalSpent: wallet.totalSpent + amount,
      updatedAt: now
    };
    const transactionId = randomUUID();
    this.transaction(() => {
      this.run(
        `INSERT OR REPLACE INTO diamond_wallet (
          id, balance, total_earned, total_spent, updated_at
        ) VALUES ('default', ?, ?, ?, ?)`,
        [nextWallet.balance, nextWallet.totalEarned, nextWallet.totalSpent, nextWallet.updatedAt]
      );
      this.run(
        `INSERT INTO diamond_transactions (
          id, transaction_type, amount, balance_after, reason,
          mission_id, profile_id, date_key, created_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          "spend",
          amount,
          nextWallet.balance,
          reason,
          null,
          profileId,
          getMissionDateKey(new Date(now)),
          now,
          idempotencyKey
        ]
      );
    });
    this.persist();
    return { ok: true, transactionId, balanceAfter: nextWallet.balance, wallet: nextWallet };
  }

  lookupDiamondSpend(input: DiamondSpendRequest): DiamondSpendLookupResult {
    const amount = Math.floor(Number(input.amount));
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const reason = normalizeSpendReason(input.reason);
    const profileId = normalizeProfileId(input.profileId);
    const wallet = this.getDiamondWallet();
    if (!idempotencyKey) {
      return spendFailure("invalid_idempotency_key", "A stable idempotency key is required.", wallet);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return spendFailure("invalid_amount", "Diamond spend amount must be positive.", wallet);
    }

    const replay = this.findDiamondSpendByIdempotencyKey(idempotencyKey);
    if (!replay) return null;
    if (replay.amount !== amount || replay.reason !== reason || replay.profile_id !== profileId) {
      return spendFailure(
        "idempotency_conflict",
        "The idempotency key was already used for a different spend.",
        wallet
      );
    }
    return {
      ok: true,
      transactionId: replay.id,
      balanceAfter: replay.balance_after,
      wallet,
      idempotentReplay: true
    };
  }

  private findDiamondSpendByIdempotencyKey(idempotencyKey: string) {
    return this.all<{
      id: string;
      amount: number;
      balance_after: number;
      reason: string;
      profile_id: string;
    }>(
      `SELECT id, amount, balance_after, reason, profile_id
       FROM diamond_transactions
       WHERE idempotency_key = ? AND transaction_type = 'spend'
       LIMIT 1`,
      [idempotencyKey]
    )[0];
  }

  getTodayMissions(_profileId: ProfileId = DEFAULT_PROFILE_ID): DailyMissionBoard {
    const dateKey = getMissionDateKey();
    return buildDailyMissionBoard(
      dateKey,
      this.listMissionProgress(dateKey),
      this.listDiamondTransactionsForDate(dateKey)
    );
  }

  recordMissionEvent(
    input: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">
  ): DailyMissionBoard {
    const now = new Date();
    const nowIso = now.toISOString();
    const dateKey = getMissionDateKey(now);
    const amount = normalizeMissionAmount(input.amount);
    const event: LearningMissionEvent = {
      id: randomUUID(),
      dateKey,
      type: input.type,
      profileId: normalizeProfileId(input.profileId),
      amount,
      metadata: input.metadata,
      createdAt: nowIso
    };
    this.run(
      `INSERT INTO mission_events (
        id, date_key, event_type, profile_id, amount, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.dateKey,
        event.type,
        event.profileId ?? null,
        event.amount,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.createdAt
      ]
    );

    for (const mission of findMissionDefinitionsByEventType(event.type)) {
      this.incrementMissionProgress(dateKey, mission.id, amount, nowIso);
    }

    this.persist();
    return this.getTodayMissions(event.profileId);
  }

  claimMissionReward(
    missionId: DailyMissionId,
    profileId: ProfileId = DEFAULT_PROFILE_ID
  ): DailyMissionBoard {
    const mission = findMissionDefinition(missionId);
    if (!mission) {
      throw new Error(`Unknown mission: ${missionId}`);
    }
    const nowIso = new Date().toISOString();
    const dateKey = getMissionDateKey();
    const progress = this.getMissionProgress(dateKey, missionId);
    const progressValue = progress?.progress ?? 0;
    if (progressValue < mission.goal) {
      throw new Error("미션이 아직 완료되지 않았습니다.");
    }
    if (progress?.claimed) {
      throw new Error("이미 받은 보상입니다.");
    }

    this.saveMissionProgress({
      ...(progress ?? createEmptyMissionProgress(dateKey, missionId, nowIso)),
      progress: Math.min(mission.goal, progressValue),
      claimed: true,
      claimedAt: nowIso,
      updatedAt: nowIso
    });
    this.addDiamondTransaction({
      amount: mission.rewardDiamonds,
      reason: mission.title,
      missionId,
      profileId: normalizeProfileId(profileId),
      dateKey,
      createdAt: nowIso
    });
    this.persist();
    return this.getTodayMissions(profileId);
  }

  claimDailyBonus(profileId: ProfileId = DEFAULT_PROFILE_ID): DailyMissionBoard {
    const board = this.getTodayMissions(profileId);
    if (!board.bonus.claimable) {
      throw new Error("오늘 보너스를 받을 수 없습니다.");
    }
    const nowIso = new Date().toISOString();
    const dateKey = board.dateKey;
    const progress = this.getMissionProgress(dateKey, dailyBonusDefinition.id);
    this.saveMissionProgress({
      ...(progress ?? createEmptyMissionProgress(dateKey, dailyBonusDefinition.id, nowIso)),
      progress: 1,
      claimed: true,
      claimedAt: nowIso,
      updatedAt: nowIso
    });
    this.addDiamondTransaction({
      amount: dailyBonusDefinition.rewardDiamonds,
      reason: dailyBonusDefinition.title,
      missionId: dailyBonusDefinition.id,
      profileId: normalizeProfileId(profileId),
      dateKey,
      createdAt: nowIso
    });
    this.persist();
    return this.getTodayMissions(profileId);
  }

  deleteProfileData(profileIdInput: ProfileId): ProfileDataDeleteResult {
    const profileId = normalizeProfileId(profileIdInput);
    if (profileId === DEFAULT_PROFILE_ID) {
      throw new Error("The default profile data cannot be deleted.");
    }
    const counts: ProfileDataDeleteResult = {
      profileId,
      cards: 0,
      translationCacheEntries: 0,
      exportRecords: 0,
      missionEvents: 0,
      walletTransactions: 0,
      lifeLogsUpdated: 0
    };

    this.transaction(() => {
      const cardIds = this.all<{ id: string }>("SELECT id FROM cards WHERE profile_id = ?", [profileId]);
      for (const { id } of cardIds) {
        this.run("DELETE FROM vocabulary_items WHERE card_id = ?", [id]);
        this.run("DELETE FROM highlight_mappings WHERE card_id = ?", [id]);
        this.run("DELETE FROM reviews WHERE card_id = ?", [id]);
      }
      this.run("DELETE FROM cards WHERE profile_id = ?", [profileId]);
      counts.cards = this.ensureDb().getRowsModified();
      this.run("DELETE FROM translation_cache WHERE profile_id = ?", [profileId]);
      counts.translationCacheEntries = this.ensureDb().getRowsModified();
      this.run("DELETE FROM export_records WHERE profile_id = ?", [profileId]);
      counts.exportRecords = this.ensureDb().getRowsModified();
      this.run("DELETE FROM mission_events WHERE profile_id = ?", [profileId]);
      counts.missionEvents = this.ensureDb().getRowsModified();
      this.run("UPDATE diamond_transactions SET profile_id = NULL WHERE profile_id = ?", [profileId]);
      counts.walletTransactions = this.ensureDb().getRowsModified();

      const lifeLogs = this.all<{ id: string; metadata_json: string | null }>(
        "SELECT id, metadata_json FROM life_logs WHERE metadata_json IS NOT NULL"
      );
      for (const row of lifeLogs) {
        const metadata = parseLifeLogMetadata(row.metadata_json);
        const nextMetadata = removeLifeLogProfileProgress(metadata, profileId);
        if (JSON.stringify(nextMetadata) === JSON.stringify(metadata)) continue;
        this.run("UPDATE life_logs SET metadata_json = ? WHERE id = ?", [
          nextMetadata ? JSON.stringify(nextMetadata) : null,
          row.id
        ]);
        counts.lifeLogsUpdated += 1;
      }
    });
    this.persist();
    return counts;
  }

  deleteAllLearningData(): PrivacyDatabaseDeleteCounts {
    const countRows = (tableName: string) =>
      this.all<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`)[0]?.count ?? 0;
    const counts: PrivacyDatabaseDeleteCounts = {
      cards: countRows("cards"),
      vocabularyItems: countRows("vocabulary_items"),
      highlightMappings: countRows("highlight_mappings"),
      lifeLogs: countRows("life_logs"),
      listeningVideoCandidates: countRows("listening_video_candidates"),
      listeningTranscripts: countRows("listening_transcripts"),
      reviews: countRows("reviews"),
      translationCacheEntries: countRows("translation_cache"),
      exportRecords: countRows("export_records"),
      diamondWallets: countRows("diamond_wallet"),
      diamondTransactions: countRows("diamond_transactions"),
      missionEvents: countRows("mission_events"),
      dailyMissionProgress: countRows("daily_mission_progress"),
      totalRows: 0
    };
    counts.totalRows = Object.entries(counts)
      .filter(([name]) => name !== "totalRows")
      .reduce((total, [, count]) => total + count, 0);

    this.transaction(() => {
      for (const tableName of privacyDeleteTableOrder) {
        this.run(`DELETE FROM ${tableName}`);
      }
    });

    // Rebuild the SQLite file so deleted text is not retained in freelist pages.
    this.exec("VACUUM");
    // The second durable write replaces the recovery copy made by the first write
    // with the already-cleared database rather than the pre-deletion database.
    this.persist();
    this.persist();
    return counts;
  }

  verifyPrivacyDeletion(): PrivacyDatabaseDeleteVerification {
    const remainingRows = privacyDeleteTableOrder.reduce(
      (total, tableName) =>
        total +
        (this.all<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`)[0]?.count ?? 0),
      0
    );
    const freelistPages =
      this.all<{ freelist_count: number }>("PRAGMA freelist_count")[0]?.freelist_count ?? -1;
    const integrityRows = this.all<Record<string, string>>("PRAGMA integrity_check");
    const integrityOk =
      integrityRows.length === 1 &&
      Object.values(integrityRows[0] ?? {}).some((value) => value === "ok");
    const exported = Buffer.from(this.ensureDb().export());
    const durableCopiesVerified = [this.dbPath, `${this.dbPath}.bak`].every((filePath) => {
      try {
        const stat = fs.lstatSync(filePath);
        return stat.isFile() && !stat.isSymbolicLink() && fs.readFileSync(filePath).equals(exported);
      } catch {
        return false;
      }
    });
    return {
      remainingRows,
      freelistPages,
      integrityOk,
      durableCopiesVerified
    };
  }

  private writeCard(card: StudyCard, options: { preserveTimestamps: boolean }): StudyCard {
    const now = new Date().toISOString();
    const existing = this.getCard(card.id);
    const createdAt = options.preserveTimestamps
      ? card.createdAt || existing?.createdAt || now
      : existing?.createdAt ?? now;
    const updatedAt = options.preserveTimestamps ? card.updatedAt || now : now;
    const normalizedCard = normalizeCardDeck({
      ...card,
      profileId: normalizeProfileId(card.profileId),
      createdAt,
      updatedAt
    });

    this.run(
      `INSERT OR REPLACE INTO cards (
        id, profile_id, card_type, source_sentence, target_text, front_text,
        literal_translation_ko, natural_translation_ko, structure_note,
        card_json, created_at, updated_at, due_at, interval_days,
        ease_factor, review_count, lapse_count, last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCard.id,
        normalizeProfileId(normalizedCard.profileId),
        normalizedCard.cardType,
        normalizedCard.sourceSentence,
        normalizedCard.targetText ?? null,
        normalizedCard.frontText,
        normalizedCard.literalTranslationKo ?? null,
        normalizedCard.naturalTranslationKo ?? null,
        normalizedCard.structureNote ?? null,
        JSON.stringify(normalizedCard),
        createdAt,
        updatedAt,
        normalizedCard.srs.dueAt,
        normalizedCard.srs.intervalDays,
        normalizedCard.srs.easeFactor,
        normalizedCard.srs.reviewCount,
        normalizedCard.srs.lapseCount,
        normalizedCard.srs.lastReviewedAt ?? null
      ]
    );

    this.run(`DELETE FROM vocabulary_items WHERE card_id = ?`, [normalizedCard.id]);
    this.run(`DELETE FROM highlight_mappings WHERE card_id = ?`, [normalizedCard.id]);

    normalizedCard.vocabularyItems.forEach((item) => {
      this.run(
        `INSERT INTO vocabulary_items (
          id, card_id, term, normalized_term, ipa, part_of_speech,
          basic_meaning_ko, meaning_in_context_ko, color_key, examples_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          normalizedCard.id,
          item.term,
          item.term.trim().toLowerCase(),
          item.ipa ?? null,
          item.partOfSpeech ?? null,
          item.basicMeaningKo,
          item.meaningInContextKo ?? null,
          item.colorKey,
          JSON.stringify(item.examples)
        ]
      );
    });

    normalizedCard.highlightMappings.forEach((mapping) => {
      this.run(
        `INSERT INTO highlight_mappings (
          id, card_id, source_text, literal_ko, natural_ko, color_key
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          normalizedCard.id,
          mapping.sourceText,
          mapping.literalKo ?? null,
          mapping.naturalKo ?? null,
          mapping.colorKey
        ]
      );
    });

    if (!options.preserveTimestamps) {
      this.persist();
    }
    return normalizedCard;
  }

  deleteCard(id: string) {
    this.run(`DELETE FROM vocabulary_items WHERE card_id = ?`, [id]);
    this.run(`DELETE FROM highlight_mappings WHERE card_id = ?`, [id]);
    this.run(`DELETE FROM reviews WHERE card_id = ?`, [id]);
    this.run(`DELETE FROM cards WHERE id = ?`, [id]);
    this.persist();
  }

  clearAllCards() {
    const before = {
      cards: this.all<{ count: number }>("SELECT COUNT(*) AS count FROM cards")[0]?.count ?? 0,
      vocabularyItems:
        this.all<{ count: number }>("SELECT COUNT(*) AS count FROM vocabulary_items")[0]?.count ?? 0,
      highlightMappings:
        this.all<{ count: number }>("SELECT COUNT(*) AS count FROM highlight_mappings")[0]?.count ?? 0,
      reviews: this.all<{ count: number }>("SELECT COUNT(*) AS count FROM reviews")[0]?.count ?? 0
    };
    this.transaction(() => {
      this.run("DELETE FROM reviews");
      this.run("DELETE FROM vocabulary_items");
      this.run("DELETE FROM highlight_mappings");
      this.run("DELETE FROM cards");
    });
    // Keep the durable recovery copy in the same cleared state as the primary database.
    this.persist();
    this.persist();
    return {
      before,
      after: {
        cards: 0,
        vocabularyItems: 0,
        highlightMappings: 0,
        reviews: 0
      }
    };
  }

  reviewCard(cardId: string, rating: ReviewRating): StudyCard {
    const card = this.getCard(cardId);
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    const previousDueAt = card.srs.dueAt;
    const now = new Date();
    const nextSrs = scheduleCardReview(card.srs, rating, now);

    const updated = this.saveCard({ ...card, srs: nextSrs });
    this.run(
      `INSERT INTO reviews (
        id, card_id, rating, reviewed_at, previous_due_at, next_due_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        cardId,
        rating,
        now.toISOString(),
        previousDueAt,
        nextSrs.dueAt
      ]
    );
    this.persist();
    return updated;
  }

  listLifeLogs(): LifeLog[] {
    const rows = this.all<LifeLogRow>(
      `SELECT * FROM life_logs ORDER BY datetime(created_at) DESC`
    );
    return rows.map(lifeLogFromRow);
  }

  listLifeLogsPage(offsetInput = 0, limitInput = 100): LifeLogPageResult {
    const offset = normalizePageOffset(offsetInput);
    const limit = normalizePageLimit(limitInput);
    const total = this.all<{ count: number }>("SELECT COUNT(*) AS count FROM life_logs")[0]?.count ?? 0;
    const items = this.all<LifeLogRow>(
      "SELECT * FROM life_logs ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?",
      [limit, offset]
    ).map(lifeLogFromRow);
    return { items, total, offset, limit };
  }

  saveLifeLog(input: Omit<LifeLog, "id" | "processed" | "createdAt">): LifeLog {
    const lifeLog: LifeLog = {
      id: randomUUID(),
      text: input.text,
      beforeContext: input.beforeContext,
      afterContext: input.afterContext,
      appName: input.appName,
      metadata: input.metadata,
      sourceType: input.sourceType,
      processed: false,
      createdAt: new Date().toISOString()
    };

    this.run(
      `INSERT INTO life_logs (
        id, text, before_context, after_context, app_name, metadata_json, source_type,
        processed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lifeLog.id,
        lifeLog.text,
        lifeLog.beforeContext ?? null,
        lifeLog.afterContext ?? null,
        lifeLog.appName ?? null,
        lifeLog.metadata ? JSON.stringify(lifeLog.metadata) : null,
        lifeLog.sourceType,
        0,
        lifeLog.createdAt
      ]
    );
    this.persist();
    return lifeLog;
  }

  markLifeLogProcessed(id: string, profileId: ProfileId = DEFAULT_PROFILE_ID) {
    const [row] = this.all<Pick<LifeLogRow, "metadata_json">>(
      `SELECT metadata_json FROM life_logs WHERE id = ? LIMIT 1`,
      [id]
    );
    const metadata = markLifeLogMetadataProcessedForProfile(
      parseLifeLogMetadata(row?.metadata_json ?? null),
      profileId
    );
    this.run(`UPDATE life_logs SET processed = 1, metadata_json = ? WHERE id = ?`, [
      JSON.stringify(metadata),
      id
    ]);
    this.persist();
  }

  deleteLifeLog(id: string) {
    this.run(`DELETE FROM life_logs WHERE id = ?`, [id]);
    this.persist();
  }

  listListeningVideoCandidates(limit = 100): ListeningVideoCandidate[] {
    const rows = this.all<ListeningVideoCandidateRow>(
      `SELECT * FROM listening_video_candidates
       ORDER BY datetime(last_seen_at) DESC
       LIMIT ?`,
      [Math.max(1, Math.min(500, Math.floor(limit)))]
    );
    return rows.map(listeningVideoCandidateFromRow);
  }

  getListeningVideoCandidate(id: string): ListeningVideoCandidate | null {
    const rows = this.all<ListeningVideoCandidateRow>(
      `SELECT * FROM listening_video_candidates WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? listeningVideoCandidateFromRow(rows[0]) : null;
  }

  saveListeningVideoCandidate(
    input: ListeningVideoCandidateInput
  ): ListeningVideoCandidate {
    const now = input.collectedAt ?? new Date().toISOString();
    const id = getListeningVideoCandidateId(input);
    const existingRows = this.all<ListeningVideoCandidateRow>(
      `SELECT * FROM listening_video_candidates WHERE id = ? LIMIT 1`,
      [id]
    );
    const existing = existingRows[0]
      ? listeningVideoCandidateFromRow(existingRows[0])
      : null;
    const nextMetadata = mergeListeningCandidateMetadata(existing?.metadata, input.metadata);
    const candidate: ListeningVideoCandidate = {
      id,
      sourceType: input.sourceType,
      videoId: input.videoId.trim(),
      url: input.url.trim(),
      title: input.title.trim(),
      languageCode:
        normalizeOptionalText(input.languageCode) ??
        existing?.languageCode ??
        normalizeOptionalText(
          typeof nextMetadata?.languageCode === "string" ? nextMetadata.languageCode : undefined
        ),
      channelName: normalizeOptionalText(input.channelName) ?? existing?.channelName,
      channelUrl: normalizeOptionalText(input.channelUrl) ?? existing?.channelUrl,
      thumbnailUrl: normalizeOptionalText(input.thumbnailUrl) ?? existing?.thumbnailUrl,
      durationSeconds: normalizeOptionalNumber(input.durationSeconds) ?? existing?.durationSeconds,
      watchedSeconds: normalizeOptionalNumber(input.watchedSeconds) ?? existing?.watchedSeconds,
      progressRatio: normalizeOptionalNumber(input.progressRatio) ?? existing?.progressRatio,
      lastPositionSeconds:
        normalizeOptionalNumber(input.lastPositionSeconds) ?? existing?.lastPositionSeconds,
      collectedAt: input.collectedAt,
      metadata: nextMetadata,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      watchCount: (existing?.watchCount ?? 0) + 1
    };

    this.run(
      `INSERT OR REPLACE INTO listening_video_candidates (
        id, source_type, video_id, url, title, language_code, channel_name, channel_url, thumbnail_url,
        duration_seconds, watched_seconds, progress_ratio, last_position_seconds,
        metadata_json, first_seen_at, last_seen_at, watch_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidate.id,
        candidate.sourceType,
        candidate.videoId,
        candidate.url,
        candidate.title,
        candidate.languageCode ?? null,
        candidate.channelName ?? null,
        candidate.channelUrl ?? null,
        candidate.thumbnailUrl ?? null,
        candidate.durationSeconds ?? null,
        candidate.watchedSeconds ?? null,
        candidate.progressRatio ?? null,
        candidate.lastPositionSeconds ?? null,
        candidate.metadata ? JSON.stringify(candidate.metadata) : null,
        candidate.firstSeenAt,
        candidate.lastSeenAt,
        candidate.watchCount
      ]
    );
    this.persist();
    return candidate;
  }

  updateListeningVideoCandidateMetadata(
    id: string,
    input: Partial<
      Pick<
        ListeningVideoCandidateInput,
        "channelName" | "thumbnailUrl" | "durationSeconds" | "languageCode" | "metadata"
      >
    >
  ): ListeningVideoCandidate | null {
    const existing = this.getListeningVideoCandidate(id);
    if (!existing) {
      return null;
    }

    const nextMetadata = mergeListeningCandidateMetadata(existing.metadata, input.metadata);
    const candidate: ListeningVideoCandidate = {
      ...existing,
      languageCode:
        normalizeOptionalText(input.languageCode) ??
        existing.languageCode ??
        normalizeOptionalText(
          typeof nextMetadata?.languageCode === "string" ? nextMetadata.languageCode : undefined
        ),
      channelName: normalizeOptionalText(input.channelName) ?? existing.channelName,
      thumbnailUrl: normalizeOptionalText(input.thumbnailUrl) ?? existing.thumbnailUrl,
      durationSeconds:
        normalizeOptionalNumber(input.durationSeconds) ?? existing.durationSeconds,
      metadata: nextMetadata
    };

    this.run(
      `UPDATE listening_video_candidates
       SET language_code = ?, channel_name = ?, thumbnail_url = ?, duration_seconds = ?, metadata_json = ?
       WHERE id = ?`,
      [
        candidate.languageCode ?? null,
        candidate.channelName ?? null,
        candidate.thumbnailUrl ?? null,
        candidate.durationSeconds ?? null,
        candidate.metadata ? JSON.stringify(candidate.metadata) : null,
        candidate.id
      ]
    );
    this.persist();
    return candidate;
  }

  listListeningTranscripts(): ListeningTranscript[] {
    const rows = this.all<ListeningTranscriptRow>(
      `SELECT * FROM listening_transcripts ORDER BY datetime(updated_at) DESC`
    );
    return rows.map(listeningTranscriptFromRow);
  }

  getListeningTranscript(candidateId: string): ListeningTranscript | null {
    const rows = this.all<ListeningTranscriptRow>(
      `SELECT * FROM listening_transcripts WHERE candidate_id = ? LIMIT 1`,
      [candidateId]
    );
    return rows[0] ? listeningTranscriptFromRow(rows[0]) : null;
  }

  saveListeningTranscript(transcript: ListeningTranscript): ListeningTranscript {
    const existing = this.getListeningTranscript(transcript.candidateId);
    const now = new Date().toISOString();
    const saved: ListeningTranscript = {
      ...transcript,
      id: existing?.id ?? transcript.id,
      createdAt: existing?.createdAt ?? transcript.createdAt ?? now,
      updatedAt: now
    };
    this.run(
      `INSERT OR REPLACE INTO listening_transcripts (
        id, candidate_id, video_id, title, channel_name, language_code, status, segments_json,
        error_message, audio_path, model_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saved.id,
        saved.candidateId,
        saved.videoId,
        saved.title,
        saved.channelName ?? null,
        saved.languageCode ?? null,
        saved.status,
        JSON.stringify(saved.segments),
        saved.errorMessage ?? null,
        saved.audioPath ?? null,
        saved.modelName,
        saved.createdAt,
        saved.updatedAt
      ]
    );
    this.persist();
    return saved;
  }

  getTranslationCache(input: TranslationCacheLookupInput): TranslationCacheEntry | null {
    const cacheKey = getTranslationCacheKey(input);
    const rows = this.all<TranslationCacheRow>(
      `SELECT * FROM translation_cache WHERE profile_id = ? AND cache_key = ? LIMIT 1`,
      [normalizeProfileId(input.profileId), cacheKey]
    );
    return rows[0] ? translationCacheFromRow(rows[0]) : null;
  }

  saveTranslationCache(
    input: TranslationCacheLookupInput & { translatedText: string }
  ): TranslationCacheEntry {
    const now = new Date().toISOString();
    const cacheKey = getTranslationCacheKey(input);
    const existing = this.getTranslationCache(input);
    const entry: TranslationCacheEntry = {
      id: existing?.id ?? randomUUID(),
      profileId: normalizeProfileId(input.profileId),
      providerName: input.providerName,
      sourceLang: normalizeSourceLang(input.sourceLang),
      targetLang: normalizeTargetLang(input.targetLang),
      sourceHash: hashText(normalizeTranslationText(input.text)),
      sourceText: input.text.trim(),
      translatedText: input.translatedText,
      model: normalizeTranslationModel(input.model),
      promptVersion: normalizePromptVersion(input.promptVersion),
      contextHash: normalizeContextHash(input.contextHash),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.run(
      `INSERT OR REPLACE INTO translation_cache (
        id, profile_id, cache_key, provider_name, source_lang, target_lang, source_hash,
        source_text, translated_text, model, prompt_version, context_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.profileId ?? DEFAULT_PROFILE_ID,
        cacheKey,
        entry.providerName,
        entry.sourceLang,
        entry.targetLang,
        entry.sourceHash,
        entry.sourceText,
        entry.translatedText,
        entry.model ?? null,
        entry.promptVersion ?? null,
        entry.contextHash ?? null,
        entry.createdAt,
        entry.updatedAt
      ]
    );
    this.persist();
    return entry;
  }

  listExportRecords(profileId: ProfileId = DEFAULT_PROFILE_ID): BilingualExportHistoryRecord[] {
    const rows = this.all<ExportRecordRow>(
      `SELECT * FROM export_records
       WHERE profile_id = ?
       ORDER BY datetime(created_at) DESC`,
      [normalizeProfileId(profileId)]
    );
    return rows.map(exportRecordFromRow);
  }

  saveExportRecord(record: BilingualExportHistoryRecord): BilingualExportHistoryRecord {
    this.run(
      `INSERT OR REPLACE INTO export_records (
        id, profile_id, title, file_path, file_type, page_range, page_count, segment_count,
        provider_label, source_language_label, target_language_label, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        normalizeProfileId(record.profileId),
        record.title,
        record.filePath,
        record.fileType,
        record.pageRange,
        record.pageCount,
        record.segmentCount,
        record.providerLabel,
        record.sourceLanguageLabel,
        record.targetLanguageLabel,
        record.createdAt
      ]
    );
    this.persist();
    return record;
  }

  private listMissionProgress(dateKey: string): DailyMissionProgress[] {
    return this.all<MissionProgressRow>(
      `SELECT * FROM daily_mission_progress WHERE date_key = ?`,
      [dateKey]
    ).map(missionProgressFromRow);
  }

  private getMissionProgress(
    dateKey: string,
    missionId: DailyMissionProgress["missionId"]
  ): DailyMissionProgress | null {
    const row = this.all<MissionProgressRow>(
      `SELECT * FROM daily_mission_progress
       WHERE date_key = ? AND mission_id = ?
       LIMIT 1`,
      [dateKey, missionId]
    )[0];
    return row ? missionProgressFromRow(row) : null;
  }

  private incrementMissionProgress(
    dateKey: string,
    missionId: DailyMissionId,
    amount: number,
    nowIso: string
  ) {
    const mission = findMissionDefinition(missionId);
    const existing = this.getMissionProgress(dateKey, missionId);
    const nextProgress = Math.min(
      mission?.goal ?? Number.MAX_SAFE_INTEGER,
      Math.max(0, existing?.progress ?? 0) + amount
    );
    this.saveMissionProgress({
      ...(existing ?? createEmptyMissionProgress(dateKey, missionId, nowIso)),
      progress: nextProgress,
      updatedAt: nowIso
    });
  }

  private saveMissionProgress(progress: DailyMissionProgress) {
    this.run(
      `INSERT OR REPLACE INTO daily_mission_progress (
        date_key, mission_id, progress, claimed, claimed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        progress.dateKey,
        progress.missionId,
        progress.progress,
        progress.claimed ? 1 : 0,
        progress.claimedAt ?? null,
        progress.updatedAt
      ]
    );
  }

  private listDiamondTransactionsForDate(dateKey: string): DiamondTransaction[] {
    return this.all<DiamondTransactionRow>(
      `SELECT * FROM diamond_transactions WHERE date_key = ? ORDER BY datetime(created_at) DESC`,
      [dateKey]
    ).map(diamondTransactionFromRow);
  }

  private addDiamondTransaction(input: {
    amount: number;
    reason: string;
    missionId?: DiamondTransaction["missionId"];
    profileId?: ProfileId;
    dateKey: string;
    createdAt: string;
  }) {
    const wallet = this.getDiamondWallet();
    const amount = Math.max(0, Math.floor(input.amount));
    const nextWallet: DiamondWallet = {
      balance: wallet.balance + amount,
      totalEarned: wallet.totalEarned + amount,
      totalSpent: wallet.totalSpent,
      updatedAt: input.createdAt
    };
    this.run(
      `INSERT OR REPLACE INTO diamond_wallet (
        id, balance, total_earned, total_spent, updated_at
      ) VALUES ('default', ?, ?, ?, ?)`,
      [
        nextWallet.balance,
        nextWallet.totalEarned,
        nextWallet.totalSpent,
        nextWallet.updatedAt
      ]
    );
    this.run(
      `INSERT INTO diamond_transactions (
        id, transaction_type, amount, balance_after, reason,
        mission_id, profile_id, date_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        "earn",
        amount,
        nextWallet.balance,
        input.reason,
        input.missionId ?? null,
        normalizeProfileId(input.profileId),
        input.dateKey,
        input.createdAt
      ]
    );
  }

  private getCard(id: string): StudyCard | null {
    const rows = this.all<CardRow>(`SELECT * FROM cards WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? cardFromRow(rows[0]) : null;
  }

  private applySchema() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL DEFAULT 'profile-english',
        card_type TEXT NOT NULL,
        source_sentence TEXT NOT NULL,
        target_text TEXT,
        front_text TEXT NOT NULL,
        literal_translation_ko TEXT,
        natural_translation_ko TEXT,
        structure_note TEXT,
        card_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        due_at TEXT NOT NULL,
        interval_days REAL DEFAULT 0,
        ease_factor REAL DEFAULT 2.5,
        review_count INTEGER DEFAULT 0,
        lapse_count INTEGER DEFAULT 0,
        last_reviewed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS vocabulary_items (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        term TEXT NOT NULL,
        normalized_term TEXT NOT NULL,
        ipa TEXT,
        part_of_speech TEXT,
        basic_meaning_ko TEXT NOT NULL,
        meaning_in_context_ko TEXT,
        color_key TEXT NOT NULL,
        examples_json TEXT NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      );

      CREATE TABLE IF NOT EXISTS highlight_mappings (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        source_text TEXT NOT NULL,
        literal_ko TEXT,
        natural_ko TEXT,
        color_key TEXT NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      );

      CREATE TABLE IF NOT EXISTS life_logs (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        before_context TEXT,
        after_context TEXT,
        app_name TEXT,
        metadata_json TEXT,
        source_type TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS listening_video_candidates (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        video_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        language_code TEXT,
        channel_name TEXT,
        channel_url TEXT,
        thumbnail_url TEXT,
        duration_seconds REAL,
        watched_seconds REAL,
        progress_ratio REAL,
        last_position_seconds REAL,
        metadata_json TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        watch_count INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS listening_transcripts (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL UNIQUE,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel_name TEXT,
        language_code TEXT,
        status TEXT NOT NULL,
        segments_json TEXT NOT NULL,
        error_message TEXT,
        audio_path TEXT,
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(candidate_id) REFERENCES listening_video_candidates(id)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        rating TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        previous_due_at TEXT NOT NULL,
        next_due_at TEXT NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      );

      CREATE TABLE IF NOT EXISTS translation_cache (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL DEFAULT 'profile-english',
        cache_key TEXT NOT NULL UNIQUE,
        provider_name TEXT NOT NULL,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        model TEXT,
        prompt_version TEXT,
        context_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS export_records (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL DEFAULT 'profile-english',
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        page_range TEXT NOT NULL,
        page_count INTEGER NOT NULL,
        segment_count INTEGER NOT NULL,
        provider_label TEXT NOT NULL,
        source_language_label TEXT NOT NULL,
        target_language_label TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diamond_wallet (
        id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        total_earned INTEGER NOT NULL DEFAULT 0,
        total_spent INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diamond_transactions (
        id TEXT PRIMARY KEY,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        mission_id TEXT,
        profile_id TEXT,
        date_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        idempotency_key TEXT
      );

      CREATE TABLE IF NOT EXISTS mission_events (
        id TEXT PRIMARY KEY,
        date_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        profile_id TEXT,
        amount INTEGER NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_mission_progress (
        date_key TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        claimed INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(date_key, mission_id)
      );

      CREATE INDEX IF NOT EXISTS idx_life_logs_created_at ON life_logs(created_at);
    `);

    this.addColumnIfMissing("cards", "profile_id", "TEXT NOT NULL DEFAULT 'profile-english'");
    this.addColumnIfMissing("translation_cache", "model", "TEXT");
    this.addColumnIfMissing("translation_cache", "prompt_version", "TEXT");
    this.addColumnIfMissing("translation_cache", "context_hash", "TEXT");
    this.addColumnIfMissing(
      "translation_cache",
      "profile_id",
      "TEXT NOT NULL DEFAULT 'profile-english'"
    );
    this.addColumnIfMissing(
      "export_records",
      "profile_id",
      "TEXT NOT NULL DEFAULT 'profile-english'"
    );
    this.addColumnIfMissing("life_logs", "metadata_json", "TEXT");
    this.addColumnIfMissing("diamond_transactions", "idempotency_key", "TEXT");

    this.exec(`
      CREATE INDEX IF NOT EXISTS idx_cards_profile_due_at ON cards(profile_id, due_at);
      CREATE INDEX IF NOT EXISTS idx_translation_cache_hash
        ON translation_cache(profile_id, provider_name, source_lang, target_lang, source_hash);
      CREATE INDEX IF NOT EXISTS idx_export_records_profile_created_at
        ON export_records(profile_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_diamond_transactions_date
        ON diamond_transactions(date_key, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_transactions_idempotency
        ON diamond_transactions(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_mission_events_date_type
        ON mission_events(date_key, event_type);
      CREATE INDEX IF NOT EXISTS idx_listening_video_candidates_last_seen
        ON listening_video_candidates(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_listening_video_candidates_video
        ON listening_video_candidates(source_type, video_id);
      CREATE INDEX IF NOT EXISTS idx_listening_transcripts_status
        ON listening_transcripts(status, updated_at);
    `);
    this.addColumnIfMissing("listening_video_candidates", "language_code", "TEXT");
    this.addColumnIfMissing("listening_transcripts", "language_code", "TEXT");
  }

  private exec(sql: string) {
    this.ensureDb().exec(sql);
  }

  private run(sql: string, params: SqlValue[] = []) {
    this.ensureDb().run(sql, params);
  }

  private all<T extends object>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.ensureDb().prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  private transaction<T>(action: () => T): T {
    this.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const result = action();
      this.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction failure.
      }
      throw error;
    }
  }

  private persist() {
    const bytes = Buffer.from(this.ensureDb().export());
    const directory = path.dirname(this.dbPath);
    const tempPath = path.join(
      directory,
      `.${path.basename(this.dbPath)}.${process.pid}.${randomUUID()}.tmp`
    );
    const backupPath = `${this.dbPath}.bak`;
    const backupTempPath = `${backupPath}.${process.pid}.tmp`;
    try {
      const handle = fs.openSync(tempPath, "wx", 0o600);
      try {
        fs.writeFileSync(handle, bytes);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      if (fs.existsSync(this.dbPath)) {
        fs.copyFileSync(this.dbPath, backupTempPath);
        renameDatabaseFileWithRetry(backupTempPath, backupPath);
      }
      renameDatabaseFileWithRetry(tempPath, this.dbPath);
    } catch (error) {
      throw createSafeDatabasePersistenceError(error);
    } finally {
      for (const candidate of [tempPath, backupTempPath]) {
        try {
          if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
        } catch {
          // Stale temp files are never loaded as databases.
        }
      }
    }
  }

  private addColumnIfMissing(tableName: string, columnName: string, definition: string) {
    const columns = this.all<{ name: string }>(`PRAGMA table_info(${tableName})`);
    if (!columns.some((column) => column.name === columnName)) {
      this.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error("Database has not been initialized.");
    }
    return this.db;
  }
}

const appBackupTableColumns: Record<AppBackupTableName, string[]> = {
  cards: [
    "id", "profile_id", "card_type", "source_sentence", "target_text", "front_text",
    "literal_translation_ko", "natural_translation_ko", "structure_note", "card_json",
    "created_at", "updated_at", "due_at", "interval_days", "ease_factor", "review_count",
    "lapse_count", "last_reviewed_at"
  ],
  vocabulary_items: [
    "id", "card_id", "term", "normalized_term", "ipa", "part_of_speech",
    "basic_meaning_ko", "meaning_in_context_ko", "color_key", "examples_json"
  ],
  highlight_mappings: ["id", "card_id", "source_text", "literal_ko", "natural_ko", "color_key"],
  life_logs: [
    "id", "text", "before_context", "after_context", "app_name", "metadata_json",
    "source_type", "processed", "created_at"
  ],
  listening_video_candidates: [
    "id", "source_type", "video_id", "url", "title", "language_code", "channel_name",
    "channel_url", "thumbnail_url", "duration_seconds", "watched_seconds", "progress_ratio",
    "last_position_seconds", "metadata_json", "first_seen_at", "last_seen_at", "watch_count"
  ],
  listening_transcripts: [
    "id", "candidate_id", "video_id", "title", "channel_name", "language_code", "status",
    "segments_json", "error_message", "audio_path", "model_name", "created_at", "updated_at"
  ],
  reviews: ["id", "card_id", "rating", "reviewed_at", "previous_due_at", "next_due_at"],
  export_records: [
    "id", "profile_id", "title", "file_path", "file_type", "page_range", "page_count",
    "segment_count", "provider_label", "source_language_label", "target_language_label", "created_at"
  ],
  diamond_wallet: ["id", "balance", "total_earned", "total_spent", "updated_at"],
  diamond_transactions: [
    "id", "transaction_type", "amount", "balance_after", "reason", "mission_id", "profile_id",
    "date_key", "created_at", "idempotency_key"
  ],
  mission_events: ["id", "date_key", "event_type", "profile_id", "amount", "metadata_json", "created_at"],
  daily_mission_progress: [
    "date_key", "mission_id", "progress", "claimed", "claimed_at", "updated_at"
  ]
};

const appBackupDeleteOrder: AppBackupTableName[] = [
  "reviews",
  "vocabulary_items",
  "highlight_mappings",
  "cards",
  "listening_transcripts",
  "listening_video_candidates",
  "life_logs",
  "export_records",
  "diamond_transactions",
  "diamond_wallet",
  "mission_events",
  "daily_mission_progress"
];

const privacyDeleteTableOrder = [
  "reviews",
  "vocabulary_items",
  "highlight_mappings",
  "cards",
  "listening_transcripts",
  "listening_video_candidates",
  "life_logs",
  "translation_cache",
  "export_records",
  "diamond_transactions",
  "diamond_wallet",
  "mission_events",
  "daily_mission_progress"
] as const;

const appBackupInsertOrder: AppBackupTableName[] = [
  "cards",
  "vocabulary_items",
  "highlight_mappings",
  "reviews",
  "life_logs",
  "listening_video_candidates",
  "listening_transcripts",
  "export_records",
  "diamond_wallet",
  "diamond_transactions",
  "mission_events",
  "daily_mission_progress"
];

const appBackupGlobalStateTables = new Set<AppBackupTableName>([
  "diamond_wallet",
  "diamond_transactions",
  "mission_events",
  "daily_mission_progress"
]);

const appBackupNewProfileEntityTables = [
  "cards",
  "vocabulary_items",
  "highlight_mappings",
  "reviews",
  "life_logs",
  "listening_video_candidates",
  "listening_transcripts",
  "export_records"
] as const satisfies readonly AppBackupTableName[];

const appBackupEntityForeignKeyColumns: Partial<Record<AppBackupTableName, string[]>> = {
  vocabulary_items: ["card_id"],
  highlight_mappings: ["card_id"],
  reviews: ["card_id"],
  listening_transcripts: ["candidate_id"]
};

type AppBackupEntityIdMap = ReadonlyMap<string, string>;

function sanitizeBackupDatabaseRow(
  tableName: AppBackupTableName,
  row: Record<string, SqlValue>
): AppBackupRow {
  const next: AppBackupRow = {};
  for (const column of appBackupTableColumns[tableName]) {
    if (!(column in row)) continue;
    let value: unknown = row[column];
    if (tableName === "listening_transcripts" && column === "audio_path") {
      value = null;
    } else if (tableName === "export_records" && column === "file_path") {
      value = "";
    } else if (column.endsWith("_json") && typeof value === "string") {
      try {
        value = JSON.stringify(sanitizeAppBackupValue(JSON.parse(value)));
      } catch {
        value = "{}";
      }
    }
    next[column] = normalizeBackupScalar(value);
  }
  return next;
}

function copyBackupDatabaseRow(
  tableName: AppBackupTableName,
  row: Record<string, SqlValue>
): AppBackupRow {
  const next: AppBackupRow = {};
  for (const column of appBackupTableColumns[tableName]) {
    if (column in row) next[column] = normalizeBackupScalar(row[column]);
  }
  return next;
}

function prepareBackupRowForRestore(
  tableName: AppBackupTableName,
  sourceRow: AppBackupRow,
  profileIdMap: Record<string, string>,
  entityIdMap: AppBackupEntityIdMap,
  sanitizeForPublicBackup: boolean
): AppBackupRow {
  const row = sanitizeForPublicBackup
    ? sanitizeBackupDatabaseRow(tableName, sourceRow)
    : copyBackupDatabaseRow(tableName, sourceRow);
  if (typeof row.profile_id === "string") {
    row.profile_id = Object.prototype.hasOwnProperty.call(profileIdMap, row.profile_id)
      ? profileIdMap[row.profile_id]
      : row.profile_id;
  }
  if (typeof row.id === "string") {
    row.id = entityIdMap.get(row.id) ?? row.id;
  }
  for (const column of appBackupEntityForeignKeyColumns[tableName] ?? []) {
    const value = row[column];
    if (typeof value === "string") {
      row[column] = entityIdMap.get(value) ?? value;
    }
  }
  const shouldRewriteJson =
    sanitizeForPublicBackup || entityIdMap.size > 0 || Object.keys(profileIdMap).length > 0;
  if (shouldRewriteJson) {
    for (const column of appBackupTableColumns[tableName].filter((name) => name.endsWith("_json"))) {
      const value = row[column];
      if (typeof value !== "string" || !value) continue;
      try {
        const entityRemapped = remapBackupExactIds(JSON.parse(value), entityIdMap);
        row[column] = JSON.stringify(remapBackupProfileId(entityRemapped, profileIdMap));
      } catch {
        row[column] = "{}";
      }
    }
  }
  if (sanitizeForPublicBackup && tableName === "export_records") row.file_path = "";
  if (sanitizeForPublicBackup && tableName === "listening_transcripts") row.audio_path = null;
  return row;
}

function createNewProfileBackupEntityIdMap(
  snapshot: AppBackupDatabaseSnapshot
): AppBackupEntityIdMap {
  const idMap = new Map<string, string>();
  for (const tableName of appBackupNewProfileEntityTables) {
    for (const row of snapshot.tables[tableName] ?? []) {
      const sourceId = row.id;
      if (typeof sourceId !== "string" || !sourceId || idMap.has(sourceId)) continue;
      idMap.set(sourceId, randomUUID());
    }
  }
  return idMap;
}

function remapBackupExactIds(value: unknown, idMap: AppBackupEntityIdMap): unknown {
  if (typeof value === "string") {
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapBackupExactIds(item, idMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        idMap.get(key) ?? key,
        remapBackupExactIds(childValue, idMap)
      ])
    );
  }
  return value;
}

function normalizeBackupScalar(value: unknown): SqlValue {
  if (value === null || typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return JSON.stringify(value ?? null);
}

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9:._-]{7,199}$/.test(normalized) ? normalized : "";
}

function normalizeSpendReason(value: unknown) {
  if (typeof value !== "string") return "PlayZone diamond spend";
  return value.trim().replace(/\s+/g, " ").slice(0, 240) || "PlayZone diamond spend";
}

function spendFailure(
  code: Extract<DiamondSpendResult, { ok: false }>["code"],
  message: string,
  wallet: DiamondWallet
): DiamondSpendResult {
  return { ok: false, code, message, balance: wallet.balance, wallet };
}

function normalizePageOffset(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizePageLimit(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(500, Math.max(1, parsed)) : 100;
}
