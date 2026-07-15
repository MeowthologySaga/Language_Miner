# Language Miner Complete User Manual

[한국어](complete-user-manual.ko.md) · [Quick user guide](user-guide.en.md) · [Windows installation](install-windows.en.md) · [Privacy notice](privacy.en.md) · [UGC policy](ugc-policy.en.md)

This tutorial-style manual is for an English learner who is not assumed to know web development, APIs, or local AI. It does more than list menus: each feature explains **where to go → why to use it → what success looks like → what to check next when it fails**.

This manual covers public beta [v0.1.0-beta.1](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1). Its Release page takes precedence for the exact file list, known issues, and changes.

## 1. Terms in plain language

- **UGC (user-generated content):** a character or game pack made and shared by a user.
- **BYOK (bring your own key):** you enter an API key issued to you by the provider instead of using a key owned by the app developer. Any provider charges are between you and that provider.
- **loopback:** an address such as `localhost`, `127.0.0.1`, or `::1` that returns to the same computer. Language Miner treats Ollama as local only on one of these addresses.
- **NSIS:** a standard Windows installer format used by the installable Language Miner build.
- **SBOM:** a software bill of materials, or a machine-readable inventory of software components in a release.
- **CSP (Content Security Policy):** browser security rules that limit what a game page may load or run.
- **quota:** a provider-side request or token cap. Unlike an estimate inside the app, a provider quota can actually reject a request.

## 2. Why a sentence loop instead of a word list

Memorizing only `late = not on time` may help you recognize the word without helping you speak when you are late for a meeting. A real sentence keeps the vocabulary, grammar, natural combination, and situation together:

> I’m running a little late.

Language Miner uses this loop:

1. Discover a real expression while reading or listening.
2. Save the complete sentence as a reading, listening, or speaking card.
3. Retrieve it again with spaced repetition before it fades.
4. Produce it yourself in writing or a character conversation.

Reading and listening **input** build recognition. Speaking and writing **output** train retrieval at the moment you need the language. The app connects both directions because either one by itself leaves a gap.

[![Learning loop from expression discovery to cards, review, writing, and conversation](site/assets/app-images/en/00-learning-loop.gif)](site/assets/app-images/en/00-learning-loop.gif)

*Figure 1. Discover, save, review, and reuse the same sentence. Click the GIF to open the original if the embedded animation is heavy.*

## 3. Installation and first launch

### 3.1 Choose a build from the official Release

**Path:** [v0.1.0-beta.1 Release](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1) → Assets

**Why:** To verify the source and file before running it.

**Steps**

1. From the same Release, download `Language-Miner-Setup-0.1.0-beta.1-x64.exe` or `Language-Miner-Portable-0.1.0-beta.1-x64.exe`, `SHA256SUMS.txt`, and the SBOM.
2. Choose the installer for normal Windows app behavior, or portable when you want to manage the executable without an installation wizard.
3. Compare the SHA-256 value by following the [Windows installation guide](install-windows.en.md).
4. The first beta may be unsigned, so recheck the publisher warning and file source in SmartScreen.
5. Do not run the file if you cannot verify it.

**Success:** The app window opens to the first-launch language screen.

**If it fails:** Do not search for a similarly named file on another site; return to the official Release. Running a later installer for the same Windows user and path normally performs an upgrade or repair, but read that Release’s notes first. “Portable” means no installer; it does not promise that all learning data stays beside the executable.

**Privacy and cost:** Installation itself has no AI API charge. Windows uninstall may preserve user data, so use the in-app full deletion before handing the PC to someone else.

### 3.2 Choose app, native, and learning languages

**Path:** First-launch dialog → Language setup

**Why:** To keep the interface language separate from the languages in your learning profile.

**Steps**

1. `App language` controls menus and instructions.
2. `Native language` is the basis for meanings and explanations.
3. `Learning language` is the language used in cards and practice.
4. A Korean speaker learning English would select `한국어 / 한국어 / English`.
5. On the last AI introduction, continue with `Explore the app` without entering a key if you prefer.

**Success:** Today opens, and the first-launch dialog does not return on every later start.

**If it fails:** Fully quit and reopen the app. Check whether you are alternating between the installer and portable builds. If it still returns every time, report it as a bug.

**Privacy and cost:** Language selection is local. No external AI request should occur here.

[![First launch with App language, Native language, and Learning language](site/assets/app-images/en/01-onboarding-language.webp)](site/assets/app-images/en/01-onboarding-language.webp)

*Figure 2. Interface language and learning-profile languages are separate settings.*

## 4. A 10-minute starting sequence

This is a sequence for starting your first loop without getting trapped in settings. It is not a promise that you can finish learning the app in ten minutes. AI can remain disconnected.

### 4.1 Distinguish the tutorial from real screens

**Path:** Manage → Tutorial

**Why:** To rehearse selection, card creation, and review controls without altering your library.

The tutorial is a **sandbox copy** of app screens. Its actions record tutorial progress but do not change your real card library. Exit it before making a real card.

**Success:** The screen says that you are in the tutorial and shows the copied navigation.

**If it fails:** If a card does not appear in your real library, first check whether you created it inside the tutorial.

**Privacy and cost:** The tutorial sandbox is an offline practice flow and should not call external AI.

[![Tutorial sandbox separated from real cards](site/assets/app-images/en/manual-01-tutorial-sandbox.webp)](site/assets/app-images/en/manual-01-tutorial-sandbox.webp)

*The tutorial notice and practice navigation make it clear that this space does not change the real card library.*

### 4.2 Select a sentence on a real webpage

**Path:** Read & Listen · Input → Reading → Web Reader → address bar

This example uses the public-domain text of *Alice’s Adventures in Wonderland* hosted by Project Gutenberg. Opening the address contacts that website and needs an internet connection.

1. Enter `https://www.gutenberg.org/files/11/11-0.txt` in the address bar.
2. Drag over `Oh dear! I shall be late!`.
3. Choose `Sentence card` in the tool that appears.
4. Check that the full sentence and nearby context are included.

**Success:** A reading-card preview for the selected Alice sentence opens.

**If it fails:** Make sure you chose the sentence-card action after selecting text. Choose `Select again` if the range is wrong.

**Privacy and cost:** Opening a webpage does not by itself send card text to AI. If Gemini or remote Ollama is the card engine, a separate transfer preflight appears before real generation.

[![Web Reader showing the Project Gutenberg text of Alice’s Adventures in Wonderland with a sentence selected](site/assets/app-images/en/home-web-reader-live.webp)](site/assets/app-images/en/home-web-reader-live.webp)

*Figure 3. Select a sentence where you found it on the live webpage and create a reading-card candidate.*

### 4.3 Check the Web Reader card before saving

**Path:** Web Reader reading-card preview → Save card or Select again

The card previews below return to the built-in `I’m running a little late.` sample so the structure stays easy to compare. Any selected web sentence follows the same review-and-save sequence.

