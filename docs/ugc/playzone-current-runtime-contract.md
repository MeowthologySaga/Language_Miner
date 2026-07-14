# PlayZone Current Runtime Contract

이 문서는 현재 Language Miner 앱에서 실제로 동작하는 PlayZone Game Pack 계약이다.
에이전트가 `.lem` 게임을 만들 때는 오래된 초안 API가 아니라 이 문서를 우선 기준으로 삼는다.

## Current Implementation Status

현재 앱에서 동작하는 것:

- `.lem`, `.lemgame`, `.zip`, 폴더형 Game Pack 추가.
- 사용자가 지정한 라이브러리 폴더와 그 안의 `lem/` 하위 폴더 자동 스캔.
- zip 호환 `.lem` 파일을 안전 캐시에 풀어 실행.
- `manifest.json` 또는 `lem.json` 읽기.
- `entry.path` 기준 iframe 런타임 실행.
- top-level `thumbnail` 기준 런처 썸네일 표시. `metadata.thumbnail`은 이전 팩 호환용으로만 읽는다.
- sandbox iframe 안에 `window.LEM_GAME_HOST_API` 주입.
- Host API를 통한 다이아 조회/차감, 저장/불러오기/삭제와 confirm.
- `ui.toast` 요청은 받아들이지만 현재 베타 Host가 화면에 토스트를 그려 주지는 않는다.
- 게임 창 종료 시 메인 앱 다이아 잔액 새로고침.
- pack별 저장 데이터를 앱 userData의 `play-zone-saves/` 아래에 분리 저장.

현재 베타에서 강제하는 제한:

- Host는 `economy.diamondActions`와 런타임 spend 요청을 대조하고, 선언되지 않은 요청을 거부한다.
- `network`, `externalLinks`, `cardRead`는 아직 지원하지 않는다. 하나라도 `true`이면 팩은 차단된다.
- `cardsRead`, `cardsCreate`, `filesystem`, `clipboard`는 현재 manifest 권한 이름이 아니며 선언하면 차단된다.
- 기술 검사가 끝난 뒤 상태가 `ready` 또는 `trusted_official`인 팩만 실행할 수 있다.

## Pack Layout

권장 최종 구조:

```txt
my-game.lem
  manifest.json
  README.md
  security-report.md
  game/
    index.html
    main.js
    styles.css
    host-adapter.js
    mock-host.js
  assets/
    thumbnail.png
    icon.png
```

개발 중에는 `src/`, `node_modules/`, Vite/Phaser/Three 프로젝트를 써도 되지만 최종 `.lem` 안에는 실행 결과물만 넣는다.

최종 `.lem`에 넣지 않는 것:

- `node_modules/`
- `.git/`
- `.vscode/`
- `coverage/`
- 빌드 전 TypeScript만 있고 실행 JS가 없는 상태
- 실행에 `npm install`이 필요한 상태
- 외부 CDN 없이는 부팅하지 못하는 상태

## Manifest Format

현재 앱이 우선 읽는 manifest 형식:

