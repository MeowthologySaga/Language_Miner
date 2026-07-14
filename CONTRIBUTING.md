# Contributing to Language Miner

Thank you for helping make sentence-based language study easier and safer.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Use a public GitHub issue for ordinary bugs, accessibility problems, translations, and proposals.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities, privacy leaks, exposed credentials, or sandbox bypasses.
- Do not attach private study data, API keys, logs with source text, databases, copyrighted books, or unlicensed media.

## Development setup

Language Miner currently targets Windows 10/11 x64.

```powershell
npm ci
npm run dev
```

Before submitting a pull request:

```powershell
npm run typecheck
npm test
npm run build
```

Installer and portable packaging can be checked with:

```powershell
npm run dist:installer
npm run dist:portable
```

## Pull requests

1. Keep each pull request focused on one problem.
2. Explain the user-visible behavior, privacy impact, and test coverage.
3. Add or update Korean and English UI text together.
4. Include keyboard, screen-reader, minimum-window, and long-English-string checks for UI changes.
5. Add fixtures for file parsers and UGC validation without including real user data.
6. Do not commit `.env` files, credentials, certificates, local paths, databases, logs, caches, installers, or generated QA artifacts.
7. Avoid adding analytics, telemetry, hosted databases, or shared API keys.

Learning features are frozen until the first public beta. During that period, changes should focus on release safety, privacy, backup and restore, UGC validation, accessibility, performance, localization, and documentation.

## Translations

Korean and English are first-class UI languages. Keep meaning and safety warnings equivalent rather than translating word for word. Dates, numbers, currencies, plurals, keyboard labels, Electron dialogs, extension text, and accessibility labels also need localization.

Japanese and Chinese catalog structure may be prepared, but incomplete translations should not be presented as supported UI languages.

## UGC and assets

Application code contributions are licensed under GNU GPL-3.0-only. Character cards, game packs, sample text, images, audio, and video require separate provenance and license records.

For every new asset, update [docs/asset-inventory.md](docs/asset-inventory.md) with its creator, source URL, creation method, license, required attribution, and redistribution evidence. “Found online” is not sufficient.

See the [creator guide](docs/creator-guide.en.md) and [UGC policy](docs/ugc-policy.en.md) before submitting a sample pack.

## License of contributions

By submitting application code or documentation, you agree that your contribution is licensed under GNU GPL-3.0-only unless the file clearly states a compatible separate license. You must have the right to submit everything in the contribution.
