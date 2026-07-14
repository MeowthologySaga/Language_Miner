import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  TranslationUsageTotals
} from "../../shared/types";

export type LlmUsageObservation = {
  providerName: "gemini";
  model: string;
  plan?: "free" | "paid";
  sourceLang: string;
  targetLang: string;
  usage: TranslationUsageTotals;
  outcome: "success" | "failure";
  exact: boolean;
  attemptCount: number;
};

export interface LLMProvider {
  name: string;
  setUsageObserver?(observer: (observation: LlmUsageObservation) => void): void;
  testConnection(): Promise<boolean>;
  generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData>;
  generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData>;
  generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string>;
}