```json
{
  "schemaVersion": 1,
  "contentType": "game_pack",
  "id": "creator.example-game",
  "lineageId": "1ecaf85e-e1b4-4ae5-8dea-bb547d8ed251",
  "version": "0.1.0",
  "minPlayZoneVersion": "0.1.0-beta.1",
  "title": "Example Game",
  "description": "짧은 설명입니다.",
  "releaseNotes": "첫 배포.",
  "creator": {
    "name": "Creator"
  },
  "license": "MIT",
  "sourceUrl": "https://github.com/example/example-game/releases/tag/v0.1.0",
  "tags": ["idle-rpg", "growth"],
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
        "id": "summon-hero-1",
        "amount": 30,
        "reason": "Example Game 영웅 1회 소환",
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

위 해시 값은 형식만 보여 주는 자리표시자다. 실제 팩에서는 manifest를 제외한 모든 런타임 파일의 SHA-256으로 교체해야 한다. 예시 `lineageId`도 새 작품을 만들 때 새 UUID로 바꾸고, 그 작품의 업데이트에서는 계속 유지한다.

중요:

- `entry`는 문자열이 아니라 `{ "type": "html", "path": "game/index.html" }` 형태를 쓴다. 호환용 `iframe`도 읽지만 새 팩은 `html`을 권장한다.
- 런처 썸네일은 `coverImage`나 `metadata.thumbnail`이 아니라 top-level `thumbnail`을 쓴다. `metadata.thumbnail`은 이전 팩 호환용이다.
- 제작자는 `author` 대신 `creator.name`을 쓴다.
- 다이아 액션은 top-level `diamondActions`가 아니라 `economy.diamondActions`에 둔다.
- 다이아 권한은 `permissions.diamondSpend`가 아니라 현재 앱 기준 `permissions.walletSpend`를 쓴다.

`ready`가 되기 위한 validator 규칙:

- `id`는 2–128자의 소문자 영숫자·점·밑줄·하이픈이고, `lineageId`는 UUID, `version`과 `minPlayZoneVersion`은 SemVer여야 한다.
- `license`는 단일 SPDX 식별자 또는 괄호 없는 `AND`/`OR`/`WITH` 표현식이어야 하고, `sourceUrl`은 HTTPS URL이어야 한다.
- `permissions`에는 `walletSpend`, `storage`, `network`, `externalLinks`, `cardRead`를 모두 boolean으로 적는다. 알 수 없는 키는 오류이며, 현재 베타에서 마지막 세 권한은 `false`여야 한다.
- `integrity.files`에는 manifest 자체를 제외한 모든 런타임 파일을 빠짐없이 한 번씩 적고, 실제로 없는 파일을 추가하지 않는다. 경로는 `/` 구분자의 canonical 상대 경로이고 대소문자를 무시해도 중복되지 않아야 한다.
- root manifest가 없으면 `quarantined`, 그 밖의 오류가 있으면 `blocked`, 경고만 있어도 `warning`이다. 경고와 오류가 모두 없어야 `ready`가 되고, Host가 별도로 신뢰한 공식 팩만 `trusted_official`이 된다. 실행 가능 상태는 이 둘뿐이다.
- `thumbnail`은 팩 안의 PNG/JPEG/WebP/GIF/AVIF 파일만 가리킨다. `assets/icon.png`는 게임 자체에서 쓸 수 있지만 현재 런처가 읽는 별도 icon manifest 필드는 없다.

## Manual Update File Flow

PlayZone 배포는 중앙 레지스트리 없이 시작하며 Discord는 발견·커뮤니티 채널로만 사용한다. GitHub Release를 권장 원본으로, Google Drive를 미검증 외부 링크로 표시한다. 출처와 무관하게 모든 파일에 같은 검증을 적용하며, `manifest.id`만으로 자동 업데이트를 판정하면 다른 제작자가 같은 id를 써서 충돌할 수 있다.

MVP 업데이트 UX:

- 사용자는 기존 게임 카드를 선택한 뒤 `업데이트 파일 선택` 버튼으로 새 `.lem` 파일을 고른다.
- 앱은 이 흐름에서만 새 파일을 기존 게임의 업데이트로 연결한다.
- 기존 저장 데이터는 선택한 게임의 기존 `cartridgeId`/save slot을 유지한다.
- 새 파일의 실행 경로, thumbnail, title, version metadata만 새 pack 기준으로 갱신한다.
- 선택한 게임의 이전 `.lem` 경로는 superseded 상태로 숨겨 중복 카드처럼 보이지 않게 한다.

권장 manifest:

- `id`: 사람이 읽는 짧은 pack id. 중앙 통제가 없으므로 충돌 가능성이 있다.
- `lineageId`: 최초 생성 시 UUID로 만들고 업데이트마다 절대 바꾸지 않는다.
- `version`: 반드시 유효한 SemVer를 쓴다. 업데이트 안내와 경고에 사용한다.
- `minPlayZoneVersion`: 이 pack이 요구하는 최소 PlayZone 앱 버전이다.
- `save.schemaVersion`: 저장 데이터 구조가 바뀔 때만 올린다.
- `releaseNotes`: 사용자가 받은 새 `.lem`이 무엇을 바꿨는지 확인하는 짧은 변경사항이다.

판정 규칙:

- `lineageId` 같음 + version 높음: 정상 업데이트.
- `lineageId` 없음: 자동 판정하지 말고 사용자가 선택한 게임에 연결할지 확인한다.
- `id` 같지만 `lineageId` 다름: 이름이 같아도 다른 게임일 수 있다고 경고한다.
- `version`이 낮거나 같음: 다운그레이드/재설치 가능성을 경고한다.
- `minPlayZoneVersion`이 현재 앱 기준보다 높음: 앱 업데이트가 필요할 수 있다고 경고한다.
- `save.schemaVersion`이 바뀜: 기존 저장과 호환되지 않을 수 있다고 경고하고, 업데이트 전 저장 백업을 만든다.

업데이트 전 저장 백업:

- 앱은 `업데이트 파일 선택`으로 새 `.lem`을 연결하기 직전에 기존 save slot을 백업한다.
- 백업은 pack 파일 안이 아니라 앱 내부 save 저장소 아래에 둔다.
- 기존 저장이 아직 없으면 백업을 건너뛰고 업데이트를 계속할 수 있다.

Version bump rule:

- 에이전트가 사용자가 받을 새 `.lem`을 만들면 `manifest.version`을 올린다.
- 문서 주석이나 내부 작업 메모만 바꾸고 새 `.lem`을 배포하지 않는다면 version을 올릴 필요가 없다.
- patch: 오타, 아이콘, 작은 밸런스, 저장 타이밍 같은 호환 가능한 수정.
- minor: 새 스테이지, 새 캐릭터, 새 기능처럼 기존 저장과 호환되는 콘텐츠 추가.
- major: 기존 저장 구조가 깨지거나 migration이 필요한 변경.
- `lineageId`는 major update에서도 바꾸지 않는다.

## Host API Name

현재 앱이 iframe에 주입하는 실제 API 이름:

```ts
window.LEM_GAME_HOST_API
```

오래된 `LanguageMiner` 전역 저장·다이아 API는 사용하지 않는다. 그 전역만 호출하면 앱 안에서 저장이나 다이아가 연결되지 않는다.

현재 사용 가능한 형태:

```ts
type HostFailure = {
  ok: false;
  code: string;
  message: string;
  balance?: number;
};

