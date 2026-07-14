# Manifest Schema

이 문서는 Language Miner `v0.1.0-beta.1`에서 실행 가능한 `.lem/.lemgame`의 `manifest.json` 규격입니다. manifest를 제외한 실제 런타임 파일과 해시가 일치하고, validator 결과에 경고나 오류가 없어야 `ready`가 됩니다.

## 예시

```json
{
  "schemaVersion": 1,
  "contentType": "game_pack",
  "id": "creator.example-game",
  "lineageId": "1ecaf85e-e1b4-4ae5-8dea-bb547d8ed251",
  "version": "1.0.0",
  "minPlayZoneVersion": "0.1.0-beta.1",
  "title": "Example Game",
  "description": "짧은 런을 반복하며 성장하는 액션 게임",
  "releaseNotes": "첫 배포.",
  "creator": { "name": "Example Creator" },
  "license": "MIT",
  "sourceUrl": "https://github.com/example/example-game/releases/tag/v1.0.0",
  "tags": ["action", "roguelite"],
  "thumbnail": "assets/thumbnail.png",
  "entry": {
    "type": "html",
    "path": "game/index.html"
  },
  "permissions": {
    "walletSpend": true,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "save": { "schemaVersion": 1 },
  "economy": {
    "diamondActions": [
      {
        "id": "revive-once",
        "amount": 30,
        "reason": "1회 부활",
        "repeatable": true
      }
    ]
  },
  "integrity": {
    "files": {
      "README.md": "0000000000000000000000000000000000000000000000000000000000000000",
      "security-report.md": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/index.html": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/main.js": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/styles.css": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/host-adapter.js": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/mock-host.js": "0000000000000000000000000000000000000000000000000000000000000000",
      "assets/thumbnail.png": "0000000000000000000000000000000000000000000000000000000000000000",
      "assets/icon.png": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

`integrity.files`의 0 값은 설명용 자리표시자입니다. 실제 pack을 만들 때 manifest를 제외한 모든 런타임 파일의 SHA-256으로 교체합니다. 예시 `lineageId`도 새 작품을 시작할 때 새 UUID로 바꾸고 이후 업데이트에서는 유지합니다.

## 필수 의미

| 필드 | 설명 |
| --- | --- |
| `schemaVersion` | 현재 `1` |
| `contentType` | `game_pack` |
| `id` | 2–128자의 안정적인 소문자 pack ID |
| `lineageId` | 최초 제작 때 만든 UUID; 업데이트마다 유지 |
| `version` | 새 배포 파일마다 올리는 SemVer |
| `minPlayZoneVersion` | 필요한 최소 앱 버전 |
| `title`, `creator.name` | 사용자에게 표시할 제목·제작자 |
| `license`, `sourceUrl` | 단일 SPDX 식별자 또는 괄호 없는 `AND`/`OR`/`WITH` 표현식과 HTTPS 원본 |
| `entry` | `html` 진입점과 안전한 상대 `.html` 경로 |
| `permissions` | 아래 다섯 권한을 모두 명시 |
| `integrity.files` | manifest를 제외한 모든 실제 파일과 SHA-256 |

`tags`와 top-level `thumbnail`은 선택이지만 공개 팩에는 권장합니다. 썸네일은 PNG/JPEG/WebP/GIF/AVIF 같은 로컬 래스터 파일만 사용합니다. `metadata.thumbnail`은 이전 팩 호환용이며 새 팩에는 쓰지 않습니다.

`integrity.files`에는 manifest 자체를 제외한 모든 런타임 파일을 빠짐없이 한 번씩 적고 실제로 없는 파일을 추가하지 않습니다. 경로는 `/` 구분자의 canonical 상대 경로이며, 대소문자를 무시해도 서로 달라야 합니다. root manifest가 없으면 `quarantined`, 그 밖의 오류가 있으면 `blocked`, 경고만 있어도 `warning`이므로 경고와 오류가 모두 없어야 `ready`가 됩니다.

## 권한

정확한 키는 다음 다섯 개입니다.

```json
{
  "walletSpend": false,
  "storage": true,
  "network": false,
  "externalLinks": false,
  "cardRead": false
}
```

이번 베타에서 `network`, `externalLinks`, `cardRead`는 반드시 `false`입니다. `filesystem`, `clipboard`, `cardsRead`, `cardsCreate`, `diamondSpend`, `localSave` 같은 옛 키나 알 수 없는 키를 넣으면 차단됩니다.

## 다이아 동작

action은 최대 64개입니다. 각 action은 1–80자의 영문·숫자·점·밑줄·하이픈 고유 `id`, 1–1,000,000 정수 `amount`, 1–160자의 사용자용 `reason`을 가집니다. Host는 확인을 항상 강제하므로 `requiresConfirm` 같은 manifest 필드로 확인창을 끌 수 없습니다.

런타임 호출:

```js
await window.LEM_GAME_HOST_API.wallet.spend({
  id: "revive-once",
  idempotencyKey: `revive-once:${save.runId}`
});
```

금액과 사유는 요청하지 않습니다. Host가 검증된 manifest에서 다시 읽습니다. `repeatable: true`이면 같은 구매 의도에 같은 `idempotencyKey`를 사용합니다. 반복 불가 action은 Host가 pack과 action별 한 번만 차감합니다.

## 오래된 초안 필드

- `author` 대신 `creator.name`
- 문자열 `entry` 대신 `{ "type": "html", "path": "game/index.html" }`
- `coverImage` 대신 `thumbnail`
- `permissions.diamondSpend` 대신 `permissions.walletSpend`
- top-level `diamondActions` 대신 `economy.diamondActions`
- 이전 `LanguageMiner` 전역 저장 API 대신 `window.LEM_GAME_HOST_API.save.write`
