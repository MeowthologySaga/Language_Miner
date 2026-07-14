# Asset Provenance and Redistribution Inventory

This inventory is a release gate for images, audio, video, text samples, fonts, archives, and UGC shipped in the public repository or binary. It is not a claim that every file in the private development tree is cleared for public redistribution.

Status meanings:

- **Confirmed:** source and redistribution basis are recorded.
- **Review:** evidence or attribution still needs review.
- **Block:** do not include in a public tree or binary until resolved.
- **Regenerate:** rebuild from audited source before release.

Maintainer declaration recorded on 2026-07-14:

- the application tutorial and bundled listening visuals were created with OpenAI Codex-assisted image generation;
- the official games' images were created with OpenAI Codex-assisted image generation;
- the official games' music and sound effects were generated while the maintainer had a paid Suno subscription, and the maintainer confirms commercial-use and redistribution rights for those outputs;
- no third-party photograph, game screenshot, or character image was supplied as a reference input for those application or game images;
- the bundled onboarding voices were created through the application's own TTS feature; and
- this declaration does not by itself prove copyright registration, exclusivity, or compliance with every provider term. Pack audits still verify the shipped hashes, source inputs, exact source tag, and notices.

Current provider terms used as the redistribution basis:

- OpenAI Terms of Use, effective 2026-01-01: as between the user and OpenAI, the user owns Output to the extent permitted by law; Output may not be unique and must still be reviewed for third-party rights. <https://openai.com/policies/terms-of-use/>
- Suno paid-subscription rights: songs made while subscribed receive commercial-use rights, including use in video games; this does not guarantee copyright protection. <https://help.suno.com/en/articles/9601665>
- Suno Terms of Service: for Pro/Premier output generated during the paid subscription term, Suno assigns the rights it owns to the subscriber, subject to the terms and the subscriber having rights to all inputs. <https://suno.com/terms/>
- ElevenLabs' current help page states that free-plan output has no commercial license but may be published non-commercially with required attribution. This inventory does not assume that current terms alone prove the plan, voice, inputs, or terms applicable when a historical file was generated. <https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform>

Technical reference only: Microsoft's `System.Speech.Synthesis.SpeechSynthesizer` documentation confirms that the API can write synthesized output to a WAV file, but it does not state a general right to redistribute output made with every installed Windows voice. <https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.setoutputtowavefile>

## Current asset groups

