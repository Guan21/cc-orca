# DevCrew AI Engineering Manager — V2 M0 Offline Diagnostic Contract

Issue: [#185](https://github.com/Guan21/cc-orca/issues/185) · Roadmap: [#47](https://github.com/Guan21/cc-orca/issues/47) · Dependencies: [#54](https://github.com/Guan21/cc-orca/issues/54), [#68](https://github.com/Guan21/cc-orca/issues/68), [#73](https://github.com/Guan21/cc-orca/issues/73)

**Status: M0 Draft / inert domain-only slice. Not a released feature, not a production-safe diagnosis engine, and NOT V1 release scope.**

## Desired loop

```text
Trusted project/activity/review observations (bounded to one authorized Project)
  -> Attention Router / Manager Suggestions
  -> Evidence-scoped diagnosis (later, separately approved)
  -> Proposed coordination plan (later)
  -> Human explicitly approves a scoped action (later)
  -> Existing authorized Harness/Agent adapter executes (later)
  -> Independently verified outcome and audit (later)
```

DevCrew owns evidence, attention, decisions, and team coordination state. The Harness adapter owns dispatch and runtime mechanics; Claude/Codex own execution. DevCrew does not duplicate the agent runtime.

## M0 actual implementation

`planEngineeringManagerSuggestions(snapshot, options)` is a synchronous pure function over the existing `ProjectStateSnapshot`; it does not call GitHub, agents, an LLM, Electron IPC, a timer, or a scheduler.

- Reports *historical test failure observation* as a suggestion to inspect actual verification, not as proof of current CI state.
- Reports *failed run observation* as a suggestion to investigate run evidence, not proof that its task failed.
- Reports *review-request observation* as a suggestion to verify the current review state, not proof that a review remains pending.
- Suggests a *freshness status check* only when the caller supplies a separately trusted, project/task-matched **local receipt** with the same clock ID. Never derive stall status from `lastObservedAt` because that may be a remote event/agent timestamp.
- Produces stable reason IDs, dedupes repeated tasks, uses existing project-scoped task identities and evidence references, never fabricates an owner, blocker, or successful/failed outcome.
- Every proposal is `human_decision_required` and `not_authorized`; no machine action or dispatch instruction is emitted.

Even a linked evidence reference is only a pointer. The ref is not proof of current validity, authenticity or permissions. M0 does not include review packages or read live PR status.

## Trust and security model for later integration

1. Main authenticates the initiating app window/document and checks project/repository/workspace/host binding, grant revision and re-entry after every await. A Renderer ID or a GitHub PR selection does not grant authority.
2. External GitHub/CI facts must originate from an explicitly approved source and be identified as such. Agent claims, event timestamps, file handoffs and user-declared task/run associations are **not** authoritative execution proof.
3. Local observation receipts must be supplied only by an approved local source on a comparable clock. The plain M0 type is **not** a cryptographic or authorization guarantee. A renderer or file source must not be allowed to assert a trusted receipt.
4. SSH disconnect/no events never implies task stopped; preserve `live | unverifiable | exited` when liveness is eventually shown. `activity_freshness_needs_confirmation` is a verification prompt, not a liveness verdict.
5. Human approval must be bounded by action, object identity, permission scope, expiry and revocation, checked before and after awaits. A generic Manager permission is forbidden.
6. Provider-neutral Execution Contract (#73) and current company allowlist are mandatory. No raw sessions, secrets, untrusted code, arbitrary command text, unrestricted repository reads, new egress, or background polling in M0.
7. Integrate a subsequent UI with #54/My Attention instead of creating a parallel notification database. Capture actionable evidence and decisions in #56/Audit; real action execution remains unapproved until separately reviewed.
8. Network/security/privacy approval, relevant CI and native Windows+macOS installed testing are release gates, not implied by this Draft PR.

## Follow-up acceptance milestones

- M1: Read-only Manager/Attention view with trusted input, no fake/demo active state, dedup/persistence and explanation of uncertainty.
- M2: Approved, user-invoked, bounded diagnostic queries to real GitHub/CI and agent status via existing authenticated boundaries.
- M3: Evidence-linked proposed steps with owner, reasons, dependency impact and uncertainty; approval UX.
- M4: Scoped human-approved execute/recheck/rollback via Harness adapters; never auto-merge or blindly retry.
- M5: Observe actual outcome and measure review wait/lead time, avoided manual coordination, failed actions, AI spend and risk (QCD).

## Offline validation

```sh
pnpm test src/shared/engineering-manager/engineering-manager-plan.test.ts
pnpm tc:node
pnpm run check:code-quality:changed
```

These checks need to pass before integration. This PR does not authorize running or shipping the full AI Engineering Manager.
