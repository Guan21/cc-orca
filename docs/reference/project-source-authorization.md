# #116-A: Project source authorization boundary

Status: **proposed, not an installed/enforced production data path**. Parent [Issue #116](https://github.com/Guan21/cc-orca/issues/116), #51, roadmap #47.

## The current gap

DevelopmentEvent v1 has a projectId and free-form source label, but it has **no authenticated reader, authenticated producer, repository/worktree/host binding, or trusted authorization grant**. The Activity Graph reducer enforces its *declared* project IDs, not actual upstream trust. Reading a local file or having a GitHub login is not permission to disclose its contents to a shared project map.

Project Map currently has no authorized source and must remain Source Unavailable. The separate #124 / draft PR #128 removes the renderer's implicit demo-data fallback; a truthful UI does not itself supply authentication or authorization.

## Required identity tuple

An authorized request is bound to **every** field:

| Field | Required meaning |
| --- | --- |
| principalId | Verified reader/service principal; resolved outside renderer |
| producerId | Independently verified event producer; NOT the event.source field |
| sourceId | Administrator/user-approved registered source instance |
| eventSourceName | Expected event.source label; consistency check only |
| projectId | Registered project namespace; not a path/display name |
| repositoryId | Registered stable DevCrew repo ID, bound by the trusted adapter |
| workspaceId | Exact workspace, or *explicitly granted* repo-wide null |
| worktreeId | Exact worktree, or *explicitly granted* all-worktrees null |
| executionHostId | Concrete local, ssh:<target>, or runtime:<environment> |
| permission | Separately granted ingest-event or read-snapshot |

No wildcard scope or automatic fallback from SSH/runtime to local. Missing worktree/workspace is **not** equal to explicit null. Repo-wide grants are never cross-repository, cross-host or cross-project. The same taskId, eventId, source label or project display name on different hosts cannot merge their scopes.

## Who grants access? (proposed responsibilities; owner approval pending)

- **Corporate/team:** a trusted policy authority/administrator approves source registrations and grants to verified principals or groups. A GitHub collaborator, an OS account, or an arbitrary renderer property does not automatically authorize access.
- **Local personal use:** a future narrow local-only producer can be explicitly opted into for that local principal if its identity and provenance are validated. It must not grant team, SSH or Corporate access.
- **Agents:** actor metadata is not human read permission. The producer must be independently attested via an approved execution context.
- **Evidence:** an evidenceRef is only a reference, not a read capability. Evidence-content lookup needs another trusted access check tied to principal, project, scope, evidence identity and redaction. This first contract intentionally exposes no read-evidence permission.

Existing Corporate no-implicit-egress policy remains independent: a network allowlist cannot grant data access, and data permission cannot approve Internet communication.

## Trust and enforcement flow

~~~text
approved source registry + authenticated producer    authenticated principal + trusted policy
                       |                                     |
                       +-------- exact scope binding -------+
                                          |
                             trusted main/backend gate
                            (BEFORE source read/ingest)
                                          |
                         parse/validate DevelopmentEvent v1
                        and enforce project/source consistency
                                          |
                         Activity Graph -> Project State
                                          |
                         re-authorize EACH snapshot read
                                          |
                      scoped, sanitized, versioned read model
                                          |
                            Project Map / Pulse / Review
~~~

The pure code in src/shared/project-source/project-source-access.ts is **not a security boundary by itself**. It compares exact request identity/scope/operation with grants that a trusted authority has already supplied. Its replay helper denies unauthorized/malformed/mixed project or source event batches atomically. Comparing labels is not producer authentication.

**NEVER** accept principalId, producerId, grant arrays or authenticated-source claims from renderer, raw event payloads, arbitrary workspace files or unverified IPC requests. Do not wire this library to renderer-controlled grants.

## Selection, freshness, revocation and isolation

- A trusted binding must map the existing Repo.id, explicit workspace/worktree scope, validated execution owner and registered project/source IDs. A local repo ID is not an enterprise-global identity by itself. Reject contradictory connection/host ownership or ambiguous folder workspace host.
- On principal, project, source, repo, workspace, worktree or execution host switch: immediately hide and invalidate old data and selections; reauthorize. A future async adapter must carry full scope and request generation, and discard late responses from previous selections.
- Recheck policy before every new source read, replay, snapshot read or evidence lookup. A revoked grant or logged-out principal must clear active cache/subscriptions and reject in-flight snapshots.
- Loading, authorized-empty, unavailable, error, stale and disconnected are different outcomes. Do not call missing authorization an empty result. No prior task/review/evidence may flash when access is lost.
- The trusted producer must own immutable event IDs and stable source provenance. Reconciliation, checkpointing, deduplication, reorder handling and bounded storage are future #116 implementation work.
- No raw prompts, terminal transcripts, credentials or unnecessary private source content in the event graph or evidence refs.

## Existing source inventory

| Candidate | Status / authority |
| --- | --- |
| Bundled demo DevelopmentEvents/review fixtures | Tests only; NEVER real project evidence |
| Activity Graph / Project State | Pure selectors, not authentication or source connectors |
| Current local repo/workspace and runtime observations | Not yet an approved DevelopmentEvent authority; producer mapping and policy needed |
| GitHub/Linear/external project data | Not approved by the mere existence of a remote URL; needs separate auth and Corporate network review |
| Team-shared backend | Not implemented here; needs its own storage, authentication, replay, policy and revocation contract |

## Delivery and test boundaries

**Slice A (this PR):** exact-scope deny-by-default decision helpers, all-or-nothing validated DevelopmentEvent replay, unit tests for mismatched principal/producer/source/project/repo/worktree/workspace/host, invalid scopes and operation separation. No live source or renderer IPC integration; tests are not proof of production enforcement.

**Slice B (future, separately reviewed):** register one demonstrably trusted local-only event producer; implement verified principal, source attestation and grant acquisition at main/backend; enforce before reading or delivering snapshots; use scope/freshness metadata and test revocation, late responses, switching, no source, Corporate behavior. Do not silently invent a producer.

**Slice C (future):** enterprise multi-user/group grants, audited revocation, durable shared backend, real connectors, realtime replay/reconnect and evidence-content retrieval. Requires security-owner approval.

The following are still **open design decisions**, not permissions silently granted by Slice A: policy owner/admin and group model; trusted desktop login and producer attestation; durable source-to-project mapping; grant expiry/revocation/offline behavior; approved local producer identity; external transport. Without these, production Project Map remains Source Unavailable.

## Release rules

- No new Internet fetch, polling, telemetry, token storage, Enterprise allowlist change, IPC bridge, demo connector or security-policy bypass.
- Do not claim Slice A completes #116, #51, #52 or native Windows #119.
- #124 / draft PR #128 remains independent: real installed Windows UI acceptance is still blocked by QA environment.
- The full #116 acceptance requires implemented authority, trustworthy source integration and negative/revocation tests. This document alone does not close it.