| Path or group | Description | Creator / source | Creation method | License / redistribution basis | Attribution | Status / required action |
| --- | --- | --- | --- | --- | --- | --- |
| `public/samples/reading/alice-adventures-in-wonderland-gutenberg.txt` | Reading sample | Lewis Carroll; Project Gutenberg eBook #11, <https://www.gutenberg.org/ebooks/11> | Project Gutenberg text copy | Public domain in the United States; Gutenberg terms remain in file | Keep header and terms block | **Confirmed**, with jurisdiction warning |
| `cartridges/diamond-bistro/source/src/assets/playzone/diamond-bistro/*` food images | Diamond Bistro prototype food props | Kenney, Food Kit 2.0, <https://kenney.nl/assets/food-kit> | Third-party asset pack | CC0-1.0 | Optional `Kenney` / `kenney.nl` credit | **Excluded** from the public selected tree and packaged binary with the rest of `cartridges/diamond-bistro/source/**` |
| `cartridges/diamond-bistro/game/**` | Private Diamond Bistro experiment | Project contributor(s) not yet recorded | Project-authored HTML/CSS/JS | Private-only; no public redistribution decision is required while excluded | None in public distribution | **Excluded** from the public selected tree, built-in registry, and packaged binaries |
| `cartridges/diamond-bistro/source/src/games/**` | Archived prototype source | Project contributor(s) not yet recorded | Project-authored React prototype | Ownership remains private and unresolved | None in public distribution | **Excluded** from both the selected public tree and packaged binary; not required to build or run the audited HTML Game Pack |
| `cartridges/abyss-summoner/**` | Developer-official on-demand idle RPG | MeowthologySaga; <https://github.com/MeowthologySaga/abyss-summoner/tree/v0.1.2>; commit `e4148c3ba0ec8a4de4246580b95ed6b5945047eb` | Project code; images generated with OpenAI Codex; music/SFX generated with paid Suno; runtime allowlist copied, MP3 metadata stripped, PNG converted to WebP | Code: GPL-3.0-only. Media: `LicenseRef-Meowthology-Official-Builtin`; OpenAI and paid-Suno terms linked above; maintainer declaration dated 2026-07-14 | `LICENSE.assets.md` and provider disclosure | **Confirmed** for the immutable `v0.1.2` source and `abyss-summoner-0.1.2.lemgame`; archive SHA-256 `04d9694da80d5d42817f3d32c007a89faf4a5d7a35ed0bdb6df4dffc3b82c156`, pack SHA-256 `0bde7bec159d2675d6ed4a4214f96276c9066934ced725b0ddde4e69dc45c819` |
| `cartridges/drillheart-defense/**` | Developer-official on-demand action-defense game | MeowthologySaga; <https://github.com/MeowthologySaga/Drillheart_Defense/tree/v0.2.0>; commit `debc714a83cda1cbe1550e99360ebccde1ec63cb` | Project code; images generated with OpenAI Codex; music/SFX generated with paid Suno; portfolio media excluded, MP3 metadata stripped, PNG converted to WebP | Code: GPL-3.0-only. Media: `LicenseRef-Meowthology-Official-Builtin`; OpenAI and paid-Suno terms linked above; maintainer declaration dated 2026-07-14 | `LICENSE.assets.md` and provider disclosure | **Confirmed** for the immutable `v0.2.0` source and `drillheart-defense-0.2.0.lemgame`; archive SHA-256 `820b9c7447c897976bc3fa6d787647f7a3f0dc07c8e6d91b1e5291c55d39d423`, pack SHA-256 `d927ec4e0c7d1da8b095afc175ba705167667877ccb874d89ffb0d6ccc409576` |
| `cartridges/cat-odyssey/**` | Developer-official on-demand ricochet action RPG | MeowthologySaga; <https://github.com/MeowthologySaga/Cat_Odyssey/tree/v0.1.1>; commit `233813f782732b8e282f38a26465be71c5579df4` | Project code; images generated with OpenAI Codex without third-party reference images; music/SFX generated with paid Suno; video assembled from project-generated visual/audio inputs; MP3 metadata stripped, PNG converted to WebP; narration scripts controlled by the maintainer and prepared with AI assistance; ordinary ElevenLabs Text to Speech, not a self-created voice clone | Code: MIT. Images and paid-Suno audio: `LicenseRef-Meowthology-Official-Builtin`. All EP1–20 narration and dependent cutscene videos are conservatively non-commercial under `LicenseRef-Cat-Odyssey-ElevenLabs-NC-1.0`; a later subscription does not retroactively change that scope | Keep `elevenlabs.io` in every episode title and retain `CUTSCENE_CREDITS.md`, `ASSET_LICENSES.md`, and provider notices | **Confirmed for non-commercial distribution only** for immutable `v0.1.1` and `cat-odyssey-0.1.1.lemgame`; archive SHA-256 `a755ee3c74fe6f4d945969faf58b94f19ab4ab7f645ccf0ba7cab14686bbd5b3`, pack SHA-256 `6a5cbfa685061777f05ab17754e65e3bac19554387e810250ceb6bcc8a3ab0ad`; commercial redistribution requires newly generated eligible narration and rebuilt videos |
| `scripts/generate-tray-icon.cjs`, `electron/assets/tray-mole-miner.png`, `electron/assets/tray-mole-miner.ico` | App and tray LM lettermark | Language Miner project source | Deterministic geometric drawing and in-repository PNG/ICO encoder; no font, source image, model, or external asset | GPL-3.0-only with the application source | None | **Confirmed**; regenerate with `node scripts/generate-tray-icon.cjs` |
| `public/tutorial/**` | Tutorial character and guide images | Language Miner maintainer | Maintainer states the images were generated with OpenAI Codex without third-party reference images; visual review on 2026-07-14 found a project-specific mole miner mascot and no obvious third-party logo | OpenAI Terms of Use linked above; maintainer declaration dated 2026-07-14 | Disclose AI-assisted generation in the asset notice | **Confirmed**; creation source, no-reference declaration, and redistribution basis are recorded |
| `src/assets/onboarding/gemini/**` | Former Google AI Studio instructional screenshots | Screenshot author and capture date were not recorded; Google UI was depicted | Annotated product screenshots | Not eligible for the audited public bundle because provenance was incomplete and the captures were modified | None | **Removed**; no application or documentation code referenced these files, and the onboarding uses text plus links instead |
| `public/samples/listening/onboarding-*.png` | Sample listening scene images | Language Miner maintainer | Maintainer states the images were generated with OpenAI Codex without third-party reference images; visual review on 2026-07-14 found no obvious logo or known public figure | OpenAI Terms of Use linked above; maintainer declaration dated 2026-07-14 | Disclose AI-assisted generation in the asset notice | **Confirmed**; creation source, no-reference declaration, and redistribution basis are recorded |
| `public/samples/listening/onboarding-*.wav` (former files) | Former sample English listening voices | Language Miner maintainer | The files were generated through the application's TTS feature. Current code uses Windows `System.Speech.Synthesis.SpeechSynthesizer`, but the historical PCM files did not record the exact installed voice or Windows version | No redistribution claim is made for the historical output; sample sentences are now synthesized on the user's device at playback time and cached only in that user's app data | None | **Removed**; the three WAV files and all application references were deleted, and starter cards now use their confirmed scene image plus runtime device TTS |
| `public/samples/listening/tutorial-room-check-scene.png` | Tutorial listening scene | Language Miner maintainer | OpenAI Codex-assisted project graphic made without third-party reference images; simple flat scene, visually reviewed on 2026-07-14 | OpenAI Terms of Use linked above; maintainer declaration dated 2026-07-14 | Disclose AI-assisted generation in the asset notice | **Confirmed**; creation source, no-reference declaration, and redistribution basis are recorded |
| `public/samples/listening/tutorial-room-check.mp4` (former file) | Former tutorial listening video | Language Miner maintainer | FFmpeg assembly from the confirmed scene and an audio track generated through the application's TTS feature; the exact installed voice was not embedded | No redistribution claim is made for the historical voice output; the tutorial now displays the confirmed scene and synthesizes its sample sentence on the user's device at playback time | None | **Removed**; the MP4 and all application references were deleted |
| `public/playzone/abyss-summoner-thumbnail.png` | Former local PlayZone thumbnail override | Not recorded | Not recorded | Not eligible for redistribution | None | **Removed**; unknown local packs now use their own validated thumbnail or the app's code-generated cover style |
| `public/playzone/LanguageMinerGameKit.zip` | Creator template archive | Generated from tracked `gamekit/` plus the current PlayZone runtime contract by `scripts/release/package-gamekit.cjs` | Generated build artifact; not tracked | Follows licenses of included source/assets | `BUILD_INFO.json` and archive contents | Regenerate for every CI/release build; never copy an older ZIP |
| `electron/assets` generated ICO/PNG variants | Packaged icon derivatives | Same project-authored generation script above | Generated directly from geometric pixel primitives | GPL-3.0-only with the application source | None | **Confirmed**; the unused provenance-unknown SVG was removed |

