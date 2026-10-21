# G2-B4c Task B: Main selection and coordinator lifecycle

Tracking: #152; parent #116; security #151; release #148; real E2E #153.
Task A baseline: `a3b6e4246b5c2cad5ac5763eef7d18ca1fd74846`; continue Draft #162 on #161.

**Task B implementation status: PARTIAL / BLOCKED.** A trustworthy production
Main Current Selection producer is absent. The explicit fail-closed adapter and
default-disabled Coordinator lifecycle are implemented; this does not satisfy
the user's condition for `B4c TASK B OFFLINE INTEGRATION COMPLETE`.

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

Node 24.21.0: **516 tests PASS across 26 files**, including Catalog/Selection,
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

## Follow-up: App Restart Grant Reuse

The focused review at `d60cae3692a10af57656b672857ba9a51f5bfac8` found no
production grant-reuse defect. Grant/consent state, pending registration, operation
closures and current selection are Main-memory state with no reviewed persistence
or restoration path. Fresh Registry, Origin and Integration instances own fresh
incarnations; production Bootstrap also starts with no credential evidence adapter.
Store reload restores Project facts but leaves current selection empty.

Four added regression cases close a composite coverage gap without changing
production behavior:

- Recreate a Registry with identical document fields and numeric binding/grant
  revisions. A read is denied until fresh consent, the incarnation differs, and
  the retired pending read/context cannot deliver or become current again.
- Recreate Origin with repeated numeric Electron IDs and principal generation.
  Installation, Session and document identities differ; old origins/events fail.
- Separately retire pending registration and pending PR read, then reconstruct
  the composed Integration/Catalog/Credential fixtures with repeated IDs,
  selection revision and principal generation. The replacement's own current
  event is denied before testing the old event. Late old native completion cannot
  authorize the replacement, deliver a result or trigger an extra process.

The three targeted suites PASS **71 tests**. Independent read-only AI review found
the coverage meaningful, with no new actionable finding. These are offline
same-process owner-replacement simulations, not actual installed-app restart E2E.

Normal committed quit disposes owners; pre-relaunch retirement occurs before
awaits and covers direct `app.exit()` relaunch. A vetoed ordinary quit is not a
restart or grant restoration. Explicit pre-relaunch retirement remains terminal
even if shutdown is later vetoed. Abrupt process death loses its in-memory grants;
surviving native children and termination across a real OS restart still require
OS confinement evidence. No persistent grant/consent recovery mechanism is added.

## Follow-up: Main Store mutable-reference ownership

The audit found a real Main-internal ABA defect: Project/HostSetup getters and
mutation results exposed live records, Repo admission retained caller objects,
hydrated Repo results shared nested arrays, and metadata getters/results/maps
and scan expectations exposed canonical rows. A retained reference could change
A to B to A without `scheduleSave()`, so no mutation event or revision changed
and final snapshots matched A. Catalog's output clone cannot prove that history.
No Renderer-reachable JavaScript reference transfer was identified; production
remains disabled, but the source ownership invariant needed repair.

The repair stays at existing public Store domain boundaries:

- `ProjectCollectionOperations`: clone Repo/Project/HostSetup getters and mutation
  results; clone update/setup arguments. Include the alternate Repo result from
  `moveProjectToGroup()`, found in the independent re-review.
- `RepoLifecycleOperations`: copy admitted Repo and update input/result values.
- `MetadataLineageOperations`: copy every public Worktree metadata row/map and
  setter input/result, including legacy unhosted and strict native-host paths.
- `WorktreeScanOwnership`: keep original reference-CAS scan expectations in a
  per-Store weak mapping. Expose detached snapshots; only the original unmodified
  public scan/member objects map back to internal expectations. Existing host,
  path, owner, Instance, serialized-value and reference checks still decide
  pruning. A clone/forged row/foreign Store/mutated scan cannot widen deletion.

Internal persistence identity helpers remain unchanged. Public values remain
mutable caller-owned snapshots; private Main collaborator writes still require
the existing synchronous invalidation path. This is source-domain ownership
repair, not a claim that every unrelated Store record is immutable or that
snapshot comparison detects arbitrary private-memory corruption.
Deep copies add allocation cost; production profile performance was not benchmarked.

