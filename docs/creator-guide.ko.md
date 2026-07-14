# Language Miner UGC 제작자 가이드

[English](creator-guide.en.md) · [UGC 정책](ugc-policy.ko.md) · [Game Pack 런타임 계약](ugc/playzone-current-runtime-contract.md)

이 문서는 준비 중인 `v0.1.0-beta.1`용 공개 계약입니다. 실제 팩은 대상 앱 버전의 템플릿과 validator 결과를 기준으로 배포하세요.

## 1. 먼저 선택할 것

### 캐릭터팩

캐릭터 설정, 대화 예시와 안전한 래스터 이미지 참조로 이루어진 **데이터 전용 단일 JSON** 콘텐츠입니다. HTML·JavaScript·원격 스크립트를 넣지 않습니다.

### Game Pack

PlayZone에서 실행되는 HTML/CSS/JavaScript 콘텐츠입니다. 별도 창과 CSP 안에서 실행되며, 앱 기능은 선언된 Host API로만 요청합니다.

두 형식 모두 제작자, 출처, SPDX 라이선스, 안정적인 id, 업데이트 계보와 무결성 해시가 필요합니다. 다만 캐릭터팩과 Game Pack은 같은 manifest 스키마를 공유하지 않습니다.

## 2. 공통 식별 정보와 형식별 계약

| 항목 | 캐릭터팩 | Game Pack |
| --- | --- | --- |
| 형식 버전 | `formatVersion: 1`, `schemaVersion: 1` | `schemaVersion: 1` |
| `contentType` | `language_miner_character_pack` | `game_pack` |
| 식별·업데이트 | `id`, `lineageId`, `version`, `minAppVersion` | `id`, `lineageId`, `version`, `minPlayZoneVersion` |
| `creator` | 문자열 | 문자열 또는 `{ "name": "..." }` |
| 진입점·해시 | 고정 `entry.path: "payload"`와 `entry.sha256` | 로컬 HTML `entry`와 런타임 파일별 `integrity.files` |
| 권한 | `requestedPermissions` 배열. 첫 베타는 `remote_images`만 지원 | `permissions` 객체의 모든 항목을 `true` 또는 `false`로 명시 |
| 공통 배포 정보 | `sourceUrl`, `license`, `releaseNotes` | `sourceUrl`, `license`, `releaseNotes` |

`id`는 소문자 영숫자로 시작하고 점·밑줄·하이픈을 사용하는 안정적인 식별자입니다. `version`은 SemVer를 사용하고, `sourceUrl`은 원본을 확인할 수 있는 HTTPS URL, `license`는 SPDX 식별자나 표현식을 사용합니다. 현재 Game Pack validator는 단일 SPDX 식별자 또는 괄호 없는 `AND`/`OR`/`WITH` 표현식만 허용합니다.

`id`는 작품 이름을 바꿔도 유지합니다. 완전히 다른 작품으로 갈라질 때만 새 `lineageId`를 만드세요. 기존 팩의 정상 업데이트라면 `id`와 `lineageId`를 모두 유지하고 `version`을 올립니다.

## 3. 배포 구조

### 캐릭터팩

```text
my-character.json
```

현재 캐릭터팩은 ZIP이나 폴더가 아닌 하나의 JSON 봉투입니다. 앱의 **Language Miner 팩으로 내보내기**를 사용하면 `payload`를 캐릭터 데이터로 작성하고, 정규화한 payload의 SHA-256을 `entry.sha256`에 기록합니다. 전체 JSON은 2 MiB를 넘을 수 없습니다.

자체 포함 이미지는 PNG/JPEG/WebP/GIF `data:` URL을 사용할 수 있습니다. HTTPS 원격 래스터 이미지를 쓰려면 `requestedPermissions`에 `remote_images`를 선언해야 하며, 실행 중 사용자 확인 전에는 로드되지 않습니다. SVG, HTTP, 로컬 파일 경로와 실행 가능 필드는 차단됩니다.

### Game Pack

```text
my-game/
  manifest.json
  README.md
  game/
    index.html
    main.js
    styles.css
    assets/
      thumbnail.png
```

개발용 `src`, `node_modules`, 로그, source map, 로컬 설정과 비밀 파일을 최종 팩에 넣지 마세요. manifest가 팩 루트에 오도록 압축하며, 루트 위에 불필요한 상위 폴더를 하나 더 만들지 않습니다.

## 4. Game Pack manifest 예시

다음 SHA-256 값은 자리표시자입니다. 실제 배포 파일의 64자리 해시로 모두 교체해야 합니다.

