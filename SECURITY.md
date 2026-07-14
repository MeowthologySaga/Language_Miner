# Security Policy

## Supported versions

Security fixes target the newest published `0.1.0-beta.x` release. Older prerelease builds and untagged source snapshots may not receive fixes.

| Version | Supported |
| --- | --- |
| Latest `0.1.0-beta.x` | Yes |
| Older beta builds | Upgrade first |
| Unofficial or modified builds | No |

## Report a vulnerability privately

Do **not** open a public issue for a suspected vulnerability, exposed credential, privacy leak, or UGC sandbox bypass.

Use [GitHub private vulnerability reporting](https://github.com/MeowthologySaga/Language_Miner/security/advisories/new). If the private reporting form is temporarily unavailable, do not post exploit details publicly; try again later.

Include only the information needed to reproduce the issue:

- affected version or commit;
- Windows version and installation type;
- feature, file type, or UGC pack involved;
- minimal reproduction steps;
- expected and actual result;
- impact and any safe proof of concept;
- whether a credential or personal record may have been exposed.

Remove real API keys, tokens, personal conversations, local file paths, and other people’s data. Use canary values and synthetic fixtures whenever possible.

## High-priority reports

Examples include:

- a secret included in a production bundle or log;
- an API call occurring before user consent;
- a path traversal, ZIP bomb, symlink, CSP, sandbox, or Host API bypass;
- undeclared network access from UGC;
- duplicate or unauthorized local reward spending;
- backup restore writing outside the intended data store;
- failure to remove credentials after an in-app delete action;
- remote content loading that exposes a user without confirmation.

## Coordinated disclosure

The maintainers will acknowledge reports on a best-effort basis, investigate, and coordinate a disclosure date with the reporter when a fix is required. Please allow time for supported builds to be patched before publishing technical details. This project does not offer a bug bounty or guaranteed response time.

## Safe research boundaries

Test only on systems and accounts you own or are authorized to use. Do not access another person’s data, cause provider charges, disrupt community services, or distribute a malicious pack. Stop testing and report privately if you encounter real credentials or personal data.
