# G2-B4c Task C: trusted Main selection producer

Tracking: #152; parent #116; security #151; release #148; installed-app E2E #153.
Task B baseline: `a41f6b8d1b33a917336fd3b86a1384571d3cc704`.
Delivery remains Draft #162 on `feature/116-g2b-b4c-main-security-integration`.

## Source of truth and user entry

Project Map uses ordinary renderer repository selection; Project Pulse defaults to
demonstration events. Zustand owns active repository, Worktree and execution host,
and renderer session restoration reproduces UI state. Existing Main UI activation
signals do not independently prove canonical Project, HostSetup, Worktree or PR.

The existing native application menu now includes **Select GitHub Project Source...**.
Its Main callback opens a Main-created candidate menu for the attached main window.
Main enumerates host-qualified Store Worktree metadata and independently resolves
Project, Repository and ready HostSetup. It requires one exact record per identity,
explicit Project-to-Repo association, matching local host/path/setup, an unambiguous
Worktree instance, a linked positive PR and matching github.com provider/remote.
Folder workspaces without authoritative mapping, SSH and WSL remain denied.

On Windows, `hostId: local` alone does not prove native execution. Catalog reuses
`resolveProjectExecutionRuntime`, reading the Project override and actual global
runtime default. Missing Windows settings, WSL, repair-required resolution and WSL
UNC repository/Worktree paths are denied. Runtime resolution and configuration join
the fingerprint, so changes retire scope even if an override still resolves native.
macOS/Linux retain the resolver's native host semantics.

A native candidate opens a separate Main-owned Cancel-default confirmation showing
Project, repository, Worktree instance, PR and purpose. Acceptance establishes only
selection. Registration and reads retain independent consent; the producer has no
credential, transport or grant capability.

## Production wiring and retirement

`main-process-ready-foundation.ts` constructs actual Store Catalog, producer,
consumer and disabled Bootstrap. The main window factory attaches the exact window
before document load. The application menu reaches `Bootstrap.openSelectionPicker`
and the producer. Selection starts empty, is process-local and is never restored.

Only the producer writes source revisions. Strictly increasing snapshots reach
`MainProjectSourceSelection`, retaining its ordered-event checks and independent
Catalog admission. Catalog invalidation synchronously revokes the coordinator.
Revision overflow and reentrant publication fail closed.

The document verifier is extracted from the existing origin attestor: packaged
Personal profile, exact Main-pinned window/WebContents/session, current live main
frame and packaged URL, with loading frames denied. Prompt completion rechecks
profile, frame, document, session, revision and candidate fingerprint. Navigation,
destruction, replacement, Store changes and overlapping selections abort pending
confirmation. Delayed Accept cannot restore scope. Existing Bootstrap disposal
handles profile/sign-out/relaunch; committed quit disposes producer and consumer.

The only new renderer bridge is payload-free synchronous retirement IPC,
`ui.clearProjectSourceSelection()`. Active Repo/Worktree/host transitions clear scope
before continuing, including A-to-B-to-A. Main verifies exact document origin;
the channel cannot admit candidates, revisions, principals or grants. Unavailable
and Corporate sources receive false instead of hanging a synchronous caller.
Owner maps/listeners are removed on destruction or disposal. No registration/refresh
IPC is exposed. Remote RPC and stream schemas are unchanged.

## Review and validation

AI offline review found the local-host/WSL ambiguity; regression tests reproduced
it before repair. The fix reuses the runtime resolver and WSL parser, with no new
dependency. Read-only review also checked production wiring, origin, async retirement,
renderer spoofing and grant boundaries. AI review is not independent human approval
or Owner acceptance of runtime risk.

Current validation and final-SHA CI are recorded after verification. Historical
Task A/B results remain in their original records. The three known local Windows
POSIX-path fixture failures remain separate from focused tests and CI.

Task C adds **113 tests**: producer 23, actual Store 8, candidate inspection 18,
runtime admission 12, document verification 28, Main retirement 12, preload 5,
renderer retirement 5 and native menu 2. Focused source/menu/preload/renderer run:
**1167 PASS, 1 SKIPPED across 92 files**. Node/CLI/Web typechecks pass on Node 24.21.
Actual Store/runtime/startup subset: **69 PASS, 3 FAIL across 6 files**; the failures
are the previously recorded unchanged Windows POSIX-path scan fixtures. Source
runtime repair reproduced 7 failing tests before the fix and passes 12 afterward.
After a test-list command mistakenly overwrote the producer test with JSON, the
staged source was restored byte-for-byte and both producer/Store files reran:
**31 PASS**. No test was removed or safety condition relaxed.

Corporate endpoint scan: **12,375 files, zero known/new violations**. Reliability
manifest (118 gates), max-lines, ts-nocheck and runtime-Electron ratchets pass.
Full native-plugin and type-aware lint pass. Final base/changed lint and broader
startup results are recorded in the final delivery comment with exact-SHA CI.

## Remaining gates

B5 needs reviewed registration/refresh IPC and preload, scoped selected-PR UI,
Main-pinned HEAD/delivery checks and cancellation. Production credential, principal
and confinement providers remain unapproved and inert.

G3 requires Owner exact-SHA acceptance, authorized test repository and named QA
owner, real keyring/config/generation and Repository/Checks ACL evidence, effective
binary/library/config/network/process confinement, separately authorized GitHub reads
and installed Windows/macOS positive/negative acceptance.

- LIVE GITHUB SOURCE: BLOCKED
- REAL CREDENTIAL / CHECKS ACL: NOT VERIFIED
- NATIVE CONFINEMENT: NOT VERIFIED
- INSTALLED-APP E2E: NOT EXERCISED
- CORPORATE SOURCE: DISABLED
- V1 RELEASE: NO-GO

No merge, issue closure, credential access, network enablement or release is implied.