type LemGameHostApi = {
  packId: string;
  appVersion: string;
  wallet: {
    getBalance(): Promise<{ balance: number } | HostFailure>;
    spend(input: {
      id: string;
      idempotencyKey: string;
    }): Promise<
      | { ok: true; transactionId: string; balanceAfter: number; idempotentReplay?: boolean }
      | { ok: false; code: string; message: string; balance?: number }
    >;
  };
  save: {
    load<T>(fallback: T): Promise<T | HostFailure>;
    write<T>(value: T): Promise<void | HostFailure>;
    clear(): Promise<void | HostFailure>;
  };
  ui: {
    toast(message: string): void;
    confirm(input: { title: string; message: string }): Promise<boolean | HostFailure>;
  };
};
```

Host 요청은 reject 대신 `{ ok: false, code, message }`로 끝날 수 있으므로 저장·불러오기·삭제·confirm도 실패 객체를 검사한다. `appVersion`은 현재 고정 식별 문자열 `language-miner-host`이므로 버전 비교나 기능 감지에 쓰지 않는다. 호환성 최솟값은 manifest의 `minPlayZoneVersion`으로 선언한다. `ui.toast()`는 fire-and-forget 호환 API이며 현재 베타에는 Host가 그리는 토스트 UI가 없으므로, 저장 성공·실패처럼 중요한 안내는 게임 화면 안에도 직접 표시한다.

```js
function isHostFailure(value) {
  return Boolean(value && value.ok === false && typeof value.code === "string");
}
```

`wallet.spend()`의 `amount`, `reason`, 확인 여부는 게임 코드가 정하지 않는다. Host는
`manifest.economy.diamondActions`에서 `id`를 찾아 선언된 금액과 사유만 사용하고, 모든
차감에 사용자 확인을 강제한다. 선언되지 않은 action id는 `action_not_allowed`로 거부된다.

## Required Host Adapter

게임 코드는 Host API를 직접 흩뿌려 호출하지 말고, 반드시 adapter를 하나 둔다.
앱 안에서는 실제 `LEM_GAME_HOST_API`를 쓰고, 앱 밖 개발 프리뷰에서는 mock host를 쓴다.

```js
// game/host-adapter.js
export function createGameHost() {
  if (window.LEM_GAME_HOST_API) {
    return window.LEM_GAME_HOST_API;
  }
  return createMockHost();
}

