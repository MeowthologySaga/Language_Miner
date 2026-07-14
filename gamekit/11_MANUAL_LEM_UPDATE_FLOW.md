# Manual LEM Update Flow

Language Miner PlayZone may start without a central registry. Creators can share `.lem` files through Discord, and users can download those files manually.

Because there is no central registry, do not use `manifest.id` alone to decide whether two packs are the same game. Different creators can accidentally choose the same id.

## Required Manifest Fields

Recommended fields for Game Packs:

```json
{
  "id": "creator.short-game-id",
  "lineageId": "1ecaf85e-e1b4-4ae5-8dea-bb547d8ed251",
  "version": "1.2.0",
  "minPlayZoneVersion": "0.1.0-beta.1",
  "releaseNotes": "신규 스테이지와 저장 안정화.",
  "save": {
    "schemaVersion": 1
  }
}
```

- `id`: short human-readable pack id. It can collide in a decentralized Discord workflow.
- `lineageId`: stable UUID generated when the game is first created. Replace the example UUID for a new work, then keep it unchanged for every update.
- `version`: valid SemVer used for update warnings and display.
- `minPlayZoneVersion`: minimum PlayZone app version required by the pack.
- `releaseNotes`: short user-facing change summary for the downloaded file.
- `save.schemaVersion`: save data shape version. Increase only when the save structure changes.

## App UX Rule

Users should update a game manually:

1. Select the existing game card in PlayZone.
2. Click `Update file` / `업데이트 파일 선택`.
3. Choose the newly downloaded `.lem` file.
4. Confirm any warning if lineage/version/app version/save schema cannot prove it is safe.

The app should create a save backup first, keep the existing save slot, and replace only the executable pack metadata/assets/entry path.

## Update Decision Rules

- Same `lineageId` and higher `version`: safe update candidate.
- Missing `lineageId`: do not auto-update; ask the user to confirm the selected game should use this file.
- Same `id` but different `lineageId`: warn that it may be a different game.
- Lower or equal `version`: warn about reinstall/downgrade.
- Higher `minPlayZoneVersion`: warn that the app may need to be updated first.
- Changed `save.schemaVersion`: warn that old saves may need migration, then back up the current save before connecting the file.

## Version Bump Rule

- If the agent creates a new `.lem/.lemgame` file for the user to distribute, bump `manifest.version`.
- If only internal notes or docs changed and no distributable file is produced, version does not need to change.
- patch: save-compatible bug fix, typo, icon, small balance, save timing.
- minor: save-compatible new content, stage, character, feature.
- major: save migration or incompatible save structure change.
- Never change `lineageId` for an update.
