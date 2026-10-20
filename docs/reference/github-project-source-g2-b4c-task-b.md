# G2-B4c Task B: Main selection and coordinator lifecycle

Tracking: #152; parent #116; security #151; release #148; real E2E #153.
Task A baseline: `a3b6e4246b5c2cad5ac5763eef7d18ca1fd74846`; continue Draft #162 on #161.

## Source of truth and design

Project Map (`ProjectMapDesktopPage.tsx`) uses Renderer `useActiveRepo()` and
passes a Repo ID as a display Project selector. Project Pulse defaults to demo
events. Neither is a canonical Main Project selection producer.
Renderer `set-active-worktree.ts` owns active Repo/Worktree/workspace/host state;
session persistence restores these values. Main `ipc/session.ts` saves Renderer
snapshots. They are candidate selectors, never selection or read authority.
Main `runtime-window-lifecycle.ts` can request UI activation but cannot prove
the UI's subsequent selection, canonical Project/HostSetup/PR or revision.

No independently verifiable Main current-selection producer exists in this
baseline. The chosen bounded design is a Main-only, ephemeral selection owner
with an explicit fail-closed source adapter. A missing producer is UNAVAILABLE;
an invalid candidate is DENIED. Production never substitutes Renderer sessions,
Repo IDs, paths, display names or remote strings as that producer.

Reuse the existing Catalog and its synchronous Store mutation subscription,
unambiguous native Worktree metadata and monotonic selection revision. A trusted
Main source must publish fresh ordered revisions; source failure, mutation and
out-of-order events retire selection. A source candidate is still independently
validated against Project/Repo/HostSetup/native Worktree relationships. Folder
mapping remains unsupported and denied. No persisted selection/grant restoration.

Bind one default-disabled coordinator to the actual Main window creation path,
pinning object identities for Window/WebContents/Session and the bundled document,
with Main profile checks and native execution realm. Retire before replacement,
navigation, mutation, credential change and committed quit. Dispose all owned
listeners. No public IPC/preload/API or successful production credential fixture.
The existing global transport/runner permit continues to own uncertain termination.

Alternatives rejected: treating persisted UI state as authority (untrusted and
replayable); adding an unrelated selection UI/authentication system (outside this
increment). A native selection producer and verified credential/confinement
providers remain explicit activation prerequisites.

## Implementation and verification plan

- [x] Add Main selection owner tests first: valid native fixtures, invalid IDs,
      Folder/remote denial, ordered revisions, ABA, Store mutation, source failures,
      late/reentrant operations and disposal. Implement using the existing Catalog.
- [x] Add failing subscription/disposal/document tests, then harden Integration,
      Authority and Origin without replacing grant/registration/transport logic.
- [x] Add disabled bootstrap tests and wire foundation/window/committed quit;
      production credentials remain absent and network execution remains disabled.
- [x] Run focused and relevant startup/persistence regressions, Node/CLI/web
      typechecks, changed-code lint/static analysis, formatting and Corporate scanner.
- [x] Independently review the final diff for spoofing, TOCTOU, Session/document
      ABA, ambiguous instances, listener leaks and asynchronous result revocation.
- [ ] Commit using Lore trailers; push existing branch without force; update Draft
      #162 and record exact-HEAD CI without merging or closing security/E2E gates.

## Security review and lifecycle completion

Independent offline AI review found a missing pre-relaunch/profile retirement
boundary. The shared Main lifecycle callback now disposes Bootstrap and Selection,
then invalidates Catalog before relaunch's first await. Profile switch and active
source transfer call an internal synchronous hook before their first await;
sign-out and auth/org mutation also retire the source. This covers direct
`app.exit()` relaunch as well as a vetoed normal quit without recovering authority.
The existing profile IPC signature is unchanged; no new privileged API was added.