function createMockHost() {
  const saveKey = "mock:example-game:save";
  const actions = { "summon-hero-1": { amount: 30, reason: "Summon hero" } };
  const spendResults = new Map();
  let balance = 1000;

  return {
    packId: "creator.example-game",
    appVersion: "mock",
    wallet: {
      async getBalance() {
        return { balance };
      },
      async spend(input) {
        const action = actions[input.id];
        if (!action) {
          return { ok: false, code: "action_not_allowed", message: "Unknown action.", balance };
        }
        const amount = action.amount;
        if (!input.idempotencyKey) {
          return {
            ok: false,
            code: "invalid_idempotency_key",
            message: "idempotencyKey is required.",
            balance
          };
        }
        const requestKey = `${input.id}:${input.idempotencyKey}`;
        const previous = spendResults.get(requestKey);
        if (previous) {
          return { ...previous, idempotentReplay: true };
        }
        if (amount <= 0) {
          return { ok: false, code: "invalid_amount", message: "Invalid amount.", balance };
        }
        if (balance < amount) {
          return {
            ok: false,
            code: "insufficient_balance",
            message: "Not enough diamonds.",
            balance
          };
        }
        balance -= amount;
        const result = {
          ok: true,
          transactionId: "mock-" + Date.now(),
          balanceAfter: balance
        };
        spendResults.set(requestKey, result);
        return result;
      }
    },
    save: {
      async load(fallback) {
        const raw = localStorage.getItem(saveKey);
        return raw ? JSON.parse(raw) : fallback;
      },
      async write(value) {
        localStorage.setItem(saveKey, JSON.stringify(value));
      },
      async clear() {
        localStorage.removeItem(saveKey);
      }
    },
    ui: {
      toast(message) {
        console.log("[toast]", message);
      },
      async confirm(input) {
        return window.confirm([input.title, input.message].filter(Boolean).join("\\n\\n"));
      }
    }
  };
}
```

## Save Rules

게임은 진행 데이터를 `host.save.write(value)`로 저장한다.

현재 상한은 pack별 직렬화된 JSON 5 MiB, 모든 pack 합계 256 MiB다. 저장은 `packId`별로 분리되며, 순환 참조처럼 JSON으로 직렬화할 수 없는 값과 상한을 넘는 payload는 실패 객체로 돌아온다.

필수:

- 게임 시작 시 `host.save.load(DEFAULT_SAVE)`를 호출한다.
- `load`, `write`, `clear` 결과가 Host 실패 객체인지 검사하고 게임 화면에 재시도 가능한 오류를 표시한다.
- 중요한 변화 직후 저장한다. 예: 층 이동, 보스 처치, 구매, 소환, 설정 변경.
- 주기 저장을 하더라도 5초 이상만 기다리지 말고 중요한 변화 직후 즉시 저장한다.
- `pagehide`, `beforeunload`, `visibilitychange`에서 마지막 save payload를 flush할 수 있게 최신 상태를 host save에 넘긴다.
- save data에 다이아 잔액을 저장하지 않는다. 잔액은 항상 `host.wallet.getBalance()`로 읽는다.

금지:

- 앱 안에서만 `localStorage`에 저장하고 Host API를 우회하는 것.
- save key에 사용자 PC 절대 경로나 개인정보를 넣는 것.
- 저장 payload를 무제한으로 키우는 것.

## Diamond Spend Rules

게임에서 다이아 버튼을 누를 때:

```js
const result = await host.wallet.spend({
  id: "summon-hero-1",
  idempotencyKey: `summon-hero-1:${save.purchaseCounter + 1}`
});

