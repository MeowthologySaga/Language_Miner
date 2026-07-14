import fs from "node:fs";
import path from "node:path";
import type { PrivacyDeletionCoordinatorPersistence } from "./privacyDeletionCoordinator";

const MAX_STATE_BYTES = 512 * 1024;

export class PrivacyDeletionStateStore implements PrivacyDeletionCoordinatorPersistence {
  constructor(private readonly getUserDataPath: () => string) {}

  load() {
    const statePath = this.getStatePath();
    try {
      const stat = fs.statSync(statePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STATE_BYTES) {
        this.clear();
        return null;
      }
      return JSON.parse(fs.readFileSync(statePath, "utf8")) as unknown;
    } catch (error) {
      if (isMissing(error)) return null;
      this.clear();
      return null;
    }
  }

  save(value: Parameters<PrivacyDeletionCoordinatorPersistence["save"]>[0]) {
    const statePath = this.getStatePath();
    const directory = path.dirname(statePath);
    const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    if (bytes.length > MAX_STATE_BYTES) {
      throw new Error("Privacy deletion state exceeds the safe size limit.");
    }
    fs.mkdirSync(directory, { recursive: true });
    try {
      fs.writeFileSync(temporaryPath, bytes, { flag: "wx" });
      try {
        fs.renameSync(temporaryPath, statePath);
      } catch (error) {
        if (!isReplaceConflict(error)) throw error;
        fs.copyFileSync(temporaryPath, statePath);
      }
    } finally {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }

  clear() {
    const statePath = this.getStatePath();
    try {
      fs.unlinkSync(statePath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      fs.rmdirSync(path.dirname(statePath));
    } catch (error) {
      if (!isMissing(error) && !isNotEmpty(error)) throw error;
    }
  }

  private getStatePath() {
    const root = path.resolve(this.getUserDataPath());
    const statePath = path.resolve(root, "privacy-deletion", "pending-operation.json");
    const relative = path.relative(root, statePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Privacy deletion state path is unsafe.");
    }
    return statePath;
  }
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isNotEmpty(error: unknown) {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOTEMPTY";
}

function isReplaceConflict(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EACCES", "EEXIST", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")
  );
}