The review also identified pending native confirmations that survived revocation.
One shared internal confirmation function passes Electron's documented abort
signal, settles cancellation immediately, detaches the listener and consumes late
native rejection. Registration and PR consent use the coordinator generation's
signal. Offline unresolved-dialog tests verify prompt promises settle on dispose;
actual native dialog disappearance remains platform QA, not an offline claim.
See [Electron dialog documentation](https://www.electronjs.org/docs/latest/api/dialog).
The global native termination permit is unchanged and is never released merely
because a dialog or operation promise settles.

Re-review found no remaining actionable defect in this delta. This is an
independent AI code review, not independent human approval or Owner exact-SHA
runtime acceptance. No new dependencies, persistent source authority, credential
store, public IPC/preload, UI, Corporate policy or transport factory were added.

## Offline verification

Node 24.21.0: **480 tests PASS across 25 files**, including Catalog/Selection,
Store identity/mutation, credential, Origin/Authority/Integration, native runner,
G1 projection/facts, Profile IPC and startup ordering regressions. The focused
Coordinator/Transport/Runner suites also PASS 77 tests. Node, CLI
and web TypeScript projects PASS. Changed-code base/type-aware/React Doctor gates
report zero new findings; format and whitespace PASS. Final Corporate scan and
max-lines/runtime-Electron ratchets are recorded with exact-HEAD CI in Draft #162.

Simplification: one detachable Origin listener set replaces Integration's duplicate
watchers; one abort-aware confirmation function serves registration and PR reads.
Existing Catalog, Store mutation feed, identity map, grant/registration/transport
chain and global native runner permit remain the security boundaries.

Changed files: new Selection, Bootstrap and native-confirmation modules; their
tests; Origin, Credential, Integration, Authority and consent modules; existing
Profile IPC internal lifecycle hooks; startup foundation/state/window/quit/core
services; startup/Profile regressions; this document and the B4c index.

## Follow-up: multiple Coordinator / Runner bypass

The explicit follow-up review at `c5426d2316736c78b55efad44df5d06c4500b233`
found two P2 internal reentrancy defects missed by the earlier broad review.
No Renderer-reachable production route or enabled credential access was found;
the defects nevertheless violated the claimed cross-instance invariants.

- Bootstrap checked target ownership before detaching its old window. A Catalog
  callback could let another Bootstrap acquire the target, then the outer call
  overwrote that ownership. Reentrant attachment is now guarded; ownership is
  rechecked after callbacks and construction. Detach clears captured state before
  callbacks, cleans captured instances and deletes only entries it still owns.
- Raw Runner checked its shared lane before request-property access. A getter
  could start a different factory's Runner before the outer call acquired it.
  Runner now rechecks immediately before acquisition, owns a unique reservation,
  and publishes pending idle proof before invoking runtime callbacks. Only its
  reservation can release the shared lane, after required termination evidence.
- Transport had a similar pre-acquisition `isCurrent()` callback gap, normally
  contained by the real Raw Runner. Its shared permit is now rechecked after
  validation and snapshotting, before consuming the action or invoking Runner.

Eight new offline regressions cover competing Bootstrap ownership, same-owner
reentry, construction-time disposal, request getter reentry, Transport callback
reentry, early idle inspection and uncertain termination after rejected outer
acquisition. Existing recreation/uncertain-termination cases remain unchanged.
The targeted three suites pass **77 tests** (19 Bootstrap, 45 Raw Runner,
13 Transport). Independent scoped AI re-review found both P2 findings resolved,
without authorization weakening or replacement of the shared termination permit.

The first follow-up SHA `4b7c2d200...` failed CI's full-file lint because Transport
exceeded the 300-line limit; the added-line-only diagnostic filter did not catch
the file-end finding locally. The repair reuses imported lease types and groups
the identical positive-revision checks. No limit, exception or workflow changed.
Full-file lint now covers all six changed TypeScript files; exact final-SHA CI
supersedes that failed implementation run without erasing it.

## Evidence boundaries

Fixtures prove offline behavior only. Actual credential provenance, repository
and Checks permission, OS binary/library/config/network/process confinement and
installed-platform real-source E2E remain NOT VERIFIED / NOT EXERCISED. Source
activation stays BLOCKED, Corporate source DISABLED and V1 NO-GO.
