const INTERACTIVE_SHORTCUT_TARGET_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "audio[controls]",
  "video[controls]",
  "iframe",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='tab']",
  "[role='textbox']",
  "[tabindex]"
].join(",");

type ShortcutEventTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

export function isInteractiveShortcutTarget(target: EventTarget | null) {
  if (!target) {
    return false;
  }

  const candidate = target as ShortcutEventTarget;
  if (candidate.isContentEditable || typeof candidate.closest !== "function") {
    return Boolean(candidate.isContentEditable);
  }

  return Boolean(candidate.closest(INTERACTIVE_SHORTCUT_TARGET_SELECTOR));
}
