# G2-B4c — Main integration and security proof

Tracking #152; source #116; security #151; release #148; native QA #153.
Corporate Source **DISABLED**. V1 **NO-GO**. No live activation is authorized.

Task C continuation: [Trusted Main selection producer](./github-project-source-g2-b4c-task-c.md)
records the native Main selection entry, producer, runtime validation and lifecycle.
Historical Task A/B status below applies to their recorded commits.

Task B continuation: [Main selection and coordinator lifecycle](./github-project-source-g2-b4c-task-b.md)
records the default-disabled foundation/window/profile/relaunch wiring and its
offline review. The historical Task A records below retain their original scope.
Production has no authoritative Main selection producer or verified credential/
confinement provider; current selection remains UNAVAILABLE, live activation BLOCKED.

## Task B current disposition — PARTIAL / BLOCKED

Task A HEAD stays `a3b6e4246b5c2cad5ac5763eef7d18ca1fd74846`. Task B's
[source-of-truth, architecture, validation and review ledger](./github-project-source-g2-b4c-task-b.md)
records disabled Main window/profile/restart wiring, shared Coordinator/Runner
reentrancy fixes, restart grant-isolation tests and the Main Store mutable-reference
repair. Public source-record inputs/results are detached; internal identity-CAS
scan expectations remain private. Supported Store writes still revoke before debounce.
Task B adds 110 tests relative to Task A, including 32 real-Store ownership cases;
focused source/authorization/startup verification is 516 PASS. A wider local
Windows POSIX-path fixture diagnostic retains its FAIL status separately.

No trustworthy production Current Selection producer is available. Consequently
Task B **does not meet** `B4c TASK B OFFLINE INTEGRATION COMPLETE`; production
Selection is UNAVAILABLE and Coordinator is default disabled. AI review is not
independent human safety approval or Owner acceptance of real runtime risk.
Final SHA, exact Actions/test-LoC results and Bot #156 disposition are recorded on
Draft #162 and tracking #152 without overwriting Task A history. #116/#151/#152/#153
stay OPEN. LIVE GITHUB SOURCE BLOCKED; REAL CREDENTIAL / CHECKS ACL and NATIVE
CONFINEMENT NOT VERIFIED; INSTALLED-APP E2E NOT EXERCISED; CORPORATE SOURCE DISABLED;
V1 RELEASE NO-GO. No public privileged IPC/preload, live call, merge or release.

## Baseline and implementation plan

The latest #161 HEAD was verified on 2026-10-20 as
`cb3b96fe2c4c9cbcd3ef281d7bcbd7bb80a9fd84`, unchanged from the requested SHA.
The dependency stack is #157 → #158 → #159 → #160 → #161, all unmerged.
Base checks: 17 SUCCESS / 10 SKIPPED; AI COMMENT review, no independent approval.
The #151 Solo Maintainer exception permits this offline implementation while all
23 controls and Owner exact-SHA live-risk acceptance remain mandatory.

Use the existing B2 registry, B3 Electron origin/native consent, B4a repository
registration and B4b transport. A second authentication system would duplicate
security state. Direct renderer identity and ambient gh login are rejected as
authority. The Main-only coordinator owns action epochs and abort signals.

1. Add real Store catalog and explicit Main selection adapter with ABA revisions;
   test Worktree membership, explicit folder denial, remote denial and missing Store data.
2. Extend the B2/B3 execution interface compatibly with immutable operation scope;
   preserve native read consent and consume grants once per operation.
3. Compose separate default-Cancel repository consent with B4a and B4b; bind every
   lease to the current Electron document, principal, catalog and selection epoch.
4. Add credential adapter/change observation with permanently retired identities;
   default NOT VERIFIED, no installed OS credential reader or success stub.
5. Move the native concurrency permit to the raw Runner boundary; test two Runner
   instances and uncertain process termination without changing timeouts.
6. Exercise offline composition with fake Electron/credential/process fixtures,
   run typecheck, lint/static analysis, formatting, regressions and Corporate scan.
7. Review Main/IPC/principal/transport boundaries; deliver a stacked Draft on #161,
   record exact-SHA CI and append #152 history. Do not merge or close issues.

## Integration boundary

The Catalog is attached to the actual Store in Main foundation and disposed on
committed shutdown. Authored Store mutations synchronously retire its selection.
The application still has no trusted Main current-selection lifecycle service;
renderer workspace snapshots do not establish authority. Coordinator/Window/
Session and selection wiring remain UNWIRED until reviewed Main adapters exist.
No IPC, preload, UI, credential storage or egress policy is installed.

Actual keyring provenance, effective account/config generation, repository and
Checks permissions, OS executable/library/config replacement prevention,
redirect/retry confinement and process-tree termination remain **NOT VERIFIED**.
Missing providers leave **LIVE_SOURCE_BLOCKED**. Login proof alone does not prove
repository/Checks permission; valid JSON and green CI do not prove real-source ACLs.

