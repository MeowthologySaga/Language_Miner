import { describe, expect, it } from "vitest";
import {
  findSelectedSourceText,
  normalizeHighlightLookupKey,
  normalizeSelectedText,
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString
} from "./listeningLoopSelection";

describe("listeningLoopSelection", () => {
  it("normalizes selected text and resolves flexible source matches", () => {
    expect(normalizeSelectedText("  Keep\n\n  listening\tclosely  ")).toBe(
      "Keep listening closely"
    );
    expect(normalizeHighlightLookupKey("  Keep\nListening  ")).toBe("keep listening");
    expect(findSelectedSourceText("Keep\nlistening closely.", "Keep listening")).toBe(
      "Keep\nlistening"
    );
    expect(findSelectedSourceText("Use C++ carefully.", "C++")).toBe("C++");
    expect(findSelectedSourceText("No exact phrase here.", "missing phrase")).toBe(
      "missing phrase"
    );
  });

  it("reads and writes stored booleans with safe fallbacks", () => {
    const storage = createMemoryStorage();

    expect(readStoredBoolean("enabled", true, storage)).toBe(true);
    writeStoredBoolean("enabled", false, storage);
    expect(readStoredBoolean("enabled", true, storage)).toBe(false);
    writeStoredBoolean("enabled", true, storage);
    expect(readStoredBoolean("enabled", false, storage)).toBe(true);
    storage.setItem("enabled", "other");
    expect(readStoredBoolean("enabled", false, storage)).toBe(false);
  });

  it("reads and writes stored strings with safe fallbacks", () => {
    const storage = createMemoryStorage();

    expect(readStoredString("lastRun", storage)).toBe("");
    writeStoredString("lastRun", "2026-01-01", storage);
    expect(readStoredString("lastRun", storage)).toBe("2026-01-01");
  });

  it("swallows storage failures", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      }
    };

    expect(readStoredBoolean("enabled", true, throwingStorage)).toBe(true);
    expect(readStoredString("lastRun", throwingStorage)).toBe("");
    expect(() => writeStoredBoolean("enabled", true, throwingStorage)).not.toThrow();
    expect(() => writeStoredString("lastRun", "2026-01-01", throwingStorage)).not.toThrow();
  });
});

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
