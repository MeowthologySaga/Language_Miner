import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrivacyDeletionStateStore } from "./privacyDeletionStateStore";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("PrivacyDeletionStateStore", () => {
  it("round-trips a bounded pending operation and removes it after completion", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-state-"));
    roots.push(root);
    const store = new PrivacyDeletionStateStore(() => root);
    const value = { schemaVersion: 1 as const, records: [] };
    store.save(value);
    expect(store.load()).toEqual(value);
    store.clear();
    expect(store.load()).toBeNull();
    expect(fs.existsSync(path.join(root, "privacy-deletion"))).toBe(false);
  });

  it("fails closed and clears an oversized or malformed state file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-state-invalid-"));
    roots.push(root);
    const statePath = path.join(root, "privacy-deletion", "pending-operation.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "not-json", "utf8");
    const store = new PrivacyDeletionStateStore(() => root);
    expect(store.load()).toBeNull();
    expect(fs.existsSync(statePath)).toBe(false);
  });
});
