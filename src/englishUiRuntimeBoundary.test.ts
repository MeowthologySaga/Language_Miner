import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

describe("English UI runtime localization boundaries", () => {
  it("keeps translation connection IPC results code-based and renderer-localized", () => {
    const serviceSource = readSource("electron", "translationService.ts");
    const connectionSection = serviceSource.slice(
      serviceSource.indexOf("export async function testTranslationConnection"),
      serviceSource.indexOf("export async function translateWithLocalOllama")
    );
    const settingsSource = readSource("src", "pages", "SettingsPage.tsx");

    expect(connectionSection).not.toMatch(/[가-힣]/u);
    expect(connectionSection).not.toContain("message:");
    expect(connectionSection).toContain('connectionTestResult(input, true, "connected")');
    expect(settingsSource).toContain("localizeConnectionTestResult(result)");
    expect(settingsSource).not.toContain("result.message");
  });

  it("uses stable Ollama readiness errors instead of Korean runtime messages", () => {
    const readinessSource = readSource("src", "services", "llm", "ollamaReadiness.ts");

    expect(readinessSource).not.toMatch(/[가-힣]/u);
    expect(readinessSource).toContain('new OllamaReadinessError("model_required"');
    expect(readinessSource).toContain('new OllamaReadinessError("model_missing"');
    expect(readinessSource).toContain('new OllamaReadinessError("server_unreachable"');
  });

  it("keeps built-in recommendation copy in the locale catalog", () => {
    const seedSource = readSource("src", "shared", "listeningLoopSeeds.ts");
    const nonLearningCopy = seedSource
      .replace(/^\s*translationKo:.*$/gmu, "")
      .replace(/^\s*noteKo:.*$/gmu, "");
    const pageSource = readSource("src", "pages", "ListeningLoopPage.tsx");
    const utilitySource = readSource("src", "pages", "listeningLoopUtils.ts");
    const seedFactorySection = utilitySource.slice(
      utilitySource.indexOf("export function transcriptsToSeeds"),
      utilitySource.indexOf("export function getTranscriptSeedId")
    );

    expect(nonLearningCopy).not.toMatch(/[가-힣]/u);
    expect(seedFactorySection).not.toMatch(/[가-힣]/u);
    expect(seedSource).toContain('displayCopyKey: "shortEverydaySample"');
    expect(utilitySource).toContain('displayCopyKey: "generatedTranscript"');
    expect(utilitySource).toContain('displayCopyKey: "dailyRoutine"');
    expect(pageSource).toContain("localizeListeningLoopSeedDisplay");
  });
});
