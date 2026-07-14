# Windows 설치·SmartScreen·체크섬 안내

[English](install-windows.en.md) · [README](../README.md) · [사용자 가이드](user-guide.ko.md)

대상: Windows 10/11 x64, 준비 중인 `v0.1.0-beta.1`.

첫 공개 베타는 코드 서명이 없는 설치판과 포터블판으로 제공할 예정입니다. SmartScreen 경고를 없애는 우회 파일을 찾지 말고, 공식 출처와 SHA-256을 직접 확인하세요.

## 1. 공식 파일 찾기

공식 배포 위치는 [MeowthologySaga/Language_Miner의 GitHub Releases](https://github.com/MeowthologySaga/Language_Miner/releases)입니다.

같은 Release에서 다음을 확인합니다.

- `v0.1.0-beta.1` 태그;
- Windows x64 NSIS 설치판 또는 포터블판;
- SHA-256 체크섬 파일;
- SBOM;
- Source code.

Discord 재업로드, 단축 URL, 검색 광고, 파일 공유 사이트의 복사본은 사용하지 마세요. 공식 Discord도 파일을 다시 올리는 장소가 아니라 GitHub Release 원본을 안내하는 장소로 사용합니다.

## 2. SHA-256 확인

PowerShell을 열고 다운로드 폴더로 이동한 뒤 실제 파일명으로 실행합니다.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\Language Miner Setup 0.1.0-beta.1-x64.exe"
```

포터블판도 같은 방식입니다.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\Language Miner Portable 0.1.0-beta.1-x64.exe"
```

출력의 `Hash`가 Release 체크섬 파일의 해당 값과 글자 단위로 같아야 합니다. 대소문자는 무관하지만 한 글자라도 다르면 실행하지 말고 파일을 삭제한 뒤 공식 Release에서 다시 받으세요.

체크섬은 전송 중 손상이나 다른 파일로의 교체를 찾는 데 도움을 줍니다. 체크섬 파일 자체도 같은 공식 Release에서 받아야 합니다.

### 특정 Release와 빌드 출처 확인하기

공식 [GitHub CLI](https://cli.github.com/) `2.93.0` 이상이 설치되어 있다면, 다운로드한 파일이 **이 태그의 특정 GitHub Release**에 포함되고 서명된 증명과 일치하는지 확인할 수 있습니다. 이전 버전에는 검증 명령의 보안 문제가 있으므로 먼저 업데이트하고, 실제 태그와 파일명으로 실행하세요.

```powershell
gh release verify-asset v0.1.0-beta.1 ".\Language Miner Setup 0.1.0-beta.1-x64.exe" -R MeowthologySaga/Language_Miner
```

Language Miner는 세 단계를 함께 사용합니다.

- `SHA256SUMS.txt`는 받은 파일의 내용이 배포 시 계산한 값과 같은지 확인합니다.
- `gh release verify-asset`은 파일의 해시를 지정한 Language Miner Release의 서명된 증명과 연결합니다.
- GitHub의 변경 불가 Release는 공개된 뒤 자산과 연결된 태그가 교체되지 않도록 잠급니다.

이 보호들은 파일 교체 위험을 크게 줄이지만, 코드에 취약점이 전혀 없다는 보증이나 Windows 코드 서명을 대신하지는 않습니다. 체크섬과 증명 중 하나라도 실패하거나 Release 제목 아래에 `Immutable` 표시가 없다면 실행하지 말고 [비공개 보안 신고](../SECURITY.md)로 알려 주세요.

## 3. NSIS 설치판

1. 체크섬이 일치하는지 확인합니다.
2. 설치 파일을 실행합니다.
3. 게시자가 `Unknown publisher`로 보일 수 있음을 확인합니다.
4. SmartScreen이 나타나면 파일명과 출처를 다시 확인합니다.
5. 확신할 수 있을 때만 **추가 정보**를 선택한 뒤 **실행**을 선택합니다.
6. 설치 위치와 바로가기 옵션을 확인하고 완료합니다.

출처나 체크섬을 확인하지 못했다면 “실행”을 누르지 마세요. Windows 보안 기능을 전역으로 끄지 마세요.

## 4. 포터블판

포터블판은 설치 마법사 없이 실행하는 단일 실행 파일입니다.

- 쓰기 권한이 있는 개인 폴더에 둡니다.
- 체크섬과 SmartScreen 확인은 설치판과 동일합니다.
- 포터블 실행 파일을 USB에 옮겨도 학습 데이터가 반드시 USB에 저장되는 것은 아닙니다.
- 기본 사용자 데이터, 캐시와 자격 증명은 Windows 사용자 데이터 영역에 남을 수 있습니다.

공용 PC에서 포터블판을 실행했다고 해서 흔적이 남지 않는 것은 아닙니다.

## 5. 첫 실행 안전 설정

- AI는 미연결 상태로 둔 채 기본 카드와 복습을 먼저 확인합니다.
- 클라우드 기능이 필요하면 본인 키만 사용합니다.
- Google 키에 사용할 API와 앱 제한, quota와 예산 알림을 설정합니다.
- 원격 UGC를 설치하기 전 출처, 라이선스, 해시와 권한 리포트를 읽습니다.
- 백업 위치가 OneDrive 등 동기화 폴더인지 확인합니다.

## 6. 업데이트

첫 베타에서는 새 Release를 직접 확인하고 설치하는 수동 업데이트를 기준으로 합니다.

1. 현재 데이터의 `.lembackup`을 만듭니다.
2. 새 Release의 설치 파일과 체크섬을 받습니다.
3. SHA-256을 검증합니다.
4. 릴리스 노트의 데이터 마이그레이션·UGC 호환성 안내를 읽습니다.
5. 앱을 종료하고 업데이트합니다.

서로 다른 출처의 “자동 업데이트 도구”를 사용하지 마세요.

## 7. 제거와 데이터 삭제

Windows 앱 제거는 프로그램 파일을 지우지만 사용자 데이터, 별도 백업, 내보내기 파일이 남을 수 있습니다.

PC를 양도하거나 모든 데이터를 지우려면:

1. 필요한 `.lembackup`을 안전한 개인 저장소에 복사합니다.
2. 앱 설정에서 API 키, 쿠키, 확장 큐와 전체 데이터를 삭제합니다.
3. 앱을 종료하고 Windows에서 Language Miner를 제거합니다.
4. 다운로드 폴더의 설치 파일, 별도 백업과 내보내기를 직접 확인합니다.
5. Google Drive 카드 동기화를 사용했다면 원격 사본과 앱 권한도 별도로 관리합니다.

## 8. 문제 신고

SmartScreen이 아닌 앱 오류는 버그 이슈 템플릿을 사용하세요. 공식 파일의 체크섬 불일치, 악성 변조 의심, 키 노출이나 취약점은 공개 이슈에 파일을 올리지 말고 [비공개 보안 신고](../SECURITY.md)를 사용하세요.
