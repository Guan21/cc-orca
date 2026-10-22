# G2-B5c Task C — offline Main composition and lifecycle boundary

Tracks #169 / #152 / #116. Base: Draft #168 at
`022cdf96d1afbeee048c263b3e9b5a01ddc46bf4`. This increment installs no production
adapter, source, IPC sender or Renderer activation. #151 exact-SHA Owner acceptance
and #153 native installed QA remain BLOCKED; #148 V1 remains NO-GO.

## Production entrypoint audit

| Boundary                           | Existing authority and Task C treatment                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup                            | `startup/main-process-ready-foundation.ts` constructs the Main Store catalog, picker producer, selection bridge and bootstrap. Task C adds no startup instance.                                                                                                                                                             |
| Main Project/worktree selection    | `MainProjectSourceCatalog` validates detached Store ownership and native execution; `MainProjectSourceSelection` consumes ordered Main producer events. Selection invalidation precedes publication and revisions protect A→B→A. Renderer selectors cannot implement this source.                                           |
| Immutable repository / selected PR | `MainRegisteredSelectedPrRepository` supplies a binding only after separate trusted registration. Owner/name, local git HEAD and Renderer PR fields are insufficient. Task C requires the registered binding to match the grant's complete binding. Folder/SSH/WSL/relay remain denied.                                     |
| B3 identity and consent            | `MainPersonalProjectSourceAuthority.attest()` authenticates the actual Electron window/WebContents/main frame/document/Session/profile/principal/credential generation. Its `run()` owns the existing registry grant lifetime and post-await checks. Task C consumes that operation; it neither selects nor grants consent. |
| B4 integration                     | `MainProjectSourceIntegration` already owns native registration, transport and revocation. Its existing `refresh(event, headSha, ...)` accepts an expected HEAD constraint and is not a trusted HEAD source. Task C does not invoke that separate refresh operation or change it.                                           |
| B5a intent                         | `project-source-operation-ipc.ts` permits zero-argument authenticated intents, reserves before callbacks and defaults to denial without an owner. Task C adds no IPC method or payload.                                                                                                                                     |
| B5b UI                             | `ProjectMapDesktopPage.tsx` keeps the observed-facts source disabled. Task C cannot populate it.                                                                                                                                                                                                                            |
| Task A / B                         | `MainTrustedSelectedPrHeadProvider` acquires private one-use HEAD receipts against the same registry context. Its synchronous `handoff()` invokes `MainSelectedPrFactDeliveryFence`, which reparses G1 facts and exact PR/commit/Checks SHA linkage. Task C reuses both.                                                    |
| Production bootstrap               | `MainProjectSourceBootstrap` creates `MainCredentialEvidenceProvider()` without an adapter, sets `enabled: false`, uses an empty runner, and registers an IPC owner with `isEnabled: () => false` and no refresh callback. All remain unchanged.                                                                            |

## Composition contract

The new adapter is Main-only and default-disabled. Its optional sources exist for
offline injection; their types and fixture success do not establish trusted provenance.
Disabled mode does not consult providers. Missing dependencies or lifecycle subscriptions
remain unavailable. Readiness requires explicit Owner acceptance, native QA, effective ACL
and native credential custody; it never infers these from login or successful CI.
`readiness().offline_ready` describes dependency/subscription and gate preflight only.
It does not attest the current document, principal, grant, registered binding or provider
availability. Every operation separately authenticates those inputs; no preflight status
confers authorization or proves production readiness. Test fixtures wrap the actual grant
registry, but do not exercise actual B4 registration plus Electron B3 authority together.

An operation reserves a single permit before invoking supplied callbacks. Inside the
existing authority's `run()` loader it checks authenticated current Main state against
the operation context and registered binding, acquires Task B HEAD evidence, then reads
one bounded offline fact projection. Cancellation, timeout, exceptions, unavailable or
incomplete data cannot produce a packet. Authorization and operation epochs are checked
after asynchronous work and again immediately before synchronous delivery. Handoff occurs
inside `run()` while its original grant and context are still current, never after it
returns. Results expose sanitized statuses only.

Every required lifecycle domain must provide synchronous invalidation before publishing
a change: Project, Worktree/host, repository, selected PR, Window, Frame, Document, Session,
Principal, credential generation, grant, policy/readiness and HEAD. Invalidation retires
the adapter epoch, cancels work, invalidates provider receipts and retires Main authority.
Returning to identical display names or bytes cannot revive an old operation or grant.
Missing or failed subscription installation fails closed; teardown attempts every cleanup.
Out-of-order or duplicate responses never become a second authorized handoff.

The fact loader must use the existing complete GraphQL→G1 projection contract if a future
reviewed source is installed. Missing Checks keep the unchanged G1 unknown semantics;
malformed or partial responses cannot be promoted to complete/green. No new interpretation
of GitHub facts as native task or agent completion is introduced.

## Trusted inputs still absent and future evidence

Production integration is **BLOCKED** on actual reviewed producers for all of:

- Credential custody, current principal and generation with synchronous revocation.
- Trusted immutable repo registration and selected PR bound to current Main catalog state.
- A grant-bound Main authority reader and complete lifecycle event coverage.
- An authenticated selected-PR HEAD adapter; no local/Renderer/cache fallback.
- Actual repository and Checks visibility/effective ACL evidence.
- Pinned native executable/environment and OS/process/network confinement.
- A separately reviewed synchronous Main-owned delivery sink and stale-display clearing.
- Exact implementation/ADR SHA Owner self-review under #151 and installed Windows/macOS
  positive and negative QA under #153. AI review cannot replace Owner acceptance.

Before any future live source work, record the exact accepted SHA, approved Personal test
repo/PR and credential type/least privilege without credential values. Prove actual identity,
consent, lifecycle cancellation/clearing, 401/403/404/429/offline/timeout, complete Checks and
HEAD linkage, native confinement and installed-app evidence in the existing issues. This
document authorizes none of those calls or any activation. Corporate, development and
remote sources stay disabled. No merge, issue closure or release gate change is included.

## Verification boundary

Task C acceptance requires focused security regressions, Typecheck, Lint, Formatting,
changed-code quality and the unchanged Corporate Scanner, followed by exact final-HEAD
PR Checks and PR test LoC. Record actual counts and links in the Draft PR and #169/#152.
Conditional jobs remain SKIPPED, never PASS or native QA evidence. Offline PASS can be
reported only after all required checks succeed and never means production readiness.