```json
{
  "schemaVersion": 1,
  "contentType": "game_pack",
  "id": "creator.sentence-garden",
  "lineageId": "38c556b0-ff77-4b4e-92bf-6d1b5f9205af",
  "version": "0.1.0",
  "minPlayZoneVersion": "0.1.0-beta.1",
  "title": "Sentence Garden",
  "description": "Grow a garden by recalling useful sentences.",
  "releaseNotes": "First public version.",
  "creator": {
    "name": "Example Creator"
  },
  "license": "MIT",
  "sourceUrl": "https://github.com/example/sentence-garden/releases/tag/v0.1.0",
  "thumbnail": "game/assets/thumbnail.png",
  "entry": {
    "type": "html",
    "path": "game/index.html"
  },
  "permissions": {
    "walletSpend": false,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "save": {
    "schemaVersion": 1
  },
  "integrity": {
    "files": {
      "README.md": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/index.html": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/main.js": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/styles.css": "0000000000000000000000000000000000000000000000000000000000000000",
      "game/assets/thumbnail.png": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

첫 베타에서 `network`, `externalLinks`, `cardRead`는 지원하지 않으며 `true`이면 차단됩니다. 필요하지 않은 권한은 반드시 `false`로 두세요.

새 팩은 `entry.type`에 `html`을 쓰고, `entry.path`에는 팩 안의 canonical 상대 `.html` 경로를 씁니다. 문자열 entry와 원격 URL은 사용할 수 없습니다. 모든 필수 정보와 다섯 권한을 명시하고, 무결성 검사가 완전해야 경고 없이 `ready`가 됩니다. root manifest가 없으면 `quarantined`, 그 밖의 오류는 `blocked`, 경고는 `warning`이며 `ready` 또는 Host가 지정한 `trusted_official`만 실행됩니다.

## 5. 파일과 압축 제한

Game Pack validator의 첫 베타 상한:

- 압축 파일: 256 MiB;
- 해제 후 전체: 512 MiB;
- 단일 파일: 128 MiB;
- 파일 수: 4,096개;
- 최대 압축률: 200:1;
- manifest: 256 KiB;
- ZIP64: 지원하지 않음.

일반 ZIP의 stored 또는 deflate 방식만 사용하세요. 심볼릭 링크, 절대 경로, `..`, Windows 드라이브·UNC 경로, 암호화·지원하지 않는 압축 방식과 손상된 CRC는 차단됩니다.

용량 상한보다 작다고 좋은 팩인 것은 아닙니다. 다운로드와 시작 시간을 위해 실제로 필요한 파일만 넣으세요.

## 6. 파일 해시 만들기

PowerShell에서 각 런타임 파일의 SHA-256을 확인할 수 있습니다.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\game\index.html"
```

`integrity.files`에는 `/` 구분자를 쓴 canonical 팩 내부 상대 경로와 64자리 16진수 해시를 기록합니다. manifest 자체는 목록에 넣지 않지만 그 밖의 모든 런타임 파일은 빠짐없이 한 번씩 넣고, 실제로 없는 파일은 넣지 않습니다. 경로는 대소문자를 무시해도 중복되지 않아야 합니다. 파일을 한 글자라도 바꾸면 해시를 다시 계산하고 SemVer를 올리세요.

## 7. Game Pack 실행 규칙

- 진입 파일은 로컬 `.html`만 가능합니다.
- 모든 문서 응답에는 Host가 CSP를 적용합니다.
- Electron, Node, 앱 DB, 임의 파일 시스템에 접근하지 않습니다.
- `fetch`, WebSocket, 원격 스크립트·폰트·이미지에 의존하지 않습니다.
- 다이아 잔액을 게임 저장에 진실값으로 보관하지 않습니다.
- 저장은 `window.LEM_GAME_HOST_API.save`만 사용합니다.

현재 Host API 개요:

```ts
window.LEM_GAME_HOST_API.wallet.getBalance()
window.LEM_GAME_HOST_API.wallet.spend({ id, idempotencyKey })
window.LEM_GAME_HOST_API.save.load(fallback)
window.LEM_GAME_HOST_API.save.write(value)
window.LEM_GAME_HOST_API.save.clear()
```

Host 요청은 Promise reject 대신 `{ ok: false, code, message }` 실패 객체로 끝날 수 있습니다. 잔액 조회뿐 아니라 저장·불러오기·삭제·confirm 결과도 검사하고 게임 화면에 재시도 가능한 오류를 표시하세요. `ui.toast()`는 현재 베타에서 Host 화면 표시를 보장하지 않으므로 중요한 안내를 맡기지 않습니다. `appVersion`은 `language-miner-host`라는 고정 식별 문자열이므로 기능 감지에 쓰지 말고 manifest의 `minPlayZoneVersion`을 사용하세요.

