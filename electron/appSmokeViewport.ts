export type AppSmokeViewport = { width: number; height: number };

const MIN_WIDTH = 940;
const MIN_HEIGHT = 680;
const MAX_WIDTH = 3_840;
const MAX_HEIGHT = 2_160;

export function parseAppSmokeViewport(value: string | undefined): AppSmokeViewport | null {
  const match = value?.trim().match(/^(\d{3,4})x(\d{3,4})$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_WIDTH ||
    height < MIN_HEIGHT ||
    width > MAX_WIDTH ||
    height > MAX_HEIGHT
  ) {
    return null;
  }
  return { width, height };
}
