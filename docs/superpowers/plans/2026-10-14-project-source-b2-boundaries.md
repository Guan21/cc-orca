# Project Source B2 Boundary Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the separately authorized B2 work, task by task. This is an approval-gated boundary plan, not authorization to activate a source.

**Goal:** Enforce a deny-by-default Main boundary for one explicitly approved personal native-local observation source, with Corporate and remote access disabled.

**Architecture:** Main owns opaque producer registrations, exact identity bindings, separate producer/viewer leases, bounded admission and scoped snapshots. Existing v1 projections remain pure; renderer supplies selection intent only. Source activation and any new IPC exposure require the decisions in the [B1 design](../../reference/project-source-trust-b1.md).

**Tech stack:** Existing Electron Main, TypeScript, DevelopmentEvent v1/Zod, Activity Graph/Project State selectors and Vitest. No dependencies, transport, credential storage or background polling added.

## Approval and change boundaries

B1 found a verifiable native exclusive-create operation, **not an approved DevelopmentEvent producer**. No production adapter is designed as approved or implemented here. Tasks 1–3 can be developed/tested with internal synthetic test receipts and no bridge/source activation. Tasks 4–6 require producer, personal consent, identity/locality and IPC approval; failing any prerequisite leaves source unavailable. Corporate authority is absent and Corporate activation is outside this plan.

Base B2 on `company-work` plus the separately reviewed/approved #129 contract; do not merge #129 automatically. Keep #128 independent. Record the exact approved contract/source commits and named decision owners in the B2 PR before activation. Do not mark this plan executed based on B1 documentation review.

## Proposed file ownership

| Proposed file/seam | Responsibility |
| --- | --- |
| `src/main/project-source/project-source-registry.ts` + `.test.ts` | Composition-root producer registration, immutable full binding, opaque handles and bounded source count. |
| `src/main/project-source/project-source-leases.ts` + `.test.ts` | Personal session/producer lease ownership, expiry, revocation and policy epochs; hard Corporate denial. |
| `src/main/project-source/project-source-admission.ts` + `.test.ts` | Size/depth/sequence limits, trusted receipt conversion, atomic admission and dedupe. |
| `src/main/project-source/project-source-snapshots.ts` + `.test.ts` | Scoped retained-window projections, freshness/completeness and reauthorization before delivery. |
| `src/main/runtime/runtime-file-commands-write-file-explorer-file.ts` | Only after approval: completion observation seam for `createFileExplorerFile`; preserve the original operation's result and permissions. |
| `src/main/ipc/project-source.ts` + `.test.ts`; `src/preload/index.ts`, `src/preload/index.d.ts` | Only after IPC approval: narrow snapshot/availability bridge; inspect existing preload declaration layout before editing. New domain types belong in `.ts`, not another `.d.ts`. |

Inspect existing utilities and composition wiring before introducing these modules; combine or omit files only where the same responsibility already exists. Do not add source methods to `src/main/runtime/rpc/methods/index.ts` / `ALL_RPC_METHODS`, CLI/remote routes, or broad filesystem/history APIs. No renderer Project Map wiring in B2; that is #116-C. Consent UI/wiring requires an explicit reviewed addition to this file inventory before activation.

## Tasks and verification checkpoints

### Task 1: Registry and exact binding (deny-only)

- [ ] Add failing tests for forged producer handles, unknown registration and complete tuple equality, including explicit folder `worktreeId: null` versus missing fields.
- [ ] Resolve project/setup/repo/workspace from Main-owned records. Require exactly one consistent ready setup and exact host/realm/root revision; never accept payload-provided authority. Unknown legacy records do not auto-migrate to grants.
- [ ] Implement private registration handles with producer incarnation and registration epoch. Enforce 8-source cap without evicting active authority; binding changes invalidate old handles.
- [ ] Test same project/repo/worktree IDs across hosts and installations, folder workspace without Git, conflicting owner records, runtime-shaped local routing, malformed host, malformed raw runtime preferences/defaults and WSL preference changes. Normalizer fallback to native never authorizes a scope.
- [ ] Run registry tests, inspect failures, fix and rerun before advancing. Commit with Lore intent/trailers recording that all sources remain disabled.

### Task 2: Lease owner and revocation (deny-only)

