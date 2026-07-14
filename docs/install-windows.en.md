# Windows Installation, SmartScreen, and Checksums

[한국어](install-windows.ko.md) · [README](../README.en.md) · [User guide](user-guide.en.md)

Target: Windows 10/11 x64 public beta [v0.1.0-beta.1](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1).

This public beta is provided as an unsigned installer and portable build. Do not look for a repack that bypasses SmartScreen; verify the official source and SHA-256 yourself.

## 1. Find the official files

The official distribution location for this version is the [v0.1.0-beta.1 Release](https://github.com/MeowthologySaga/Language_Miner/releases/tag/v0.1.0-beta.1).

Use files from the same Release:

- the `v0.1.0-beta.1` tag;
- Windows x64 NSIS installer `Language-Miner-Setup-0.1.0-beta.1-x64.exe` or portable build `Language-Miner-Portable-0.1.0-beta.1-x64.exe`;
- SHA-256 checksum file;
- SBOM;
- source code.

Do not use a Discord re-upload, shortened URL, search ad, or file-sharing mirror. The official Discord is not open yet. Even if a community opens later, verify downloads only against the GitHub Release above.

## 2. Verify SHA-256

Open PowerShell, move to your download folder, and use the actual filename.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\Language-Miner-Setup-0.1.0-beta.1-x64.exe"
```

For the portable build:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath ".\Language-Miner-Portable-0.1.0-beta.1-x64.exe"
```

The `Hash` output must match the corresponding Release checksum character for character. Case does not matter. If any character differs, do not run the file; delete it and download again from the official Release.

A checksum helps detect damage or replacement, but only when the checksum file also comes from the official Release.

### Verify the specific Release and build provenance

With the official [GitHub CLI](https://cli.github.com/) version `2.93.0` or newer, you can verify that the downloaded file belongs to the **specific GitHub Release for this tag** and matches its signed attestation. Update first because older CLI versions have a security advisory affecting verification commands. Use the actual tag and filename.

```powershell
gh release verify-asset v0.1.0-beta.1 ".\Language-Miner-Setup-0.1.0-beta.1-x64.exe" -R MeowthologySaga/Language_Miner
```

Language Miner uses three layers together:

- `SHA256SUMS.txt` checks that the downloaded bytes match the value calculated for the release.
- `gh release verify-asset` binds the file digest to the signed attestation for the specified Language Miner Release.
- GitHub's immutable Release locks published assets and the associated tag against later replacement.

These controls substantially reduce replacement risk, but they do not prove that the code has no vulnerabilities and they do not replace Windows code signing. If either verification fails, or the Release does not show `Immutable` below its title, do not run the file; use the [private security process](../SECURITY.md).

## 3. NSIS installer

1. Confirm the checksum.
2. Run the installer.
3. Expect Windows to show `Unknown publisher` for the unsigned beta.
4. If SmartScreen appears, re-check the filename and source.
5. Only when you are confident, choose **More info** and then **Run anyway**.
6. Review the install location and shortcut options.

If you cannot verify the source and checksum, do not choose Run anyway. Do not disable Windows security globally.

## 4. Portable build

The portable build is a single executable without an installation wizard.

- Keep it in a personal folder where you have write access.
- Apply the same checksum and SmartScreen checks as the installer.
- Moving the executable to a USB drive does not guarantee that study data follows it.
- User data, caches, and credentials may remain in the Windows user-data area.

Running the portable build on a shared PC is not a no-trace mode.

## 5. First-run safety

- Leave AI disconnected while checking basic cards and review.
- If cloud features are needed, use only your own key.
- Configure API and application restrictions, quota, and budget alerts for Google keys.
- Before installing remote UGC, read the source, license, hashes, permissions, and validator report.
- Check whether a backup destination is synchronized by OneDrive or another provider.

## 6. Update

The first beta uses manual updates from a new Release.

1. Create a `.lembackup` of current data.
2. Download the new build and checksum.
3. Verify SHA-256.
4. Read the Release notes for data migration and UGC compatibility.
5. Close the app and update.

Do not use an “automatic updater” from another source.

## 7. Uninstall and delete data

Windows uninstall removes program files but can leave user data, separate backups, and exports.

Before transferring a PC or removing everything:

1. Copy any wanted `.lembackup` to secure personal storage.
2. In app Settings, delete API keys, cookies, the extension queue, and all data.
3. Close and uninstall Language Miner through Windows.
4. Inspect the Downloads folder and any separate backup and export locations.
5. If Google Drive card sync was used, manage the remote copy and app permission separately.

## 8. Report a problem

Use the bug template for an app error unrelated to SmartScreen. For an official checksum mismatch, suspected malicious modification, exposed key, or vulnerability, do not attach the file to a public issue; use the [private security process](../SECURITY.md).