1. Read the sentence, literal meaning, natural meaning, and study note.
2. If the selection is wrong or contains information you do not want to keep, return with `Select again`.
3. If the content is correct, choose `Save card` or the save action shown by that screen.

**Success:** A saved notice appears and the card is visible in Cards or Review.

**If it fails:** The Web Reader preview does not edit the card body. If the explanation is wrong or includes unwanted context, do not save it; change the selection or create the candidate again. Use Document Reader when you need the editable card-body flow.

**Privacy and cost:** Card content is stored locally in plaintext in SQLite and related storage. Avoid personal conversations or confidential workplace sentences on a shared PC.

[![Reading-card preview for I’m running a little late with the Save card and Select again actions](site/assets/app-images/en/07-reading-card-preview.webp)](site/assets/app-images/en/07-reading-card-preview.webp)

*Figure 4. Review the generated content and save it only when it is correct.*

### 4.4 Complete the first review and writing attempt

**Path:** Review → Reading Cards → Start review

1. Recall the meaning and situation before showing the answer.
2. Choose `Show answer`.
3. Choose `Again` or `Hard` if retrieval was difficult, and `Good` or `Easy` if it was immediate.
4. Open Speak & Write · Output → Writing Practice and produce the sentence from a native-language situation such as telling a friend you are late.

**Success:** Your rating changes the next review time, and Writing Practice shows your answer, expression checks, and a suggested answer.

**If it fails:** If the card is not due yet, check the deck counts in Review. If no writing prompt can be created, save a reading or speaking card first.

**Privacy and cost:** Review scheduling and basic writing comparison are local. Writing feedback helps you decide what to focus on next; it does not silently rewrite SRS card hints.

[![Front of a review card with Show answer](site/assets/app-images/en/09-review-front.webp)](site/assets/app-images/en/09-review-front.webp)

*Figure 5. Recall first, then reveal the answer.*

[![Review answer with Again, Hard, Good, and Easy](site/assets/app-images/en/10-review-answer.webp)](site/assets/app-images/en/10-review-answer.webp)

*Figure 6. The rating is an interval signal, not a school grade.*

[![Writing result comparing my answer, expression checks, and a suggested answer](site/assets/app-images/en/12-writing-result.webp)](site/assets/app-images/en/12-writing-result.webp)

*Figure 7. Produce the sentence from meaning, then compare it with a suggestion.*

## 5. Today, routines, missions, and diamonds

### 5.1 Read the Today workspace

**Path:** Today

**Why:** To see due reviews, Life Mining candidates, and listening work in one place and choose one next action.

The top summary cards are `Today’s review`, `New card candidates`, and `Listening Loop`. Below them are recent activity and the daily routine.

**Example:** If eight reviews and two Life Mining candidates are waiting, finish the scheduled reviews before processing candidates.

**Success:** Counts and progress change to match your actual learning activity.

**If it fails:** Reopen the relevant screen or action. A full-page reload every time you change a setting is not expected behavior.

**Privacy and cost:** Summaries and the activity heatmap are local. They are not sent to a developer-owned analytics server.

[![Today hub summaries and activity history](site/assets/app-images/en/manual-02-today-hub.webp)](site/assets/app-images/en/manual-02-today-hub.webp)

*Review, candidate, listening, routine, and recent activity are summarized in one place.*

### 5.2 Continue the daily routine

**Path:** Today → Start today’s routine

The order is `Review → Listening Loop → Writing Practice → Claim rewards`. You can leave and return through `Resume today’s routine`, and reopen a skipped step when needed.

**Success:** The final reward step marks the basic routine complete.

**If it fails:** Use `Open current step`, or open that destination directly from the left navigation and return to Today afterward.

**Privacy and cost:** The routine itself costs nothing. A cloud card or translation job inside it still requires a separate preflight.

[![In-progress daily routine and current step](site/assets/app-images/en/manual-03-today-routine.webp)](site/assets/app-images/en/manual-03-today-routine.webp)

*Check the current step, then resume where you stopped.*

### 5.3 Complete missions and claim diamonds

Diamonds are a **local learning reward**, not cash, cryptocurrency, or a tradable balance. Progress alone may not increase the wallet; choose `Claim` on a completed mission.

| Daily mission | Goal | Reward |
|---|---:|---:|
| Create reading cards | 5 cards | 15 diamonds |
| Complete Listening Loop sentences | 30 sentences | 20 diamonds |
| Check Writing Practice answers | 3 times | 15 diamonds |
| Create Life Mining cards | 5 cards | 25 diamonds |
| Finish the reading-card deck | once | 15 diamonds |
| Finish the listening-card deck | once | 15 diamonds |
| Finish the speaking-card deck | once | 15 diamonds |
| Claim all base rewards | daily bonus | 30 diamonds |

**Success:** The mission changes to claimed, and the wallet and earned-today amount increase.

**If it fails:** Check the local date and active profile, then complete the relevant activity once more. A duplicate click must not grant the same reward twice.

**Privacy and cost:** Diamonds are not connected to real payment. A PlayZone spend confirmation must match the game’s declared action, amount, and reason.

[![Daily mission progress and diamond rewards](site/assets/app-images/en/manual-04-daily-missions.webp)](site/assets/app-images/en/manual-04-daily-missions.webp)

*A completed mission changes the local diamond balance only after you choose `Claim`.*

## 6. Profiles and app language

### 6.1 Create, switch, and duplicate profiles

**Path:** Settings → General → Current learning profile → Manage profiles

**Why:** To separate cards and review history for different languages or goals.

1. Choose `New profile`; it begins with a copy of the current language settings.
2. Check the name, learning language, and native language.
3. Use `Duplicate` for a similar setup.
4. Switch with the top profile control or `Switch profile` in Settings.

**Success:** The top bar shows the new profile and language summary, and card/review counts change to that profile.

**If it fails:** The default profile cannot be deleted. Switch to another profile or delete individual data inside the default profile.

**Privacy and cost:** Cards, reviews, listening progress, documents, exports, and translation cache are profile-scoped. Original Life Log entries are shared on the device while processing state is per profile. Profile deletion cannot be undone.

[![Profile manager for separate learning languages](site/assets/app-images/en/manual-05-profile-manager.webp)](site/assets/app-images/en/manual-05-profile-manager.webp)

*Review the active profile and manage new, duplicated, and language-specific profiles.*

### 6.2 Change the interface language

**Path:** Settings → General → App display language

Switch between `한국어` and `English` immediately. This changes labels and instructions, not the learning profile.

**Success:** The current screen changes language and the setting auto-saves.

**If it fails:** Reopen the screen. Report any remaining hard-coded string as a localization bug.

**Privacy and cost:** This is a local display setting with no external request.

## 7. Three card types and card management

### 7.1 Choose the correct card type

| Card | What appears first | Training goal | Main creation screens |
|---|---|---|---|
| Reading | English sentence | Recognize meaning, role, and context | Document Reader, Web Reader |
| Listening | Original sound or segment | Recognize the sentence in real speech | Listening Loop, Video Reader |
| Speaking | Native-language meaning or situation | Produce the learning-language sentence | Life Mining and speaking flows |