- [ ] Add failing tests for renderer-supplied grants, wrong issuer/principal, producer/read separation, evidence denial and Corporate denial despite personal consent.
- [ ] Implement process-private 15-minute monotonic leases, separate producer/viewer principals and policy epoch. Renewal requires new explicit consent; tests use injected clock/consent authority, never a production bypass.
- [ ] Revoke on all B1 lifecycle triggers, purge scoped state and cancel pending work. Ensure same tuple/new lease cannot revive old requests; lookup does not create grants.
- [ ] Test expiry without trusting wall clock, suspend/resume, navigation/reload, logout/session termination, opt-out, producer failure/restart and mapping removal. Keep Corporate offline/cache restoration denied.
- [ ] Run lease tests and commit independently. Document that an OS account and a paired channel are not enterprise principals.

### Task 3: Admission and snapshots (deny-only)

- [ ] Add failing tests exercising the B1 byte/count/depth/queue/retention limits before invoking recursive v1 parsing or projection. Include limit equality, limit+1, cycles/accessors and malformed batches.
- [ ] Build only bounded plain events from test receipts admitted by an opaque producer handle. Main supplies labels, system actor, IDs, sequence and timestamps; caller metadata is not copied.
- [ ] Stage batches atomically; duplicate identical receipts are no-ops, conflicting IDs/sequence/gaps deny with no graph/checkpoint change. Apply #129 policy decisions only to Main-owned identities/leases.
- [ ] Partition projection/cache/reference state by complete tuple, installation/realm and registration epoch. Rebuild retained-window projections atomically after expected history eviction; signal truncation/completeness. Queue overflow fails closed.
- [ ] Test authorized-empty versus unavailable, snapshot-before-lease denial, revoked mid-read/ingest, stale selection/frame response and same-ID cross-scope isolation. Assert no raw evidence/content in output.
- [ ] Run admission/snapshot tests and existing DevelopmentEvent/graph/state suites. Commit with tested limits and no-source behavior recorded.

### Task 4: Resolve activation prerequisites (mandatory gate)

- [ ] Record security-owner approval of producer semantics, consent mechanism, session principal, lease and budget values. Record approvals as decisions, not inferred from green tests.
- [ ] Prove current desktop/native execution and native-local storage, including Windows mapped drives/UNC/WSL/reparse and POSIX network mounts. Reject roots whose locality or stable containment cannot be established. Do not solve this by polling or invoking new platform interpreters.
- [ ] Resolve ancestor replacement/TOCTOU proof: if the receipt cannot be bound to the approved root at operation time, suppress it. A later path readback alone is insufficient. If a stronger file-operation primitive is needed, review that separate scope before changing the existing operation.
- [ ] Approve exact project/setup/repository/folder/worktree mapping and complete request generations. If these proofs cannot be supplied, stop source activation and preserve NOT APPROVED.
- [ ] Inventory consent and snapshot IPC and approve sender/frame validation plus targeted invalidation. No new production bridge before this review.

### Task 5: Narrow observation seam (only after Task 4)

- [ ] Add failing integration tests around the real native create seam, with ephemeral temporary roots and injected approved Main registrations. No watcher, network source, Git command or transcript reads.
- [ ] Attach a read-only observer to the existing successful exclusive-create completion. Capture tuple/epoch/realm before the operation, revalidate after it and before publication. Only `file.changed` / `added`, system actor and bounded relative path are permitted.
- [ ] Verify failed writes, `EEXIST`, mkdir-only partial failure, symlink/root replacement, unapproved/remote scopes and revoked receipts publish nothing. Receipt rejection must not alter the underlying operation's success/error or filesystem permissions.
- [ ] Prove observer performs no additional filesystem content reads, mutations, process spawns, HTTP/SDK calls, sockets or telemetry. Any new attestation gap keeps source unavailable.

### Task 6: Reviewed read bridge and boundary verification

