# G2-B5e: before-publication lifecycle evidence

Issue #174 / parent #152; stacked on #173 at
`d8915808450867c5b0db5145fdfe5c89dbf75532`.

## Claim boundary

VERIFIED means complete production producer coverage for that domain, including
synchronous retirement before replacement becomes observable. PARTIAL means a
concrete local boundary or conservative observation exists but coverage is incomplete.
BLOCKED means the required authoritative production publisher is absent. None of
these labels upgrades offline fixtures to installed Electron or live GitHub evidence.

The B5d bridge remains default-disabled with an empty frozen lifecycle map. Partial
hooks are never offered as complete Task C subscriptions. No source, production fact
sender, Renderer activation, Corporate policy or credential adapter is added.

## Domain provenance matrix

Paths below are relative to `src/main/`. Catalog subscriptions belong to the catalog
instance; picker subscriptions to the Main selection owner; bridge listeners to the
attached BrowserWindow/WebContents. Disposal removes owned listeners. Old process
grants are never persisted or restored.

| Domain | Real producer and publication ordering | Invalidation and evidence | Status / unresolved coverage |
| --- | --- | --- | --- |
| project | `persistence/loading-store/project-collection-operations.ts:updateProject`; native picker `github/project-source-main-producer.ts:publish` | Store before-mutation barrier retires catalog before the covered write; picker retires catalog before installing candidate. Catalog rejects selection during retirement/write. Tests exercise real operations and producer. | PARTIAL: project creation/removal, compatibility synchronization and private state writes lack universal coverage. |
| worktree | `persistence/loading-store/metadata-lineage-operations.ts:setWorktreeMetaForHost`, backed by `worktree-identity-metadata.ts` | Covered setter barrier precedes identity migration and replacement, including host/instance/linkedPR changes. A→B→A retires old selection. | PARTIAL: getter-triggered migration, lineage pruning, alias repair, host setup CRUD and other setters remain uncovered; SSH/WSL/relay/Folder authority stays denied. |
| repository | `persistence/loading-store/repo-lifecycle-operations.ts:updateRepo` → `tracking-repos/repo-update-operations.ts` | Barrier precedes field deletion, assignment and compatibility updates. Callback failure prevents the covered mutation. | PARTIAL: add/remove, hydration and other compatibility mutations require audit/hooks; immutable GitHub registration remains disabled. |
| selectedPr | Native picker confirmation/publish and worktree metadata `linkedPR` | Picker retires before candidate publication; covered metadata setter retires before writes. Native Cancel and late confirmation remain fenced. | PARTIAL: alternate metadata writers and authentic registered repository authority remain incomplete. |
| window | Main window attachment; BrowserWindow `close` and fallback `closed` / WebContents `destroyed` | Actual B5d listeners retire synchronously on observed events, including cancelled close. EventEmitter tests verify listener behavior. | PARTIAL: no installed native proof of every identity replacement ordering. |
| frame | WebContents `will-frame-navigate`, `did-start-navigation`, `frame-created`, `did-frame-navigate`, `render-process-gone` | Bridge retires on starts and conservative fallbacks; exact frame comparisons deny mismatches. | PARTIAL: created/committed events follow changes; no universal frame replacement/ABA publisher proven. |
| document | Navigation starts and committed/process fallbacks; `github/project-source-window-document.ts` origin check | Bridge cancels pending offline HEAD/projection and receipts. Read-time comparisons supplement observed invalidation. | PARTIAL: native document replacement and unobserved ABA ordering remain unproved. |
| session | Exact Electron Session captured at bootstrap and checked by origin verifier | Mismatch denies access. Identity equality is not an event source. | BLOCKED: no authoritative before-publication Session replacement producer. |
| principal | `github/project-source-native-principal.ts`; adapter-less credential provider at bootstrap | Production returns no authenticated GitHub principal. Fixture attestations do not prove identity. | BLOCKED: verified native GitHub principal/generation producer absent. |
| credential | `github/project-source-main-credential.ts:revoke/dispose/subscribeRevocation` | Explicit revocation retires principal and notifies bridge; subscriptions owned by provider/bridge. | PARTIAL: actual keyring/custody/replacement/generation publisher absent; no credential access exercised. |
| grant | `github/project-source-grant-registry.ts:select/requestGrant/revoke/retireWebContents/retireAll/run` | In-memory authority is removed before abort callbacks; nested retirement is bounded; final callback fences reject revoked/expired results. Offline regressions cover ABA, restart, cancellation and stale async work. | PARTIAL: no complete production composition subscription/expiry publisher or live Main consent integration; deadline/read checks do not prove a before-publication expiry event. |
| policy | `startup/main-window-core-services.ts` pre-profile-selection, pre-signout and pre-relaunch callbacks | Whole bootstrap retires before these explicit transitions; post-auth callbacks remain fallback observations. | PARTIAL: effective Repo/Checks ACL, Owner/readiness and all policy replacement sources are absent. |
| head | `github/project-source-main-pr-head-provider.ts` adapter contract | Offline epochs and one-use receipts fence observed invalidation. Local Git HEAD and Renderer caches are not authenticated PR HEAD. | BLOCKED: authenticated selected-PR HEAD publisher absent. |

