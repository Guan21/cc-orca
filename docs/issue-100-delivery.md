# Issue #100 delivery record

Base: company-work at `244767ebd1ffdf213cc89ca2648d2ac1c088e1c1` (re-fetched unchanged before delivery).
Branch: `fix/issue-100-corporate-cli-skills-cleanup`.
The final commit SHA and PR URL accompany the delivery message; the PR targets company-work and must not be merged or close #100 before acceptance.

## Root causes and decisions

- Existing DevCrew branding retained executable/config contracts without explaining them; onboarding still selected internet-backed Skill commands.
- Corporate disabled the entire Skills surface, including filesystem inspection, through one broad remote capability gate.
- Jira/Linear lacked Corporate guards before credentials, SDK construction and HTTP.
- Packaged CLI validation honored its Corporate marker while Skills handlers trusted the ambient shell profile. A real compiled-artifact probe reproduced this mismatch; handlers now use the packaged resolver.
- WSL bridges execute the host CLI and cannot install into the caller's filesystem. Corporate setup now declares this-device scope and consistently selects host registration, terminals and discovery; forwarding guards remain intact.

CLI: npm exposes canonical `devcrew` alongside `orca`, both using the same dispatcher. Desktop registration preserves `orca` on macOS/Windows and `orca-ide` on Linux/WSL; `orca-dev` remains isolated. Native launchers/PATH ownership and existing scripts remain intact.

Configuration: no migration. `orca.yaml` stays authoritative; `devcrew.yaml` is unsupported and never a fallback, even after malformed legacy config. No workspace/config directories or existing worktrees are moved or deleted.

Skills: the broad capability stays disabled. Explicit filesystem discovery/inspection, the constant deletion-support probe, and existing local deletion operations are allowed. Trusted packaged `orca-cli`/`orchestration` resources install offline for Claude/Codex/universal. Existing ordinary Skill files are preserved and reported unchanged while missing topics install. No upstream installer material or dependency was introduced. Marketplace, download, sharing, updates and Linear integration topics stay restricted. Corporate remote-target CLI flags fail before dispatch.

Integrations/security: no new external destination, allowlist, OAuth flow, download or capability bypass. Saved tokens and user-entered sites do not constitute administrator approval. Corporate Jira/Linear operations fail before credentials, SDK, proxy or HTTP; default-build behavior remains supported. The packaged Skills verifier now checks Corporate artifacts rather than skipping them.

## Simplifications

Reuse the existing packaged profile resolver, network contract, runtime-scoped discovery cache and UI primitives. Remove Corporate remote actions and eager status/share fetches. Keep a narrow shared offline method allowlist across preload/IPC/RPC. Extract existing command preview code only to meet file limits; no new max-lines suppression.

## Verification on Windows / Node 24

Counts below are per run and overlap; they must not be summed as unique tests.

| Check | Evidence |
| --- | --- |
| Jira/Linear and configuration regression set | 32 files, 283 tests passed |
| Skills and network contract set | 11 files, 193 tests passed; final local policy/preload/IPC/RPC set: 4 files, 45 passed |
| CLI/package contract set | 5 files, 73 tests passed; final CLI compatibility/installer/parser run: 7 files, 110 tests passed |
| Core renderer regression set | 6 files, 76 tests passed |
| Explicit host discovery and existing hook regressions | 5 files, 40 tests passed |
| Wider renderer and platform CLI checks | 120 renderer tests passed with 1 existing Windows skip; earlier CLI/package set 79 passed with 14 platform skips |
| TypeScript 7 Node project | Four serial batches covering all 6,451 production/declaration roots and 4,500 test roots: passed |
| TypeScript 7 Web project | Four serial batches covering all 7,623 production/declaration roots and 4,404 test roots: passed |
| CLI types | Standard pnpm tc:cli passed; build:cli also typechecks/emits |
| Changed quality gates | Native lint, type-aware lint and React Doctor passed with zero new findings |
| Static security | Forbidden endpoint scan: 12,328 files, zero new forbidden destinations; Corporate branding audit passed |
| Ratchets | Max-lines, runtime-Electron and ts-nocheck passed, no new exceptions |
| Localization | Full EN/JA catalog validation and runtime English coverage passed; actual i18next EN/JA Corporate keys resolved |
| Builds | CLI and complete Corporate main/preload/renderer build passed; renderer boot graph: 347 chunks, 4,358.7 KB minified. Final CLI/main/preload recomposition follows the last installer fix. |
| Composed CLI artifact | Default profile: 555 closure files, five probes passed. Corporate marker against default shell override: six guarded probes and real local Claude/Codex installation passed. Final repetition also checks preserved existing instructions and remote flags. |