## Verification record

Real GitHub E2E is **NOT EXERCISED**. Tests use fake Electron, cached credential
attestations, executable bytes and process termination callbacks, never real gh.

## Main call flow and decisions

`Store.getProjects/getProjectHostSetups/getRepos/getUnambiguousWorktreeMetaForHost` →
`MainProjectSourceCatalog.selectCurrent` → coordinator's pinned WebContents,
Session/document/principal fence → separate default-Cancel native registration
confirmation → B4a registration → B4b fixed registration query → B3 trusted binding.

A subsequent explicit refresh obtains its own B3 default-Cancel native consent →
B2 single-use grant/context → coordinator lease with selection/binding/grant epochs →
B4b fixed selected-PR query → G1 allowlisted projection → synchronous final delivery
fence. No callback accepts renderer identifiers as authentication evidence. Every
post-await path rechecks authority. Navigation/process loss, catalog selection or
mutation, credential changes, explicit revoke and disposal abort pending work and
retire registration plus grants. Returning to old values cannot restore them.

`main-process-state.ts` owns the actual Store and its default-deny Catalog, created
in Main foundation. No coordinator consumer is installed in IPC/preload/renderer.
Existing GitHub Project View IPC is a separate broader feature, not G2 authority.
Main current selection and coordinator/Window/Session wiring remain **UNWIRED /
BLOCKED**. Store API mutations now invalidate synchronously, while arbitrary direct
reference mutation still needs explicit invalidation plus snapshot rechecks.
Only explicitly owned native Worktree instances are accepted. Folder models lack
the required mapping and are DENIED, including bare Repo IDs; no folder support
is inferred from fixture equality. SSH/WSL/paired/runtime hosts never fall back.

## Credential and confinement evidence

| Property                        | Offline evidence                                                                                          | Actual runtime status                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Login/account/config/generation | Reuse B4b principal; cached reviewed-adapter interface, synchronous invalidation, irreversible retirement | OS/keyring adapter absent: NOT VERIFIED                                                  |
| Repository permission           | Immutable identity and response linkage validation only                                                   | NOT VERIFIED; login is not permission                                                    |
| Checks permission               | Strict bounded connection/linkage validation only                                                         | NOT VERIFIED; response shape cannot prove hidden/omitted ACL fields                      |
| Executable custody              | Canonical path/stat/SHA/native image checks before and after execution                                    | Binary/library/config check-to-exec replacement prevention NOT VERIFIED                  |
| Network custody                 | Fixed github.com GraphQL operations, controlled environment, no application retry/fallback loop           | OS enforcement, gh internal redirects/retries and effective least privilege NOT VERIFIED |
| Process bounds                  | 15s deadline, AbortSignal, 1MiB response; raw runners share one permit                                    | Process-tree/OS confinement NOT VERIFIED; uncertainty retains permit                     |

No production adapter or confinement provisioner is installed. The credential
provider always reports repository/Checks permission NOT VERIFIED and live source
LIVE_SOURCE_BLOCKED. Tests' proof callbacks are fixtures, not deployment evidence.

## Authorization/revocation test matrix

| Area               | Executable offline coverage                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid flow         | Actual B2/B3/B4a/B4b composition through fake native process; independent registration/read confirmations; Repository/PR/HEAD/Checks ready projection           |
| Forgery            | Project/repo/workspace IDs, wrong main frame/window/document/Session, unapproved WebContents, remote host                                                       |
| Consent and grants | Registration/read Cancel, expiry, duplicate/in-flight operation, single-use success/failure, cross-Project reuse                                                |
| Lifecycle          | Selection A→B→A, PR change, worktree instance ownership/switch, delete/recreate, rebind, host switch, navigation, renderer loss/destruction, restart, revoke    |
| Principal          | Missing/invalid provider, account/config/generation changes, logout, restored identity, reentrant revoke/accessor substitution                                  |
| Native runner      | Cross-instance concurrent construction, uncertain termination, replacement, environment injection, no WSL/fallback, deadline/Abort, response bounds             |
| API/privacy        | 401/403/404/429 allowlisted errors, partial GraphQL errors, incomplete Checks, mismatched repository/HEAD, raw secret errors suppressed, default zero execution |

Initial delivery at `e08f38eb...`: **74 new offline tests** and **322 PASS across
14 focused/G1 files**. The Task A continuation below supersedes its fixture scope
and records additional tests and final-head evidence separately.
Node, CLI and web TypeScript projects PASS on Node 24.19.0.
Additional process/Host/rate-limit regression: **68 PASS / 5 platform SKIPPED /
1 local timeout** across 10 files. The unchanged gh spawn-boundary source scan exceeded its original
30s timeout on local Windows (275.7s). No timeout/exception/policy was changed;
this local test is not reported PASS. Final-SHA CI supplies its separate result.
Changed-code quality (base, type-aware and React Doctor): zero new findings.
Corporate Forbidden Endpoint Scanner: **12,366 files, zero known/new violations**.
Formatting and whitespace PASS. Final-SHA CI is recorded separately in the Draft
PR delivery evidence; local source-scan timeout is retained even if CI passes.

