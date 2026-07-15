const BUNDLED_PUBLIC_PATH = /^\/(samples|tutorial|playzone)\//;

/**
 * Vite serves `public/` assets from `/` during development, while the packaged
 * Electron app loads `dist/index.html` through `file://`. A leading slash then
 * points at the drive root (for example `C:\\samples`) instead of `dist/`.
 * Keep persisted legacy URLs working by making only known bundled paths
 * relative to the application document.
 */
export function resolveBundledAssetUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return BUNDLED_PUBLIC_PATH.test(trimmed) ? `.${trimmed}` : trimmed;
}
