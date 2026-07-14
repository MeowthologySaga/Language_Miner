# Runtime Security Rules

Game Pack은 다른 사람이 만든 JavaScript 실행물입니다. Language Miner는 출처와 관계없이 검증·격리하고, `ready` 또는 `trusted_official` 상태만 실행합니다.

## 런타임 경계

- Electron·Node 통합과 원본 IPC를 게임에 노출하지 않습니다.
- `fs`, `child_process`, shell, 환경변수, 사용자 경로와 OS 클립보드를 사용할 수 없습니다.
- 모든 문서 응답에 Host가 CSP를 적용합니다.
- 이번 베타에서는 `network`, `externalLinks`, `cardRead`가 지원되지 않으며 `true`로 선언하면 팩이 차단됩니다.
- 저장과 다이아는 `window.LEM_GAME_HOST_API`만 사용합니다.
- pack 내부 파일은 안정적인 상대 경로로 불러옵니다.

현재 Host API 개요:

```js
const host = window.LEM_GAME_HOST_API;
const balanceResult = await host.wallet.getBalance();
const save = await host.save.load(DEFAULT_SAVE);
const writeResult = await host.save.write(save);
const clearResult = await host.save.clear();
const confirmResult = await host.ui.confirm({ title: "Reset", message: "Start over?" });
```

Host 요청은 reject 대신 `{ ok: false, code, message }` 실패 객체로 끝날 수 있습니다. `getBalance`, `load`, `write`, `clear`, `confirm`의 결과를 검사하고, 저장 성공·실패처럼 중요한 상태는 게임 UI에 직접 표시하세요. `ui.toast()`는 현재 베타에서 화면 표시를 보장하지 않는 fire-and-forget 호환 API입니다. `appVersion`도 현재 `language-miner-host`라는 고정 식별 문자열이므로 버전 비교에 쓰지 말고 manifest의 `minPlayZoneVersion`을 사용합니다.

`localStorage`는 앱 밖 개발 프리뷰에서 mock Host가 없을 때만 fallback으로 사용합니다. 앱 안의 실제 진행은 Host 저장소에 기록합니다.

## 저장 상한과 데이터

- pack당 5 MiB, 전체 256 MiB입니다.
- JSON으로 직렬화할 수 있는 최소 진행 상태만 저장합니다.
- 다이아 잔액, API 키, 로컬 파일 경로와 개인정보를 저장하지 않습니다.
- 보스 처치·구매·해금처럼 중요한 변화 직후 저장합니다.

## 네트워크와 외부 링크

첫 베타의 Game Pack은 오프라인 전용입니다. 원격 스크립트, API, WebSocket, CDN, 원격 이미지·폰트와 외부 링크에 의존하지 마세요. 권한을 숨기거나 iframe·redirect로 우회하려는 팩은 차단 대상입니다.

## 설치 전 사용자에게 보이는 것

앱은 해시, 제작자, 소스 URL, 라이선스, 요청 권한과 차단·경고 이유를 보안 리포트로 보여 줍니다. Discord나 외부 링크에서 받았다는 사실은 안전 보증이 아닙니다. 배포 원본은 제작자의 GitHub Release와 체크섬을 권장합니다.
