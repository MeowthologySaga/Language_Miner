import { afterEach, describe, expect, it, vi } from "vitest";
import { playStandaloneTts, resolveBrowserVoice } from "./cardTts";

const voices = [
  { name: "Microsoft David", lang: "en-US" },
  { name: "Microsoft Zira", lang: "en-GB" },
  { name: "Microsoft SunHi", lang: "ko-KR" }
];

describe("resolveBrowserVoice", () => {
  it("honors the voice selected in settings", () => {
    expect(resolveBrowserVoice(voices, "en-US", "microsoft zira")?.name).toBe("Microsoft Zira");
  });

  it("falls back to an exact language and then a base-language voice", () => {
    expect(resolveBrowserVoice(voices, "ko-KR")?.name).toBe("Microsoft SunHi");
    expect(resolveBrowserVoice(voices, "en-AU")?.name).toBe("Microsoft David");
  });
});

describe("playStandaloneTts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("generates tutorial speech at playback time instead of reading a bundled file", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class TestSpeechSynthesisUtterance {
      lang = "";
      rate = 1;
      text: string;
      voice?: SpeechSynthesisVoice;

      constructor(text: string) {
        this.text = text;
      }
    }

    const storedValues = new Map<string, string>();
    const storage = {
      clear: () => storedValues.clear(),
      getItem: (key: string) => storedValues.get(key) ?? null,
      removeItem: (key: string) => storedValues.delete(key),
      setItem: (key: string, value: string) => storedValues.set(key, value)
    };
    const speechSynthesis = {
        cancel,
        getVoices: () => voices,
        speak
    };
    vi.stubGlobal("SpeechSynthesisUtterance", TestSpeechSynthesisUtterance);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { speechSynthesis });
    storage.setItem(
      "lem:settings",
      JSON.stringify({
        ttsProviderName: "browser",
        ttsModel: "browser-default",
        ttsVoiceName: "Microsoft Zira",
        ttsRate: 0
      })
    );

    await expect(playStandaloneTts("Play this at runtime.", "en")).resolves.toBeTruthy();

    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0]).toMatchObject({
      lang: "en-US",
      rate: 1,
      text: "Play this at runtime.",
      voice: voices[1]
    });
  });
});