The monolithic checker exceeded this host's memory budget. Batches derive from the original project file lists, retain every production/declaration root, distribute test roots, and disable composite/incremental metadata without emitting code. All configured roots are covered; this is not a claim that the monolithic pnpm tc command completed here.

Build diagnostics include large-chunk and CSS ::highlight minifier warnings; this change adds no CSS rules. The English runtime verifier accepts two harmless retained entries. No unavailable runtime check is marked passed.

## Acceptance still required

No packaged M2 Mac application, actual Electron renderer screenshots, isolated VM traffic capture or native-focus desktop test was run here. The existing lifecycle egress test invokes native focus/show operations and must remain on isolated display/CI. This PR remains draft until the required visual proof and Mac acceptance are available.

[M2 acceptance checklist](issue-100-corporate-cleanup.md#m2-mac-acceptance-checklist): package the final SHA; capture EN/JA onboarding/CLI/Skills/integration screens; run existing orca commands and legacy config/worktrees; install/recheck bundled Skills offline; verify custom instructions remain unchanged; prove marketplace/Linear/Jira stay disabled; capture zero undeclared startup/settings/idle traffic; regression-check default build behavior.

## Issue #99 coordination

No Session History implementation is changed. Shared integration points are `src/preload/corporate-preload-api-filter.ts` and its tests. Preserve #99's declared local aiVault exception and #100's declared local Skills exception together; both broad capabilities must remain disabled. Neither PR merges the other's implementation.

## Modified files (86)

- `config/electron-builder.config.cjs`
- `config/scripts/corporate-build-profile-contract.test.mjs`
- `config/scripts/verify-skills-cli-runtime.cjs`
- `config/scripts/verify-skills-cli-runtime.test.mjs`
- `docs/issue-100-cli.md`
- `docs/issue-100-corporate-cleanup.md`
- `docs/issue-100-delivery.md`
- `docs/issue-100-integrations.md`
- `docs/issue-100-skills.md`
- `docs/issue-100-ui.md`
- `package.json`
- `src/cli/args.test.ts`
- `src/cli/args.ts`
- `src/cli/cli-package-alias.test.ts`
- `src/cli/handlers/bundled-skill-guide-table.ts`
- `src/cli/handlers/corporate-bundled-skill-install.test.ts`
- `src/cli/handlers/corporate-bundled-skill-install.ts`
- `src/cli/handlers/corporate-packaged-skills.test.ts`
- `src/cli/handlers/corporate-skills.test.ts`
- `src/cli/handlers/skills.ts`
- `src/main/cli/cli-branding-copy.test.ts`
- `src/main/cli/cli-branding-copy.ts`
- `src/main/hooks-config-compatibility.test.ts`
- `src/main/ipc/skill-ipc-main-window.test.ts`
- `src/main/ipc/skill-ipc-main-window.ts`
- `src/main/jira/authenticated-request.ts`
- `src/main/jira/client.test.ts`
- `src/main/jira/client.ts`
- `src/main/jira/corporate-request-boundary.test.ts`
- `src/main/jira/site-credential-store.ts`
- `src/main/linear/client.test.ts`
- `src/main/linear/client.ts`
- `src/main/linear/corporate-sdk-boundary.test.ts`
- `src/main/linear/linear-sdk.ts`
- `src/main/linear/linear-token-store.ts`
- `src/main/runtime/rpc/methods/skills.test.ts`
- `src/main/runtime/rpc/methods/skills.ts`
- `src/preload/corporate-preload-api-filter.test.ts`
- `src/preload/corporate-preload-api-filter.ts`
- `src/renderer/src/components/feature-tips/CliSkillSetupTerminal.test.tsx`
- `src/renderer/src/components/feature-tips/CliSkillSetupTerminal.tsx`
- `src/renderer/src/components/feature-tips/FeatureTipsModal.tsx`
- `src/renderer/src/components/feature-wall/AgentCapabilitiesSetupAction.test.ts`
- `src/renderer/src/components/feature-wall/AgentCapabilitiesSetupAction.tsx`
- `src/renderer/src/components/feature-wall/agent-capability-setup-status.ts`
- `src/renderer/src/components/onboarding/FeatureSetupInlineTerminal.tsx`
- `src/renderer/src/components/onboarding/IntegrationsStep.tsx`
- `src/renderer/src/components/onboarding/onboarding-feature-setup-runtime.ts`
- `src/renderer/src/components/onboarding/onboarding-feature-setup.test.ts`
- `src/renderer/src/components/onboarding/onboarding-feature-setup.ts`
- `src/renderer/src/components/settings/AgentSkillSetupCommandPreview.tsx`
- `src/renderer/src/components/settings/AgentSkillSetupPanel.test.tsx`
- `src/renderer/src/components/settings/AgentSkillSetupPanel.tsx`
- `src/renderer/src/components/settings/CliSection.tsx`
- `src/renderer/src/components/settings/IntegrationsPane.test.tsx`
- `src/renderer/src/components/settings/IntegrationsPane.tsx`
- `src/renderer/src/components/settings/OrchestrationPane.test.tsx`
- `src/renderer/src/components/settings/OrchestrationPane.tsx`
- `src/renderer/src/components/settings/RepositoryHooksYamlStatus.tsx`
- `src/renderer/src/components/settings/TaskSourceLinearSetup.tsx`
- `src/renderer/src/components/settings/TaskSourceSimpleSetup.test.tsx`
- `src/renderer/src/components/settings/TaskSourceSimpleSetup.tsx`
- `src/renderer/src/components/settings/agent-skill-setup-panel-props.ts`
- `src/renderer/src/components/settings/jira-integration-card.tsx`
- `src/renderer/src/components/settings/settings-capability-section-renderers.tsx`
- `src/renderer/src/components/settings/task-tracker-integration-cards.tsx`
- `src/renderer/src/components/settings/use-integration-provider-status-refresh.ts`
- `src/renderer/src/components/skills/SkillsFilterToolbar.tsx`
- `src/renderer/src/components/skills/SkillsList.tsx`
- `src/renderer/src/components/skills/SkillsPage.test.tsx`
- `src/renderer/src/components/skills/SkillsPage.tsx`
- `src/renderer/src/components/skills/SkillsPageHeader.tsx`
- `src/renderer/src/components/skills/use-owned-skill-shares.ts`
- `src/renderer/src/hooks/useInstalledAgentSkills.runtime-override.test.tsx`
- `src/renderer/src/hooks/useInstalledAgentSkills.ts`
- `src/renderer/src/i18n/en-runtime-required.json`
- `src/renderer/src/i18n/locales/en.json`
- `src/renderer/src/i18n/locales/ja.json`
- `src/renderer/src/lib/agent-skill-cli-prerequisite.ts`
- `src/renderer/src/store/slices/ui/ui-slice-corporate-profile.test.ts`
- `src/renderer/src/store/slices/ui/ui-slice-view-actions.ts`
- `src/shared/corporate-build-profile.test.ts`
- `src/shared/corporate-build-profile.ts`
- `src/shared/corporate-integration-policy.ts`
- `src/shared/corporate-skills-policy.test.ts`
- `src/shared/corporate-skills-policy.ts`
