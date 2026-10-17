# #116 G1 — GitHub factual Project snapshot (pure contract only)

**Status: Draft / offline-only. NOT a real GitHub connector, authorized reader, DevelopmentEvent producer, or live Project Map implementation.** Owner V1 direction: begin with separately approved GitHub PR/commit/check facts, leaving native Agent Run/Task ownership unknown.

## Source and semantic boundaries

- Accept a small _already normalized_ snapshot candidate only from a future **Main-authenticated, authorized** GitHub source pipeline. This library does not fetch APIs, read secrets, install hooks, register IPC, persist, or mutate canonical Project/Task data.
- `GitHubProjectFactScope`: exact DevCrew `projectId`, Main-owned `bindingRevision` (must be authoritative and monotonic from separate reviewed Project↔repo assignment source), and immutable GitHub repo ID **plus host**, owner and repo name. Comparing these fields is **not a grant**; any renderer-supplied expected scope is equally untrusted until Main authenticates it.
- `GitHubFact`: observed pull request state/head SHA/updated time, commit SHA and check-run status/conclusion. This is **snapshot observation**, NOT `pull_request.created`, `task.started/completed`, Agent/native worktree ownership, or local test execution. No Agent attribution, task ID, evidence contents, private prompt, message, CLI/session or token appears in projection.
- `GitHubFactSnapshot` labels `attestation=not_verified_by_projection`, `agentExecution=unknown`, `taskCompletion=unknown`. Only a separately reviewed source adapter/Main reader with proof of identity and API response may later claim genuine GitHub-observed provenance. A successful pure parse **never** attests authenticity.
- `fetchedAt` is an observation timestamp from a future trusted fetch; `updatedAt` is PR source metadata, not DevCrew execution time. Caller supplies a bounded freshness horizon. Future observations, expired snapshots, excess or unsupported fields, conflicts/duplicates and extra authority/secret fields fail closed.

## Pure test matrix

### Check-run and timestamp normalization

- The read contract preserves the six statuses `waiting`, `requested`, `pending`, `queued`, `in_progress`, `completed` and nine conclusions `success`, `failure`, `neutral`, `cancelled`, `timed_out`, `action_required`, `skipped`, `stale`, `startup_failure`, plus `null` (unknown/not supplied). Every incomplete status requires `null`; completed observations preserve their conclusion without implying Agent or Task completion. `stale` and `startup_failure` never become success.
- Source distinction: [GraphQL Checks](https://docs.github.com/en/graphql/reference/checks#checkstatusstate) defines uppercase `CheckStatusState` and `CheckConclusionState`; a future reviewed adapter must map these one-to-one to the lowercase values above, preserving null. Do not use the combined rollup `CheckRunState` as a status. The [REST Checks guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks#about-check-runs) documents the six lowercase observed statuses; only GitHub Actions can set `requested`, `waiting`, `pending`, and only GitHub can mark `stale`. [REST create/update inputs](https://docs.github.com/en/rest/checks/runs) are a separate write contract, not the read enum definition. GraphQL explicitly defines `STARTUP_FAILURE`; this projection does not claim it is a supported REST mutation input. Raw GraphQL uppercase values and unsupported values fail closed in this already-normalized contract.
- Both snapshot `fetchedAt` and PR `updatedAt` require a real Gregorian UTC date in `YYYY-MM-DDTHH:mm:ssZ` format, optionally with 1–3 fractional-second digits. UTC calendar-field round trips reject normalization of impossible dates, out-of-range clock fields, offsets and missing `Z`. Snapshot freshness and existing future-timestamp ceilings remain unchanged.

### Existing boundaries

- Distinguish absent input (`unavailable`) from an explicit empty factual collection (`empty`), ready scoped collection (`ready`) and stale/invalid/cross-project results.
- Deny same-name repos under another GitHub hostname/repo ID; deny wrong Project, unexpected owner/name, and old binding epochs even when A→B→A returns to the same visible name.
- Strict allowlist on host/repo/facts and SHA format; no extra prompt, tokens, confidence or attestation claims may escape. Normalize and copy only bounded primitives.
- A PR with new head SHA in the same collection is contradictory and fails; identical duplicates collapse. CI `queued` with `success` fails, null conclusion remains null/unverified; no fabricated `PASS` or Task completion.
- No API/network changes, new Event producers, release policy changes, Corporate access, user credentials or approval.

## Required review before G2 source integration

1. **Named GitHub network/privacy policy owner** signs exact host/endpoint/method list, GitHub installation/scopes and token custody, Corporate build egress allowlist, read invocation (prefer manual user-triggered, no automatic polling/webhook), PII and rate-limits/revocation.
2. **Named Electron Main/Project authorization reviewer** approves actual Project↔repo mapping source with monotonic binding revision across deletion/reassignment A→B→A, exact BrowserWindow/document/session, read ACL, before/after awaited revalidation and fail-closed worktree/host switching.
3. **Independent schema/source reviewer** confirms GitHub status/CI semantics, SHA pinning, conflict resolution, time skew and freshness, durable replay/checkpoint if proposed, production state compatibility. `ProjectStateSnapshot` is Task-centric and must **not** be force-filled with fabricated Task nodes; use a separate approved GitHub Project Activity surface if required.
4. **Native QA** proves a real authorized GitHub event/check→DevCrew scoped read after G2 is legally enabled, plus offline/401/403/429/revoked/cross-Project tests. A fixture-only green PR does not close #116 or V1.

**Stop:** any missing approval or actual source authority leaves new network/IPC/persistence disabled. A Draft PR is not authorization to activate.
