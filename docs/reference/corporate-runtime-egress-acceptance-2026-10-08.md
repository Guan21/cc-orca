# C5 / #92 Corporate runtime acceptance boundary — 2026-10-08

Host Control Plane: **ACCEPTED**. Optional VM inactive-path: **NO AUTOMATIC EGRESS**.
Real VM active-mode: **NOT YET ACCEPTED, TRACKED SEPARATELY** in
[#97 — Validate Corporate Ephemeral VM Active-Mode Egress](https://github.com/Guan21/cc-orca/issues/97).

This corrects the earlier interpretation in the VM acceptance report. It changes acceptance
scope only; the #89 Network Contract, Host gate, static scanner, baseline and provider runtime
architecture remain unchanged. The contract still applies whenever an optional runtime is used.

## Product architecture evidence

Ephemeral VM is an optional, explicitly selected execution environment, not a requirement for
Corporate builds or normal provider execution. A Corporate user can operate entirely on Host.

- `src/shared/default-global-settings.ts`: `experimentalEphemeralVms` defaults to `false` and
  `activeRuntimeEnvironmentId` to `null`.
- `src/renderer/src/runtime/runtime-client-target.ts`: `getActiveRuntimeTarget` returns `local`
  without a selected environment.
- `src/renderer/src/components/settings/EphemeralVmsExperimentalSetting.tsx`: the switch exposes
  repo-owned, on-demand environments; changing it updates the feature flag.
- `src/renderer/src/hooks/useEphemeralVmRecipeOptions.ts`: disabled discovery returns without
  probing recipes; recipe discovery does not implicitly select a recipe.
- `src/renderer/src/hooks/composer-state/quick-creation-execution.ts`: VM execution requires an
  enabled feature, selected recipe, ready target and trust decision. Otherwise provider routing
  uses the workspace execution host, falling back to local.
- `src/renderer/src/lib/ephemeral-vm-worktree-creation.ts`: without `ephemeralVmRecipe`, creation
  returns the original request before provisioning, event subscription or VM setup.
- `src/main/ipc/ephemeral-vm.ts`: provisioning starts through the explicit
  `ephemeralVm:provision` handler with repository/recipe arguments. Startup only registers handlers;
  runtime listing reads persistence rather than creating a VM.
- `src/shared/corporate-build-profile.ts`: Corporate allows Claude/Codex and disables SSH/cloud
  capabilities by default. This does not mandate a VM or establish acceptance of every active
  remote route; those gates remain unchanged.

No product contract requires all Corporate provider execution to occur inside a VM. The existence
of VM provisioning/SSH infrastructure is not evidence of such a requirement.

## Required C5 / #92 acceptance

1. Normal Host lifecycle (cold start, focus, hide/show, restore, Settings, Help/Support, terminal
   idle and 30-second idle) produces **zero unexpected Host Internet attempts**.
2. Claude/Codex credential presence alone produces **zero provider launches and unexpected
   egress**. Explicit provider actions retain `provider-specific-egress` attribution.
3. Explicit browser/support actions retain `user-initiated-egress` attribution and configured
   destinations. Disabled capabilities remain quiet; forbidden destinations fail with sanitized
   destination/category diagnostics. SCM/plugin policy semantics remain protected by #89 tests.
4. When no VM is provisioned or the VM feature is not invoked, there is **no background VM
   provisioning, VM provider launch, VM-related Internet request or implicit VM network activity**.
5. The #91 static gate remains complementary: **baseline 0 / new violations 0**.

The required release command remains `pnpm run test:corporate-egress`, already used by
`.github/workflows/pr.yml` in the Windows package lane. The Host test implementation is retained.

## Evidence and result

The accepted Host evidence at PR head `a4d90dc91d2340cfee3a97b707c262459ea32683` records all
listed lifecycle scenarios passing, unexpected Host egress **0**, Claude/Codex credential-only
launches **0**, and explicit Claude/Codex/Report Bug/Team Support attribution passing.

Inactive-path evidence combines this Host runtime observation with repository call-path inspection
and semantic regression coverage:

- `useEphemeralVmRecipeOptions.test.tsx`: disabled feature performs no recipe discovery.
- `runtime-rpc-client.test.ts`: no selected environment resolves to local execution.
- `ephemeral-vm-worktree-creation.test.ts`: normal Claude/Codex workspace requests with no recipe
  perform no VM preparation, provisioning subscription, folder setup or creation-state mutation.
- Corporate build/preload capability tests, Host observer/installation tests and #89 contract tests
  retain disabled-path and fail-closed coverage.

These establish the inactive optional-feature boundary; they do not measure an active guest.
The targeted semantic run passed **133 tests across 10 suites**, including preserved VM guest guard
and prerequisite tests. No app was launched during this scope correction. Existing focus/visible
window tests were not rerun on the user's desktop; their previously accepted Host/CI evidence is
retained. The static scanner was rerun with baseline **0** and new violations **0**.
Node/CLI/web typecheck passed. Changed-file native/type-aware/React quality checks found zero
new findings; formatting and diff checks passed. Independent scope review found no major issues.

| #92 acceptance item               | Result                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| Host Control Plane                | PASS / ACCEPTED                                               |
| Host unexpected egress            | 0                                                             |
| Credential-only providers         | 0 launches / 0 unexpected egress                              |
| Explicit provider attribution     | PASS                                                          |
| Explicit navigation attribution   | PASS                                                          |
| Ephemeral VM automatic activation | NONE                                                          |
| VM feature inactive egress        | 0 automatic VM-related attempts in the accepted Host boundary |
| Real VM active-mode acceptance    | FOLLOW-UP #97; NOT YET ACCEPTED                               |
| Static baseline / new violations  | 0 / 0                                                         |
| #92                               | READY TO COMPLETE after PR #96 merge                          |

## Independent active VM gate

Real provision/ready, 30-second guest idle, guest firewall observation, Claude/Codex/SCM guest
execution and attribution, and real cleanup belong to #97. Actual active VM unexpected egress
is **UNKNOWN / UNMEASURED**. No successful real VM acceptance run is claimed.

Retain `.github/workflows/corporate-vm-egress.yml`,
`config/scripts/run-corporate-vm-egress-tests.mjs` and its tests, the guest egress guard/evidence,
execution trace, VM E2E/session/Git fixtures and semantic tests, and both VM acceptance documents.
The VM command remains fail closed. `test:corporate-egress:all` explicitly opts into Host plus
required active VM acceptance; it is not a required C5 completion command.

See [VM setup and limitations](corporate-vm-egress.md). #97 requires a self-hosted Windows x64
runner labeled `corporate-ephemeral-vm`, a staged provider/recipe and repository variables
`CORPORATE_VM_RECIPE_REPO` and `CORPORATE_VM_RECIPE_ID`.

## Parent #14 and PR readiness

#89 Network Contract, #90 Existing Remediation and #91 Static Guard are closed. #92 satisfies
the corrected runtime verification boundary. Recommend merging PR #96, completing #92 and then
closing #14; #97 remains open independently. This is C5 acceptance readiness, not a claim that
repository-wide CI is fully green or permission to bypass branch protection.

Existing CI on `a4d90d` passed typecheck, static analysis, test shards 1–8, Linux/Windows packaging,
Windows native smoke, Computer-use E2E, mac-native-owner-smoke, changed E2E and PR test LoC.
The unrelated cross-version wire compatibility job fails because required release tags are absent
(`v1.4.190` cannot resolve); its aggregate `verify` job also fails. That infrastructure debt remains
outside this scope. Fresh pushed-commit CI status must be assessed under normal merge policy.
