# LEM Package Spec

`.lem`과 `.lemgame`은 ZIP 형식의 정적 웹 게임 패키지입니다. 공개 배포에는 의미가 분명한 `.lemgame` 확장자를 권장합니다.

## 권장 구조

```text
my-game.lemgame
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

manifest는 압축 루트에 있어야 합니다. 한 단계짜리 불필요한 상위 폴더 안에 넣지 않습니다.

## 최종 pack에 넣는 것

- 실행 가능한 로컬 HTML, 번들 JavaScript와 CSS
- pack 내부 이미지·오디오·폰트
- 앱 밖 프리뷰용 mock Host adapter
- README, 보안·자산·라이선스 고지
- 모든 런타임 파일의 SHA-256을 적은 manifest

## 최종 pack에서 빼는 것

- `src`, `node_modules`, `.git`, `.vscode`, `coverage`
- `.env`, API 키, 토큰, 인증서와 로컬 설정
- source map, 개발 로그, DB, 백업, 개인 경로
- 실행에 `npm install`이 필요한 빌드 전 소스만 있는 상태
- 외부 CDN·원격 폰트·원격 이미지가 없으면 시작하지 못하는 코드

## 첫 베타 상한

- 압축 파일 256 MiB
- 해제 후 전체 512 MiB
- 단일 파일 128 MiB
- 런타임 파일 4,096개
- 최대 압축률 200:1
- manifest 256 KiB
- ZIP64, 심볼릭 링크, 경로 탈출, 암호화 ZIP은 지원하지 않음

## 설치 가능한 상태

validator가 manifest, CRC, 경로, 파일 수·용량, SHA-256, 권한과 진입 HTML을 검사합니다. 오류나 경고가 하나라도 남으면 `ready`가 되지 않으므로 실행할 수 없습니다. 제작 중에도 실제 앱에서 가져와 보안 리포트와 `ready` 상태를 확인하세요.

정확한 필드는 [07_MANIFEST_SCHEMA.md](07_MANIFEST_SCHEMA.md), 실제 Host API는 배포 ZIP의 `13_CURRENT_RUNTIME_CONTRACT.md`를 따릅니다.
