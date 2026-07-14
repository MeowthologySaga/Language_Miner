import { MockProvider } from "./mockProvider";
import { OllamaProvider } from "./ollamaProvider";
import { GeminiProvider } from "./geminiProvider";
import type { LLMProvider } from "./types";
import type { AppSettings } from "../../shared/types";
import { readRendererCloudProviderConsent } from "../../shared/cloudProviderConsent";
import {
  ManualChatGptProvider,
  type ManualChatGptUiBridge
} from "./manualChatGptProvider";

export function createProvider(
  settings: AppSettings,
  options: { manualChatGptBridge?: ManualChatGptUiBridge } = {}
): LLMProvider {
  if (settings.providerName === "gemini") {
    return new GeminiProvider({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      plan: settings.geminiPlan,
      cloudConsent: readRendererCloudProviderConsent("gemini") ?? undefined
    });
  }

  if (settings.providerName === "ollama") {
    return new OllamaProvider({
      baseUrl: settings.ollamaBaseUrl,
      model: settings.ollamaModel
    });
  }

  if (settings.providerName === "chatgptWeb") {
    return new ManualChatGptProvider(
      options.manualChatGptBridge ??
        (async () => {
          throw new Error("Manual ChatGPT Web bridge is unavailable in this renderer.");
        })
    );
  }

  return new MockProvider();
}
