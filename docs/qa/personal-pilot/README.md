# DevCrew Personal Pilot — parallel QA fixture preparation

Tracking: #184, #153 and #181. Development runs independently under #183.
Status: FIXTURE ONLY; DevCrew real Source and installed E2E NOT EXERCISED.

This **public repository** directory contains NON-SECRET example files and a human-operated setup script. The example GitHub Actions workflow is nested under docs/, so it is NOT installed at the cc-orca repository root.

## Operator: create the isolated PRIVATE test repository

1. Copy this directory locally from latest Draft [PR #186](https://github.com/Guan21/cc-orca/pull/186). Use PowerShell 7 with Git and GitHub CLI installed on your own Windows machine.
2. From this directory, run: pwsh -NoProfile -File ./operator/setup-private-qa.ps1. **DRY RUN by default**: no remote calls or changes.
3. Review the exact operator account Guan21, intended repository Guan21/devcrew-personal-pilot-qa, and the non-secret seed contents.
4. **Only after explicit operator approval**, run: pwsh -NoProfile -File ./operator/setup-private-qa.ps1 -Apply. The script uses GitHub CLI's **REST gh api subcommand only**, for GET user, POST user/repos, GET repos/{owner}/{repo} and POST repos/{owner}/{repo}/pulls, with normal Git HTTPS pushes. It deliberately does **not** use the GraphQL-backed gh repo view or gh pr create.
5. -Apply authenticates through the GitHub CLI account already configured on your machine; it does not print tokens or explicitly open OS Keychain/Credential Manager. It creates **PRIVATE** repo only for the expected owner, re-verifies PRIVATE visibility **before any push**, adds repo-seed as main, then creates pilot/one-pr and one **unmerged** PR.
6. Verify independently that the remote is PRIVATE and exactly one test PR is open; record its actual PR number, HEAD SHA, CI workflow IDs/states/times and numeric repo ID. **Do not infer real check outcomes from local fixture tests.**
7. If creation or any later step fails, **do not rerun -Apply blindly**. The script will refuse to reuse/overwrite an existing repository. Inspect/recover partial state manually.

The connected GitHub app does not currently expose a create-repository action. This operator-controlled script has **not** been executed by ChatGPT. A 404 lookup means *not found or inaccessible*, not proof of non-existence.

## Test order

- Phase W: Windows x64 packaged Personal only, after separately approved **exact-SHA** application Source test under #151.
- Phase M: macOS arm64 packaged Personal, then macOS Intel x64 while it remains part of the V1 support contract.
- Verify actual GitHub PR/HEAD/Checks observation and negative cases under #153 only on approved installed native builds. GitHub-hosted Action PASS is **not** DevCrew native E2E PASS.
- Fixture GitHub preparation may proceed in parallel with development #183; DevCrew app real-source E2E cannot start before the independent #151 runtime security gates and Owner approval.

## Security boundary

Current state: #151 OPEN, #153 NOT EXERCISED, #148 V1 NO-GO.
Repository management via GitHub CLI REST, after operator approval, is **separate** from DevCrew's application GitHub GraphQL Source and native gh credential pipeline. No application Source/Renderer activation, Owner signoff or release authorization follows from fixture provisioning.

Never post credential values, effective token metadata, sensitive host traces, internal security reports or private screenshots in public cc-orca.
