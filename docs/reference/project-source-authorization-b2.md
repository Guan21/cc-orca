# #116-B2: Main-private authorization infrastructure

Status: **unwired infrastructure; no approved production source or issuer**. Stacked on [Draft #129](https://github.com/Guan21/cc-orca/pull/129), contract SHA `00a710c278deb642f7af88569200784d312a6c4e`. [B1 design #130](https://github.com/Guan21/cc-orca/pull/130) remains a separate documentation prerequisite. Keep #116 open, #128 unchanged, and all three authorization PRs Draft/unmerged.

## Trusted ownership

`src/main/project-source/project-source-registry.ts` accepts an independently verified, Main-owned immutable catalog and principal inventory. No production catalog builder or principal authenticator is implemented. Empty inventories cannot authorize anything. Test fixtures supply synthetic trusted records; they never approve a producer. There is no runtime composition root, configuration switch, IPC/preload/renderer export, EventBus connection, file-create observer or live Project Map integration.

Registration requires an exact catalog entry and rejects Corporate, WSL, SSH and paired-runtime entries even when present in that catalog. `local` is insufficient: native realm, installation/session namespace and policy epoch must match. Scope is discriminated `git-worktree` with known exact worktree identity or `folder-workspace` with exact workspace/repository and explicit absence of Git. Missing scope, wildcard, legacy null and ambiguous catalog identity fail closed. Catalog records must already establish ProjectHostSetup, project, repository and workspace ownership; strings, paths and labels do not establish it.

Main mints opaque producer/principal symbols and immutable registered records. Every registration receives a fresh UUID incarnation and monotonic revision; replacement invalidates the old handle. Mapping changes require a newly verified catalog/registry instance, never mutating an existing binding. Old-instance handles cannot authorize the new instance. A future composition root must invalidate/dispose the former instance when replacing it.

## Lease and operation lifecycle

`project-source-leases.ts` consumes frozen, independently trusted Main lease records via an injected lookup. It does not implement consent, principal authentication, personal grant issuance or enterprise issuance. Only test modules supply a grant fixture today. Lookup must publish immutable current records and synchronously invalidate sources on revocation; observed withdrawal also invalidates the source. The lookup is internal Main authority, never a renderer grant array.

Lease duration and operation capacity are required explicit constructor parameters. The B1 proposal of 15 minutes is not a production default or approval. An injected monotonic clock makes expiry deterministic; expiry at the exact boundary denies. Clock reversal, invalid values or exceptions fail closed. Separate `ingest-event` and `read-snapshot` permissions never imply each other or evidence-content access.

Captured opaque operation tickets bind the exact principal, registration, immutable lease instance and permission. Validation checks the complete identity from #129, current registration/lease ownership and clock before state access and commit/delivery. Revocation, restart, replacement, session invalidation and policy changes invalidate tickets. Reissue under the same scope cannot revive an old operation. Caller releases completed tickets; explicit capacity prevents unbounded retention. Revocation invalidates the whole source and conservatively purges retained observations, including when a read lease expires.

There is no timer, polling or automatic renewal. Expiry is enforced on each access. A future approved runtime owner must drive immediate lifecycle invalidations and disposal, including suspend/resume, sender/frame destruction, selection changes and source failure. No inactive fixture implies authorized-empty production availability.

## Bounded atomic admission

`project-source-batch.ts` accepts only encoded JSON behind an authenticated Main operation ticket. Raw arrays, accessors, cyclic JavaScript objects and caller-supplied grant objects are not an authenticated input path. UTF-8 batch size, array count, structural depth and structural entry budgets are checked lexically before JSON parsing and recursive DevelopmentEvent v1 schema validation. Per-envelope bytes are checked before schema parsing. Structural depth includes the envelope/event/payload/metadata containers; entry budget counts containers, separators and property delimiters across the batch. These conservative definitions also bound metadata depth and entries. All budgets must be explicitly supplied positive safe integers; omission never disables a limit.

Each envelope contains exactly `{ incarnation, sequence, event }`. Sequence is a positive safe integer; incarnation must match the current Main registration. Event v1 remains unchanged. Actor/source strings are consistency labels and never identity evidence. Admission checks the exact registered project/source before staging any state.

`project-source-admission.ts` stages full batches against an immutable retained-state version and returns a private pending symbol. Commit revalidates authorization and the state version before one atomic replacement. Identical duplicate envelopes are no-ops; changed same-ID content/sequence, sequence gaps/regressions and mixed project/source/incarnation reject the whole batch without consuming IDs or sequence. Concurrent batches staged against an old version cannot overwrite a newer commit. Pending batch count, queued observations per source, retained event count and retained encoded bytes are bounded. Source registration capacity bounds total source state; pending capacity bounds staged copies. Encoded byte budgets are logical payload bounds, not exact JavaScript heap measurements.

Overflow rejects without eviction or projection. B2 retains a bounded session window only; it implements no historical completeness claim or persistence. Invalidation purges pending and retained source state. Read requires a distinct read ticket, verifies registry ownership before cache access, clones retained events, and revalidates before return. No graph, snapshot transport or callback is connected. Disposal permanently closes admission and clears state.

## Automated evidence

| Contract | Tests |
| --- | --- |
| No grant, forged producer/principal, permission separation, expiry and same-scope reissue | `project-source-leases.test.ts` |
| All binding dimensions, native/WSL/SSH/runtime confusion, unknown worktree, folder absence, Corporate denial, source limits and fresh generations | `project-source-registry.test.ts`; shared `project-source-access.test.ts` |
| Count/UTF-8 bytes/depth/entry/schema limits; raw-object rejection; missing budget rejection | `project-source-batch.test.ts` |
| Atomic mixed replay, conflict/dedupe/sequence/incarnation, queue/retention caps, concurrent commits and cloned reads | `project-source-admission.test.ts` |
| Deferred revoke/reissue/restart/session/policy/expiry completion does not reach projection/delivery callbacks | `project-source-admission.test.ts`; `project-source-leases.test.ts` |
| Cross-registry ticket rejection and independent caches despite identical project/event IDs | `project-source-admission.test.ts` |

Existing DevelopmentEvent, Activity Graph and Project State tests run alongside this suite. PR reports pin counts and CI to final SHAs; documentation-only skipped jobs are not test passes.

## Activation blockers

Security owners must approve the first producer, trusted record/root/native-locality derivation, authenticated current-frame principal lifecycle, consent owner/flow, lease and budget policy, and any future IPC inventory. Corporate remains disabled until separately approved enterprise authority exists. No evidence retrieval, credentials, connectors, network access, background polling or shared backend is introduced. These primitives assume an uncompromised Main and installation; they do not attest mutable workspace files or protect against a compromised Main/same-user OS attacker. Source Unavailable remains the production result.
