# Issue #103 — Impact assessment and staged implementation contract

> Status: **design-only, no runtime change**. Baseline: `fix/issue-100-corporate-cli-skills-cleanup` @ `56a2dab03d85276dc3f772eebea467041533c0b6` (PR #102, still Draft). Parent: #103.
> Scope: Corporate DevCrew first. This report lists verified primary touchpoints, not an exhaustive call-site census; full dependency scan and test inventory remain a Phase A entry gate.

## Findings from actual code

1. `src/main/hooks.ts` hard-codes `orca.yaml` in `loadHooks`, `hasHooksFile` and unknown-key inspection. `src/main/hooks-config-compatibility.test.ts` deliberately rejects a `devcrew.yaml`-only repo and makes `orca.yaml` authoritative when both files exist. **Changing UI text alone does not enable the new configuration.**
2. `src/main/ipc/hooks/register-worktree-hook-check-handler.ts`, `src/main/ipc/hooks/register-worktree-hook-file-handlers.ts`, and `src/main/runtime/runtime-repository-hooks-commands.ts` each independently read `orca.yaml` for SSH/remote paths. A local-only loader change would make settings/actual execution inconsistent.
3. `src/main/issue-command-file.ts` reads the shared config through `loadHooks` but retains the separate **local override** `.orca/issue-command`. Keep local overrides and workspace paths untouched.
4. `src/main/effective-hook-config.ts` merges committed hooks with local scripts under `shared-only`/`local-only`/`run-both`, controls setup policy and the default-tab command trust content. The YAML can carry setup, archive, issue command, default tabs, environment recipes and worktree shared-directory defaults; new source selection may change executable behavior.
5. `src/shared/orca-yaml.ts` already parses the supported schema with bounds. **Reuse the parser/schema**; do not duplicate or rename the internal types or persisted data just to change the filename.
6. `src/main/cli/cli-install-location.ts` returns `orca` for packaged macOS, chooses `/usr/local/bin/orca` or `~/.local/bin/orca`, and uses PATH first-match discovery. `src/main/cli/cli-installer.ts` installs/removes one command; the supporting inspection, quarantine, privilege and rollback helpers must be preserved.
7. `src/main/cli/bundled-cli-launcher-path.ts` ships `resources/bin/orca`; `src/main/ipc/cli.ts` exposes `cli:getInstallStatus`, `cli:install`, `cli:remove`. `src/renderer/src/components/settings/CliSection.tsx` and `AgentSkillSetupPanel.tsx` show/execute the reported command. An npm `bin.devcrew` alias exists in PR #102, **but the packaged macOS `devcrew` command is not yet registered**.
8. UI strings remain in `RepositoryHooksYamlStatus.tsx`, `RepositoryHooksSection.tsx`, `RepositoryHookPolicySettings.tsx`, onboarding/CLI Skills and JA/EN catalogs. Do not change them to advertise an unimplemented feature.

## Proposed architecture boundary

Introduce one **project configuration resolver** between filename discovery and the existing YAML parser. It must return a structured result including `status` (`absent` / `loaded` / `invalid` / `conflict` / `io-error`), `sourceFilename` (`devcrew.yaml` / `orca.yaml` / null), and parsed contents when valid.
Use the SAME selection and error contract for local, SSH-provider and applicable runtime APIs. Do not replace errors with `hasHooksFile: false`, and do not allow a conflicting/malformed file to silently fall through to the other filename.
Source filename must survive far enough for UI diagnostics, remote RPC and trust approval to distinguish a newly introduced config from an old, previously approved one. Preserve all existing command source policies, script approval and network restrictions. Audit persisted discriminated unions currently containing literal `orca.yaml` before extending types.

### Filename decision table (Corporate only)

| Files in repo root | Safe expected Corporate behavior |
| --- | --- |
| Neither | Report `absent`. Do not auto-create a file merely from adding an existing repository. New-project templates propose `devcrew.yaml`. |
| Only valid `devcrew.yaml` | Load it using the existing bounded YAML parser; normal, separately gated hook execution and trust rules apply. |
| Only valid `orca.yaml` | Load legacy config unchanged; display its actual source and compatibility explanation. |
| Both files (valid or invalid) | Report `conflict` explicitly, do not auto-select or auto-execute shared hooks; require explicit user resolution. Preserve BOTH files byte-for-byte. |
| Single invalid file | Report `invalid`, do not guess/fallback; do not auto-run shared hooks. |
| SSH read/stat unavailable | Report `io-error`, not `absent`, unless the provider unequivocally reports ENOENT for both candidates. |
| Default non-Corporate build | Keep current `orca.yaml`-only discovery and runtime semantics. |

**Approval hazard:** Current trust computation for default-tab commands is derived from script content. Audit whether filename/source changes can reuse an approval unexpectedly. New `devcrew.yaml` commands must not inherit approval merely from matching previously trusted legacy content unless an explicitly justified contract proves this safe. Legacy approvals should remain valid for unchanged `orca.yaml`.
**Mixed clients:** An old Orca binary will not automatically understand `devcrew.yaml`. Document this compatibility boundary. Avoid writing both files as a workaround.

## Verified impact inventory

| Domain | Primary paths | Review/test focus |
| --- | --- | --- |
| Local loader | `src/main/hooks.ts`, `src/main/hooks-config-compatibility.test.ts` | precedence, malformed YAML, no unsafe fallback, schema bounds |
| SSH / runtime | `src/main/runtime/runtime-repository-hooks-commands.ts`, `src/main/ipc/hooks/register-worktree-hook-check-handler.ts`, `src/main/ipc/hooks/register-worktree-hook-file-handlers.ts` | consistent source and failure state across hosts |
| Issue command | `src/main/issue-command-file.ts`, `.orca/issue-command` local override | local override priority, no user-data migration |
| Script / trust | `src/main/effective-hook-config.ts`, shared hook policy and trust paths | setup/archive/default tabs, approval hash, `local-only`, `run-both` |
| CLI location | `src/main/cli/cli-install-location.ts`, `cli-installer.ts`, `cli-command-inspection.ts`, `cli-command-installation.ts`, `cli-command-filesystem-transaction.ts`, `cli-install-constants.ts` | ownership, conflict, registration, rollback, removal, PATH |
| Packaged CLI bridge | `src/main/cli/bundled-cli-launcher-path.ts`, `src/main/ipc/cli.ts`, macOS installer tests | executable packaged arm64 launcher, legacy alias |
| UI | `src/renderer/src/components/settings/{RepositoryHooksYamlStatus,RepositoryHooksSection,RepositoryHookPolicySettings,CliSection,AgentSkillSetupPanel}.tsx`, onboarding, locales | truthful labels, EN/JA, dynamic actual config source |
| Baseline constraints | Corporate preload and network policies introduced by #99/#100 | no remote reopening or unrelated rewrite |

## Incremental delivery (separate PRs; no broad rename)

**Phase 0 — this document:** make impact/behavior explicit. No runtime changes. Confirm filename/CLI compatibility contract before coding.

**Phase A — Config resolver only:** add shared source selection abstraction and tests; wire local/SSH/runtime/IPC paths to it; preserve schema and existing execution engine. Add conflict and invalid states, source metadata and trust-policy tests. Do not change packaged CLI, user data paths or branding claims yet. Base on PR #102 integrated SHA or an approved later descendant, with PR explicitly stacked against its parent until merged.

**Phase B — macOS packaged CLI:** register `devcrew` as the primary command in Corporate **without removing or replacing** `orca`. Keep `orca` working, add managed symlink ownership checks, idempotent install/status/remove and rollback. Verify real ARM64 package and both CLI aliases. Leave Linux/Windows/WSL unchanged; record separate feasibility findings.

**Phase C — UI/EN/JA and packaged acceptance:** dynamically show active YAML source; advertise `devcrew.yaml` on new projects and `devcrew` only after working install. Keep legacy paths untouched. Build pinned Corporate M2 DMG, record SHA256, manually test startup/history, CLI Skills, new + legacy project configs, collisions, trust prompts and no undeclared egress.

## Mandatory test matrix

- Config: no file, devcrew-only, orca-only, both, malformed devcrew-only, malformed orca-only, dual with malformed, unreadable/non-binary/oversized, symbolic-link/path safety, new project vs existing repo import.
- Hooks: setup, archive, issue command, default tabs, environment recipes, shared directories; all source policy modes; no execution on conflict; trust prompts and unchanged legacy approvals.
- Runtime: local/SSH and any supported WSL/remote paths; source and error parity; disconnected provider fail-closed.
- CLI macOS: pre-existing user `orca`, absent `/usr/local/bin`, writable `~/.local/bin`, PATH shadowing, foreign command at `devcrew`, stale/broken symlink, partial install rollback, ownership-aware uninstall; installed arm64 binary and Skills offline path.
- Compatibility: unchanged default build, #99 Session History, #100 local Skills, Corporate external egress deny, existing `/orca/workspaces` and `.orca` user data untouched.

## Stop / rollback gates

1. Never overwrite/delete/migrate existing `orca.yaml` or `.orca` state as a rename side effect.
2. Do not merge Phase A with missing/contradictory source or approval semantics.
3. Do not ship a UI change promising an absent packaged `devcrew` binary.
4. Do not merge PR #102, #103 phases or close #99/#100 without separate authorization and M2 acceptance.
5. Each phase requires focused tests, typechecks, Corporate build, code-quality/forbidden-endpoint scan and GitHub CI before the next phase.

## Open review points before Phase A

- Exact trust-store identity: does source filename need a versioned, source-separated approval key? Determine via actual read/write code paths and tests.
- Inventory all direct `orca.yaml` readers and source literal types (including worktree/archive/remote pathways), not only the primary files listed here.
- Confirm how a new project is represented: new repository initialization vs adding an existing repository; do not implicitly create/commit an executable config.
- Determine whether `devcrew` CLI installation is single alias or dual managed entries, including atomicity and uninstall behavior. This requires separate Phase B design review.

Design-only investigation complete at identified primary entrypoints. **No runtime tests executed for this document**, and no claim of exhaustive repository-wide search is made.