**32 new actual-Store tests** exercise retained inputs/results, nested arrays,
Project/runtime fields, all metadata access paths, genuine and forged/stale scan
pruning, pending registration, and synchronous pending-read revocation. The first
21 tests reproduced the alias failures before implementation; the alternate
group-move result also failed before its fix. Relative to Task A, Task B now adds
**110 tests** (226 new B4c tests including Task A's 116). No tests were deleted.

The old strict-reader and alias-projection assertions are strengthened for the
new public contract: values match but references differ; all 400 actual internal
alias/locator twins still share objects. The initial wider run's new-contract
failure was fixed without removing that internal sharing invariant. The full
alias-projection file subsequently passes all six tests.

Independent offline AI re-review found no remaining actionable alias path in the
examined public source domains and no destructive-prune widening. It is **not
independent human security approval or Owner acceptance of real runtime risk**.
No dependency, schema, privileged IPC/preload, credential store, egress policy or
new authorization system was introduced. Folder remains DENIED.

## B7 validation ledger

Commands use Node 24.21.0 and the repository-installed tools/configuration,
matching the package scripts; `ORCA_BACKGROUND_LAUNCH=1` applies to all tests.
No visible app/native-focus validation was launched on the user's desktop.

| Validation                                       | Local status / evidence                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node Typecheck                                   | PASS: `tsc --noEmit -p config/tsconfig.node.json`                                                                                                                            |
| CLI Typecheck                                    | PASS: `tsc --noEmit -p config/tsconfig.tc.cli.json`                                                                                                                          |
| Web Typecheck                                    | PASS: `tsc --noEmit -p config/tsconfig.tc.web.json`                                                                                                                          |
| Base lint                                        | PASS: full `oxlint --format github`, 24,003 files, zero warnings/errors                                                                                                      |
| Type-aware lint                                  | PASS: full `--type-aware --config config/oxlint-code-quality-type-aware.json src config tests --deny-warnings`                                                               |
| Static analysis                                  | PASS: configured native plugins; changed base/type-aware/React Doctor; reliability 118 gates; max-lines/ts-nocheck/runtime-Electron ratchets                                 |
| Formatting                                       | PASS: repository `oxfmt` on changed files; `git diff --check`                                                                                                                |
| Project Source / Authorization / focused Startup | PASS: 516 tests, 26 files; includes all 32 new Store ownership cases                                                                                                         |
| Broader Main Store / Electron Startup            | Initial 197 PASS / 4 FAIL; internal alias-sharing assertion retained; corrected rerun: 198 PASS / 3 existing Windows fixture FAIL across 14 files                            |
| Windows POSIX-path diagnostic                    | FAIL retained: three unchanged `local-worktree-metadata-scan-expectation.test.ts` positive-prune cases use `/workspace/...`; native Windows absolute-path guard refuses them |
| Host / SSH / Project Runtime compatibility       | PASS: 36 tests across five existing regression files                                                                                                                         |
| Corporate Forbidden Endpoint Scanner             | PASS: 12,370 files, zero known/new forbidden violations                                                                                                                      |
| GitHub PR Checks / PR test LoC                   | Exact final-SHA result recorded in PR #162 and Issue #152; earlier SHA results are historical only                                                                           |
| Auxiliary Bot #156                               | Separate status at final SHA; NOT EXERCISED if absent; retain any failed run; no secret or workflow permission change                                                        |
| Installed-app / actual GitHub / OS confinement   | NOT EXERCISED / NOT VERIFIED; not inferred from packaging or fixtures                                                                                                        |

The three Windows diagnostic failures are on untouched pure prune/test sources;
their Git blob IDs match `7081916a1...`. Initial failure logs and the rerun are
retained separately. Neither those fixtures, the absolute-path guard, scan rules,
timeouts nor existing fail-closed checks were relaxed. Historical local source
scan timeout and earlier `4b7c2d200...` max-lines CI failure remain historical
evidence, never silently relabeled PASS.

## B8 delivery and completion gate

Continue existing branch `feature/116-g2b-b4c-main-security-integration` and
Draft [#162](https://github.com/Guan21/cc-orca/pull/162). Task A HEAD remains
`a3b6e4246b5c2cad5ac5763eef7d18ca1fd74846`; base #161 remains
`cb3b96fe2c4c9cbcd3ef281d7bcbd7bb80a9fd84`. Exact Task B final HEAD, its Actions,
changed-file inventory, review and progression records are published on #162 and
#152 after this implementation commit. Prior Task A and earlier Task B results
are retained. #116/#151/#152/#153 stay OPEN; no merge/release is performed.

Foundation creates the real Store/Catalog, the unavailable Selection owner and
disabled Bootstrap in `main-process-ready-foundation.ts`; `main-window-controller.ts`
attaches only the actual Main window before loading; `main-process-state.ts` owns
them. Origin authenticates object identities and current document; subscriptions
retire registration/grants on changes. `main-window-core-services.ts` revokes before
profile/auth/sign-out/relaunch awaits, existing Profile handlers signal before
switch/transfer, and committed `main-process-quit.ts` disposes owners before async
teardown. Separate native registration/read confirmation and shared Runner permit
remain. No real production Selection producer is installed by this work.

Therefore **PARTIAL / BLOCKED**, even if final CI is green. B5 guarded IPC/preload,
Main-pinned HEAD/delivery/UI and G3 authorized test repository/named QA owner,
Owner exact-SHA review, real credential/Repository/Checks permissions, effective
OS confinement and installed Windows/macOS positive/negative acceptance remain.

## Evidence boundaries

Fixtures prove offline behavior only. Actual credential provenance, repository
and Checks permission, OS binary/library/config/network/process confinement and
installed-platform real-source E2E remain NOT VERIFIED / NOT EXERCISED. Source
activation stays BLOCKED, Corporate source DISABLED and V1 NO-GO.

- `LIVE GITHUB SOURCE: BLOCKED`
- `REAL CREDENTIAL / CHECKS ACL: NOT VERIFIED`
- `NATIVE CONFINEMENT: NOT VERIFIED`
- `INSTALLED-APP E2E: NOT EXERCISED`
- `CORPORATE SOURCE: DISABLED`
- `V1 RELEASE: NO-GO`
