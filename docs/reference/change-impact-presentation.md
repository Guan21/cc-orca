# Change Impact presentation v1

Implemented for #113 (#52-B), parent #52, roadmap #47. Domain contracts remain
owned by #52-A and #51-A. This layer adds no source, transport or backend.

## Presentation contract

`toChangeImpactViewModels(projectId, signals, snapshot?)` is a pure synchronous
adapter in `src/renderer/src/components/change-impact/`. The caller must authorize
the project and supply an authorized complete snapshot. Project filtering is a
defense against accidental mixing, not an authorization mechanism.

Each `ChangeImpactViewModel` contains signal/project/category identity, affected
paths, task IDs, per-task canonical node and relationship IDs, evidence references,
observed lifecycle, a neutral explanation, limitations and `contentRevision`.
The adapter validates the current detector's single-file contract and canonical
project/task/file/CHANGED identities. Unsupported/malformed observations are omitted.
Ordering and deduplication are lexical and deterministic, without source mutation.
Contradictory versions of one signal in a single input are rejected; callers must
provide one authoritative snapshot, not an append-only list of revisions.

Missing Project State information yields unknown lifecycle and never drops otherwise
supported participants. Snapshot evidence, changed files, runs and uncontrolled
metadata are not copied. Observed started lifecycle is not proof a task remains
active. Neither historical timestamps nor remote contact loss prove current activity
or process exit. Folder workspaces and local/WSL/SSH sources use the same contracts.

## Candidate generation and provenance

The existing `detectChangeImpact` accepts direct project-scoped task-to-file CHANGED
edges with canonical identities and references resolving to development-event
evidence nodes. At least two distinct tasks must independently support the same
file. It emits one candidate per project/file, including all participants. It does
not scan the filesystem or source content.

The adapter preserves each task's relationship references. It never attributes
the shared file node's accumulated evidence, top-level signal union, or Project
State evidence to individual participants. The renderer displays reference and
relationship IDs as escaped plain text; it does not retrieve payloads, make links,
render Markdown/HTML, invoke IPC, log observations or send telemetry.

The presentation validates structure and scope, not evidence authenticity. Only
the detector/source can resolve evidence nodes and prove original attribution.
An empty or missing participation/evidence array cannot support an overlap and is
omitted. No raw conversations, prompts, review bodies or credentials are accepted
as presentation metadata. IDs and repository paths themselves remain sensitive:
authorized producers must not embed secrets in identifiers or paths, and future
drill-down must authorize every evidence lookup. This is not a general DLP filter.

## Historical and false-positive limitations

Tasks may change different lines, execute sequentially, or already be completed.
Accumulated observations may be stale. Shared relative paths across repositories
inside one project retain the domain's identity limitation. Missing events, missing
task IDs, graph truncation and retractions can suppress candidates. An empty list
does not prove there are no conflicts. File overlap establishes no merge conflict,
task dependency, causal impact, owner, concurrent execution or numerical risk.

## Components and Project Map integration

`ChangeImpactSection` accepts `projectId`, `signals` and optional `snapshot`. It
adapts inputs and renders a candidate list plus `ChangeImpactDetail`. Native shadcn
buttons support Tab/Enter/Space, expose pressed selection and control the detail
region. Selection is component-local navigation. Withdrawn candidates disappear;
project changes cannot retain another project's detail. New evidence is rendered
on fresh props even when the selected signal ID remains unchanged.

`ChangeImpactDetail` accepts **validated adapter output only**. The section is the
safe boundary for raw signals. Both components use existing UI tokens/primitives.

After #51-B / PR #114 is integrated:

1. Supply the authorized project ID and matching domain snapshot/signals.
2. Replace its existing inline historical overlap display with this section; do
   not mount both or create another page/state engine.
3. Keep loading/error/source-unavailable and snapshot freshness in Project Map;
   call this section only for an available authorized source. Missing input must
   not be represented as a live, conflict-free team.
4. Add page composition/access-control integration tests and rendered Electron
   checks using the repository background launch/CDP policy before shipping.

No Project Map, desktop navigation or AppWorkspaceShell files are changed here.

## Future attention persistence and audit contract

No authoritative acknowledgement backend is available in these contracts. This
implementation has no acknowledgement/dismissal controls, storage, notifications
or agent blocks. A local selection is never an enterprise decision.

Stable detector IDs describe a project/file candidate, not immutable incidents.
`contentRevision` is versioned canonical serialized content covering category,
project/signal, paths, sorted participants, canonical relationships and evidence
references. It excludes ordering/duplicates, observed lifecycle and display copy.
New participants or evidence change the revision even when `signalId` is stable.
It is an opaque comparison token, not a risk score, timestamp or audit record.
It can contain sensitive identifiers and must not be logged or used as a URL.

A future backend must compute an authoritative revision (or versioned cryptographic
digest of canonical bytes) server-side and store decisions against the tuple
`(projectId, signalId, contentRevision)`. Define review states `unreviewed`,
`acknowledged`, `dismissed`, and `reopened` with actor, authorization scope,
server timestamp, optional reason and immutable audit event ID. Decisions must
compare the reviewed revision atomically with current content; reject stale writes.
Never apply a prior decision to materially new participants/evidence. Emit an
audited reopen transition when content changes, retaining the previous decision
and revision. Formatting/order alone must not reopen. Retractions and disappearance
need explicit lifecycle semantics; disappearance must not erase audit history.

Define whether decisions are personal or project-wide, require project membership
and evidence access, handle idempotency, concurrent reviewers, retention, reconnect,
schema migration and replay. Clients/hosts update independently: negotiate new
transport capabilities and follow remote wire compatibility requirements. Any real
notification routing needs separately authorized audited rules. Explicit dependency
or confirmed conflict assertions need separate authoritative producer contracts.

## Implemented versus future

Implemented: adapter validation/provenance, revision comparison token, reusable
read-only section/detail, deterministic and keyboard interaction tests, documentation.
Future: Project Map composition/live source/freshness, authorized evidence retrieval,
durable decisions and audit/reopen events, notification routing and authoritative
dependency/conflict sources. Relevant CI and maintainer review remain merge gates.
