import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn()
}));

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: electronMocks.showOpenDialog
  }
}));

import { pickPlayZonePackFile } from "./playZoneFileActions";
import { PlayZoneManagedFileWriterCoordinator } from "./playZoneManagedFileWriterCoordinator";

const tempDirectories: string[] = [];

afterEach(() => {
  electronMocks.showOpenDialog.mockReset();
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryFolder(label: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `lem-picker-${label}-`));
  tempDirectories.push(directory);
  return directory;
}

describe("PlayZone native picker write gate", () => {
  it("holds no writer lease while the dialog is open and rejects a late selection after deletion starts", async () => {
    const sourceRoot = temporaryFolder("source");
    const cacheRoot = temporaryFolder("cache");
    const selectedPath = path.join(sourceRoot, "late-selection.lemgame");
    fs.writeFileSync(selectedPath, "not inspected after deletion starts", "utf8");

    let finishPicker!: (result: { canceled: boolean; filePaths: string[] }) => void;
    electronMocks.showOpenDialog.mockReturnValue(
      new Promise((resolve) => {
        finishPicker = resolve;
      })
    );
    const coordinator = new PlayZoneManagedFileWriterCoordinator();
    const pickerWriteIntent = coordinator.captureWriteIntent();
    const pendingSelection = pickPlayZonePackFile(
      null,
      cacheRoot,
      "en",
      (operation) => coordinator.run(operation, pickerWriteIntent)
    );

    expect(coordinator.activeWriterCount).toBe(0);
    const deletionBlock = coordinator.blockNewWrites();
    await deletionBlock.drain();
    deletionBlock.release();
    finishPicker({ canceled: false, filePaths: [selectedPath] });

    await expect(pendingSelection).rejects.toThrow(/local-data deletion/i);
    expect(fs.readdirSync(cacheRoot)).toEqual([]);
  });
});
