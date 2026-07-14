# Language Miner UGC Creator Guide

[한국어](creator-guide.ko.md) · [UGC policy](ugc-policy.en.md) · [Game Pack runtime contract](ugc/playzone-current-runtime-contract.md)

This document describes the public contract planned for `v0.1.0-beta.1`. Publish against the template and validator shipped with the target app version.

## 1. Choose a content type

### Character pack

A **data-only, single-JSON** package of character definition, example dialogue, and safe raster-image references. It must not contain HTML, JavaScript, or a remote script.

### Game Pack

HTML, CSS, and JavaScript content that runs in PlayZone. It runs in a separate window under CSP and can request app features only through declared Host API capabilities.

Both formats need a creator, source, SPDX license, stable id, update lineage, and integrity hashes. They do not share one manifest schema.

## 2. Shared identity and format-specific contracts

| Item | Character pack | Game Pack |
| --- | --- | --- |
| Format version | `formatVersion: 1`, `schemaVersion: 1` | `schemaVersion: 1` |
| `contentType` | `language_miner_character_pack` | `game_pack` |
| Identity and updates | `id`, `lineageId`, `version`, `minAppVersion` | `id`, `lineageId`, `version`, `minPlayZoneVersion` |
| `creator` | String | String or `{ "name": "..." }` |
| Entry and hashes | Fixed `entry.path: "payload"` plus `entry.sha256` | Local HTML `entry` plus per-file `integrity.files` |
| Permissions | `requestedPermissions` array; only `remote_images` is supported in the first beta | Every member of the `permissions` object is explicitly `true` or `false` |
| Shared release metadata | `sourceUrl`, `license`, `releaseNotes` | `sourceUrl`, `license`, `releaseNotes` |

An `id` starts with lowercase alphanumeric characters and can use dots, underscores, and hyphens. Use SemVer for `version`, an HTTPS source of record for `sourceUrl`, and an SPDX identifier or expression for `license`. The current Game Pack validator accepts one SPDX identifier or a flat, parenthesis-free `AND`, `OR`, or `WITH` expression.

Keep `id` even if the title changes. Create a new `lineageId` only for a genuinely separate work. A normal update preserves both values and increments `version`.

## 3. Distribution layout

### Character pack

```text
my-character.json
```

The current character pack is one JSON envelope, not a ZIP or folder. Use **Export as Language Miner pack** in the app: it places character data under `payload` and writes the SHA-256 of the canonical payload to `entry.sha256`. The complete JSON file cannot exceed 2 MiB.

A self-contained image can use a PNG/JPEG/WebP/GIF `data:` URL. An HTTPS remote raster image requires `remote_images` in `requestedPermissions` and does not load before user confirmation. SVG, HTTP, local file paths, and executable fields are blocked.

### Game Pack

```text
my-game/
  manifest.json
  README.md
  game/
    index.html
    main.js
    styles.css
    assets/
      thumbnail.png
```

Do not ship development `src`, `node_modules`, logs, source maps, local settings, or secret files. Put the manifest at the archive root without an unnecessary enclosing directory.

## 4. Game Pack manifest example

The SHA-256 strings below are placeholders. Replace every one with the real 64-character digest.

```json
{
  "schemaVersion": 1,
  "contentType": "game_pack",
  "id": "creator.sentence-garden",
  "lineageId": "38c556b0-ff77-4b4e-92bf-6d1b5f9205af",
  "version": "0.1.0",
  "minPlayZoneVersion": "0.1.0-beta.1",
  "title": "Sentence Garden",
  "description": "Grow a garden by recalling useful sentences.",
  "releaseNotes": "First public version.",
  "creator": {
    "name": "Example Creator"
  },
  "license": "MIT",
  "sourceUrl": "https://github.com/example/sentence-garden/releases/tag/v0.1.0",
  "thumbnail": "game/assets/thumbnail.png",
  "entry": {
    "type": "html",
    "path": "game/index.html"
  },
  "permissions": {
    "walletSpend": false,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "save": {
    "schemaVersion": 1
  },
  "integrity": {
    "files": {
      "README.md": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/index.html": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/main.js": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/styles.css": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/assets/thumbnail.png": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

`network`, `externalLinks`, and `cardRead` are unsupported in the first beta and cause a block when set to `true`. Set every unnecessary permission to `false`.

For a new pack, use `html` as `entry.type` and a canonical pack-relative `.html` path as `entry.path`. A string entry or remote URL is invalid. All required release fields, all five permissions, and complete integrity data are needed to reach `ready` without warnings. A missing root manifest produces `quarantined`, other errors produce `blocked`, warnings produce `warning`, and only `ready` or Host-assigned `trusted_official` packs can execute.

## 5. File and archive limits

First-beta Game Pack validator limits:

- archive: 256 MiB;
- total extracted data: 512 MiB;
- one file: 128 MiB;
- file count: 4,096;
- compression ratio: 200:1;
- manifest: 256 KiB;
- ZIP64: unsupported.

Use ordinary ZIP with stored or deflate compression. Symbolic links, absolute paths, `..`, Windows drive and UNC paths, encryption or unsupported compression, and bad CRCs are blocked.

Staying below a limit does not make a pack efficient. Include only files needed at runtime.

## 6. Create file hashes

PowerShell can calculate each runtime digest:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\game\index.html"
```

