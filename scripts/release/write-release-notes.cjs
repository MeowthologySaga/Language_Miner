"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const outputPath = path.join(repoRoot, "artifacts", "release-notes.md");
const notes = `# Language Miner v${packageJson.version}

Windows 10/11 x64 공개 베타입니다. 설치판, 포터블판, 수동 설치용 브라우저 확장, GameKit, 공식 PlayZone 게임 3종, SBOM, 라이선스 보고서, SHA-256 체크섬 및 전체 소스가 포함됩니다.

## 설치 전 확인

- 이 베타 빌드는 코드 서명이 되어 있지 않아 Windows SmartScreen 경고가 표시될 수 있습니다.
- 반드시 이 GitHub Release에서 받은 파일인지 확인하고 \`SHA256SUMS.txt\`로 해시를 검증하세요.
- 공식 GitHub CLI 2.93.0 이상이 있다면 \`gh release verify-asset v${packageJson.version} FILE -R MeowthologySaga/Language_Miner\`로 파일이 이 특정 Release의 서명된 증명과 일치하는지 확인하세요.
- 이 Release는 공개 후 자산과 태그가 잠기는 GitHub 변경 불가 Release로 배포됩니다. 체크섬과 증명은 파일 교체 위험을 줄이지만 취약점이 전혀 없다는 보증이나 코드 서명을 대신하지는 않습니다.
- 앱에는 공용 API 키가 포함되지 않습니다. Gemini 또는 Google 번역은 사용자가 직접 입력한 키로만 연결됩니다.
- 심연의 무명소환사, 고양이 오디세이, 드릴하트 디펜스는 앱 용량에 포함되지 않으며 PlayZone에서 처음 실행할 때 확인 후 개별 다운로드됩니다.
- 자세한 절차는 \`docs/install-windows.ko.md\`와 \`docs/install-windows.en.md\`를 확인하세요.

---

This is the Windows 10/11 x64 public beta. The Release includes installer and portable builds, the manually installed browser extension, GameKit, three official PlayZone games, an SBOM, a license report, SHA-256 checksums, and complete source.

## Before installing

- This beta is unsigned, so Windows SmartScreen may show a warning.
- Download only from this GitHub Release and verify files against \`SHA256SUMS.txt\`.
- With the official GitHub CLI 2.93.0 or newer, run \`gh release verify-asset v${packageJson.version} FILE -R MeowthologySaga/Language_Miner\` to verify the file against the signed attestation for this specific Release.
- This is published as a GitHub immutable Release, which locks its assets and tag after publication. Checksums and attestations reduce replacement risk, but do not prove the absence of vulnerabilities or replace code signing.
- No shared API key is bundled. Gemini and Google Translate work only with a key supplied by the user.
- Abyss Summoner, Cat Odyssey, and Drillheart Defense are not embedded in the app; PlayZone downloads each one after confirmation on first launch.
- See \`docs/install-windows.en.md\` for the complete installation and SmartScreen guide.
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, notes, "utf8");
process.stdout.write(`Release notes written: ${path.relative(repoRoot, outputPath)}.\n`);
