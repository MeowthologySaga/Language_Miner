import { describe, expect, it } from "vitest";
import {
  appLocaleFromLanguage,
  documentBasename,
  documentSafeTitle,
  documentTechnicalError,
  formatDocumentDate,
  formatDocumentNumber
} from "./documentPresentation";

describe("document presentation helpers", () => {
  it("shows only a safe file name by default", () => {
    expect(documentBasename("C:\\Users\\test\\Documents\\lesson.pdf")).toBe(
      "lesson.pdf"
    );
    expect(documentBasename(["", "home", "test", "lesson.html"].join("/"))).toBe("lesson.html");
    expect(documentBasename("  ")).toBe("-");
    expect(
      documentSafeTitle(
        "C:\\Users\\private-name\\Documents\\lesson.pdf",
        "C:\\Users\\private-name\\Documents\\lesson.pdf"
      )
    ).toBe("lesson.pdf");
    expect(documentSafeTitle("Travel notes", "C:\\private\\lesson.pdf")).toBe(
      "Travel notes"
    );
    expect(documentSafeTitle("file:///C:/private/lesson.pdf")).toBe("lesson.pdf");
  });

  it("uses the app locale for dates and numbers", () => {
    expect(appLocaleFromLanguage("en-US")).toBe("en");
    expect(appLocaleFromLanguage("ko-KR")).toBe("ko");
    expect(formatDocumentNumber(12_345, "en")).toBe("12,345");
    expect(formatDocumentDate("not-a-date", "ko")).toBe("-");
    expect(formatDocumentDate("2025-01-02T12:00:00Z", "en")).not.toBe(
      formatDocumentDate("2025-01-02T12:00:00Z", "ko")
    );
  });

  it("redacts likely credentials before technical errors are disclosed", () => {
    const fakeGoogleKey = ["AI", "za", "123456789012345678901234567890"].join("");
    const detail = documentTechnicalError(
      new Error(`Bearer top.secret.token api_key=${fakeGoogleKey}`)
    );
    expect(detail).not.toContain("top.secret.token");
    expect(detail).not.toContain(fakeGoogleKey);
    expect(detail).toContain("[REDACTED]");
  });

  it("redacts local account paths before technical errors are disclosed", () => {
    const windows = documentTechnicalError(
      new Error("Failed at C:\\Users\\private-name\\Documents\\lesson.pdf")
    );
    const unix = documentTechnicalError(
      new Error(`Failed at ${["", "home", "private-name", "lesson.pdf"].join("/")}`)
    );
    expect(windows).not.toContain("private-name");
    expect(unix).not.toContain("private-name");
    expect(windows).toContain("[LOCAL_PATH]");
    expect(unix).toContain("[LOCAL_PATH]");
  });
});