## Ordering and failure semantics

`scheduleSave()` remains an after-mutation observer. Its synchronous execution before
debounce protects against missed A→B→A notifications but cannot prove before-publication
ordering. The separate barrier covers only the named public Store methods. While the
barrier is active, catalog reads/selection cannot mint new authority. Nested covered
writes reject; all captured retirement callbacks run even if one fails, and failure
prevents the outer write. Uncovered writers remain a production-readiness blocker.

Picker retirement runs before replacement candidate assignment. Its retirement and
consumer-publication phases each allow only the expected catalog event; nested clearing
or failed retirement prevents publication. A candidate is only a selector, never a grant.

Grant retirement must detach authorization before synchronous AbortSignal callbacks.
Global retirement must detach every scope before the first abort, so one scope cannot
use another scope's old authority. Callback-based clocks and attestations are reentrancy
boundaries as well as asynchronous loads; final delivery requires a current grant and
operation after those callbacks. These are Main state-machine tests, not a production
sender or a proof of external authority-change observation.

## Required next evidence

1. Cover remaining Store mutations/migrations and establish complete producer ownership.
2. Prove native Window/Frame/Document/Session replacement ordering and installed restart
   behavior on Windows/macOS (#153); EventEmitter fixtures cannot supply this evidence.
3. Implement separately authorized verified principal/keyring generation, native custody,
   confinement and effective repository/Checks ACL, plus authenticated PR HEAD updates.
4. Supply complete grant-expiry and policy/readiness publishers and an approved synchronous
   delivery/display retirement boundary before enabling any source or Renderer UI.
5. Obtain actual exact-SHA Owner self-review under #151; no AI review substitutes for it.

All thirteen domains remain unavailable to production composition. Production readiness
is BLOCKED; #151 stays open, #153 NOT EXERCISED, #148 NO-GO. No issue is closed or PR merged.

## Verification record

The focused run covers **33 files / 743 tests, zero skips**, with
`ORCA_BACKGROUND_LAUNCH=1`, Node 24.21.0 and the frozen pnpm 12 lockfile:
`vitest run --config config/vitest.config.ts src/main/github/project-source
src/main/persistence/loading-store/write-scheduling.test.ts
src/main/persistence-projects.test.ts src/main/persistence-repo-lifecycle.test.ts`.

- `project-source-store-publication.test.ts`: actual Store mutation barriers, ABA,
  listener failure/churn, nested writes, real catalog to offline composition cancellation
  during HEAD/projection waits and final fact handoff.
- `project-source-main-producer.test.ts` and `project-source-main-catalog-lifecycle.test.ts`:
  native picker publication, cancellation, nested invalidation, callback failure,
  reentrant replacement rejection and restart. Electron dialogs/events remain fixtures.
- `project-source-grant-reentrancy.test.ts` and existing registry tests: nested revoke,
  all-scope retirement, consent/clock/attestation mutation, expired final callbacks,
  asynchronous stale completion and fresh-incarnation authorization.
- Existing bridge/composition/provider/bootstrap tests retain disabled and unavailable
  negatives for all thirteen domains, listener cleanup, sender fences and late responses.

Validation and catalog Store types were extracted unchanged into narrowly named modules
to preserve max-lines limits; no dependencies, timeouts, assertions or scanner rules
were relaxed. An initial parallel Typecheck failed with Windows VirtualAlloc/errno 1455;
sequential project checks are recorded separately, never conflated with that failed run.
Sequential Main/Node, CLI and Web Typecheck completed successfully. Changed-file lint,
format check and all three changed-quality scans passed against the pinned base.

Local and exact-final-SHA CI results are recorded in the delivery PR and Issue #174.
Only completed checks count as PASS; skipped jobs remain SKIPPED. The matrix above
describes bounded code guarantees, not live authentication or installed application QA.
