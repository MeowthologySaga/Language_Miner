# Language Miner Web Capture

Browser extension MVP for Life Miner message capture, web selection sentence
cards, and YouTube dual subtitles.

## Load

1. Run the Electron app so the local bridge starts at `127.0.0.1:17345`.
2. Open Chrome Extensions.
3. Enable Developer mode.
4. Load unpacked and select this `extension` folder.
5. After code changes, click reload for this extension in `chrome://extensions`.

## Local Bridge Pairing

- The app creates a session bridge token when it starts.
- The extension posts to `/pair`, receives the token, and stores it in extension
  local storage before fetching `/settings` with that token.
- Capture, sentence-card, translation, and YouTube watch POST requests include
  the token in `X-Local-English-Miner-Token`.
- If the app restarts and the token changes, the extension pairs again, refreshes
  settings, and retries the request once.
- The Electron bridge pairs with the first extension origin it sees for the app
  session. Reloading the same unpacked extension keeps the same origin.

## Bridge Smoke QA

After `npm.cmd run build`, run this from the repository root to verify the
bridge token path without Chrome:

```powershell
npm.cmd run qa:bridge-smoke
```

The smoke starts the built Electron app, checks token pairing and CORS headers,
then posts an empty Life Miner payload that is rejected as `skipped` before user
data is saved. If another app is already using `127.0.0.1:17345`, close it first
or rerun with `-- --allow-existing-bridge` when you intentionally want to test
the existing bridge.

## Life Miner Message Capture

Supported send-message capture sites:

- `https://discord.com/*`
- `https://chatgpt.com/*`
- `https://claude.ai/*`

The content script does not store key-by-key input. It only reads the final
`textarea.value` or `contenteditable` text when Enter-send or a send button click
is detected.

## Web Selection Sentence Cards

- Runs on normal `http`/`https` pages, including YouTube and Reddit.
- Drag a word or phrase, then click the localized `Sentence card` / `문장 카드` popover action.
- The extension sends only the selected text, extracted source sentence, page
  title, URL, and nearby sentence context after you click the action.
- The app saves an input reading card. It tries Local MT for a Korean sentence
  translation. If Local MT is not ready, the card is still saved with a note.

## YouTube Dual Subtitles

- Open YouTube and turn on YouTube's built-in `CC` captions.
- The localized `LEM subtitles ON` / `LEM 자막 켜짐` toggle appears on the video player.
- The extension reads the visible YouTube caption text and asks the local app to
  translate it with Local MT, then overlays English + Korean lines.
- Video and caption files are not downloaded.

If the app is not running, Life Miner captures and sentence-card captures are
queued in extension local storage and flushed when the bridge becomes available.
Pending items expire after seven days and are bounded to 200 items per queue,
2 MiB per queue, and 5 MiB total. Open the extension's **Options** page to view
the current size or delete every pending item immediately.

## Interface languages

Chrome selects Korean or English from its UI language through the standard
`_locales` message catalogs. The manifest, options page, selection-card
popover, accessibility labels, errors, and YouTube subtitle controls use the
same catalogs. No translation files or other resources are downloaded at
runtime.
