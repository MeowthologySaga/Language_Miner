# Third-Party Notices

Language Miner application code is licensed under GNU GPL-3.0-only. The components and content listed below retain their own licenses. This file is a notice, not a replacement for the license texts shipped by each component.

The exact transitive dependency versions for a release are recorded in its lockfile and SBOM. Versions below describe the dependency set used while preparing `v0.1.0-beta.1`; consult the tagged source and release SBOM for the final list.

## Runtime components

| Component | Version in beta preparation tree | License | Project |
| --- | ---: | --- | --- |
| Transformers.js (`@huggingface/transformers`) | 4.2.0 | Apache-2.0 | <https://github.com/huggingface/transformers.js> |
| i18next | 26.3.6 | MIT | <https://www.i18next.com/> |
| Lucide React | 0.468.0 | ISC | <https://lucide.dev/> |
| pdf-lib | 1.17.1 | MIT | <https://pdf-lib.js.org/> |
| PDF.js distribution (`pdfjs-dist`) | 4.10.38 | Apache-2.0 | <https://mozilla.github.io/pdf.js/> |
| React | 18.3.1 | MIT | <https://react.dev/> |
| React DOM | 18.3.1 | MIT | <https://react.dev/> |
| react-i18next | 17.0.9 | MIT | <https://react.i18next.com/> |
| sql.js | 1.14.1 | MIT | <https://github.com/sql-js/sql.js> |

## Build and development components

These tools are used to build or test the application and may appear in source distributions or development dependency metadata.

| Component | Version in beta preparation tree | License | Project |
| --- | ---: | --- | --- |
| Electron | 43.1.0 | MIT | <https://www.electronjs.org/> |
| electron-builder | 26.15.2 | MIT | <https://www.electron.build/> |
| TypeScript | 5.9.3 | Apache-2.0 | <https://www.typescriptlang.org/> |
| Vite | 6.4.3 | MIT | <https://vite.dev/> |
| Vitest | 4.1.10 | MIT | <https://vitest.dev/> |
| React plugin for Vite | 4.7.0 | MIT | <https://github.com/vitejs/vite-plugin-react> |
| concurrently | 9.2.4 | MIT | <https://github.com/open-cli-tools/concurrently> |
| cross-env | 7.0.3 | MIT | <https://github.com/kentcdodds/cross-env> |
| wait-on | 8.0.5 | MIT | <https://github.com/jeffbski/wait-on> |

## Content and visual assets

### Alice's Adventures in Wonderland

- Author: Lewis Carroll
- Source copy: Project Gutenberg eBook #11, <https://www.gutenberg.org/ebooks/11>
- Status: public domain in the United States; users and redistributors must check the law in their own jurisdiction
- Local use: reading tutorial/sample text

The redistributed text must keep its Project Gutenberg header and terms block.

### Contributor Covenant

The project Code of Conduct is adapted from Contributor Covenant 2.1 under Creative Commons Attribution 4.0. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for attribution links.

### Language Miner official-game media

Official-game code uses the license stated by each source repository: Abyss Summoner and Drillheart Defense use GPL-3.0-only, while Cat Odyssey uses MIT. Covered images, paid-Suno audio, names, and other project media use the separate [`LicenseRef-Meowthology-Official-Builtin`](LICENSES/LicenseRef-Meowthology-Official-Builtin.txt) terms and the path-specific notice inside each game pack.

Cat Odyssey EP1–20 narration and every cutscene video retaining it are non-commercial only under [`LicenseRef-Cat-Odyssey-ElevenLabs-NC-1.0`](LICENSES/LicenseRef-Cat-Odyssey-ElevenLabs-NC-1.0.txt). The tagged game source and pack retain `elevenlabs.io` attribution in every published episode title and include the complete path/title record.

The maintainer declares that official-game images were generated with OpenAI Codex-assisted image generation and that game music and sound effects were generated during a paid Suno subscription. Provider terms and remaining per-pack verification are recorded in [docs/asset-inventory.md](docs/asset-inventory.md). The provider names identify generation services and do not imply endorsement.

## External software and services not bundled under the app license

Ollama, Google Gemini, Google Cloud Translation, Google Drive, Chrome, and Discord are independent software or services. Their names identify optional integrations; they are not bundled project services and are governed by their own terms, privacy policies, quotas, and billing arrangements.

## Asset release rule

Only assets marked Confirmed in [docs/asset-inventory.md](docs/asset-inventory.md) may enter the selected public tree or a release. Private experiments and any future unrecorded asset remain excluded until their creator, source, creation method, redistribution right, and required attribution are recorded.
