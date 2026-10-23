# G2-B5d — production Main lifecycle retirement, deny only

Requested issue: #172, parent #152. Pinned base / Task C Draft #170:
`26dfa692ce673310e695d63ceb61b15ac1713238`.
This increment authorizes no production source, transport, credential access, privileged
IPC, Renderer facts, Corporate egress, merge or issue closure.

## Production event audit

`MainProjectSourceBootstrap.attachMainWindow()` is called by the actual Main window
factory before loading the renderer. Its lifecycle bridge receives that exact window,
the existing Main catalog and the existing adapter-less credential provider. It
synchronously retires on the following real event paths. EventEmitter tests exercise
the listener wiring; they do not prove Electron's ordering for every replacement mode.

| Domain | Actual producer and invalidation path | Missing guarantee / production coverage |
| --- | --- | --- |
| Project | `MainProjectSelectionProducer.confirmCandidate()/publish()` and `ProjectHostOperations.updateProject()` → catalog retirement → bootstrap bridge | Picker notifications follow candidate assignment; Store notifications follow mutation. Partial, unavailable for composition. |
| Worktree / host | `persistence/loading-store/worktree-identity-metadata.ts` and host-setup mutations → `scheduleSave()` → catalog | Metadata/alias/host writes precede save notification. Partial; no universal before-publication hook. Folder, SSH, WSL and relay remain denied. |
| Repository | `RepoUpdateOperations.updateRepo()` and `MainRegisteredSelectedPrRepository` | `Object.assign` precedes Store notification. Immutable registration is disabled and cannot be reconstructed from owner/name/remotes. Partial. |
| Selected PR | Main picker and worktree `linkedPR` metadata | Candidate/metadata changes precede existing notifications. Partial. |
| Window | Main window factory; actual BrowserWindow `close`, `closed`; WebContents `destroyed` | `close` retires even if canceled; existing closed/destroyed detach owners. Partial: these signals alone do not prove every identity replacement ordering. |
| Frame | Actual WebContents `will-frame-navigate`, `did-start-navigation`, `frame-created`, `did-frame-navigate`, `render-process-gone` | All retire conservatively, including subframes. Created/committed events are fallback observations, not pre-publication proof. Partial. |
| Document | `will-navigate`, `will-frame-navigate`, `did-start-navigation`; committed navigation and process-gone fallbacks | Start events retire synchronously when observed, but no universal document replacement ordering has been established. Partial. |
| Session | Exact Electron Session pinned at window attachment and checked by origin verification | No synchronous production replacement publisher; object/read-time checks cannot prove ABA coverage. Unavailable. |
| Principal | `MainCredentialEvidenceProvider` / `MainNativeGitHubPrincipal` | Production has no adapter and returns null. Orca profile authentication is not GitHub identity. Unavailable. |
| Credential | Existing provider `subscribeRevocation()` / `revoke()` / `dispose()` | Explicit revocation feeds the bridge; no real custody/replacement publisher or generation ordering exists. Partial. |
| Grant | `MainSelectedPrGrantRegistry.select/requestGrant/revoke/retireWebContents/run` | Existing revisions, cancellation and expiry fences remain. No complete subscription/expiry event producer for Task C. Unavailable. |
| Policy / readiness | `main-window-core-services.ts` pre-profile-selection, pre-signout and pre-relaunch retirement callbacks | These retire the entire bootstrap. Post-auth-mutation callbacks are fallback only; no complete ACL/Owner/readiness publisher exists. Partial. |
| HEAD | `MainTrustedSelectedPrHeadProvider` offline adapter contract | No authenticated production selected-PR HEAD producer. Local git HEAD, Renderer/cache fields and fixtures are insufficient. Unavailable. |

Store `WriteSchedulingOperations.scheduleSave()` notifies synchronously before debounce,
but **after** in-memory mutation. It prevents debounce hiding A→B→A; it does not satisfy
Task C's stronger publication contract. Catalog `selectCurrent()` does invalidate before
installing replacement selection. Reentrant selection from a retirement listener must
be rejected so a later listener cannot observe replacement before its own retirement.
This narrower guarantee does not certify Store mutations in the same domains.

## Denial behavior

The production bridge owns a default-disabled Task C composition with no authority,
provider, projection reader, readiness grants or delivery sink. Its lifecycle map is
empty and frozen. All thirteen domains remain unavailable for production composition;
partial observations are never installed as nominally complete domain subscriptions.
There is no flag or callback that lets the production bridge enable composition.

Catalog observations and actual window/navigation/credential retirement signals invalidate
the bridge synchronously. Window/document observations also clear catalog selection.
The existing integration stays `enabled: false`, the operation owner stays
`isEnabled: () => false`, and the credential provider still has no adapter. Partial or
interrupted listener installation rejects attachment; disposal attempts all independent
cleanup actions. Callback failure permanently disposes the bridge. Reentrant retirement
cannot publish authority or recursively loop.

## Remaining dependencies and evidence limits

Before enabling anything, independently review and implement synchronous pre-publication
owners for every missing domain, including Store mutations and picker publication,
Session/document/frame replacement, credential custody and principal generation, grant
expiry/replacement, policy/readiness and authenticated selected-PR HEAD. Then prove
operation cancellation, one-use receipt retirement and stale-display clearing together
with an approved Main-owned delivery sink and actual B4 registration/B3 authority.

Effective repository/Checks ACL, native executable/environment and confinement remain
unverified. Exact implementation/ADR SHA Owner acceptance under #151 and installed
Windows/macOS positive and negative QA under #153 remain blocking dependencies. #148
remains NO-GO. Offline regression success and CI cannot replace those approvals.

Issue #172's live body, current #170 head and final remote CI must be verified separately.
The task explicitly forbids real GitHub API calls; administration via the connector is
pending clarification. No unavailable remote evidence may be reported as checked.

## Local verification

- Vitest: **PASS**, 30 files / 677 tests, using the repository Vitest configuration
  against `src/main/github/project-source` and the Store write-scheduling tests.
  `ORCA_BACKGROUND_LAUNCH=1`; no app or visible Electron window was launched.
- Typecheck: **PASS**, full `pnpm tc` (Node/Main, CLI and Web projects), Node 24.21.0,
  pnpm 12.0.0, with `GOMAXPROCS=2` to bound compiler concurrency. An earlier unbounded
  attempt was interrupted after severe resource contention; it is not counted as PASS.
- Changed-source lint and formatting: **PASS** for all seven changed TypeScript files.
- Changed-code quality against the pinned base: **PASS**, zero new findings in base,
  type-aware and React Doctor scans. An initial React Doctor run failed because a pinned
  Windows parser binding was absent; restoring that existing dependency resolved it.
- Corporate Scanner: **PASS**, 12,385 files scanned, zero known baseline violations
  and zero new forbidden violations.
- Regression red/green: reproduced recursive catalog notification, reentrant selection
  publication and cleanup lost after inline subscription failure before fixing them.
- Independent AI code review: no confirmed blocking defect found; not Owner acceptance.

The toolchain install used the existing frozen lockfile with install scripts disabled.
Missing pinned Windows optional bindings were installed only under ignored `node_modules`;
package manifests, lockfile, scanner rules and test timeouts were not changed.
Remote issue/PR state, exact-SHA CI, native installed-app QA, actual B3/B4 integration,
credential custody, network confinement and live GitHub behavior remain **NOT VERIFIED**.
