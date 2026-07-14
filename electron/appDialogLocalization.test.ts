import { describe, expect, it } from "vitest";
import {
  electronText,
  formatElectronNumber,
  formatElectronText,
  normalizeElectronAppLocale
} from "./appDialogLocalization";

describe("Electron dialog localization", () => {
  it("normalizes the supported app locales", () => {
    expect(normalizeElectronAppLocale("en-US")).toBe("en");
    expect(normalizeElectronAppLocale("ko-KR")).toBe("ko");
    expect(normalizeElectronAppLocale("ja-JP")).toBe("ko");
  });

  it("provides distinct Korean and English native-dialog copy", () => {
    expect(electronText("ko", "backupSaveButton")).toBe("백업 저장");
    expect(electronText("en", "backupSaveButton")).toBe("Save backup");
    expect(electronText("ko", "playZonePackTitle")).not.toBe(
      electronText("en", "playZonePackTitle")
    );
  });

  it("formats localized dynamic copy without dropping unknown placeholders", () => {
    expect(
      formatElectronText("ko", "cardSyncCompleted", { uploaded: 3, downloaded: 2 })
    ).toBe("동기화 완료 · 업로드 3장 · 다운로드 2장");
    expect(
      formatElectronText("en", "cardSyncCompleted", { uploaded: 3, downloaded: 2 })
    ).toBe("Sync complete · 3 uploaded · 2 downloaded");
    expect(formatElectronText("en", "listeningYouTubeError", {})).toContain("{code}");
    expect(formatElectronNumber("ko", 12345)).toBe("12,345");
    expect(formatElectronNumber("en", 12345)).toBe("12,345");
    expect(electronText("en", "cardSyncUploadedOne")).toContain("1 card");
  });

  it("keeps generated-window and status copy bilingual", () => {
    expect(electronText("ko", "ocrCaptureHint")).toContain("드래그");
    expect(electronText("en", "ocrCaptureHint")).toContain("Drag");
    expect(electronText("en", "lifeMiningCandidateSaved")).not.toMatch(/[가-힣]/);
    expect(electronText("en", "cardSyncFolderMissing")).not.toMatch(/[가-힣]/);
  });
});
