import { describe, expect, it } from "vitest";
import {
  CARD_TUTORIAL_MODULES,
  createCardTutorialSteps
} from "./shared/cardTutorial";
import {
  localizeCardTutorialModules,
  localizeCardTutorialSteps
} from "./tutorialLocalization";

describe("tutorial localization", () => {
  it("uses the requested Reading, Listening, and Speaking Card labels", () => {
    const modules = localizeCardTutorialModules("en", CARD_TUTORIAL_MODULES);
    expect(modules.map((module) => module.title)).toEqual([
      "Reading Cards",
      "Listening Cards",
      "Speaking Cards",
      "Cards & Review"
    ]);
  });

  it("provides English copy for every tutorial step and action", () => {
    const steps = localizeCardTutorialSteps("en", createCardTutorialSteps("profile-test"));
    const exposedCopy = steps.flatMap((step) => [
      step.navLabel,
      step.title,
      step.goal,
      step.coach,
      step.appLocation,
      step.completionText,
      ...step.progressLabels,
      ...step.actions.flatMap((action) => [
        action.label,
        action.doneLabel ?? "",
        action.targetLabel,
        action.hint
      ])
    ]);
    expect(exposedCopy.join("\n")).not.toMatch(/[가-힣]/);
  });

  it("keeps the first Web Reader loop on the same public-guide sentence in both locales", () => {
    const koreanStep = createCardTutorialSteps("profile-test")[0];
    const englishStep = localizeCardTutorialSteps("en", [koreanStep])[0];

    expect(koreanStep.goal).toContain("I’m running a little late.");
    expect(englishStep.goal).toContain("I’m running a little late.");
    expect(koreanStep.actions.map((action) => action.id)).toEqual([
      "intro-language-loop",
      "intro-card-types",
      "open-web-reader",
      "select-running-late",
      "build-reading-card",
      "save-reading-card"
    ]);
    expect(englishStep.actions.find((action) => action.id === "select-running-late")?.targetLabel)
      .toBe("running a little late");
  });
});