Generated icon evidence for this tree:

- `tray-mole-miner.png`: SHA-256 `19747db85cf25babf5dd6c2129bfa506f0a4535cc175b814e111537a22ba723b`
- `tray-mole-miner.ico`: SHA-256 `7b694dcabf34823baf80e7e9c3ebdbafc5d37ce1d9cf79d70abce75335aef161`
- Re-running `node scripts/generate-tray-icon.cjs` produces the same hashes.

## Evidence still needed before release

The following technical evidence was checked on 2026-07-13, but it does not establish authorship or redistribution rights:

- The maintainer has identified OpenAI Codex as the visual-generation tool and confirmed that no third-party photograph, game screenshot, or character image was supplied as a reference. The historical image files still lack embedded prompts or generation IDs; preserve prompt and generation records for future assets so the process is reproducible.
- The former `public/samples/listening/onboarding-*.wav` files did not prove the exact installed voice, Windows version, or redistribution terms. They were removed. Starter cards now call the app's runtime TTS path, which generates speech from the user's installed voice and stores any cache under that user's app data rather than shipping a maintainer-generated recording.
- The former `public/samples/listening/tutorial-room-check.mp4` depended on the same unidentified historical voice output and was removed. Both tutorial scenes now use `tutorial-room-check-scene.png` with runtime device TTS.
- `cartridges/diamond-bistro/**` remains a private experiment and is excluded from the public selected tree, built-in registry, and Windows packages.
- Abyss Summoner, Drillheart Defense, and Cat Odyssey are bound to the exact public tags, commits, archive hashes, and pack hashes recorded above. Preserve paid-plan/export evidence privately and update the inventory before replacing any media.
- Cat Odyssey uses the selected non-commercial narration route. Episodes 12–20 have a free-plan record and episodes 1–11 lack paid-plan evidence, so narration and dependent videos for all 20 episodes remain non-commercial. The maintainer reports ordinary Text to Speech rather than a self-created voice clone, and the tagged source keeps the required provider attribution plus the separate path-scoped notice. Future monetization still requires eligible newly generated narration and rebuilt videos.

If the maintainer cannot confirm an item, replace it with a newly created, documented asset or exclude the dependent sample/feature from the public release. Do not infer ownership from a filename such as `*-gpt-*`.

## Required record for every new asset

Copy this row into the table before adding an asset:

| Path or group | Description | Creator / source | Creation method | License / redistribution basis | Attribution | Status / required action |
| --- | --- | --- | --- | --- | --- | --- |
| `path/to/asset` | What the user sees or hears | Legal name or handle; canonical URL; access date | Original drawing, photo, recording, generated asset with tool and relevant input provenance, or derived work | SPDX id or exact terms URL; evidence the submitter can redistribute | Exact required credit | Set to `Review` until evidence is attached |

Also record:

- original filename and SHA-256;
- modifications, crop, color, compression, transcription, or remix;
- model/tool version for generated media and any reference inputs;
- consent or release for a recognizable person or voice;
- trademark, character, logo, and endorsement concerns;
- jurisdiction limits for public-domain claims;
- whether commercial redistribution and modification are allowed;
- where the license text is stored in the repository.

## Release rules

1. A **Block** or **Review** asset is removed from both source staging and packaged files until its redistribution record is confirmed.
2. A generated filename, repository age, or previous private use is not evidence of ownership.
3. A source URL without license terms is not redistribution permission.
4. AI-generated output still needs tool-term, reference, real-person, trademark, and character-right review.
5. Every packaged archive is inventoried by its unpacked contents; an outer ZIP entry is not enough.
6. Release SBOM and third-party notices complement this inventory but do not replace asset-specific records.
