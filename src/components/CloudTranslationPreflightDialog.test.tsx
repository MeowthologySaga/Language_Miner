import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
  formatKrw,
  formatKrwRange,
  TRANSLATION_CANCEL_COPY
} from "./CloudTranslationPreflightDialog";

const preflightDialogSource = readFileSync(
  join(process.cwd(), "src", "components", "CloudTranslationPreflightDialog.tsx"),
  "utf8"
);

describe("CloudTranslationPreflightDialog locale formatting", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("formats conservative KRW values and ranges for each UI locale", () => {
    expect(formatKrw(1234.2, "ko-KR")).toBe("₩1,235");
    expect(formatKrw(1234.2, "en-US")).toBe("₩1,235");
    expect(
      formatKrwRange({ min: 1.1, max: 3.1 }, "en-US", i18n.getFixedT("en"))
    ).toBe("₩2–₩4");
  });

  it("resolves stop and cancellation copy from the active catalog", async () => {
    await i18n.changeLanguage("en");

    expect(TRANSLATION_CANCEL_COPY.stop).toBe("Stop translation");
    expect(TRANSLATION_CANCEL_COPY.stopping).toBe("Stopping translation…");
    expect(TRANSLATION_CANCEL_COPY.canceled).toBe("Translation stopped.");
    expect(TRANSLATION_CANCEL_COPY.canceledBeforeStart).toBe("External transfer canceled.");
  });

  it("states that the app guard cannot block provider billing", () => {
    const korean = i18n.getFixedT("ko");
    const english = i18n.getFixedT("en");

    expect(korean("cloudTranslationPreflight.disclaimer")).toContain("실제 청구를 차단하지 않으며");
    expect(english("cloudTranslationPreflight.disclaimer")).toContain(
      "does not block actual provider billing"
    );
  });

  it("does not let the cost-prompt preference bypass external-transfer confirmation", () => {
    expect(preflightDialogSource).not.toContain(
      "if (!input.settings.confirmEstimatedCostBeforeRun)"
    );
    expect(preflightDialogSource).toContain("buildCloudTranslationPreflight(input, monthEstimate)");
  });
});
