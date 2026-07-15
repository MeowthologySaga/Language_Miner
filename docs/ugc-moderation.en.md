# Language Miner UGC moderation and anti-spam guide

This document defines how maintainers operate public GitHub UGC submissions and the site catalog. The catalog ordinary users browse is not a raw feed of the submission board.

## Security boundary

- The site is static and has no account system, OAuth flow, comments API, file upload, database, or shared API key.
- Submissions use GitHub Issue Forms. A GitHub account is required, and each post and link is public.
- A new Issue labeled `ugc` is only a submission. It does not enter the site catalog until a maintainer adds `ugc-ready` after review.
- Automation never downloads, extracts, or executes a submitted file. It checks only post counts and link strings in the Issue body.
- Repeated edits to an unapproved post do not start another guard job. Only an edit to an approved post starts the short path that removes `ugc-ready`.
- Each guard run reads at most the 100 most recent UGC Issues, so one submission cannot trigger unbounded API pagination as the repository grows.
- File inspection happens separately in an isolated review environment and in the Language Miner validator.

## Automatic close and lock rules

`.github/workflows/ugc-moderation.yml` automatically blocks only these cases:

1. more than three UGC Issues from one account within 24 hours;
2. an exact JSON, LEM, LEMGame, or Google Drive distribution link already used by another submission;
3. links to EXE, MSI, BAT, CMD, PowerShell, or similar executable files;
4. non-standard schemes such as `javascript:`, `data:`, or `file:`, or more than 12 links; and
5. editing an approved `ugc-ready` post does not close it, but removes approval for re-review.

Automation does not judge quality, copyright, or whether a file is malicious. A maintainer can unlock and reopen a legitimate false positive.

## Approval sequence

1. Check that the title and description accurately describe the content.
2. Review the creator, source repository, pinned tag and Release, licenses, and asset sources.
3. Scan source and artifacts separately for API keys, email addresses, private conversations, local paths, and logs.
4. For character JSON, verify the data-only contract and remote-image warnings.
5. For Game Packs, verify hashes, the manifest, path traversal, archive bombs, file limits, CSP, and declared capabilities.
6. Apply the general-audience policy.
7. Add `ugc-ready` only when the result is `ready` or stronger, then add the item to the static catalog data.

Stars, comment counts, a submitter's claims, and account age are not approval evidence. `ugc-ready` is not an absolute copyright, quality, or safety guarantee; the app checks the pack again during installation.

## When an attack is active

If normal automation is insufficient, open **Settings → Moderation options → Interaction limits** for the GitHub repository. Start by limiting new accounts, then restrict to prior contributors or collaborators only if necessary. Choose a temporary duration and remove the restriction after the incident.

- GitHub documentation: <https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository>
- Locking conversations: <https://docs.github.com/en/communities/moderating-comments-and-conversations/locking-conversations>
- Reporting abuse or spam: <https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam>

Block repeat attackers and report them to GitHub. Move threats, exposed personal data, leaked credentials, and validator-bypass reports to the private route in `SECURITY.md` instead of discussing them publicly.

## Maintainer prohibitions

- Do not automatically download or execute Issue links on a server.
- Do not interpolate user input into shell commands, file paths, HTML, or a GitHub Actions `run:` string.
- Do not grant `ugc-ready` based only on automation.
- Do not list mutable `latest` download URLs.
- Do not retain an old hash or approval after an approved post changes.
