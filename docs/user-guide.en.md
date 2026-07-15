# Language Miner User Guide

[한국어](user-guide.ko.md) · [Visual walkthrough](https://meowthologysaga.github.io/Language_Miner/en/tutorial.html) · [README](../README.en.md) · [Privacy notice](privacy.en.md) · [Windows installation](install-windows.en.md)

This guide covers the published `v0.1.0-beta.1`. Its official Release notes take precedence.

## 1. What Language Miner does

Language Miner brings discovery, card creation, review, and reuse into one loop.

- **Read & Listen · Input:** Find real sentences in PDFs, websites, video, and audio.
- **Cards:** Save them as reading, listening, and speaking cards.
- **Review:** Retrieve due expressions with spaced repetition.
- **Speak & Write · Output:** Reuse them in writing and character conversations.
- **PlayZone:** Spend locally earned diamonds on optional features in validated game packs to reinforce study motivation. It is not an in-game language-learning mode.

An isolated word can be easy to recognize but hard to turn into a sentence. Sentence cards preserve vocabulary, grammar, natural combinations, and situation together. Input builds recognition; output trains retrieval when you need the expression.

## 2. Install

Download the beta only from the official [`v0.1.0-beta.1` GitHub Release](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1). It is published as an immutable release, so its tag and assets cannot be edited in place.

1. Download the installer or portable build and checksum file from the same Release.
2. Compare the SHA-256 value.
3. Read the SmartScreen warning for the unsigned beta.
4. Install the NSIS build for your Windows user, or place the portable executable in a folder you control.

The portable build may still store learning data in the Windows user-data location. “Portable” means no installer; it does not guarantee that all data stays beside the executable. See [Windows installation](install-windows.en.md).

### Choose languages on first launch

1. **App language** controls menus and buttons.
2. **Native language** is the basis for meanings and explanations.
3. **Learning language** is the language used in cards and practice.
4. Select your combination and choose `Next`.
5. On the last AI introduction, you can choose `Explore the app` without entering a key.

![First launch with App language, Native language, and Learning language selected](site/assets/app-images/en/01-onboarding-language.webp)

*Figure 1. First-launch language settings. You can explore the app before connecting AI.*

## 3. Your first learning loop

Do not begin with a long settings session. AI can remain disconnected.

### Step 1: Pick one sentence

Assume you choose:

> I’m running a little late.

Connect it to a real situation such as a meeting, commute, or online session.

First, you can rehearse the controls in **Manage → Tutorial → Reading Cards → Web Reader**. That tutorial is a sandbox copy of the app: it records tutorial progress but does not change your real card library.

To create a real card, open **Read & Listen · Input → Web Reader**. You can choose `running a little late` in the built-in **Language Miner practice text**, or open a real webpage in the address bar and select a useful sentence there. Choose `Sentence card` to carry the source sentence and nearby context into a card candidate.

The screenshot below demonstrates real internet use by selecting `Oh dear! I shall be late!` in the public-domain Project Gutenberg text of *Alice’s Adventures in Wonderland*. Later card screenshots return to the built-in `I’m running a little late.` sample so their structure is easy to compare.

![Web Reader showing an Alice’s Adventures in Wonderland sentence selected on Project Gutenberg](site/assets/app-images/en/home-web-reader-live.webp)

*Figure 2. Select a sentence where you found it on the live webpage and make a sentence card.*

### Step 2: Preview the reading card

This Web Reader flow creates one **reading card**: see the English sentence and recall its meaning and situation. Check the sentence, meaning, and hint, edit anything that does not match your intent, then choose `Add card`. Listening and speaking cards are created later from their own input screens.

![Reading-card preview showing I’m running a little late, its meaning, context, and Add card](site/assets/app-images/en/07-reading-card-preview.webp)

*Figure 3. Edit generated content before adding the card.*

### Step 3: Complete the first review

Choose `Start review`, try to retrieve the answer, then choose `Show answer`. Use `Again` or `Hard` when retrieval was difficult and `Good` or `Easy` when it was immediate. The rating adjusts the next review time.

![Front of the first review card with Show answer](site/assets/app-images/en/09-review-front.webp)

*Figure 4. Recall the meaning and situation before choosing Show answer.*
![Review answer with Again, Hard, Good, and Easy buttons](site/assets/app-images/en/10-review-answer.webp)

*Figure 5. A rating controls the next interval; it is not a grade.*

### Step 4: Use it again

Respond to a writing prompt about telling a friend you are late. Choose `Show answer` to compare your response with the suggestion, and use `Rewrite` to retrieve it again. If Character Chat is connected, you can reuse the expression in a meeting scenario. That completes one loop.

![Writing Practice showing my answer, expression checks, a suggested answer, and Rewrite](site/assets/app-images/en/12-writing-result.webp)

*Figure 6. Retrieve the sentence from its meaning, then compare answers.*

![Character Chat where I’m running a little late has been sent and answered](site/assets/app-images/en/14-character-chat.webp)

*Figure 7. Move a reviewed sentence into a meeting situation.*

## 4. Make cards from your own material

### Documents and the web

1. Open the document reader or web reader under Read & Listen.
2. Select a useful sentence.
3. Choose the card action.
4. Check the complete sentence, meaning, and surrounding context.
5. Choose card types and use `Add card` or the save action shown on that screen.

Sites that require login remain subject to their own terms. Web-reader cookies may remain in the local Electron session and can be removed from Settings.

### Listening and video

1. Open local media or a supported source.
2. Confirm the transcript segment and loop range.
3. Preview the audio, sentence, and hint for the listening card.
4. Remember that the original media path is not included in app backups.

![Video Reader showing a fictional office conversation with bilingual captions, looping, and speed controls](site/assets/app-images/en/home-video-reader-sitcom.webp)

*Figure 8. Use a privacy-safe fictional clip to check captions, repeat the useful segment, and continue into a listening card.*

### Life Mining

Life Mining is an optional way to collect candidates from expressions you actually wanted to use. Automatic capture starts off.

Before using the extension, choose allowed sites, whether to collect only your own messages, surrounding context, maximum length, and masking rules. Items waiting for the app may temporarily remain in extension storage.

## 5. Review and writing

- **Reading cards** train recall of meaning from English.
- **Listening cards** train recall from sound.
- **Speaking cards** train production from a meaning or situation.

Speak or type before copying the answer. A mistake is useful evidence for the next review and exercise, not a separate failure state.

## 6. Character Chat

Character Chat is a practice space for using learned expressions in a situation.

1. Choose a character and scenario.
2. Check whether the connection is local or cloud-based.
3. If using cloud AI, read the transfer notice before starting.
4. Intentionally use at least one learned expression.

A cloud provider may receive the character definition, recent conversation, your message, and card hints. Do not enter sensitive names, contact details, workplace information, or medical or financial data. Remote character images load only after confirmation.

## 7. PlayZone and UGC

PlayZone opens HTML game packs in an isolated runtime.

- Review the creator, version, source, license, hashes, requested permissions, and warnings before installation.
- Only `ready` and `trusted_official` packs can run.
- `warning`, `blocked`, and `quarantined` packs cannot run.
- Network access is denied by default.
- Diamond spending is limited to manifest-declared actions and amounts, with user confirmation.

GitHub Releases are the recommended source of record. The official Discord is not open yet; if Discord or Google Drive links are shared later, they are discovery paths, not a warranty of safety or copyright status. See the [UGC policy](ugc-policy.en.md).

The official games are `Abyss Summoner`, `Drillheart Defense`, and `Cat Odyssey`. Choose `Install and play`, review size, source, license, SHA-256, and requested permissions, then choose `Review and download`. After checks produce a runnable state, choose `Play`.

![PlayZone showing the three official games Abyss Summoner, Drillheart Defense, and Cat Odyssey](site/assets/app-images/en/18-playzone-official-library.webp)

*Figure 9. The three Language Miner developer-approved games.*
![Official-game pre-install screen showing size, source, SHA-256, license, and permissions](site/assets/app-images/en/19-playzone-install-confirm.webp)

*Figure 10. Review the file and requested capabilities before downloading.*
![An official PlayZone game running after technical checks](site/assets/app-images/en/21-playzone-gameplay.webp)

*Figure 11. Only a game that passes technical checks is opened in the separate runtime.*

## 8. Connect AI only when needed

### Disconnected

This is the default on a new installation. Card storage and review do not require a cloud connection.

![Card-generation settings showing AI disconnected, Ollama, Gemini, and ChatGPT Web](site/assets/app-images/en/22-ai-options.webp)

*Figure 12. A new installation starts with AI disconnected.*

### Ollama

Ollama is separate software. Only loopback hosts such as `localhost`, `127.0.0.1`, and `::1` are treated as local. A LAN or internet URL can send content to another device.

Choose `Start and connect Ollama` to let the app try to launch it. If the program or model is not ready, follow the next action shown in the connection status.

![Ollama status explaining that the program or model is not ready and how to retry](site/assets/app-images/en/23-ollama-not-ready.webp)

*Figure 13. Distinguish an app connection issue from an Ollama process or model that is not ready.*

### Manual ChatGPT Web bridge

Choose `ChatGPT Web` under Card generation to use a ChatGPT web subscription manually without an API key.

1. Start card generation and review the sentence and context that will be shared.
2. Remove sensitive information, then copy the prompt.
3. Open ChatGPT in the default browser and paste the prompt.
4. Paste the complete response back into Language Miner and choose `Validate and use`.

The app never accesses your ChatGPT account, cookies, or conversation page. This manual workflow is not used for extension or background auto-generation.

### Gemini and Google

Cloud features use your own API key.

Before connection and each task, review:

- provider and model;
- sentence, document segment, or conversation context sent externally;
- estimated calls and cost range;
- how to cancel;
- how the key is stored.

The app’s cost guard is a local estimate. It cannot prevent billing, so configure provider-side API restrictions, key restrictions, quotas, and budget alerts. Do not assume a selected free tier guarantees zero cost.

![First Gemini connection consent showing external-transfer scope, API-key storage, and a cost warning](site/assets/app-images/en/24-cloud-connection-consent.webp)

*Figure 14. Review transfer, key-storage, and cost boundaries when connecting for the first time. A separate task preflight appears before an actual cloud request.*

## 9. Backup and restore

A versioned `.lembackup` can contain cards, vocabulary, reviews, highlights, profiles, Life Mining data, listening transcripts, character presets and conversations, routines and missions, and PlayZone saves.

It excludes:

- API keys, OAuth tokens, and login cookies;
- web-reader session and navigation state, plus this device's cloud-transfer consent records;
- original local file paths;
- OCR captures and logs;
- TTS and translation caches and local models;
- source PDFs, audio, video, and exported files.

Before restore, the app checks checksum, size, version, corruption, and profile conflicts. Preview the result and choose new profile, merge, or replace. A safety backup is created before replacement.

Backups can contain conversations and learning history in plaintext. Keep them in encrypted personal storage and do not share them.

Choose `Create backup file`, then preview `Restore as new profiles`, `Merge non-conflicting data`, or `Replace current data` before restoring.

![Full-backup screen showing included and excluded data and Create backup file](site/assets/app-images/en/25-backup-create.webp)

*Figure 15. Store learning records in a lembackup while excluding keys and source files.*
![Restore preview comparing new profiles, merge, and replacement](site/assets/app-images/en/26-restore-preview.webp)

*Figure 16. Review restore results and conflicts before choosing a mode.*

## 10. Delete data

The privacy and data section in Settings provides controls for:

- web-reader login cookies;
- the extension’s offline queue;
- API keys;
- rebuildable caches;
- all local learning data.

The Windows uninstaller may leave user data behind. Before handing a PC to someone else, complete the in-app full deletion, preserve any wanted backup separately, and then uninstall.

![Privacy and local-data deletion separating API keys, cookies, cache, learning data, and all-data deletion](site/assets/app-images/en/27-privacy-delete.webp)

*Figure 17. Delete selected categories or all Language Miner data on this device.*

## 11. Browser extension beta

The first public beta uses an optional manual installation rather than the Chrome Web Store.

1. Download `Language-Miner-Extension-<version>.zip` and `SHA256SUMS.txt` from the same official GitHub Release as the app.
2. Verify that the ZIP’s SHA-256 matches the line for the same filename in `SHA256SUMS.txt`.
3. Extract the ZIP into an empty folder. Do not select the ZIP itself in Chrome.
4. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
5. Select the extracted folder that directly contains `manifest.json`, not its parent folder.
6. Check pairing and permissions in app Settings, then keep the site allowlist and capture scope minimal.

The sentence-card selection tool requests broad site access so it can turn a sentence selected on an ordinary webpage into a card. Dragging text alone sends nothing. Only after you click the sentence-card action does it send the selected expression, source sentence, page title and URL, and nearby context to the local app. If you do not want that permission, you can skip the extension and keep using the rest of the desktop app.

Revoking permissions or rotating the token can require re-pairing. Failed transfers appear in the pending queue, which you can clear manually.

![App capture settings for allowed sites, own messages, surrounding context, maximum length, and masking](site/assets/app-images/en/28-app-capture-privacy.webp)

*Figure 18. Reduce the browser capture boundary in the app. Clear the entire pending queue separately from the Chrome extension options page.*

![Chrome extension options showing the offline pending-item count and the Delete all pending items button](site/assets/app-images/en/29-extension-queue-clear.webp)

*Figure 19. The delete button is disabled when the queue is empty. Use the same location to clear all items when any are pending.*

## 12. Troubleshooting

- **AI request fails:** Check provider status, model name, key restrictions, quota, and the remote URL.
- **Estimate differs from billing:** The app shows an estimate; use the provider console as the source of truth.
- **Media does not open after restore:** Original files and paths are excluded. Select the file again.
- **UGC does not run:** Read the validator state and issue codes, then ask the creator for a corrected version.
- **SmartScreen warning:** Do not run the file if you cannot verify both source and SHA-256.

Use a public issue template for ordinary bugs and the [private security process](../SECURITY.md) for vulnerabilities or privacy exposure.
