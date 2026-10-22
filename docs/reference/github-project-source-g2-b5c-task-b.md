# G2-B5c Task B — trusted Main selected-PR HEAD provider contract

Issue: #167, parent #152 / #116. Pinned Task A base: Draft #166 at
`4fdc205c91010d6d518ef56e753a0d781892549a`. Security #151 and installed QA #153
remain BLOCKED; #148 V1 remains NO-GO. All predecessor PRs stay unmerged.

## Scope and input provenance

This is an inactive Main-only contract, with no production provider instance or adapter.
`verified` means the injected Main attestation satisfied this offline contract for one
current operation. It is not proof of actual GitHub access, effective permissions, Owner
approval, or a live authenticated HEAD. Fixtures can simulate the adapter only in tests;
neither a TypeScript type nor a syntactically valid SHA establishes provenance.

| Input                                                                  | Existing authority and present limitation                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project, repo selector, active worktree and host                       | `MainProjectSourceCatalog` reads detached Main Store records, validates Project/setup/repository/worktree ownership and native runtime, and invalidates on supported Store mutations. A selector alone is not read authority. Folder, SSH, WSL and relay scopes are denied here.       |
| Selected PR and selection revision                                     | Main picker/selection producer and catalog maintain ephemeral selection and monotonic revisions, including A→B→A. Renderer can retire selection but cannot create authority.                                                                                                           |
| Immutable GitHub numeric and opaque node IDs                           | `MainRegisteredSelectedPrRepository.currentBinding()` returns these only after its separate trusted registration verifier. Production registration is disabled; no trusted inventory or live registration is established by this task. Names and local git remotes are insufficient.   |
| Window, WebContents, main frame, document and Electron Session         | Existing Main origin/window-document verifiers compare actual Electron objects and retire lifecycle identities. Provider consumes their `VerifiedSourceDocument` contract; it does not authenticate arbitrary strings or an IPC payload.                                               |
| Principal and credential generation                                    | Existing Main credential evidence provider has no production OS/keyring adapter. Production current identity remains absent. Login alone would not prove repository/Checks ACL.                                                                                                        |
| Consent, binding/grant revisions, session incarnation and grant expiry | Existing `MainSelectedPrGrantRegistry.run()` supplies `MainSelectedPrOperationContext`, synchronous `isCurrent()` and cancellation. This provider does not select, grant, renew consent or widen permissions.                                                                          |
| Selected GitHub PR HEAD and observation time                           | **Absent in production.** A future independently reviewed Main adapter must attest exact registered repo/PR/HEAD and complete operation scope, then synchronously notify changes. Renderer state, UI cache, local working-tree HEAD and raw fixture data cannot supply this authority. |
| Owner readiness and invalidation                                       | An explicit Main-owned readiness predicate defaults to denial. Its test double is not Owner acceptance. Changes must synchronously invalidate provider state before being published.                                                                                                   |

## Contract and state machine

The provider defaults to disabled and does not consult authority or adapter callbacks in
that state. Missing adapter/authority remains unavailable. There is no fallback. The only
results are `verified`, `unavailable`, `denied`, `stale`, and `incomplete`; failures carry no
raw exception, provider response, token, path or credential information.

Acquisition reserves a non-reentrant permit before callbacks. It consumes an existing
registry operation context and cancellation signal, snapshots the complete current Main
authority, and asks the optional adapter for one bounded observation. After the await it
checks cancellation, grant currentness/expiry, Owner readiness, full authority equality,
provider epoch and observation freshness again. Invalid, missing, foreign or changed
authority is never promoted to a usable HEAD. Observation age is at most five minutes;
future/nonfinite clocks are invalid. HEAD supports the existing 40/64 hex contract.

Successful evidence is version 1, detached, deeply frozen, and bound to this provider's
private operation receipt. Copies, foreign instances and caller-built objects cannot be
handed off. A new acquisition retires previous receipts. Invalidation increments an owned
epoch, aborts outstanding work and removes receipts; disposal additionally unsubscribes
and permanently denies further work. Subscription failure or synchronous invalidation
during installation makes the provider unavailable.

Handoff consumes the receipt before callbacks and revalidates it against its original
grant context. It reuses Task A's `MainSelectedPrFactDeliveryFence` and the unchanged G1
projection, including unknown CI when Checks are absent. The final sink wrapper checks
currentness and the provider's internal epoch after injected callbacks and immediately
before the synchronous Main-owned sink. There is no await in handoff. Sink failure does
not authorize a retry. No WebContents or Renderer sink is installed by this task.

Authority/adapter readers must synchronously observe current Main state. Every mutation,
including returning to identical HEAD bytes, must synchronously notify invalidation;
revisions never roll back or get reused. Hidden mutation without notification cannot be
authenticated by an offline callback interface. Future integration must review that
producer guarantee and the final Main-owned epoch check together.

## Intended offline composition

Within an existing registry `run()`, its loader may acquire one observation using the
provided context and signal. Its synchronous delivery callback may hand that exact
evidence and a ready G1 projection to the provider's handoff. The evidence becomes unusable
as soon as the registry operation finishes or revokes. A subsequent fact read still needs
the existing reviewed integration, explicit consent, fixed transport and all existing
post-await checks; this contract adds none of those authorities. Task B does not modify
`MainProjectSourceIntegration.refresh()` or connect this composition in production.

## Privacy and remaining gates

No logs, persistence, polling, cache restoration, subprocess, native gh, GitHub network
request, token/keyring access, new dependency, IPC channel, Renderer source activation or
Corporate policy change is introduced. Production bootstrap remains `enabled: false` /
`isEnabled: () => false`; the selected-PR UI remains disabled.

Offline contract acceptance requires the regression tests, Typecheck, Lint, Formatting,
unchanged Corporate Scanner and applicable final-SHA CI to succeed. Conditional skipped
jobs remain SKIPPED and do not count as native or integration evidence. AI review is an
offline review, not independent human signoff.

Live readiness remains BLOCKED on a separately reviewed Main authority adapter and HEAD
operation, exact-SHA Owner self-review under #151, actual repository/Checks ACL and
credential custody, lifecycle/epoch wiring, native OS/process/network confinement, and
installed Windows/macOS QA under #153. No approval checkbox is inferred from CI. Do not
enable Personal/Corporate/development/remote sources or claim production integration PASS.
