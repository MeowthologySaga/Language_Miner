export const appSmokeScaleFactors = [1, 1.25, 1.5] as const;

export type AppSmokeScaleFactor = (typeof appSmokeScaleFactors)[number];

const scaleFactorByInput = new Map<string, AppSmokeScaleFactor>([
  ["1", 1],
  ["1.25", 1.25],
  ["1.5", 1.5]
]);

export function parseAppSmokeScaleFactor(
  value: string | undefined
): AppSmokeScaleFactor | null {
  return scaleFactorByInput.get(value?.trim() ?? "") ?? null;
}

export function resolveQaDeviceScaleFactor(
  env: Readonly<Record<string, string | undefined>>
): AppSmokeScaleFactor | null {
  if (env.LM_QA_APP_SMOKE !== "1") {
    return null;
  }
  const input = env.LM_QA_DEVICE_SCALE_FACTOR ?? "1";
  const scaleFactor = parseAppSmokeScaleFactor(input);
  if (!scaleFactor) {
    throw new Error(
      `Invalid LM_QA_DEVICE_SCALE_FACTOR: ${input}. Expected 1, 1.25, or 1.5.`
    );
  }
  return scaleFactor;
}
