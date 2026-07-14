# PlayZone Runtime Cache Rule

Do not assume every in-game icon or sprite flicker is a Game Pack bug.

A verified case was caused by the PlayZone host serving every `lem-playzone://` pack file with `Cache-Control: no-store`. The same game did not flicker in the web version because the browser could cache PNG/WebP sprite sheets there.

## Responsibility Split

Host/runtime responsibilities:

- HTML may use `Cache-Control: no-store` because the host bridge can be injected into HTML.
- JS, CSS, and JSON should use `Cache-Control: no-cache` so development changes can be revalidated.
- Static image, audio, and font assets should use `Cache-Control: public, max-age=31536000, immutable`.
- When a pack changes, the archive cache key or entry root should change. Do not rely on random cache-busting query strings per render.

Game Pack responsibilities:

- Use stable relative asset paths inside the pack.
- Do not create new image URLs or cache-busting query strings every render.
- Do not remount icon components just because wallet balance, save state, timers, or resource counts changed.
- Preload important icons/sprite sheets when useful, but do not treat host `no-store` as something the game must work around.

## Debugging Rule

If the web version is stable but the PlayZone app version flickers, inspect the host protocol cache headers before blaming the game code.