In `integrity.files`, use canonical `/`-separated pack-relative paths and 64 hexadecimal characters. Exclude the manifest itself, but list every other runtime file exactly once and do not list a file that is absent. Paths must also be unique when case is ignored. Recalculate after any byte changes and increment SemVer.

## 7. Game Pack runtime rules

- The entry must be a local `.html` file.
- The Host applies CSP to every document response.
- Do not access Electron, Node, the app database, or arbitrary files.
- Do not depend on `fetch`, WebSocket, or remote scripts, fonts, and images.
- Do not store a diamond balance as the game’s source of truth.
- Use only `window.LEM_GAME_HOST_API.save` for persistence.

Current Host API overview:

```ts
window.LEM_GAME_HOST_API.wallet.getBalance()
window.LEM_GAME_HOST_API.wallet.spend({ id, idempotencyKey })
window.LEM_GAME_HOST_API.save.load(fallback)
window.LEM_GAME_HOST_API.save.write(value)
window.LEM_GAME_HOST_API.save.clear()
```

A Host request can resolve to `{ ok: false, code, message }` instead of rejecting its Promise. Check balance, load, write, clear, and confirm results, then show a retryable error inside the game. Do not rely on `ui.toast()` for important feedback because the current beta does not guarantee a Host-rendered toast. `appVersion` is the fixed identifier `language-miner-host`, not a comparable version; declare compatibility with `minPlayZoneVersion` in the manifest.

Use the [current runtime contract](ugc/playzone-current-runtime-contract.md) for exact types and responses. Do not use obsolete draft names such as `LanguageMiner.saveGame`, `loadGame`, or `spendDiamonds`.

Save limits are 5 MiB per pack and 256 MiB total. Persist only minimal JSON-serializable state.

## 8. Diamond actions

If `walletSpend` is required, freeze every action in the manifest.

```json
{
  "permissions": {
    "walletSpend": true,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "economy": {
    "diamondActions": [
      {
        "id": "hint-small",
        "amount": 5,
        "reason": "Reveal one sentence hint",
        "repeatable": true
      }
    ]
  }
}
```

A manifest can contain at most 64 actions. An `id` is 1–80 letters, digits, dots, underscores, or hyphens; `amount` is an integer from 1 to 1,000,000; and `reason` is 1–160 characters.

At runtime, request only the `id` and an `idempotencyKey` that identifies the purchase intent. For `repeatable: true`, reuse the same key for the same intent so a double click or retry cannot charge twice. The Host permits a non-repeatable action only once per pack and action. It reads amount and reason from the manifest, always asks the user to confirm, and a failed result must never mutate a local balance.

## 9. Character-pack safety

- Do not put instructions in a prompt that request all user cards, system messages, keys, or files.
- Describe the required conversation context and any age or topic guidance in README.
- Prefer self-contained raster images. Remote images require the `remote_images` permission and user confirmation.
- Remove location, real name, and account metadata from images.
- Confirm rights to existing characters, real people, trademarks, and voices.
- Do not use real private conversations or contact details as examples.

## 10. Licenses and asset records

README and manifest should state at least:

- creator display name;
- source URL;
- license for UGC code and data;
- creator, source, creation method, and license for each image, audio file, and font;
- required attribution text;
- original and modifications for adapted third-party assets.

Users may be unable to redistribute `All rights reserved` content. If sharing is intended, choose a license with clear redistribution and modification terms. For custom content terms that do not fit an SPDX expression, place the full text under `LICENSES/` and explain it next to the closest manifest identifier.

## 11. Pre-release checklist

- [ ] A character pack is the single JSON exported by the app, or a Game Pack build directory contains runtime files only.
- [ ] `id` and `lineageId` match the previous release.
- [ ] SemVer and `releaseNotes` are updated.
- [ ] The character payload hash or every Game Pack runtime-file hash has been recalculated.
- [ ] No key, token, `.env`, local path, source map, log, or personal data is present.
- [ ] Redistribution rights and attribution are recorded for every asset.
- [ ] Permissions are minimal.
- [ ] Importing in the app produces `ready` and a reviewed security report.
- [ ] New-profile, minimum-window, keyboard, save, restore, and failure states were checked.
- [ ] The GitHub Release includes pack, source, checksum, license, and changes.

Hiding or obfuscating dangerous behavior to evade validation can result in removal from future official community spaces and a blocked hash. Report a validator weakness privately through [SECURITY.md](../SECURITY.md), not in a public issue.
