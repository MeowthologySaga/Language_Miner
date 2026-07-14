import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppOnboardingStateStore } from "./appOnboardingState";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lem-onboarding-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("AppOnboardingStateStore", () => {
  it("persists completion across store instances", () => {
    const directory = createTemporaryDirectory();
    const completedAt = new Date("2026-07-13T12:34:56.000Z");
    const first = new AppOnboardingStateStore(directory, () => completedAt);

    expect(first.isCompleted()).toBe(false);
    expect(first.markCompleted()).toBe(true);
    expect(new AppOnboardingStateStore(directory).isCompleted()).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(directory, "app-onboarding-state.json"), "utf8"))
    ).toEqual({
      schemaVersion: 1,
      completed: true,
      completedAt: completedAt.toISOString()
    });
  });

  it("treats corrupt state as incomplete and repairs it when completed", () => {
    const directory = createTemporaryDirectory();
    const filePath = path.join(directory, "app-onboarding-state.json");
    fs.writeFileSync(filePath, "not-json", "utf8");
    const store = new AppOnboardingStateStore(directory);

    expect(store.isCompleted()).toBe(false);
    expect(store.markCompleted()).toBe(true);
    expect(store.isCompleted()).toBe(true);
  });

  it("refuses to follow a non-file completion path", () => {
    const directory = createTemporaryDirectory();
    fs.mkdirSync(path.join(directory, "app-onboarding-state.json"));
    const store = new AppOnboardingStateStore(directory);

    expect(store.isCompleted()).toBe(false);
    expect(() => store.markCompleted()).toThrow("must be a regular file");
  });
});
