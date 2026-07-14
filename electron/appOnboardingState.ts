import fs from "node:fs";
import path from "node:path";

const APP_ONBOARDING_STATE_FILE = "app-onboarding-state.json";

type StoredAppOnboardingState = {
  schemaVersion: 1;
  completed: true;
  completedAt: string;
};

export class AppOnboardingStateStore {
  private readonly filePath: string;

  constructor(
    userDataPath: string,
    private readonly now: () => Date = () => new Date()
  ) {
    this.filePath = path.join(userDataPath, APP_ONBOARDING_STATE_FILE);
  }

  isCompleted() {
    try {
      const stat = fs.lstatSync(this.filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) return false;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<StoredAppOnboardingState>;
      return parsed.schemaVersion === 1 && parsed.completed === true;
    } catch {
      return false;
    }
  }

  markCompleted() {
    if (this.isCompleted()) return true;

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const stat = fs.lstatSync(this.filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("App onboarding state path must be a regular file.");
      }
    }

    const value: StoredAppOnboardingState = {
      schemaVersion: 1,
      completed: true,
      completedAt: this.now().toISOString()
    };
    fs.writeFileSync(this.filePath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    return true;
  }
}
