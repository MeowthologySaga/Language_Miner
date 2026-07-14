# Language Miner Privacy and Data Notice

[한국어](privacy.ko.md) · [README](../README.en.md) · [User guide](user-guide.en.md) · [Security reporting](../SECURITY.md)

- Target: planned `v0.1.0-beta.1`
- Last updated: 2026-07-13

## At a glance

Language Miner is a local-first desktop app without a project account or central application server.

- The project does not operate advertising, analytics, or developer telemetry servers.
- AI starts disconnected on a new installation.
- Cards, reviews, conversations, and settings are stored on this PC by default.
- When you enable a cloud feature, selected content goes directly to that provider.
- The app’s cost guard is a local estimate and cannot block provider billing.
- Only API keys use OS-protected storage. Learning data and conversations may be stored locally in plaintext.

This notice describes data handled by the app itself. Google, Gemini, any configured Ollama server, websites, GitHub, Google Drive, and Discord apply their own terms and privacy policies.

## Data stored locally

| Feature | Data | Default storage | External transfer |
| --- | --- | --- | --- |
| Cards, vocabulary, reviews | Sentences, meanings, hints, decks, ratings, due dates | Local SQLite under Electron user data, plaintext | Selected content only when you run cloud generation or translation |
| Documents and highlights | Document metadata, selections, translation and highlight mappings | SQLite and local settings | Requested text when cloud translation is selected |
| Listening and video | Transcript segments, subtitles, playback and card state | SQLite, local settings, work folders | Target segments only after a cloud action |
| Life Mining | Allowed messages and context, source, processing state | App SQLite; extension queue before delivery | Loopback transfer between extension and app; candidate text if cloud card generation is chosen |
| Character Chat | Character presets, definitions, conversations, card hints | Local renderer storage, potentially plaintext | Runtime context sent to the connected AI provider |
| Manual ChatGPT Web bridge | Card prompt and the response pasted by the user | Kept only in dialog memory; the prompt and raw response are not persisted | The app sends nothing automatically. Content reaches OpenAI only when the user pastes the copied prompt into ChatGPT |
| PlayZone | Installed pack metadata, per-pack saves, local reward history | Pack and save areas under app user data plus SQLite | Denied by default; UGC network access is not supported in this beta |
| Settings and profiles | UI language, learning languages, provider and feature settings | Electron renderer storage | None by itself; connection settings are used in provider requests |
| Usage estimates | Provider, model, estimated or observed usage and cost | Local usage ledger | Not sent to the developer |
| Exports and backups | User-selected PDF, HTML, and `.lembackup` files | A local path you select | Never uploaded automatically by the app |

Anyone with access to your Windows account, or malware running as you, may be able to read plaintext learning data and conversations. Avoid sensitive content on a shared account and use Windows account and disk protection plus encrypted backup storage.

## API keys and connection credentials

Gemini and Google API keys persist only when Electron `safeStorage` reports OS encryption is available.

- If OS encryption is unavailable, keys are not written to a plaintext file or ordinary settings.
- In that case, a key remains in the current app session only and must be entered again after restart.
- Keys use supported authentication headers rather than request URL queries.
- UI, errors, logs, and QA reports mask keys.
- `.lembackup` excludes API keys, OAuth tokens, and cookies.

If you enable Google Drive card sync, an OAuth token may be stored in a local credential file and a card snapshot is sent to your Google Drive `appDataFolder`. Sync is used only after you connect and invoke it.

## External AI and translation

### Disconnected

This is the default. The app sends no Gemini or Google AI request before consent.

### Ollama

Only loopback hosts such as `localhost`, `127.0.0.1`, and `::1` are labeled local. A LAN or internet URL is remote and can disclose request text to that server’s operator.

### Gemini card generation and chat

Depending on the feature, a request can include:

- the sentence and surrounding context selected for a card;
- learning languages and card-format instructions;
- character definition and scenario;
- recent conversation and the new message;
- relevant card hints.

### Manual ChatGPT Web bridge