- [ ] Add integration tests invoking the actual proposed Main handlers with foreign windows, popouts, subframes, obsolete frames, desktop-looking forged RPC contexts and forged principal/grant fields.
- [ ] Implement only reviewed `project-source:getSnapshot` and targeted `project-source:availabilityChanged`. Resolve selection to registered scope in Main, check before reading cache, recheck on delivery and invalidate pending request generations on scope change/revoke.
- [ ] Keep evidence-content access denied and expose no ingestion/register/issue-grant bridge. Add tests that existing broad RPC/CLI/remote registries cannot reach source services.
- [ ] Verify no new egress from source observation/read paths with forbidden dependency spies, static Corporate endpoint scanning and existing Corporate gates. Static scanning alone is not runtime zero-egress proof; installed runtime evidence remains a separate acceptance requirement.
- [ ] Run the checks below, review the exact B2 diff against the matrix, and open a separate Draft PR with approvals, remaining limitations and focused evidence. Do not merge or enable Corporate.

## Test acceptance matrix

| Attack/condition | Required observable result |
| --- | --- |
| Valid v1 event with spoofed source/actor/project or renderer grant object | No trusted admission; no projection/callback/ref/checkpoint side effect. |
| Missing issuer, source, scope, principal or producer; ambiguous/conflicting host | Unavailable/denied, never authorized-empty or local fallback. |
| Viewer ingest attempt, producer snapshot attempt, snapshot lease used for evidence | Denied independently before operation or evidence dereference. |
| Personal lease in Corporate, WSL, SSH, paired/headless runtime; unknown host defaults; malformed WSL/default or repair-required runtime settings | Denied before discovery/dispatch; zero remote calls; normalization/migration cannot confer native authority. |
| Equal IDs in two projects/hosts/installation namespaces | Separate caches, graphs, dedupe/checkpoints and opaque refs; no evidence lookup across them. |
| Registered folder workspace with no Git worktree | Exact workspace/repository binding works only after approval; no Git required and null is not wildcard. |
| Unbounded replay, deep/cyclic metadata, huge IDs, queue flood | Budget denial before recursive parse; bounded memory/security state; no partial batch effects. |
| Identical duplicate, conflicting duplicate, out-of-order/gap, old incarnation | No duplicate projection; conflict/gap rejected atomically; old epoch unavailable. |
| Planned retention eviction | Correct rebuilt retained window and explicit incomplete history; no lifetime-history claim. |
| Lease revoked/expired or binding changed during await; revoke then regrant same tuple | Old read/ingest cannot commit/deliver; cache/refs cleared and old request remains denied. |
| Selection/frame/project/workspace/host switch during pending response | Main rejects stale context; later #116-C renderer clears selection/evidence and drops old response tag. |
| Restart/offline/suspend/resume | No restored grant or disk replay; personal fresh consent required; Corporate remains disabled. |
| Successful exclusive create versus failure/`EEXIST`/root race/network mount | At most one minimal receipt for an approved stable native scope; all uncertain/failed cases emit nothing. |
| Producer unavailable/no approved source | Source unavailable; no fixture fallback, fabricated metrics or stale prior evidence. |

Use deferred promises and an injected monotonic clock for race tests; measure zero source/cache/evidence calls on preauthorization denial. A policy-helper unit test is not proof of Main IPC enforcement.

## Commands and evidence

Run all tests with `ORCA_BACKGROUND_LAUNCH=1`. Do not launch visible Electron/native-focus tests; rendered checks, if added later, use the installed Electron skill and hidden Playwright CDP on an approved environment.

```powershell
$env:ORCA_BACKGROUND_LAUNCH = '1'
pnpm test src/main/project-source
pnpm test src/main/ipc/project-source.test.ts
pnpm test src/shared/development-event-schema.test.ts src/shared/development-event-bus.test.ts src/shared/activity-graph src/shared/project-state
pnpm tc
pnpm run check:code-quality:changed
pnpm exec oxfmt --check docs/reference/project-source-trust-b1.md docs/superpowers/plans/2026-10-14-project-source-b2-boundaries.md
```

The proposed Main tests do not exist in B1; commands above are B2 acceptance, not executed B1 evidence. Also run `node config/scripts/corporate-forbidden-endpoint-scanner.mjs` and static analysis for changed code. No new dependencies or blanket formatting are needed.

For B1, verify documentation links, source references, Mermaid structure, requirement coverage and documentation-only diff; run changed-file lint/format checks. Typecheck/runtime tests cannot prove these proposed boundaries until B2 exists. Keep native QA #119/#124 and team-shared realtime/persistence acceptance separate.
