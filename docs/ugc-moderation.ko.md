# Language Miner UGC 운영·도배 방어 가이드

이 문서는 공개 GitHub 저장소의 UGC 접수와 사이트 카탈로그를 운영하는 관리자를 위한 기준입니다. 일반 사용자가 보는 카탈로그는 제출 게시판을 그대로 보여 주지 않습니다.

## 안전 경계

- 사이트는 정적 파일만 배포하며 회원가입, OAuth, 댓글 API, 파일 업로드, 데이터베이스, 공용 API 키를 두지 않습니다.
- 제출은 GitHub Issue Form으로 받습니다. GitHub 계정이 필요하고 게시글·링크는 공개됩니다.
- 새 Issue는 `ugc` 접수일 뿐입니다. 관리자가 검토해 `ugc-ready`를 붙이기 전에는 사이트 카탈로그에 등록하지 않습니다.
- 자동 작업은 제출된 파일을 다운로드·압축 해제·실행하지 않습니다. Issue 본문의 게시 횟수와 링크 문자열만 확인합니다.
- 승인되지 않은 글의 반복 편집은 검사 작업을 새로 실행하지 않습니다. 승인된 글이 수정될 때만 짧은 작업으로 `ugc-ready`를 제거합니다.
- 한 번의 검사에서 읽는 Issue는 최근 100개로 제한해 저장소가 커져도 제출 한 건이 무제한 API 조회를 만들지 않게 합니다.
- 실제 파일 검사는 격리된 검토 환경과 Language Miner 검증기로 따로 진행합니다.

## 자동으로 닫고 잠그는 경우

`.github/workflows/ugc-moderation.yml`은 다음 경우만 자동 차단합니다.

1. 한 계정이 24시간에 UGC Issue를 3개보다 많이 만든 경우
2. 이미 등록된 정확한 JSON·LEM·LEMGame·Google Drive 배포 링크를 반복한 경우
3. EXE, MSI, BAT, CMD, PowerShell 등 실행 파일 링크를 넣은 경우
4. `javascript:`, `data:`, `file:` 같은 비표준 스킴 또는 12개를 넘는 링크를 넣은 경우
5. `ugc-ready` 승인 후 게시글 본문을 수정한 경우에는 차단하지 않고 승인 표시만 제거해 재검토합니다.

자동 차단은 콘텐츠의 품질·저작권·악성 여부를 판정하지 않습니다. 정상 제출이 잘못 닫히면 관리자가 잠금을 풀고 다시 열 수 있습니다.

## 승인 순서

1. 제목과 설명이 실제 콘텐츠를 과장하지 않는지 확인합니다.
2. 제작자, 소스 저장소, 고정 태그·Release, 라이선스와 자산 출처를 확인합니다.
3. API 키, 이메일, 개인 대화, 로컬 경로, 로그가 공개 소스와 배포물에 없는지 별도 검사합니다.
4. 캐릭터 JSON은 데이터 전용 계약과 원격 이미지 경고를 확인합니다.
5. Game Pack은 해시, manifest, 경로 탈출, 압축 폭탄, 파일 수·크기, CSP와 선언 권한을 검증합니다.
6. 일반 이용가 정책을 확인합니다.
7. 결과가 `ready` 이상이면 `ugc-ready`를 붙이고 카탈로그의 정적 데이터에 등록합니다.

별·댓글 수, 제출자의 주장, 오래된 GitHub 계정은 승인 근거가 아닙니다. `ugc-ready`도 저작권·품질·무해성을 절대 보증하지 않으며 앱이 설치 시 다시 검사합니다.

## 공격이 몰릴 때

평소 자동 제한만으로 부족하면 GitHub 저장소의 **Settings → Moderation options → Interaction limits**에서 임시 제한을 켭니다. 새 계정만 제한하거나, 기존 기여자 또는 협업자만 참여하도록 범위를 단계적으로 높일 수 있습니다. 24시간부터 제한 기간을 선택하고 상황이 끝나면 해제합니다.

- GitHub 공식 문서: <https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository>
- 잠금 가이드: <https://docs.github.com/en/communities/moderating-comments-and-conversations/locking-conversations>
- 스팸·악용 신고: <https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam>

반복 공격 계정은 저장소에서 차단하고 GitHub에 신고합니다. 위협, 개인정보 게시, 자격 증명 노출, 검증기 우회는 공개 댓글로 대응하지 말고 `SECURITY.md`의 비공개 신고 경로로 옮깁니다.

## 운영자가 하지 말아야 할 일

- Issue 링크를 서버에서 자동 다운로드하거나 자동 실행하지 않습니다.
- 사용자 입력을 셸 명령, 파일 경로, HTML 또는 GitHub Actions `run:` 문자열에 넣지 않습니다.
- 자동 검사 통과만으로 `ugc-ready`를 붙이지 않습니다.
- 움직이는 `latest` 다운로드 URL을 카탈로그에 넣지 않습니다.
- 승인된 항목이 수정됐는데 이전 해시·승인 상태를 그대로 유지하지 않습니다.