## Security review and remaining gates

AI offline security review **PASS**, after fixing: per-runner permit bypass;
reentrant credential retirement; listener failures suppressing later revocations;
restored-document in-flight revival; and B4b leaking internal nodeId into the strict
G1 Repository schema (valid reads were otherwise rejected). No independent human
approval or Owner exact-SHA live-risk acceptance is claimed.

B5 must provide a Main-owned selection/mutation lifecycle owner, bootstrap the
exact Window/WebContents/Session/profile, authenticate its new IPC/preload methods,
pin expected HEAD and preserve synchronous delivery authorization. No new IPC,
preload, UI, dependencies, durable token/source storage or network policy is added.

G3 requires Owner exact-SHA acceptance of the architecture/schema, Main/IPC,
network/privacy and native-QA matrices; an explicitly authorized test repository
and named QA owner; real least-privilege keyring account/config/generation and
repository/Checks evidence; enforceable OS binary/library/config/network/process
custody; separately authorized actual GitHub reads; and installed Windows/macOS
negative/positive acceptance. CI packages do not supply those proofs.

Status: **B4c OFFLINE IMPLEMENTATION COMPLETE** only after final checks recorded
in the Draft; **LIVE SOURCE ACTIVATION BLOCKED**; **REAL GITHUB E2E NOT EXERCISED**.
No merge, issue closure or V1/Corporate readiness is authorized.

## Task A continuation — real Main catalog boundary

Follow-up to `e08f38eb84724bee223610a7ba1aef3a80761e1b`, 2026-10-20.
The first offline fixtures incorrectly used `workspaceKind: folder` with a bare
Repo ID. Actual repo-backed folder instances and standalone FolderWorkspace UUIDs
have different identities; standalone records lack an authoritative Project/Repo/
HostSetup association. Do not infer one from display names, paths or ProjectGroup.

Implementation sequence:

1. Add regression tests that reject synthetic/real unbound folder IDs, demand
   explicit native Worktree instance ownership, and detect reentrant invalidation.
2. Reuse Store write scheduling for synchronous Main mutation notifications,
   before debounce or committed quit suppresses writes. Subscribe the Catalog and
   retire selection on every notified mutation; retain post-await snapshot fences.
3. Read host-qualified local Worktree metadata and refuse a missing provider.
   Reuse the identity map with a strict getter that refuses multiple incarnations;
   preserve existing listing winner behavior. Guard selection commits against
   mutation notifications during metadata reads.
4. Instantiate one empty/default-deny Catalog from the real Store in Main
   foundation; dispose the previous instance and retire on committed shutdown.
5. Test actual Store mutation/restart behavior, existing registration/composition,
   typechecks, lint, formatting, Corporate scanning and final-head PR checks.

This adds no credential/network/IPC authority. Main active selection remains
UNWIRED; renderer session snapshots are selectors, not source proof. Folder
selection remains DENIED until an explicit authoritative mapping exists. Store
notifications cover authored mutation APIs, not arbitrary writes through mutable
Main getter references; snapshot revalidation and live activation blocking remain.

Task A review found and corrected two Medium issues: a missing mutation provider
could still accept selections, and the listing getter could pick a winner among
competing instances. Catalog now requires the mutation subscription and validates
its unsubscribe callback; the strict getter rejects ambiguous/dangling/mismatched
host/instance/key records. An actual Store reload test preserves readable listing
behavior while denying that same record as source authority. Offline AI re-review
PASS; no independent human or actual runtime security approval is claimed.

Added Task A tests: **42** (17 catalog lifecycle, 8 actual Store, 7 scheduling,
9 strict identity, 1 registration). Existing normal-path fixtures now use real
Worktree locators and instance ownership rather than `folder = repo.id`.
The initial 74 B4c cases plus this continuation total **116 new tests**.

Additional metadata batch-pruning diagnostic: one pre-existing local Windows
failure uses POSIX `/workspace/...` fixture paths rejected by the unchanged
Windows absolute-path guard. Neither the fixture nor its safety check was relaxed.
Final Task A local checks: **364 PASS across 18 focused/G1 files**, plus **79 PASS
across 6 persistence/startup regression files**. Node/CLI/web typechecks PASS;
changed-code base/type-aware/React Doctor gates have zero new findings; format,
whitespace and Corporate scanner PASS (12,366 files, zero known/new violations).
Existing broad-process and platform-specific diagnostic failures remain historical
local results, not hidden or relabeled. Current exact-head CI is recorded in the
Draft PR and #152 after completion.