The primary Web Reader sentence-card flow creates a **reading card** first. Do not assume it creates all three types at once; use the dedicated listening and speaking screens for those senses.

### 7.2 Check results and know where editing is available

**Path:** Document Reader card result → Edit/Edit content → Save

**Why:** Generated explanations can be wrong or too broad, so only save a card that matches your situation.

**Example:** If `I’m running a little late.` is translated literally as running slowly, change it to the meaning “I may arrive a little late.”

**Success:** The Document Reader preview and saved card show your corrected sentence, meaning, and notes.

**If it fails:** Web Reader uses a check, save, or select-again flow and does not edit the generated body. Edit before saving in Document Reader, or recreate the candidate from the source screen. The saved-card page currently emphasizes tag editing.

**Privacy and cost:** Regeneration may make another paid call depending on the provider. Plain text editing has no AI cost.

### 7.3 Search, filter, and tag

**Path:** Manage → Cards

Filter by deck, search text, and tags. Add classifications such as `topic:appointments` or `intent:late-notice` in the tag editor.

**Success:** A saved message appears and selecting the filter narrows the list.

**If it fails:** Multiple selected tags match any one of them. Clear tags and the search query if nothing appears.

**Privacy and cost:** Cards and tags are local plaintext. When a sync folder is connected, card JSON may be uploaded by the service that manages that folder.

[![Card deck filters, search, and tags](site/assets/app-images/en/manual-06-card-library.webp)](site/assets/app-images/en/manual-06-card-library.webp)

*Separate reading, listening, and speaking decks, then use search and tags to find a card.*

### 7.4 Default samples and permanent deletion

A new profile may contain default sample cards. Do not expect a separate general-purpose `Hide sample` button. In the current behavior, **permanently deleting a default sample also records its dismissal**, so it does not return.

**Path:** Manage → Cards → Select card → Delete card → Delete permanently

**Success:** The card and review history disappear, and a deleted default sample stays gone after restart.

**If it fails:** There is no undo for an ordinary deleted card. Recovery requires a suitable earlier `.lembackup`.

**Privacy and cost:** Deletion is local and free. It does not automatically erase separate backups or copies on other devices.

[![Permanent deletion warning for a sample card](site/assets/app-images/en/manual-07-card-delete.webp)](site/assets/app-images/en/manual-07-card-delete.webp)

*Confirm that review history will be removed and the default sample will not return before deleting it.*

## 8. Document Library, reader, recent items, and bookmarks

### 8.1 Open PDF and HTML documents

**Path:** Read & Listen · Input → Reading → Document Reader → Add file

**Why:** To preserve the sentence and its context from material you actually read.

1. Choose a `.pdf`, `.html`, or `.htm` file.
2. Use page navigation, zoom, fit width, or fit page.
3. Search for text when needed.
4. Select text and open the sentence-card action. The default shortcut is `Ctrl+Q` and can be changed in Settings.
5. Confirm the selected sentence and expressions, then save the reading-card candidate.

**Example:** Select `I’m running a little late.` and review its literal meaning, natural meaning, and study note.

**Success:** A saved notice appears and the file enters Recent documents.

**If it fails:** Image-only scanned PDFs may not provide selectable text. For a file that will not open, check encryption, damage, and extension. Full local paths should remain hidden in the default error view and appear only in collapsed technical details.

**Privacy and cost:** The source file and path stay on this PC. Only a selected cloud translation or generation action sends text externally, after a scope and cost preflight.

[![Document Reader showing a public-domain Alice’s Adventures in Wonderland PDF](site/assets/app-images/en/home-document-alice.webp)](site/assets/app-images/en/home-document-alice.webp)

[![Creating a card from selected PDF text](site/assets/app-images/en/07-reading-card-preview.webp)](site/assets/app-images/en/07-reading-card-preview.webp)

*This flow uses a rights-cleared example PDF and continues from text selection to the card preview.*

### 8.2 Manage recent documents

**Path:** Document Reader → Recent documents

Search by title or filename, and filter all, recent, or export results. Use `Open in reader`, `Show file location`, `Remove from recent`, or `Clear recent`.

**Success:** The item opens or disappears from the recent list. Clearing recent records preserves export history.

**If it fails:** Removing a recent record does not delete the source file. If the source moved, add it again from its new location.

**Privacy and cost:** Recent items can reveal local filenames. Redact them during screen sharing. Original local paths are excluded from a normal backup.

[![Searching and reopening recent documents](site/assets/app-images/en/manual-09-document-library.webp)](site/assets/app-images/en/manual-09-document-library.webp)

*Reopen a recent item or remove only its history entry; this does not delete the source file.*

### 8.3 Save and reopen bookmarks

**Path:** Document Reader toolbar → Bookmark / Document workspace → Bookmarks

**Why:** To return to a page in a long PDF or a sentence you intend to mine later.

Choose `Bookmark` on the current page. Bookmarks are saved per profile; `Open saved page` returns to that page.

**Success:** The toolbar button becomes selected and the bookmark list shows the document and page.

**If it fails:** A missing source path prevents direct opening. Restore the file to its location or add it again in Document Library.

**Privacy and cost:** Bookmarks are local. A restored backup does not bring the original file or path to another PC.

[![Saved document bookmarks](site/assets/app-images/en/manual-10-bookmarks.webp)](site/assets/app-images/en/manual-10-bookmarks.webp)

*Check the document and page before reopening or deleting a bookmark.*

## 9. Web Reader

### 9.1 Create a reading card from a real webpage

**Path:** Read & Listen · Input → Reading → Web Reader

**Why:** To keep the selected sentence, title, URL, and nearby context without switching between a browser and a card app.

1. Use a purpose launcher, the built-in practice article, or the address bar.
2. Drag over a useful expression.
3. Choose `Sentence card` to create a reading-card candidate.
4. When auto-save is off, check the result. If the selection or content is wrong, do not save it; select the source again.

**Success:** The real Cards screen shows a reading card with source information.

**If it fails:** A site may block selection or require login. Respect its terms; use a saved document or manual Life Mining entry when needed.

**Privacy and cost:** Login cookies may remain in the Web Reader’s dedicated Electron session and can be deleted in Settings. Opening a webpage and sending card text to cloud AI are separate actions.

[![Selecting an Alice sentence and choosing Sentence card on the Project Gutenberg page](site/assets/app-images/en/home-web-reader-live.webp)](site/assets/app-images/en/home-web-reader-live.webp)

*Figure 8. Selection alone is not the transfer action; choose the card action to create a candidate.*

### 9.2 Translation and login-data deletion

**Path:** Web Reader toolbar → Translate page/selection, or Settings → Advanced → Privacy & local data deletion → Delete Web Reader login data

Built-in browser translation works only on supported Electron/Chrome versions and language pairs. Gemini or Google translation opens a separate cloud preflight.

