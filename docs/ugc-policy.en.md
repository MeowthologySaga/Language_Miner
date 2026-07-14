# Language Miner UGC Policy

[한국어](ugc-policy.ko.md) · [Creator guide](creator-guide.en.md) · [Privacy notice](privacy.en.md)

- Target: public beta [v0.1.0-beta.1](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1)
- Last updated: 2026-07-14

## 1. Scope

This policy covers character packs, character cards, and PlayZone Game Packs. The same standard will apply to the official community's UGC-sharing spaces if they open later.

The app code is GPL-3.0-only, but that license does not automatically apply to a UGC story, image, audio file, game code, or data. Each creator must state a separate license in the manifest and distribution page.

## 2. Distribution and discovery

- **Recommended source of record:** a creator-controlled GitHub Release, which can preserve versions, source, checksums, and changes.
- **Official Discord (not open yet):** if it opens later, it will be a place to discover content and discuss it. There is currently no official invitation link. Durable sources such as GitHub Releases are preferred over re-uploading binaries.
- **Google Drive and other external links:** labeled as unverified external links. Their owner and content can change.

A Discord post, star, reaction, or another user’s recommendation is not a project warranty of safety, quality, legality, or copyright status.

## 3. Content standard for a future official Discord

If the official Discord opens, it will permit general-audience content only.

Examples that are not allowed:

- explicit sexual content, pornography, or sexual exploitation;
- excessive or realistic gore and torture;
- sexualized or dangerous depictions of minors;
- hate, harassment, doxxing, and targeted threats;
- content that directly promotes or facilitates illegal acts;
- malware, credential theft, tracking, or attempts to evade validation;
- books, films, games, music, characters, or images the uploader cannot redistribute;
- false creator, source, or license information.

Material may be removed when it is unsuitable for a general-audience space even if presented in an educational or historical context. Repeated violations can lead to link removal, posting restrictions, or loss of community access.

## 4. Content obtained elsewhere

The app does not assign an age rating or review sexual or violent themes in content obtained outside the official community. Users must decide based on their local law, age, environment, and risk tolerance.

No content review does **not** mean that the project:

- permits or warrants illegal content;
- warrants copyright or trademark rights;
- endorses an external link;
- skips technical security checks.

The same technical validation and runtime limits apply regardless of source.

## 5. Technical validation states

| State | Meaning | Can run |
| --- | --- | --- |
| `quarantined` | Imported but inspection and approval are incomplete | No |
| `blocked` | A safety-contract violation or fatal error exists | No |
| `warning` | A warning or incomplete contract must be resolved | No |
| `ready` | Current format and technical checks are satisfied | Yes |
| `trusted_official` | `ready` conditions plus an app-pinned official catalog identity and hashes | Yes |

`ready` is not a certification that a pack is well intentioned or high quality. It is a technical state showing compliance with known format, file, and permission rules.

Checks include:

- manifest format, version, creator, source URL, and SPDX license;
- file hashes and undeclared files;
- ZIP path traversal, symbolic links, size, count, compression ratio, CRC, and ZIP structure;
- HTML entry point and CSP;
- requested permissions, default network denial, and Host API usage;
- diamond action id, amount, reason, and duplicate-spend prevention;
- executable character-pack fields and unsafe image references.

## 6. Character packs

Character packs are data-only.

The default allowed set is:

- JSON character definitions;
- safe local raster images;
- plain text or safely rendered Markdown descriptions.

HTML, JavaScript, executables, remote scripts, and automatic remote-image loading are not allowed. A character prompt must not be designed to extract user data, system instructions, API keys, or other secrets.

In cloud Character Chat, the provider may receive the character definition, recent conversation, new message, and card hints. Creators should describe required context honestly.

## 7. Game Packs

Game Packs can contain code and therefore run only in an isolated HTML environment.

- The entry point must be a local `.html` file.
- A pack cannot access Electron, Node, or the app database directly.
- Network access is denied by default and is not supported for UGC in the first beta.
- Storage and local reward use go through declared Host API capabilities.
- A diamond spend must exactly match a manifest action id, amount, and reason and use user confirmation and an idempotency key.
- Per-pack and total storage limits apply.

## 8. Creator responsibilities

A creator must be able to affirm that:

- they have the right to distribute every file;
- creator, source URL, creation method, and license are accurate;
- third-party notice and attribution duties are met;
- no secret key, token, personal conversation, local path, or personal data is present;
- updates preserve `id` and `lineageId` and follow SemVer;
- requested permissions and diamond actions are minimal;
- known vulnerabilities and compatibility problems are not concealed.

AI-generated media is not automatically free to redistribute. Check the tool terms, reference material, real-person rights, trademarks, and character rights, and record the creation method.

## 9. User responsibilities

- Check the creator and source URL.
- Read hashes, license, permissions, and warnings before installation.
- Prefer a versioned GitHub Release to an unfamiliar Drive link.
- Do not use an unclear pack with a profile containing sensitive study data.
- Stop the pack and record its version and report if something is wrong.
- Do not redistribute a suspicious pack to other users.

## 10. Reports and actions

- Use the UGC issue template for ordinary compatibility problems.
- Once the official community is published, use its announced private moderator route for copyright, trademark, or content concerns.
- Use [private security reporting](../SECURITY.md) for path traversal, network bypass, data exposure, duplicate spending, or another vulnerability.

Do not attach malicious files, personal data, API keys, or validation-bypass details to a public issue.

The project may remove a link or post, withdraw an official recommendation, and block a technically dangerous hash or pack version. It cannot delete a creator’s external repository.
