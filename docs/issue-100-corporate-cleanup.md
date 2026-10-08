# Issue #100: Corporate CLI, Skills and legacy identity cleanup

Base: `origin/company-work`, `244767ebd1ffdf213cc89ca2648d2ac1c088e1c1`.
Branch: `fix/issue-100-corporate-cli-skills-cleanup`.
Isolated checkout: `issue-100-isolated`; no other agent checkout is modified.

## Cleanup plan and boundaries

1. Audit setup, settings, installed CLI, packaged resources, Skills and integrations; classify visible branding separately from compatibility contracts and external destinations.
2. Protect behavior with focused regression tests before changing capability or installation behavior. Reuse the existing profile, preload, installer and network policy boundaries.
3. Keep installed `orca` / `orca-ide` launchers and add an npm `devcrew` alias to the same dispatcher. Explain the installed command accurately instead of advertising an unavailable packaged name.
4. Keep `orca.yaml` as the supported project configuration filename. Explain the name and verify existing configuration on disk without moving user data.
5. Expose only declared offline Skills methods. Install trusted bundled CLI/orchestration resources locally; keep marketplace, sharing, downloads and external integration Skills restricted.
6. Default-deny Jira and Linear before credentials, SDK construction, proxy preparation or network operations. Keep default-build behavior and existing credential storage formats.
7. Update English/Japanese copy using existing design primitives. Validate unit tests, types, lint, endpoint/security checks, corporate build outputs and available background runtime checks.
8. Review the combined diff, commit using Lore trailers, push and open an independent PR against `company-work`. Do not merge or close #100.

Detailed lane audits and tests: [CLI](issue-100-cli.md), [Skills](issue-100-skills.md), [integrations](issue-100-integrations.md), [UI](issue-100-ui.md).

Packaged CLI validation exposed a separate policy propagation defect: command validation honored the package's Corporate marker, but the Skills handlers used the ambient shell profile. Both bundled topic discovery and local installation now resolve the immutable package marker, so an unset or `default` shell profile cannot select remote installation. The existing packaged CLI verifier now checks Corporate topics and bundled installation instead of skipping Corporate packages; cross-architecture builds still inspect the closure and honestly skip executable probes.

Corporate setup explicitly installs on this device for local Claude/Codex. Registration, terminal execution and installed-status discovery all select the same local host, even when a WSL/SSH project is selected. The UI explains that WSL/SSH installation is unavailable. Existing forwarding rejection stays intact; default-build runtime selection stays unchanged.

## Identity inventory

| Class | Findings | Decision |
| --- | --- | --- |
| A: visible product identity | Onboarding, General CLI settings, Skills headings/descriptions, EN/JA product text | Use DevCrew and explain retained command/config names. |
| B: compatibility contracts | `orca`, `orca.cmd`, `orca.exe`, `orca-ide`, `orca-dev`; `orca.yaml`; `orca://`; existing `/orca/workspaces`; `.orca` state; bundled skill folder names | Preserve. Do not move or delete existing files/worktrees or re-register incompatible launchers. |
| C: internal identity | `ORCA_*`, `OrcaHooks`, runtime/API/type identifiers, native helper names, app IDs, refs | Keep the existing contracts. Broad renaming is outside this bounded cleanup. |
| D: external approval boundary | Linear GraphQL/files, Jira site REST/attachments, Skill marketplace/download/sharing, legacy public support/cloud endpoints | Keep undeclared remote operations disabled. No new endpoint allowlist or bypass of #90 policy. |

## Configuration decision

`orca.yaml` contains shared setup/archive scripts, issue automation, default terminal tabs, environment recipes and shared-directory declarations. It is read by native, WSL/SSH runtime and archive-hook paths. Its filename also appears as a source discriminant in existing clients and participates in trust checks. An isolated cosmetic rename would create inconsistent host behavior and mixed-version ambiguity.

This issue deliberately implements **no configuration migration**. `orca.yaml` remains the canonical supported filename; `devcrew.yaml` is not recognized and has no precedence. When both files exist, only `orca.yaml` is read. A malformed `orca.yaml` does not fall through to a second filename. Neither file is rewritten, deleted or renamed. Existing local overrides and script-source/trust policies continue to apply. Existing workspace roots remain user-selected data locations, including paths containing `orca/workspaces`.

## Concurrent issue #99

No Session History implementation is changed. The Corporate preload filter and its tests are shared integration points: #99 adds a narrow local `aiVault` exception while #100 adds a narrow local Skills exception. Preserve both method exceptions when integrating either PR; the broad `ai-vault` and `skills` capabilities must stay disabled. #99's independent branch is `fix/issue-99-corporate-local-session-history`, also based on `244767e`.

## M2 Mac acceptance checklist

- [ ] Build and install the Corporate arm64 package from the final PR commit; record SHA and screenshots.
- [ ] Fresh onboarding and General settings show DevCrew and the actual installed `orca` command; install/check/remove CLI, then run `orca --help` and a bounded worktree command.
- [ ] Existing CLI scripts and configured workspace directories remain usable. Existing worktrees are not moved or recreated.
- [ ] Existing `orca.yaml` hooks, local overrides and script trust prompts work; filename compatibility explanation appears in English and Japanese.
- [ ] Install trusted bundled CLI/orchestration Skills for supported local agents; list/inspect their contents offline, and invoke only within the existing agent policy.
- [ ] Marketplace, remote download, sharing and `orca-linear` show accurate restricted states; attempts fail before network access.
- [ ] Jira/Linear connect, API tests, SDK use and attachment fetches remain disabled without Corporate authorization; existing tokens do not cause background activity.
- [ ] Capture traffic while opening onboarding, Skills, integrations and settings, then idle; no undeclared app-owned egress. Run #90 VM egress contract on an isolated host.
- [ ] Regression-check the default build's integrations and Skills workflows; integrate #99 separately and retain both preload exceptions.

Windows development checks do not substitute for packaged M2 acceptance. Unavailable runtime checks must be recorded as not run, not passed.