**Success:** The translation appears, or cookie deletion reports completed deletion and residual verification.

**If it fails:** Choose Local MT, Ollama, Gemini, or Google when browser translation is unavailable. You must sign in again after deleting login data.

**Privacy and cost:** Full-page translation can send much more text than a selection. Review character count, call cap, and estimated cost for a cloud provider.

## 10. Listening Loop and Video Reader

### 10.1 Build today’s Listening Loop

**Path:** Read & Listen · Input → Listening → Listening Loop

**Why:** To turn long media into short sentences you can repeatedly recognize in real audio.

1. Select one or more recommendations, or choose a YouTube video directly.
2. Set today’s sentence target and build the routine.
3. Prepare Whisper transcription if subtitles are unavailable; this may take time.
4. Loop the current sentence and highlight the part that is hard to hear.
5. Save it to the listening-card deck.

**Example:** Highlight `running a little` when that sound chunk is unclear in `I’m running a little late.`

**Success:** The app reports that it saved a listening card and increments today’s heard-sentence count.

**If it fails:** An embedded YouTube block does not prevent use of the sentence loop; open the video on YouTube. If too few sentences are prepared, select more videos or start with the available count.

**Privacy and cost:** YouTube/RSS discovery and transcription may use the network or local compute. Original media and paths are excluded from `.lembackup`.

[![Front of a listening card saved from the fictional office conversation](site/assets/app-images/en/home-listening-card-front.webp)](site/assets/app-images/en/home-listening-card-front.webp)

*Figure 9. After repeating a short segment, review it as a listening card that starts from sound.*

### 10.2 Study your own media in Video Reader

**Path:** Read & Listen · Input → Listening → Video Reader

**Why:** To manage subtitles, translation, shadowing, and card capture for a local or YouTube video in one workspace.

1. Open an MP4, MKV, WebM, or MOV file, or enter a YouTube URL.
2. Use embedded subtitles, SRT/VTT, a stored transcript, or local Whisper.
3. Set sentence loop, auto-pause, shadowing, and subtitle hide/blur.
4. Save the current segment and selected expressions as a listening card. Make sure an input field is not focused before using global shortcuts.

**Success:** Subtitle count appears, the resume position is stored, and the card reports whether an original audio/video segment was attached.

**If it fails:** Reopen an unsupported codec through the app so it can try preparing a playable MP4. If Whisper finishes with no segments, import another subtitle file or retry. The current Whisper job has no mid-run cancel button, so test with a short file first. Subtitle translation can be stopped while it runs, and failed work can be retried.

**Privacy and cost:** Local Whisper computes on your PC, but the media file is not included in backup. Cloud subtitle translation sends the original subtitles externally and retries can add cost.

[![Video Reader showing a fictional office conversation with bilingual captions](site/assets/app-images/en/home-video-reader-sitcom.webp)](site/assets/app-images/en/home-video-reader-sitcom.webp)

*Play the fictional office conversation, adjust captions, looping, and speed, then continue into a listening card.*

## 11. Life Mining

Life Mining collects something you actually wanted to say instead of making you invent study material in advance. Automatic capture starts off.

### 11.1 Add a candidate manually

**Path:** Speak & Write · Output → Life Mining → Add manually

1. Enter “I may be a little late” in your native language under `What I said`.
2. Add preceding or following context when useful.
3. Save it as a candidate.
4. Select the candidate and generate a sentence.
5. Confirm `I’m running a little late.` and the situation, then save the speaking card.

**Success:** The candidate becomes processed and the speaking card enters Review.

**If it fails:** Failed bulk items stay selected for retry. Canceling a bulk job leaves unprocessed items and avoids duplicating cards already saved.

**Privacy and cost:** Candidates and context are local plaintext. Gemini receives what you said, nearby context, and language settings. Remote Ollama is also an external transfer. The app cost guard is not a billing block.

[![Adding a sentence to Life Mining manually](site/assets/app-images/en/manual-12a-life-mining-add.webp)](site/assets/app-images/en/manual-12a-life-mining-add.webp)

[![Reviewing a Life Mining candidate and result](site/assets/app-images/en/manual-12b-life-mining-result.webp)](site/assets/app-images/en/manual-12b-life-mining-result.webp)

*Review what you wanted to say and the necessary context before starting card generation.*

### 11.2 Set browser auto-capture scope

**Path:** Settings → Capture

**Why:** To collect only from necessary sites and keep the target focused on your own messages.

After pairing, explicitly enable automatic capture and separately allow sites. A safe starting point is your own message plus limited reply context, deduplication, a length limit, and masking. Enable only the Discord, ChatGPT, Claude, YouTube, Reddit, or generic-web access you need.

**Success:** Settings show auto-capture on, the paired official extension origin, and recent source information.

**If it fails:** Token rotation, revocation, or permission removal may require re-pairing. Reopen both app and extension and confirm that only one official extension is paired.

**Privacy and cost:** Your messages and allowed context are stored locally. This is not a global keylogger. Capture and AI generation are separate; generation opens another transfer/cost confirmation.

[![App capture settings for allowed sites and Life Mining scope](site/assets/app-images/en/28-app-capture-privacy.webp)](site/assets/app-images/en/28-app-capture-privacy.webp)

*Figure 10. This is the app’s capture-scope screen. Queue deletion lives in the Chrome extension options.*

## 12. Writing Practice

**Path:** Speak & Write · Output → Writing Practice

**Why:** To produce English from a native-language situation instead of only recognizing English.

1. Choose a card-based or conversation prompt.
2. Type an English answer from the native-language prompt.
3. Use a hint only when needed.
4. Compare your answer, expression checks, and suggestion.
5. Choose `Rewrite` and retrieve it again without the answer.

**Example:** Respond to “Tell your friend that you may be a little late” with `I’m running a little late.`

**Success:** The checked count advances and feedback appears. The daily writing mission also progresses.

**If it fails:** This is not a one-answer quiz. When the meaning is valid but wording differs, use the comparison to focus the next attempt.

**Privacy and cost:** Basic comparison is local. Do not assume the result automatically changes SRS hints. Any additional cloud feedback action must present a separate preflight.

[![Writing Practice comparing my answer, expression checks, and a suggestion](site/assets/app-images/en/12-writing-result.webp)](site/assets/app-images/en/12-writing-result.webp)

*Figure 11. Use the result to choose the next focus, not merely to mark yourself wrong.*

## 13. Character Chat

**Path:** Speak & Write · Output → Character Chat

**Why:** To reuse a reviewed sentence at conversational speed and in context.

1. Choose a character and scenario.
2. Select casual native-language chat or learning-language practice.
3. Check whether AI is local or cloud-based.
4. Read the transfer notice before a cloud session.
5. Intentionally use a reviewed expression such as `I’m running a little late.`
6. Retrieve a correction again instead of only copying it.

**Success:** A character reply, correction, and nearby card hints appear, and the conversation auto-saves.

