export type AppOnboardingCompletionResolution = {
  completed: boolean;
  shouldOpen: boolean;
  shouldBackfillHost: boolean;
};

/**
 * Completion is additive across the renderer's legacy marker and the Electron
 * user-data marker. Losing either one must not make onboarding reappear.
 */
export function resolveAppOnboardingCompletion(
  localCompleted: boolean,
  hostCompleted: boolean | null
): AppOnboardingCompletionResolution {
  const completed = localCompleted || hostCompleted === true;
  return {
    completed,
    shouldOpen: !completed,
    shouldBackfillHost: hostCompleted === false && localCompleted
  };
}