A ChatGPT subscription does not become API access. This mode uses neither an API key nor ChatGPT login cookies. The app first displays the complete prompt, copies it only after the user confirms, and opens the fixed ChatGPT home page in the default browser. It never reads the clipboard or collects a ChatGPT response automatically.

Pasted card responses are checked locally for the matching request ID, size, JSON structure, and allowed fields. Card IDs, profiles, review state, and timestamps remain controlled by the app.

### Google Cloud Translation

The sentence or document segment being translated and source and target language information can be sent to Google’s API.

Before a cloud task, the app shows the provider, model, content sent, estimated requests and cost range, and cancellation route. The consent version is recorded locally.

Do not put passwords, API keys, private business information, or sensitive medical or financial records into translation or chat input.

## Cost and usage

The limits and cost values shown in the app are estimates calculated on this device.

- Provider token counting, billing units, free allowance, currency conversion, and tax can differ.
- Retries and fallback requests can create additional usage.
- The “estimated cost guard” can stop new work in the app but cannot block charges on a Google billing account.
- Configure API and application restrictions, quotas, and budget alerts in Google Cloud Console.
- Treat the provider console’s measured usage and billing record as authoritative.

## Web reader and remote content

Signing in through the web reader can leave site cookies and session data in the local Electron session. They are not sent to a developer server, but the visited site and its third parties receive ordinary browsing requests.

Remote character images do not load automatically. If you approve a remote image, its host can observe your IP address, time, and ordinary request headers.

## Browser extension and Life Mining

The extension is an optional manual installation and automatic capture starts off.

The sentence-card selection tool runs on ordinary `http`/`https` pages, so Chrome can show a broad warning such as permission to read and change data on visited sites. Selecting text alone sends nothing. Only after you click the sentence-card action does the extension send the selected expression, source sentence, page title and URL, and nearby context to the loopback app. Automatic Life Mining message capture follows a separate site allowlist and starts off.

You control:

- allowed sites;
- whether only your own messages are collected;
- whether and how much surrounding context is included;
- maximum message length and long-message handling;
- masking rules.

Filters and masking apply before app storage. If the app is offline, items may remain temporarily in a bounded extension queue with TTL, item-count, and byte limits. Settings provides a clear-all action.

## Backups

A `.lembackup` may contain:

- cards, vocabulary, reviews, highlights, and profiles;
- Life Mining records and listening transcripts;
- character presets and conversations;
- routines and missions, PlayZone saves, and local reward history.

It excludes:

- API keys, OAuth tokens, and cookies;
- web-reader session and navigation state, plus this device's cloud-transfer consent records;
- original local file paths and source PDFs, audio, and video;
- OCR captures, logs, caches, and models;
- separately exported files.

The backup format is not encrypted. Store it securely. Saving to a synchronized folder such as OneDrive can upload it to that provider.

## Retention and deletion

Local data can remain until you delete it or remove the Windows user data. Settings provides actions for:

- web-reader login cookies;
- the extension pending queue;
- API keys;
- OCR, TTS, and translation caches;
- all local data.

Full deletion targets SQLite and backup databases, ordinary and secure settings, cookies, the extension queue, and caches. It does not automatically erase `.lembackup` files, exports, media you copied elsewhere, or a Google Drive sync copy.

Do not assume the Windows uninstaller removes all user data. Before transferring a PC, use the in-app full deletion and inspect separate backup and export locations.

## UGC and community links

The app applies technical checks to UGC but cannot guarantee the accuracy, legality, copyright status, or content rating of everything obtained externally. If the official Discord is published, it will apply a general-audience policy. An external link is not an official endorsement.

Creators must not put API keys, personal conversations, local paths, tracking pixels, or remote executable content in packs. See the [UGC policy](ugc-policy.en.md).

## Contact and changes

Report ordinary documentation errors through the documentation issue template. Use the [private security process](../SECURITY.md) for a vulnerability, exposed key, or possible privacy leak. Do not include a real secret or unnecessary personal data in a report.

When data flows change, this notice’s date and target version will be updated. Use the copy shipped with a Release as the notice for that version.
