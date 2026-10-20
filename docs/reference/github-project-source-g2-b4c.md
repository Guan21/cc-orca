# G2-B4c — Main integration and security proof

Tracking #152; source #116; security #151; release #148; native QA #153.
Corporate Source **DISABLED**. V1 **NO-GO**. No live activation is authorized.

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
   test folder/worktree membership, remote denial and missing Store data.
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

Real Store snapshots are available, but the current application has no trusted
Main current-selection lifecycle service. Renderer workspace selection is not
authorization. Bootstrap and mutation/selection event wiring must stay explicitly
UNWIRED until B5 supplies reviewed Main adapters. The coordinator is executable
offline and installs no IPC, preload, UI, credential storage or egress policy.

Actual keyring provenance, effective account/config generation, repository and
Checks permissions, OS executable/library/config replacement prevention,
redirect/retry confinement and process-tree termination remain **NOT VERIFIED**.
Missing providers leave **LIVE_SOURCE_BLOCKED**. Login proof alone does not prove
repository/Checks permission; valid JSON and green CI do not prove real-source ACLs.

## Verification record

Real GitHub E2E is **NOT EXERCISED**. Tests use fake Electron, cached credential
attestations, executable bytes and process termination callbacks, never real gh.

## Main call flow and decisions

`Store.getProjects/getProjectHostSetups/getRepos/getWorktreeMeta` →
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

The real Store adapter is present; `main-process-state.ts` owns the actual Store.
`index.ts` and `startup/main-process-ipc-bootstrap.ts` install no B4c consumer.
Existing GitHub Project View IPC is a separate broader feature and is not reused
as G2 authority. Main bootstrap/current selection/mutation wiring remains explicitly
**UNWIRED / BLOCKED**; polling cannot prove a deletion/recreation that went unseen.
Folder workspaces and explicitly owned worktree instances are supported by the
adapter; SSH/WSL/paired/runtime hosts never fall back to native execution.

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

New offline tests: **74**. Focused + G1 regression: **322 PASS across 14 files**.
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