if (result.ok) {
  grantSummonResult();
  save.purchaseCounter += 1;
  const saveResult = await host.save.write(save);
  if (isHostFailure(saveResult)) {
    showError(saveResult.message);
  }
  renderWalletBalance(result.balanceAfter);
} else {
  showError(result.message);
}
```

필수:

- `id`는 manifest `economy.diamondActions[].id`와 맞춘다.
- manifest에는 최대 64개 action을 둘 수 있다. `id`는 1–80자의 영문·숫자·점·밑줄·하이픈, `amount`는 1–1,000,000 정수, `reason`은 1–160자의 사용자용 설명이어야 한다.
- 금액과 사유를 런타임 요청에 넣지 않는다. Host가 manifest에서 읽어 사용자에게 보여 준다.
- `idempotencyKey`는 같은 구매 의도에 같은 값을 써야 한다.
- `repeatable: true`인 action은 `idempotencyKey`가 없으면 거부된다. 반복 불가 action은 Host가 pack과 action별 고정 `once` 키를 사용해 두 번째 차감을 막는다.
- 버튼 더블클릭 중에는 같은 구매가 중복 실행되지 않게 disabled/lock 상태를 둔다.
- spend 성공 후에는 게임 내부 잔액 표시를 `balanceAfter` 또는 `getBalance()` 결과로 갱신한다.
- 메인 앱 잔액은 Host가 갱신한다. 게임이 부모 앱 UI를 직접 건드리지 않는다.

## Runtime Stability Rules

### Host asset cache boundary

이번 아이콘/스프라이트 깜박임 사례의 실제 원인은 게임 코드가 아니라 PlayZone host가 pack asset을 `Cache-Control: no-store`로 서빙한 데 있었다. 웹버전에서는 브라우저가 PNG/WebP sprite sheet를 캐시했지만, 앱 런타임에서는 같은 이미지가 UI 재렌더 때마다 다시 읽히고 디코드될 수 있었다.

따라서 책임을 나눈다.

- Host/runtime 책임: HTML은 Host bridge 주입 때문에 `no-store`로 둘 수 있지만, PNG/WebP/SVG/GIF/오디오/폰트 같은 정적 asset은 캐시 가능하게 서빙한다.
- Host/runtime 책임: pack이 갱신되면 archive cache key나 entry URL root가 바뀌어야 한다. asset URL마다 임의 cache-busting query를 붙이는 방식으로 해결하지 않는다.
- Game Pack 책임: asset 경로는 pack 내부의 안정적인 상대 경로를 쓰고, 매 렌더마다 새 URL을 만들거나 query를 바꾸지 않는다.
- Game Pack 책임: 주요 아이콘/스프라이트를 필요 시 preload할 수는 있지만, host의 no-store 정책을 게임 코드에서 억지로 보완하려고 하지 않는다.

권장 cache policy:

- HTML: `Cache-Control: no-store`
- JS/CSS/JSON: 개발 중 변경 반영을 위해 `Cache-Control: no-cache`
- image/audio/font asset: `Cache-Control: public, max-age=31536000, immutable`

### iframe src를 게임 상태와 묶지 않기

게임 iframe URL은 실행 시 한 번 정해져야 한다.
다음 값을 iframe `src` 변경 조건으로 쓰면 게임이 다시 로딩되어 아이콘/스프라이트가 깜박일 수 있다.

- wallet balance
- save state
- selected tab
- resource count
- animation state
- settings state

Host는 잔액을 postMessage/Host API 응답으로 알려주고, iframe URL은 바꾸지 않는다.

게임 내부에서도 다음을 피한다.

- 아이콘을 매 프레임 새 `Image()`로 만드는 것.
- CSS `background-image` URL에 매 렌더마다 cache-busting query를 붙이는 것.
- React/Vue/Svelte key를 잔액/시간 값으로 둬서 아이콘 컴포넌트가 계속 unmount/remount되는 것.
- asset preload 없이 보상/상점 화면을 열 때 처음으로 아이콘을 불러오는 것.

권장:

- 시작 시 주요 아이콘/스프라이트/폰트를 preload한다.
- 이미지 URL은 안정적인 pack 내부 상대 경로를 쓴다.
- 상태 변경은 DOM text/class만 바꾸고 이미지 노드는 재생성하지 않는다.

### Thumbnail 표시 규칙

런처는 다양한 비율의 영역에 썸네일을 표시한다.
따라서 썸네일 자체가 잘려도 의미가 사라지면 안 된다.

권장 asset:

- `assets/thumbnail.png`
- 16:9 비율, 1280x720 또는 1536x864 권장.
- 중앙 주요 피사체와 제목 없는 key art.
- 가장자리 10%는 잘려도 되는 안전 여백.
- 텍스트, UI 버튼, 작은 숫자, 로고를 이미지 안에 넣지 않는다. 제목은 런처 UI가 얹는다.
- pack 안에 `assets/icon.png`도 따로 둔다. 512x512 정사각형 권장.

manifest:

```json
{
  "thumbnail": "assets/thumbnail.png"
}
```

`assets/icon.png`를 게임 화면에서 사용할 수는 있지만, 현재 런처는 별도 icon 필드를 소비하지 않는다. 파일을 팩에 넣었다면 다른 런타임 파일처럼 `integrity.files`에 포함한다.

검수:

- 런처 hero 영역에서 주요 피사체가 보이는가.
- 카드 그리드 작은 썸네일에서 제목과 배경이 겹쳐도 읽히는가.
- 상세 패널 4:3 영역에서 핵심 장면이 지나치게 잘리지 않는가.
- 이미지가 안 잘리게 하려고 CSS를 고치기 전에, 원본 thumbnail이 안전 여백을 갖고 있는지 확인한다.

## QA Checklist For Agents

Host/runtime QA:

- PlayZone runtime이 image/audio/font asset을 `no-store`로 서빙하지 않는다.
- HTML은 Host bridge 주입을 위해 `no-store`로 둘 수 있지만, 정적 asset은 캐시 가능해야 한다.
- 인게임 아이콘/스프라이트가 PlayZone 앱에서만 깜박이면 먼저 host protocol cache header를 확인한다.

패키징 전 반드시 확인한다.

- `manifest.json`이 현재 앱 형식이다: `contentType`, `entry.path`, top-level `thumbnail`, `permissions.walletSpend`, `economy.diamondActions`.
- 앱 밖에서 `game/index.html` 또는 정적 서버로 실행된다.
- 앱 밖에서는 mock host로 저장/다이아 버튼이 반응한다.
- 앱 안에서는 `window.LEM_GAME_HOST_API`가 선택된다.
- 다이아 버튼은 `host.wallet.spend`를 호출하고 성공/실패 UI가 나온다.
- spend 성공 후 메인 앱 잔액은 게임 창을 닫거나 앱을 force reload하지 않아도 갱신된다.
- 저장 후 게임 창을 닫고 다시 열어도 진행 층/자원/해금 상태가 유지된다.
- 새로고침/닫기 직전 마지막 상태가 저장된다.
- 다이아 잔액 변화 때문에 iframe이 다시 로딩되지 않는다.
- 인게임 아이콘이 버튼 클릭, 다이아 사용, 저장, 화면 전환 때 깜박이지 않는다.
- 썸네일이 hero/card/detail 세 곳에서 의미 있게 보인다.
- `localStorage`는 앱 밖 mock fallback으로만 쓰인다.
- pack 안에 `node_modules`, `src`, `.git`, `.env`, API key, 개인 경로가 없다.
- README와 `security-report.md`가 포함되어 있다.

## Current GameKit

공개 GameKit의 문서와 manifest 템플릿에는 이 계약의 Host adapter 패턴, 다이아, 저장, 캐시 및 썸네일 규칙이 반영되어 있다. 새 팩을 만들 때는 Release에 포함된 GameKit과 현재 앱 버전의 validator를 함께 사용한다. 오래된 예제의 `LanguageMiner` 전역 API, `coverImage`, top-level `diamondActions`, `permissions.diamondSpend`는 가져오지 않는다.