**If it fails:** Stop a stuck response before retrying. Distinguish a character-pack validation problem from an AI connection problem.

**Privacy and cost:** A cloud provider may receive the character definition, recent dialogue, new message, and selected card hints. Do not enter names, contact details, workplace secrets, or medical/financial information. Remote images load only after confirmation and approval is session-scoped.

[![Character Chat where I’m running a little late is used and answered](site/assets/app-images/en/14-character-chat.webp)](site/assets/app-images/en/14-character-chat.webp)

*Figure 12. Reuse a reviewed sentence inside a conversation.*

### 13.1 Create, import, and export characters

**Path:** Character Chat → Manage characters

Edit name, description, personality, scenario, first message, and expression images. Import JSON or a validated character pack, and export a pack with creator, source URL, license, version, and release notes.

**Success:** The import security report shows format, creator, license, SHA-256, remote images, and warnings before safe data is registered.

**If it fails:** Review legacy JSON warnings and re-export in the current pack format. Character packs are data-only; HTML or JavaScript execution is not allowed.

**Privacy and cost:** Conversations are local plaintext. Remove conversations and personal information before export. Approving a remote image host can expose normal network metadata such as your IP to that host.

[![Managing character settings](site/assets/app-images/en/manual-13a-character-manager.webp)](site/assets/app-images/en/manual-13a-character-manager.webp)

[![Confirming a remote character image before loading it](site/assets/app-images/en/manual-13b-character-remote-image.webp)](site/assets/app-images/en/manual-13b-character-remote-image.webp)

[![Entering creator and license metadata for a character pack](site/assets/app-images/en/manual-13c-character-export.webp)](site/assets/app-images/en/manual-13c-character-export.webp)

*These views cover character data, remote-image blocking, and the metadata required for a shareable pack.*

## 14. Review

**Path:** Review

**Why:** To schedule retrieval separately for reading, listening, and speaking instead of treating them as the same skill.

1. Check new, learning, and review counts for each deck.
2. Adjust per-deck daily new-card and review guards.
3. Start a deck and retrieve before showing the answer.
4. Choose Again, Hard, Good, or Easy.
5. On speaking cards, listen to the suggested sentence, record yourself, and play it back.

**Success:** The due count reaches zero, “today’s deck complete” appears, and the matching mission completes.

**If it fails:** Create a card when the deck is empty. Check the due date and daily guards when nothing is waiting. Check Windows voices and output device when TTS is silent.

**Privacy and cost:** Pronunciation recording is not saved or transmitted and remains only in the review screen. Cards and schedules are local plaintext.

[![Review session front with Show answer](site/assets/app-images/en/09-review-front.webp)](site/assets/app-images/en/09-review-front.webp)

*Figure 13. Retrieve first, then open the answer.*

[![Review session with four memory ratings](site/assets/app-images/en/10-review-answer.webp)](site/assets/app-images/en/10-review-answer.webp)

*Figure 14. A rating changes the next interval; it is not a judgment of the learner.*

## 15. PlayZone, official games, and UGC

### 15.1 Install and run an official game

**Path:** PlayZone → Select official game → Install and play → Review and download

Official games are not embedded in full inside the app installer. Their catalog and validation information are visible, and the first play downloads each game from its public GitHub Release. The three current downloads total about 166 MiB.

