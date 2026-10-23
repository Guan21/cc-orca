# G2-B5f: Session, Principal and HEAD retirement

Issue #176 / parent #152; stacked on Draft #175 at
`48b97dd465b22e999d3bf7b2fc9a2306dcbed13c`.

## Evidence boundary

VERIFIED requires complete production producer and ordering evidence. PARTIAL
denotes a bounded Main transition with incomplete native coverage. BLOCKED denotes
an absent trustworthy production producer. No domain below is fully VERIFIED.
Tests use offline adapters and Electron fixtures; they do not prove authenticated
identity, effective ACL, native ordering or installed application behavior.

Production integration and operation admission remain disabled. The bridge retains
its frozen empty lifecycle map, with all thirteen domains unavailable. No credential
reader, HEAD adapter, privileged fact sender, Renderer enablement or policy change
is introduced. The existing credential `subscribeRevocation` interface is reused;
there is no invented login/logout publisher or new principal enrollment path.

## Session: PARTIAL

The actual owner is `startup/main-window-controller.ts:openMainWindow`, which calls
`window/createMainWindow.ts:createMainWindow`. The main-window web preferences set
neither `session` nor `partition`, so Electron selects the default Session. Electron
documents [`webContents.session` as read-only](https://www.electronjs.org/docs/latest/api/web-contents/)
and Session selection through [creation preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences).
There is no supported in-place Session setter to instrument in this path. Browser
guests, dashboard popouts and preview partitions are separate contents, not Main
source owners. A frame navigation is not proof that the owning Session changed.
BrowserWindow `session-end` refers to operating-system shutdown, not replacement
of Electron Session identity.

`openMainWindow` now calls `MainProjectSourceBootstrap.retireMainWindow()` before
the factory creates replacement contents. The existing detach path synchronously
clears bootstrap ownership, disposes the old integration/credential/bridge, removes
listeners and invalidates the catalog. A detaching guard rejects same-owner attach
reentry throughout cleanup, including `destroyed` fallback callbacks. A later
attachment captures the exact replacement Session and creates a fresh credential
monitor even if Electron returns the same default Session object (A-B-A).

Attachment still precedes document loading and `state.mainWindow` publication.
Profile selection, sign-out, relaunch and process quit already retire through the
B5e callbacks. Navigation/process/close listeners remain conservative observations;
post-change events and read-time Session equality checks are not universal
before-publication proof. An unobserved identity ABA cannot be inferred from equality.
Fresh process/bootstrap construction does not restore old grants or receipts.

Proof: `project-source-session-retirement.test.ts` checks factory call ordering,
explicit retirement, Session A-B-A, fresh monitor identity, listener removal,
idempotence and reentrant destruction/retirement. Existing bootstrap, window-origin,
bridge and composition suites cover profile mismatch, reload observations, missing
owners, Session mismatch, cancellation and late results. These are offline tests;
the factory ordering assertion is static, not an installed Electron run. Universal
native Window/Frame/Document/Session ordering and #153 remain unproved.

## Principal: BLOCKED

`project-source-main-bootstrap.ts` constructs `MainCredentialEvidenceProvider()`
without an adapter. No real Main-authenticated credential-generation producer is
available to wire. `github/client/fetch/authenticated-viewer.ts` and
`github/auth-diagnose.ts` use general CLI/diagnostic paths; login strings and parsed
credential-source labels do not establish immutable principal identity, trusted
keyring provenance or synchronous generation changes. They are not invoked or
reused as authority. Orca profile authentication is not GitHub principal proof.

The existing offline contract now notifies dependent revocation listeners before
adapter cleanup can reenter. The native principal monitor rejects nested `current()`
verification and permanently revokes rather than publishing evidence while an outer
reader is incomplete. Identity/generation mismatch, explicit revocation and disposal
already permanently retire that monitor. Listener failure cannot skip later listeners.

Proof: `project-source-principal-revocation.test.ts` reproduced cleanup-before-retire
and nested-verification failures; existing principal/credential tests cover generation
changes, missing evidence, observed ABA, failed subscriptions and revoke callbacks.
No test proves a real login, logout, keyring event or credential replacement. A lost
notification followed by unobserved A-B-A remains a missing producer guarantee.

## HEAD: BLOCKED

`MainTrustedSelectedPrHeadProvider` has only an injected offline attestation adapter.
There is no authenticated production selected-PR HEAD publisher. Local Git HEAD,
Renderer caches and generic polling results cannot supply this authority. The HEAD
provider is not installed by production bootstrap.

The existing provider invalidates its receipt WeakMap and advances its epoch before
aborting pending reads. Known authority/adapter change notifications retire receipts;
read-time Project/Repository/PR mismatch rejects late results. B5e Store and picker
barriers already retire catalog-dependent offline composition on covered changes.
Uncovered Store writers and unobserved HEAD A-B-A remain blockers, not inferred facts.

The final provider check now rechecks `context.isCurrent()` after authority and clock
callbacks, followed by the existing epoch/signal check. A callback that revokes the
grant without changing the provider epoch can no longer issue a verified receipt or
send a packet. Handoff remains synchronous and one-use; no fact sender is added.

Proof: `project-source-head-revocation.test.ts` reproduced four callback-retirement
failures and covers known identity changes without events, notified ABA, reentrant
adapter changes and late old responses. Existing real Store publication tests cover
pending HEAD/projection cancellation before covered writes. None of this establishes
a genuine HEAD subscription, complete event delivery or independently trusted HEAD
generation; missing producers keep production unavailable.

## Thirteen-domain matrix retained

Paths are relative to `src/main/`; the detailed B5e source/ordering matrix remains in
[`github-project-source-g2-b5e.md`](github-project-source-g2-b5e.md).

| Domain     | Producer / retirement boundary                                  | Status and unresolved dependency                                                                            |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Project    | Store `updateProject`; native picker/catalog barrier            | PARTIAL: creation/removal, compatibility synchronization and private writes remain uncovered.               |
| Worktree   | `setWorktreeMetaForHost` before-mutation barrier                | PARTIAL: getter migration, lineage pruning, alias repair, host CRUD and alternate setters remain uncovered. |
| Repository | Store `updateRepo` barrier                                      | PARTIAL: add/remove, hydration, compatibility writes and authentic registration remain incomplete.          |
| selectedPr | Main picker and covered `linkedPR` metadata setter              | PARTIAL: alternate writers and repository authority remain incomplete.                                      |
| Window     | Main bootstrap and close/destroy observations                   | PARTIAL: installed universal replacement ordering unproved.                                                 |
| Frame      | Navigation/frame/process bridge events                          | PARTIAL: fallback events can occur after publication.                                                       |
| Document   | Navigation bridge and pinned origin verification                | PARTIAL: native replacement/lost-event ABA coverage incomplete.                                             |
| Session    | Main factory pre-creation retirement; exact Session pin         | PARTIAL: bounded code ordering only; no installed/native completeness proof.                                |
| Principal  | Adapter-less credential provider; deny-only revocation contract | BLOCKED: real authenticated identity and generation producer absent.                                        |
| Credential | Explicit provider revoke/dispose and subscriptions              | PARTIAL: actual custody/keyring/replacement publisher absent.                                               |
| Grant      | Registry selection/revoke/retirement and operation fences       | PARTIAL: full production expiry/consent publisher absent.                                                   |
| Policy     | Pre-profile-switch, sign-out and relaunch callbacks             | PARTIAL: complete policy/readiness and effective Repo/Checks ACL absent.                                    |
| HEAD       | Offline provider epochs and one-use receipts                    | BLOCKED: authenticated selected-PR HEAD producer absent.                                                    |

Subscription ownership remains local to bootstrap/bridge/provider instances and is
released on retirement/disposal. Folder, SSH, WSL and relay execution cannot acquire
source authority from these native-worktree hooks. No provider compatibility policy
is broadened. No dependencies, scanner rules, timeouts or max-lines limits change.

## Verification and delivery

Each behavior fix has a failing regression followed by a passing rerun. The combined
offline run passed 37 files / 778 tests, zero skips, with `ORCA_BACKGROUND_LAUNCH=1`,
Node 24.21.0 and frozen pnpm 12 dependencies. It includes project-source suites,
Store publication/lifecycle suites and desktop startup ordering. No app was launched.

The first Main typecheck failed at the default approximately 2 GB V8 heap limit
(exit 134). That run remains FAIL. A larger-heap sequential retry, remaining local
gates and exact-final-SHA CI are recorded in the delivery PR and issue comments.
Only completed checks count as PASS; skipped jobs stay SKIPPED.

Production readiness remains BLOCKED. #151 stays OPEN for actual Owner acceptance,
#153 is NOT EXERCISED, and #148 V1 is NO-GO. Remaining dependencies include complete
Store producers, native lifecycle ordering, verified principal/credential and HEAD
publishers, effective ACL, custody/confinement, full policy/expiry publishers and
reviewed synchronous delivery/display retirement. No merge or issue closure.
