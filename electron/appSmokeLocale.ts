export const appSmokeLocales = ["ko", "en"] as const;

export type AppSmokeLocale = (typeof appSmokeLocales)[number];

export function parseAppSmokeLocale(value: string | undefined): AppSmokeLocale | null {
  const candidate = value?.trim();
  return candidate === "ko" || candidate === "en" ? candidate : null;
}