| Official game | Version | Approx. download | Source | Code and asset license summary |
|---|---:|---:|---|---|
| Abyss Summoner | 0.1.2 | 57.0 MiB | [MeowthologySaga/abyss-summoner](https://github.com/MeowthologySaga/abyss-summoner) | Code GPL-3.0-only; official media has separate terms |
| Drillheart Defense | 0.2.0 | 14.2 MiB | [MeowthologySaga/Drillheart_Defense](https://github.com/MeowthologySaga/Drillheart_Defense) | Code GPL-3.0-only; official media has separate terms |
| Cat Odyssey | 0.1.1 | 94.8 MiB | [MeowthologySaga/Cat_Odyssey](https://github.com/MeowthologySaga/Cat_Odyssey) | Code MIT; image/audio terms separate; EP1–20 narration and dependent cutscenes are non-commercial only |

The app’s installed-content guards allow up to 512 MiB per game pack, 1 GiB in total, and 128 packs. Game save data is limited to 5 MiB per pack and 256 MiB in total. Download archives and temporary extraction can require additional disk space, so these limits are not free-space estimates.

1. Read size, creator, version, source, license, and SHA-256.
2. Review permissions. The three official games request local storage and declared diamond spending; network, external links, and card reading are denied by default.
3. Start the download once and wait for progress.
4. After archive, path, hash, manifest, and permission checks produce `trusted_official`, choose `Play`.

**Success:** A separate game window opens with working canvas, assets, and save state.

**If it fails:** For a long “Loading game pack” state, check the network, GitHub access, and disk space, then cancel and retry. Do not extract a partial download manually. Never run `warning`, `blocked`, or `quarantined` content.

**Privacy and cost:** Downloading uses internet data but not an AI API charge. Games open under CSP in a separate runtime with network denied by default. Technical validation does not guarantee taste, content rating, legality, or copyright ownership.

[![PlayZone catalog showing the three official games](site/assets/app-images/en/18-playzone-official-library.webp)](site/assets/app-images/en/18-playzone-official-library.webp)

*Figure 15. The three Language Miner developer-approved games.*

[![Official game download review with size, source, license, hashes, and permissions](site/assets/app-images/en/19-playzone-install-confirm.webp)](site/assets/app-images/en/19-playzone-install-confirm.webp)

*Figure 16. Review the exact file and capabilities before first download.*

[![An official PlayZone game running in a separate window after validation](site/assets/app-images/en/21-playzone-gameplay.webp)](site/assets/app-images/en/21-playzone-gameplay.webp)

*Figure 17. Only a runnable pack opens in the separate runtime.*

### 15.2 Spend diamonds

**Why:** To use learning rewards for optional summons, revives, or rerolls in official games.

The app opens confirmation only when the requested action id, amount, and reason match the installed manifest. Drillheart Defense currently declares instant revive for 30, appraisal reroll for 20, and one pet summon for 100 diamonds.

**Success:** Only the confirmed amount is deducted once and the game receives a success response.

**If it fails:** Insufficient balance or an undeclared request is denied. Repeated clicks must not duplicate the same spend. Close the game and inspect transaction history or report an issue if they do.

**Privacy and cost:** App diamonds are not real-money purchases. Official-game permissions do not include card reading.

[![Real diamond-spend confirmation from Drillheart Defense](site/assets/app-images/en/manual-14-diamond-confirm.webp)](site/assets/app-images/en/manual-14-diamond-confirm.webp)

*The declared instant-revive reason, 30-diamond amount, and current balance must be visible before a spend can be confirmed.*

### 15.3 External game packs and UGC participation

**Path:** PlayZone → Add file or Select folder

UGC is inspected in quarantine first. Only `ready` and `trusted_official` may run. Path traversal, symlinks, abnormal compression, CRC errors, unsafe entries, external fetches, and undeclared permissions are blocking conditions.

**Success:** The security report shows creator, source URL, SPDX license, hashes, permissions, warnings, and an explicit runnable state.

**If it fails:** Send the block code to the creator and request a corrected version. Editing the pack yourself changes hashes and lineage assumptions.

**Privacy and cost:** GitHub Releases are the recommended source of record; treat Google Drive as an unverified external link. The official Discord is not open yet, so do not treat an unofficial server or invitation as the project community. To participate, publish a pack with accurate creator, source, SPDX license, and permissions on a GitHub Release, then submit the link if the repository later announces a community intake route.

## 16. Glossary

**Path:** Manage → Glossary

**Why:** To find repeated words or expressions across cards with meanings, card count, and example count.

Search for `late`, then inspect the source, meaning, card-based policy, and examples. Use `View cards` or `Create card` to continue.

**Success:** Results and their card/example counts appear.

**If it fails:** No terms means the saved cards have no usable vocabulary data yet. The current Glossary is a **temporary card-word view**, not a terminology engine that controls PDF translation. It can be hidden from navigation in Advanced settings.

**Privacy and cost:** It is derived locally from cards with no separate AI request.

[![Searching expressions collected from cards](site/assets/app-images/en/manual-15-glossary.webp)](site/assets/app-images/en/manual-15-glossary.webp)

*Glossary is a local view of terms, meanings, and sources already present in saved cards.*

## 17. Bilingual Book Maker and export history

### 17.1 Create a bilingual PDF

**Path:** Manage → Bilingual Book Maker → Make

**Why:** To combine source and translation into a readable PDF for later reading.

1. Choose a PDF.
2. Set page range, normal reading or paper/source-preserving mode, and source boxes.
3. Review provider, estimated segments/calls/cost, and app guards.
4. Choose `Create translated PDF`.
5. Retry failed pages only, or restart the full range when needed.
6. Open the PDF, save again, open in reader, or show it in its folder.

**Success:** A completed summary lists pages, segments, and provider, and the save dialog opens.

**If it fails:** Reduce the range when a page/token guard blocks it. Try paper/source-preserving mode for tables and equations. Read the status to confirm what completed before cancel or retry.

**Privacy and cost:** Local MT stays on-device. Gemini, Google, and remote Ollama send PDF text externally. App estimates do not block provider billing; configure real quota, budget alerts, and key restrictions in the provider console.

[![Choosing a PDF range and translation mode in Bilingual Book Maker](site/assets/app-images/en/manual-16-book-maker.webp)](site/assets/app-images/en/manual-16-book-maker.webp)

[![Reviewing transfer scope and cost before a cloud document job](site/assets/app-images/en/manual-20-cloud-job-preflight.webp)](site/assets/app-images/en/manual-20-cloud-job-preflight.webp)

*Choose the source and range first; a cloud provider adds a separate transfer and call-limit review.*

### 17.2 Reuse export history

**Path:** Bilingual Book Maker → Export history

Use `Open file`, `Save again`, `Open in reader`, or `Open folder` for completed bilingual PDFs.

**Success:** The history shows title, range, page and segment counts, and the selected action reports success.

**If it fails:** A moved or deleted file can leave a record that no longer opens. Recreate it from the source PDF or try saving an available result again.

**Privacy and cost:** Exported files are not included in `.lembackup`. Store them separately; restored history may have an empty file path.

[![Bilingual document export history](site/assets/app-images/en/manual-17-export-history.webp)](site/assets/app-images/en/manual-17-export-history.webp)

*Review the completed range and size, then reopen or save the result again.*

## 18. Translation and TTS

### 18.1 Choose a translation engine

**Path:** Settings → AI & Voice → Translation & API

| Engine | Data location | Key | Best fit |
|---|---|---|---|
| Local MT | This PC | None | PDF translation; first preparation may download a model |
| Ollama LLM | This PC only on loopback | None | Local LLM translation and card generation |
| Gemini | Google | Gemini key | Fast cloud translation and generation |
| Google Translation | Google Cloud Translation | Separate Google key | Document translation |
| Built-in browser | Current Web Reader environment | None | Supported webpage/language pairs |

**Success:** Connection success or a supported browser-translation state appears.

**If it fails:** Gemini and Google Translation use separate key fields. Initial Local MT preparation can take time. Switch engines when the browser does not support the language pair.

**Privacy and cost:** Cloud engines send translation text externally. Keys must use supported authentication rather than URL query parameters and remain redacted from logs and screens.

### 18.2 Choose card voice (TTS)

**Path:** Settings → AI & Voice → Card voice

TTS reads text aloud. Choose Windows system or browser voice and set voice name and speed from -10 to 10. Piper is still being prepared and cannot be selected.

**Success:** Card playback uses the chosen voice and speed.

**If it fails:** Check that a voice for the learning language is installed in Windows and that the output device is correct. Browser voice is immediate playback and cannot be pre-generated on save.

**Privacy and cost:** Actual Windows/browser processing depends on that environment. Tutorial sample audio is generated at playback with device TTS rather than shipped as a recording.

[![Separating translation engines and API keys](site/assets/app-images/en/manual-18a-translation-settings.webp)](site/assets/app-images/en/manual-18a-translation-settings.webp)

[![Choosing a TTS engine, voice, and speed](site/assets/app-images/en/manual-18b-tts-settings.webp)](site/assets/app-images/en/manual-18b-tts-settings.webp)

*Gemini card generation and Google translation use separate credentials, while playback has its own TTS settings.*

## 19. Card sync folder

**Path:** Settings → Sync & Data → Card sync / Manage → Cards → Sync folder panel

**Why:** To reconcile card JSON with another device or a folder used for backup.

1. Select a dedicated Language Miner folder.
2. Choose the intended action in Cards. `Upload` writes the current local card snapshot to the folder, `Download` imports and merges folder cards into local data, and `Sync` merges both sides against the last sync snapshot.
3. Optionally enable sync on app start and full quit.
4. After the job, read the uploaded, downloaded, and conflict-copy counts in the result message. If the same card changed on both sides, Language Miner preserves the folder version as a separate `Conflict` card; compare the two cards in the library and keep the version you want.

**Success:** Connected state, last file modification, and a result message with uploaded, downloaded, and conflict-copy counts appear.

**If it fails:** Clearing the folder disables automatic sync. The X button may hide the app to the tray; quit from the tray for `Sync on quit`.

**Privacy and cost:** OneDrive, Dropbox, Google Drive, or iCloud may upload card JSON. Check encryption and sharing before storing personal conversation cards. This is not a full backup and does not sync keys, cookies, or game data.

[![Card sync folder and direction controls](site/assets/app-images/en/manual-19-card-sync.webp)](site/assets/app-images/en/manual-19-card-sync.webp)

*Distinguish upload, download, and two-way sync, and read the external-folder upload warning.*

## 20. AI connections

A new installation starts at `AI disconnected`. Card storage, review, and basic navigation need no shared API key.

[![Card generation settings with AI disconnected, Ollama, Gemini, and ChatGPT Web](site/assets/app-images/en/22-ai-options.webp)](site/assets/app-images/en/22-ai-options.webp)

*Figure 18. Connect only the generation route you need.*

### 20.1 AI disconnected

**Path:** Settings → AI & Voice → Card generation → AI disconnected

**Why:** To explore example structures without an external call or charge.

**Success:** Settings summary says AI disconnected and example card structure is available without a real LLM call.

**If it fails:** Select Ollama, Gemini, or manual ChatGPT Web when real contextual analysis is required.

**Privacy and cost:** No external LLM call or API charge.

### 20.2 Local Ollama

**Path:** Settings → AI & Voice → Card generation → Ollama

**Why:** To run a supported model on your PC instead of sending sentences to a cloud API.

1. Install Ollama separately.
2. Confirm a loopback URL such as `http://127.0.0.1:11434` or `http://localhost:11434`.
3. Choose the exact installed model name. A 12B-class model may require substantial memory and time.
4. Choose `Start and connect Ollama`; the app checks the process, server, and model separately.

**Success:** The app reports that the Ollama model is available.

**If it fails:** Distinguish the state:

- executable not found: install Ollama;
- automatic launch failed: start the Ollama app yourself;
- server unreachable: check URL and port;
- server connected but model missing: select the exact name from `ollama list` or download it;
- slow or out of memory: use a smaller model and close other heavy programs.

**Privacy and cost:** Only loopback is local. A `192.168.x.x`, work server, or internet URL is remote and must show a transfer warning. Local use has no API fee but can require a large download, electricity, CPU, and GPU time.

[![Ollama readiness explaining a stopped process or missing model](site/assets/app-images/en/23-ollama-not-ready.webp)](site/assets/app-images/en/23-ollama-not-ready.webp)

*Figure 19. Split “not connected” into program, server, and model problems.*

### 20.3 Gemini card generation

**Path:** Settings → AI & Voice → Card generation → Gemini → Gemini API key

Gemini uses BYOK. First-connect consent asks whether to enable the provider. A **separate job preflight** appears before an actual card or translation operation.

1. Create your own Google project and key.
2. Restrict the key to the required API and add an application restriction where possible.
3. Configure provider quota and budget alerts.
4. Enter the key and read transfer, key-storage, and cost boundaries in first-connect consent.
5. Before each real job, review provider/model, payload, estimated and maximum calls, cost range, this app’s monthly estimate, and cancellation.

**Success:** The model connection succeeds, and a request starts only after job approval.

**If it fails:** Check API restrictions, enabled API, model name, quota, billing project, and 429/5xx status. Never paste the key into chat, an issue, or a screenshot.

**Privacy and cost:** With OS encryption, Electron `safeStorage` stores the key encrypted. Without it, the key is not saved as plaintext and remains for the current session only. Selecting a free tier does not guarantee zero cost. The app guard cannot block Google billing.

[![Gemini first-connect consent for transfer, key storage, and cost](site/assets/app-images/en/24-cloud-connection-consent.webp)](site/assets/app-images/en/24-cloud-connection-consent.webp)

*Figure 20. This is first-connect consent. A separate operation preflight appears before real work.*

[![Reviewing provider, transfer scope, and cost before a cloud job](site/assets/app-images/en/manual-20-cloud-job-preflight.webp)](site/assets/app-images/en/manual-20-cloud-job-preflight.webp)

*The provider, model, data scope, call ceiling, and cost range are shown without exposing an API key.*

### 20.4 Google Cloud Translation

**Path:** Settings → AI & Voice → Translation & API → Google Translation

The Google Translation key is separate from the Gemini key. This option sends document/PDF text to Cloud Translation API.

**Success:** Connection succeeds and the document preflight identifies Google Cloud Translation and the transfer scope.

**If it fails:** Confirm that Cloud Translation API is enabled, the key allows that API, and provider quota and billing are configured.

**Privacy and cost:** Full-page and book translation can be large. Configure Google-side quota, budget alerts, and key restrictions in addition to the app guard.

### 20.5 Manual ChatGPT Web

**Path:** Settings → AI & Voice → Card generation → ChatGPT Web

**Why:** To use a ChatGPT web subscription manually without a separate API key.

1. Read the final prompt and included sentence in the app.
2. Remove personal information, then choose `Review transfer and copy`.
3. Open ChatGPT in the default browser and paste it yourself.
4. Paste the complete ChatGPT response back into the app.
5. Choose `Validate and use` so the request id and format are checked before preview.

**Success:** A validated response opens in the normal card preview.

**If it fails:** Paste the full response. For a JSON request, do not omit part of the code block. This mode cannot power extension or background auto-generation.

**Privacy and cost:** The app never accesses your ChatGPT account, cookies, or conversation page. Copying places text on the clipboard; pasting into ChatGPT sends it to OpenAI. The app does not call the OpenAI API and create a separate API usage charge, but the price and message limits of your chosen ChatGPT plan and OpenAI data policy still apply.

[![Manual ChatGPT Web bridge dialog](site/assets/app-images/en/manual-21-manual-chatgpt.webp)](site/assets/app-images/en/manual-21-manual-chatgpt.webp)

*Review and copy the prompt yourself, then paste the complete ChatGPT response back for local validation.*

## 21. Full backup and restore

### 21.1 Create a `.lembackup`

**Path:** Settings → Sync & Data → Full backup & restore → Create backup file

A backup can include cards, vocabulary, reviews, highlights, profiles, Life Mining, listening transcripts, character presets and conversations, routines and missions, and PlayZone saves and local rewards.

It excludes:

- API keys, OAuth tokens, and login cookies;
- the last Web Reader session/navigation state and this device’s cloud-consent record;
- local paths, source PDF/audio/video, and exported result files;
- downloaded PlayZone game packs themselves (game saves and local reward records can be included);
- OCR captures, logs, caches, and local models;
- TTS and translation caches.

**Success:** A `.lembackup` saves and the app reports its filename.

**If it fails:** Check free space and write permission. The current maximum size for one backup file that the app can open is 64 MiB. The source learning data must remain unchanged after export failure.

**Privacy and cost:** Keys are excluded, but cards, conversations, and reviews can be plaintext inside the backup. Keep it in encrypted private storage and do not share it.

[![Full backup showing included and excluded data and Create backup file](site/assets/app-images/en/25-backup-create.webp)](site/assets/app-images/en/25-backup-create.webp)

*Figure 21. Package learning records while excluding secrets and source files.*

### 21.2 Preview three restore modes

**Path:** Same panel → Open backup file

The app checks format, size, checksum, version, corruption, and profile conflicts. The preview session expires after 30 minutes; reopen the file if you wait longer before restoring.

| Mode | Current data | Backup data | Use it when |
|---|---|---|---|
| Restore as new profiles | Preserved | Added under new IDs | You want the safest inspection first |
| Merge non-conflicting data | Current values win | Missing items added | Combining records from two devices |
| Replace current data | Replaced after automatic safety backup | Becomes the active state | Returning the device to the backup point |

**Success:** You review added, overwritten, and skipped estimates; restore completes and the app reloads the new state.

**If it fails:** Reopen an expired preview. On restore failure, verify that all changes rolled back and the safety backup remains before retrying.

**Privacy and cost:** New-profile and merge modes may skip device-global diamonds and daily missions. Cloud consent and API keys must be configured again after restore.

[![Restore preview comparing new-profile, merge, and replacement](site/assets/app-images/en/26-restore-preview.webp)](site/assets/app-images/en/26-restore-preview.webp)

*Figure 22. Compare conflicts and predicted results before modifying data.*

## 22. Privacy deletion and uninstall

**Path:** Settings → Advanced → Privacy & local data deletion

Choose only the scope you need:

- saved Gemini and Google API keys;
- Web Reader cookies and site storage;
- rebuildable Electron caches;
- learning data such as cards, reviews, Life Mining, listening, translation models, character conversations, installed PlayZone games and saves;
- every Language Miner-managed item on this device.

A destructive action requires typing the exact confirmation phrase.

**Success:** The app verifies remaining keys, cookies, database rows, files, renderer storage, and extension queue, then reports completed deletion and residual verification.

**If it fails:** If the extension is off, app data may be removed while queue verification is still pending. Clear the queue from Chrome extension options, keep this screen open, and retry. Raw values and paths must not appear in the result.

**Privacy and cost:** Full deletion does not delete `.lembackup` files you saved elsewhere. Move any wanted backup to safe storage, complete deletion, fully quit and restart, and only then uninstall from Windows.

[![Privacy deletion separating keys, login data, cache, learning data, and all data](site/assets/app-images/en/27-privacy-delete.webp)](site/assets/app-images/en/27-privacy-delete.webp)

*Figure 23. Category deletion and full-device deletion are different operations.*

## 23. Manual browser extension installation and queue deletion

`v0.1.0-beta.1` provides an optional manual-installation archive instead of a Chrome Web Store listing.

### 23.1 Exact installation sequence

1. Download `Language-Miner-Extension-<version>.zip` and `SHA256SUMS.txt` from the same official Release as the app.
2. Verify the ZIP’s SHA-256 against the line for the **same filename**.
3. Extract the ZIP into an empty folder.
4. Open `chrome://extensions`.
5. Enable `Developer mode` and choose `Load unpacked`.
6. Select the folder where **`manifest.json` is directly visible**—not the ZIP and not its parent.
7. Check official-extension pairing and allowed sites in Settings → Capture.

**Success:** Chrome shows Language Miner Web Capture and the app shows the paired origin.

**If it fails:** Select one folder deeper if Chrome cannot find a manifest. Captures made while the app is closed wait in the queue and send after reconnection.

**Privacy and cost:** Sentence selection on ordinary sites can require broad site access. Dragging alone sends nothing. Choosing the card action sends the selected expression, source sentence, page title, URL, and nearby context to the local app. Skip the extension if you do not want this permission; the rest of the desktop app still works.

### 23.2 Inspect and clear the offline queue

**Path:** Chrome → Manage extensions → Language Miner Web Capture → Details → Extension options

Pending items expire after seven days. Each queue is limited to 200 items and 2 MiB, each item to 128 KiB, and all queues together to 5 MiB.

1. Choose `Refresh` to read count and size.
2. Choose `Delete all pending items`.
3. Confirm deletion.
4. When the app is running, wait for its acknowledgement.

**Success:** Pending count becomes zero and the app confirms deletion.

**If it fails:** Open the app to restore pairing when only acknowledgement is pending. The delete button is not on the app capture-settings screenshot.

**Privacy and cost:** Unsent captures can temporarily remain in Chrome local storage. Clear them before removing the extension on a shared PC.

[![Offline items waiting in the extension](site/assets/app-images/en/29-extension-queue-clear.webp)](site/assets/app-images/en/29-extension-queue-clear.webp)

[![Confirmation before clearing the extension queue](site/assets/app-images/en/30-extension-queue-clear-confirm.webp)](site/assets/app-images/en/30-extension-queue-clear-confirm.webp)

[![Extension queue cleared to zero](site/assets/app-images/en/31-extension-queue-cleared.webp)](site/assets/app-images/en/31-extension-queue-cleared.webp)

*Review the count and size, confirm deletion, and verify that the queue reaches zero.*

## 24. Common problems

| Symptom | Check first | Next action | Never include in a report |
|---|---|---|---|
| Black screen for about two seconds at startup | Whether local DB and UI are still loading | Report version, PC specs, and duration if it persists or grows | Full user-folder path |
| First-launch dialog appears every time | Whether installer and portable builds are alternated; whether full quit changes it | Report onboarding completion not being saved | Personal profile name |
| Clicking a setting reloads the whole screen | Distinguish auto-save from an actual window reload | Provide the exact setting and a short recording | A visible API key |
| Ollama connection fails | Program, server URL, and model availability separately | Start/connect, manual start, then exact model selection | Remote-server credentials |
| Gemini/Google 401 or 403 | Key type, enabled API, restrictions | Check provider project and restrictions | Raw key |
| 429, timeout, or 5xx | Quota, concurrent work, provider status | Cancel, wait, and retry a smaller range | Sensitive card text |
| Estimate differs from billing | App value is a local estimate | Treat provider usage and billing as source of truth | Billing-account details |
| Document/media will not open after restore | Original files and paths are excluded | Select the file again and reconnect bookmark | Screenshot of full local path |
| Game download waits forever | GitHub access, disk space, progress | Cancel, redownload, inspect security report | User-data folder |
| UGC will not run | `blocked`, `warning`, `quarantined`, and issue code | Ask creator for a corrected version | Personal files inside pack |
| Extension candidates do not arrive | App process, pairing, site permission, queue | Refresh options and re-pair | Full conversation content |
| SmartScreen warning | Official Release and SHA-256 | Do not run if either cannot be verified | Instructions for bypassing verification |

Use the public issue template for ordinary bugs, but first inspect logs and screenshots for names, email, API keys, full paths, and conversation text. Do not report a key leak, privacy exposure, or vulnerability in a public issue; use the [private security process](../SECURITY.md).

## 25. A practical first week

1. Create only three to five reading cards per day from real sentences.
2. Hear ten to thirty short Listening Loop sentences and save only the genuinely difficult sound segments.
3. Add one to three things you actually wanted to say in Life Mining.
4. Finish due reviews before creating many new cards.
5. Reuse one sentence from that day in Writing Practice and Character Chat.
6. Create a `.lembackup` once a week and keep it in encrypted private storage.

Language Miner is most useful when one sentence such as `I’m running a little late.` is **read → heard → retrieved → produced**, not when card count grows as quickly as possible.
