# DevCrew Personal Pilot — parallel QA fixture preparation

Tracking: #184, #153 and #181. Development runs independently under #183.
Status: FIXTURE ONLY; DevCrew real Source and installed E2E NOT EXERCISED.

This public-repository folder contains NON-SECRET example source files and an operator-controlled setup script. It is deliberately nested under docs/, so it does not add or trigger a GitHub Actions workflow in cc-orca itself.

## Operator: create the isolated Private test repository

1. Copy this directory locally from the Draft QA PR or the downloaded fixture ZIP. Run PowerShell 7 with Git and GitHub CLI installed on your own Windows computer.
2. From this folder, run: pwsh -NoProfile -File ./operator/setup-private-qa.ps1
3. Default operation is a DRY RUN; no changes are made.
4. Only after reviewing the target and local Git/GitHub access, run: pwsh -NoProfile -File ./operator/setup-private-qa.ps1 -Apply
5. The script creates an *isolated Private* Guan21/devcrew-personal-pilot-qa repository, pushes only repo-seed/ to the new main, pushes a safe pilot/one-pr branch and opens an unmerged Pull Request. It checks PRIVATE visibility before PR creation.
6. Inspect the newly created repo visibility, PR number, HEAD SHA and real GitHub Actions checks in GitHub. Do not post credentials, credential metadata or sensitive device logs in public cc-orca.
7. If a step fails after repository creation, inspect the partial remote manually: the script intentionally refuses reuse/overwrite of an existing repo.

The connected GitHub app does not expose a create-repository action. This script is an operator action, not something executed by ChatGPT or the DevCrew app.

## Test order

- Phase W: Windows x64 packaged Personal only, after a separately approved exact-SHA live source test under #151.
- Phase M: macOS arm64 packaged Personal, then Intel x64 if supported by the V1 release contract.
- Verify actual GitHub PR/HEAD/Checks observation and negative cases in #153 on installed native artifacts. GitHub-hosted Action PASS is **not** native DevCrew QA.
- Pilot fixture setup and GitHub Actions may be prepared in parallel with development #183. App real-source E2E must NOT start until #151 security prerequisites and explicit Owner approval.

## Security boundary

Current state: #151 OPEN, #153 NOT EXERCISED, #148 V1 NO-GO.
No application GraphQL, Keychain/Credential Manager, native gh, token inspection, production Source/Renderer enablement, merge or authorization is performed by this fixture.
