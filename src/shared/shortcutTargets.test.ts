import { describe, expect, it, vi } from "vitest";
import { isInteractiveShortcutTarget } from "./shortcutTargets";

describe("interactive shortcut targets", () => {
  it.each([
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "summary",
    "audio[controls]",
    "video[controls]",
    "iframe",
    "[role='button']",
    "[role='link']",
    "[tabindex]"
  ])("protects %s and its descendants from page shortcuts", (matchedSelector) => {
    const closest = vi.fn(() => ({ matchedSelector }) as unknown as Element);

    expect(
      isInteractiveShortcutTarget({ closest, isContentEditable: false } as unknown as EventTarget)
    ).toBe(true);
    expect(closest).toHaveBeenCalledTimes(1);
  });

  it("protects inherited contenteditable targets", () => {
    expect(
      isInteractiveShortcutTarget({
        closest: vi.fn(() => null),
        isContentEditable: true
      } as unknown as EventTarget)
    ).toBe(true);
  });

  it("allows shortcuts from non-interactive page surfaces", () => {
    expect(
      isInteractiveShortcutTarget({
        closest: vi.fn(() => null),
        isContentEditable: false
      } as unknown as EventTarget)
    ).toBe(false);
    expect(isInteractiveShortcutTarget(null)).toBe(false);
  });
});
