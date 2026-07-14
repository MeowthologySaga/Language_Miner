# 검증된 GitHub Release 공개 절차

[English](release-publishing.en.md) · [Windows 설치 안내](install-windows.ko.md) · [보안 정책](../SECURITY.md)

이 문서는 Language Miner 유지관리자가 태그 빌드로 만들어진 **검증된 초안 Release**를 최종 공개할 때만 사용합니다. GitHub Actions는 빌드, 테스트, 출처 증명, 자산 해시 확인과 초안 업로드까지만 수행하며 자동으로 공개하지 않습니다.

## 준비

1. 공식 [GitHub CLI](https://cli.github.com/) `2.93.0` 이상을 설치합니다. 이전 버전에는 Release 검증 명령의 보안 문제가 있습니다.
2. 장기 PAT를 만들거나 저장소 Secret에 관리자 토큰을 넣지 않습니다.
3. 공개 저장소를 새 폴더에 clone하고, 로컬 PC에서 유지관리자 계정으로 로그인합니다.

```powershell
git clone https://github.com/MeowthologySaga/Language_Miner.git Language_Miner_release
Set-Location .\Language_Miner_release
gh auth login --hostname github.com
gh auth status --hostname github.com
```

공개 스크립트는 `GH_TOKEN` 또는 `GITHUB_TOKEN` 환경 변수가 있으면 중단하고, GitHub CLI의 대화형 로그인만 사용합니다.

## 최초 한 번: 변경 불가 Release 켜기

저장소 관리자 권한으로 다음 명령을 실행합니다.

```powershell
gh api --hostname github.com --method PUT `
  -H "Accept: application/vnd.github+json" `
  -H "X-GitHub-Api-Version: 2026-03-10" `
  repos/MeowthologySaga/Language_Miner/immutable-releases

gh api --hostname github.com --method GET `
  -H "Accept: application/vnd.github+json" `
  -H "X-GitHub-Api-Version: 2026-03-10" `
  repos/MeowthologySaga/Language_Miner/immutable-releases
```

두 번째 명령 결과에 `"enabled": true`가 보여야 합니다. 이 설정을 확인하지 못하면 공개 스크립트는 중단합니다.

## 태그 빌드와 초안 확인

1. 감사된 커밋에 버전 태그를 푸시합니다.
2. `Windows release` Actions 실행이 모두 성공할 때까지 기다립니다.
3. 실행의 `language-miner-<태그>-windows-x64` workflow artifact를 내려받아 빈 폴더에 압축 해제합니다.
4. GitHub Release 화면에서 같은 태그의 항목이 아직 **Draft**인지 확인합니다. 웹 화면의 **Publish release** 버튼은 누르지 않습니다.

압축을 푼 폴더에는 최소한 다음 구조가 있어야 합니다.

```text
artifacts/
  release/
    SHA256SUMS.txt
    ...설치판, 포터블판, 소스, SBOM 및 기타 Release 자산...
  release-build-metadata.json
  release-notes.md
```

## 로컬 사전 검사

저장소 루트에서 metadata가 기록한 정확한 40자리 커밋 SHA를 사용합니다.

```powershell
$metadata = Get-Content -Raw ".\artifacts\release-build-metadata.json" | ConvertFrom-Json

git fetch --tags origin
git switch --detach $metadata.commitSha
git status --porcelain

.\scripts\release\publish-verified-draft.ps1 `
  -Tag $metadata.tag `
  -ExpectedCommit $metadata.commitSha `
  -ReleaseDirectory ".\artifacts\release"
```

이 단계는 공개하지 않습니다. 다음을 모두 다시 확인합니다.

- GitHub CLI 버전과 유지관리자 로그인;
- 공개 저장소 checkout이 깨끗하고, 로컬 `HEAD`와 로컬 태그가 예상 커밋과 일치하는지;
- 저장소의 변경 불가 Release 설정;
- 원격 태그가 예상 커밋을 가리키는지;
- 초안의 모든 파일명, 크기, 업로드 상태와 SHA-256 digest;
- 로컬 `SHA256SUMS.txt`가 모든 자산을 빠짐없이 포함하는지;
- 각 자산의 출처 증명이 정확한 `release.yml`, 태그 ref와 커밋에서 만들어졌는지.

여기서 `gh attestation verify FILE --repo MeowthologySaga/Language_Miner`만 단독으로 실행하면 “이 저장소가 만든 유효한 출처 증명”까지만 확인하며, 그 파일이 **특정 GitHub Release에 실제로 포함되었다는 뜻은 아닙니다**. 그래서 공개 스크립트는 signer workflow·source ref·source digest를 함께 제한하고, 별도로 초안 자산 목록과 digest를 대조하며, 공개 후에는 `gh release verify`와 `gh release verify-asset`으로 특정 변경 불가 Release와의 연결까지 확인합니다.

## 최종 공개

사전 검사가 성공한 같은 폴더에서 `-Publish`를 추가합니다.

```powershell
.\scripts\release\publish-verified-draft.ps1 `
  -Tag $metadata.tag `
  -ExpectedCommit $metadata.commitSha `
  -ReleaseDirectory ".\artifacts\release" `
  -Publish
```

확인 질문에 표시된 저장소, 태그와 커밋 SHA가 모두 맞을 때만 승인합니다. 스크립트는 공개 직전에 원격 설정, 태그와 자산을 한 번 더 검사하고, 공개 뒤 `Immutable` 상태와 `gh release verify`, 각 파일의 `gh release verify-asset` 결과까지 확인합니다.

실패 메시지에 이미 공개되었다고 나오면 다시 실행하거나 자산을 덮어쓰지 말고 즉시 조사합니다. 변경 불가 Release는 공개 후 자산이나 연결 태그를 교체하는 용도가 아니므로 수정이 필요하면 새 버전 태그를 만듭니다.
