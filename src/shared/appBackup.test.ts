import { describe, expect, it } from "vitest";
import {
  APP_BACKUP_FORMAT,
  APP_BACKUP_SCHEMA_VERSION,
  createEmptyAppBackupTables,
  remapBackupProfileId,
  sanitizeAppBackupValue,
  validateAppBackupDocumentShape
} from "./appBackup";

describe("app backup contract", () => {
  it("redacts local paths while preserving ordinary URLs and learning text", () => {
    expect(
      sanitizeAppBackupValue({
        audioPath: "C:\\Users\\person\\private.wav",
        mediaUrl: "https://example.com/audio.wav",
        nested: { file_path: "file:///C:/secret.pdf", text: "C: is a grade" }
      })
    ).toEqual({
      audioPath: null,
      mediaUrl: "https://example.com/audio.wav",
      nested: { file_path: null, text: "C: is a grade" }
    });
  });

  it("redacts credentials even when they are nested outside the settings object", () => {
    expect(
      sanitizeAppBackupValue({
        integration: {
          accessToken: "not-a-real-token",
          Authorization: "Bearer not-a-real-token",
          session_id: "not-a-real-session",
          providerName: "gemini"
        }
      })
    ).toEqual({
      integration: {
        accessToken: null,
        Authorization: null,
        session_id: null,
        providerName: "gemini"
      }
    });
  });

  it("remaps profile ids in nested card payloads", () => {
    expect(
      remapBackupProfileId(
        { profileId: "profile-a", metadata: { profiles: ["profile-a", "profile-b"] } },
        { "profile-a": "imported-a" }
      )
    ).toEqual({
      profileId: "imported-a",
      metadata: { profiles: ["imported-a", "profile-b"] }
    });
  });

  it("does not treat inherited object keys as profile-id mappings", () => {
    expect(
      remapBackupProfileId(
        {
          profileId: "profile-a",
          learningValues: ["toString", "constructor", "__proto__"]
        },
        { "profile-a": "profile-imported" }
      )
    ).toEqual({
      profileId: "profile-imported",
      learningValues: ["toString", "constructor", "__proto__"]
    });
  });

  it("rejects a backup without a valid checksum", () => {
    expect(() =>
      validateAppBackupDocumentShape({
        manifest: {
          format: APP_BACKUP_FORMAT,
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          appVersion: "0.1.0-beta.1",
          createdAt: "2026-01-01T00:00:00.000Z",
          profileIds: [],
          includedStores: [],
          excludedStores: [],
          redactions: []
        },
        payload: {
          database: {
            schemaVersion: APP_BACKUP_SCHEMA_VERSION,
            tables: createEmptyAppBackupTables()
          },
          renderer: { entries: {}, excludedKeys: [] },
          playZoneSaves: []
        },
        checksumSha256: "not-a-checksum"
      })
    ).toThrow(/체크섬/);
  });

  it("rejects database rows whose profile is not declared by the manifest", () => {
    const tables = createEmptyAppBackupTables();
    tables.cards.push({ id: "card-a", profile_id: "undeclared-profile" });
    expect(() =>
      validateAppBackupDocumentShape({
        manifest: {
          format: APP_BACKUP_FORMAT,
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          appVersion: "0.1.0-beta.1",
          createdAt: "2026-01-01T00:00:00.000Z",
          profileIds: ["declared-profile"],
          includedStores: [],
          excludedStores: [],
          redactions: []
        },
        payload: {
          database: { schemaVersion: APP_BACKUP_SCHEMA_VERSION, tables },
          renderer: { entries: {}, excludedKeys: [] },
          playZoneSaves: []
        },
        checksumSha256: "0".repeat(64)
      })
    ).toThrow(/undeclared profile/);
  });

  it("rejects empty or whitespace-only manifest profile ids", () => {
    expect(() =>
      validateAppBackupDocumentShape({
        manifest: {
          format: APP_BACKUP_FORMAT,
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          appVersion: "0.1.0-beta.1",
          createdAt: "2026-01-01T00:00:00.000Z",
          profileIds: [" "],
          includedStores: [],
          excludedStores: [],
          redactions: []
        },
        payload: {
          database: {
            schemaVersion: APP_BACKUP_SCHEMA_VERSION,
            tables: createEmptyAppBackupTables()
          },
          renderer: { entries: {}, excludedKeys: [] },
          playZoneSaves: []
        },
        checksumSha256: "0".repeat(64)
      })
    ).toThrow(/non-empty/);
  });

  it("rejects renderer entries outside the Language Miner namespace", () => {
    expect(() =>
      validateAppBackupDocumentShape({
        manifest: {
          format: APP_BACKUP_FORMAT,
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          appVersion: "0.1.0-beta.1",
          createdAt: "2026-01-01T00:00:00.000Z",
          profileIds: [],
          includedStores: [],
          excludedStores: [],
          redactions: []
        },
        payload: {
          database: {
            schemaVersion: APP_BACKUP_SCHEMA_VERSION,
            tables: createEmptyAppBackupTables()
          },
          renderer: { entries: { unrelated: "value" }, excludedKeys: [] },
          playZoneSaves: []
        },
        checksumSha256: "0".repeat(64)
      })
    ).toThrow(/허용되지 않는 항목/);
  });

  it("rejects malformed database rows before restore", () => {
    const tables = createEmptyAppBackupTables();
    (tables.cards as unknown[]).push({ id: { nested: "not-a-scalar" } });
    expect(() =>
      validateAppBackupDocumentShape({
        manifest: {
          format: APP_BACKUP_FORMAT,
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          appVersion: "0.1.0-beta.1",
          createdAt: "2026-01-01T00:00:00.000Z",
          profileIds: [],
          includedStores: [],
          excludedStores: [],
          redactions: []
        },
        payload: {
          database: { schemaVersion: APP_BACKUP_SCHEMA_VERSION, tables },
          renderer: { entries: {}, excludedKeys: [] },
          playZoneSaves: []
        },
        checksumSha256: "0".repeat(64)
      })
    ).toThrow(/테이블 행/);
  });
});
