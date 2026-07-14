# Release Checklist Before Making A LEM File

Use this checklist before handing a `.lem/.lemgame` file to the user or posting it to Discord.

## Manifest

- `contentType` is `game_pack`.
- `lineageId` exists and is unchanged from the previous version.
- `version` is bumped if this is a new distributable file.
- `minPlayZoneVersion` is set when the pack depends on a newer host behavior.
- `releaseNotes` says what changed in user-facing language.
- `save.schemaVersion` changes only when the save data shape changes.
- top-level `thumbnail` points to a 16:9 local raster image inside the pack.
- `permissions.walletSpend` and `economy.diamondActions` match the runtime spend calls.

## Runtime QA

- Run `game/index.html` locally with the mock host.
- Add the `.lem` to PlayZone and launch it from the app.
- Save progress, close the game window, launch again, and confirm progress persisted.
- Use every diamond button once and confirm balance/status updates.
- Confirm the game does not store diamond balance inside save data.
- Confirm icons, sprites, thumbnail, and audio do not flicker or reload on ordinary UI updates.
- Confirm the thumbnail is not badly cropped in hero, card, and detail views.

## Update QA

- Install the previous `.lem`, make a save, then connect the new `.lem` through `업데이트 파일 선택`.
- Confirm PlayZone makes a save backup before connecting the update.
- Confirm the save still loads after update when `save.schemaVersion` did not change.
- If `save.schemaVersion` changed, provide a migration note or migration code.
- Confirm the previous source path is hidden as superseded and the new file is selected.