정확한 타입과 응답은 [현재 런타임 계약](ugc/playzone-current-runtime-contract.md)을 사용하세요. 이전 초안의 `LanguageMiner.saveGame`, `loadGame`, `spendDiamonds`는 사용하지 않습니다.

저장 상한은 팩당 5 MiB, 전체 256 MiB입니다. JSON으로 직렬화할 수 있는 최소 상태만 저장하세요.

## 8. 다이아 동작

`walletSpend`가 필요하면 모든 동작을 manifest에 고정합니다.

```json
{
  "permissions": {
    "walletSpend": true,
    "storage": true,
    "network": false,
    "externalLinks": false,
    "cardRead": false
  },
  "economy": {
    "diamondActions": [
      {
        "id": "hint-small",
        "amount": 5,
        "reason": "Reveal one sentence hint",
        "repeatable": true
      }
    ]
  }
}
```

manifest에는 최대 64개 action을 둘 수 있습니다. `id`는 1–80자의 영문·숫자·점·밑줄·하이픈, `amount`는 1–1,000,000 정수, `reason`은 1–160자여야 합니다.

런타임은 `id`와 구매 의도를 식별하는 `idempotencyKey`만 요청합니다. `repeatable: true`이면 같은 구매 의도에 같은 키를 재사용해 더블클릭·재시도로 인한 중복 차감을 막습니다. 반복 불가 action은 Host가 pack과 action별로 한 번만 차감합니다. Host가 금액과 사유를 manifest에서 다시 읽고 항상 사용자에게 확인하며, 실패 시 자체 잔액을 임의로 바꾸지 않습니다.

## 9. 캐릭터팩 안전 규칙

- 프롬프트 안에 사용자 카드 전체, 시스템 메시지, 키나 파일을 요구하는 지시를 넣지 않습니다.
- 캐릭터가 필요로 하는 대화 범위와 연령·주제 안내를 README에 적습니다.
- 가능하면 팩에 자체 포함된 래스터 이미지를 사용합니다. 원격 이미지는 `remote_images` 권한과 사용자 확인을 전제로 합니다.
- 이미지 metadata에 위치, 실명, 계정 정보가 남지 않았는지 확인합니다.
- 기존 작품의 캐릭터, 실존 인물, 상표와 음성을 사용할 권리를 확인합니다.
- 대화 예시에 실제 개인 대화나 연락처를 넣지 않습니다.

## 10. 라이선스와 자산 기록

README와 manifest에 최소한 다음을 적습니다.

- 제작자 표시 이름;
- source URL;
- UGC 코드·데이터 라이선스;
- 이미지·음성·폰트별 제작자, 출처, 생성 방식과 라이선스;
- 필요한 저작자 표시 문구;
- 수정한 제3자 자산의 원본과 변경 내용.

`All rights reserved` 콘텐츠는 사용자가 팩을 다시 배포할 수 없을 수 있습니다. 공유를 원한다면 재배포와 수정 범위가 분명한 라이선스를 선택하세요. SPDX 표현식으로 충분하지 않은 별도 콘텐츠 약관은 `LICENSES/`에 전문을 넣고 manifest에는 가장 가까운 SPDX 식별자와 설명을 적습니다.

## 11. 배포 전 체크리스트

- [ ] 캐릭터팩은 앱에서 내보낸 단일 JSON을, Game Pack은 깨끗한 빌드 폴더의 런타임 파일만 준비했다.
- [ ] `id`와 `lineageId`를 이전 버전과 대조했다.
- [ ] SemVer와 `releaseNotes`를 갱신했다.
- [ ] 캐릭터 payload 해시 또는 Game Pack의 모든 런타임 파일 해시를 다시 계산했다.
- [ ] 키, 토큰, `.env`, 로컬 경로, source map, 로그와 개인정보가 없다.
- [ ] 모든 자산의 재배포 권리와 표시 의무를 기록했다.
- [ ] 최소 권한만 요청한다.
- [ ] 앱에서 가져와 `ready` 상태와 보안 리포트를 확인했다.
- [ ] 새 프로필, 최소 창, 키보드, 저장·복원과 실패 상태를 확인했다.
- [ ] GitHub Release에 pack, source, 체크섬, 라이선스와 변경사항을 함께 올렸다.

validator를 통과하기 위해 위험 동작을 숨기거나 난독화하면 향후 공식 커뮤니티에서 제거되고 해당 해시가 차단될 수 있습니다. validator 자체의 결함은 공개하지 말고 [비공개 보안 신고](../SECURITY.md)로 알려 주세요.
