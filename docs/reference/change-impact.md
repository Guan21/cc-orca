# Change Impact Detection v1

Tracking: #110 (#52-A); parent #52; roadmap #47. Requires Activity Graph v1 (#70 / PR #98), independently of Project State Engine #51-A / PR #109.

## Contract and algorithm

Call `detectChangeImpact(graph)` from `src/shared/change-impact/detect-change-impact.ts`. It returns `ChangeImpactSignal[]`, defined in `change-impact.ts`. It is synchronous, pure and provider-neutral; there is no Electron, filesystem, network, database or agent-runtime dependency.

1. Index graph nodes by their existing IDs. Reject unsupported graph versions explicitly.
2. Accept only direct `task -> CHANGED -> file` edges whose endpoints and edge all belong to the same project. Require nonempty task identity and canonical task, normalized file and edge IDs using Activity Graph's existing identity functions.
3. Normalize file metadata with `normalizeActivityGraphPath`: backslashes, duplicate separators, dot and parent segments follow #70; absolute paths and escaping the repository are rejected. Preserve case. Never resolve paths against this machine's filesystem.
4. Retain only nonempty string edge evidence references resolving to canonical `evidence` nodes in that project with matching evidence IDs and `development_event` kind. Ignore malformed, dangling or foreign-project references. An edge with no valid evidence contributes no task.
5. Group accepted relationships by project-scoped file identity and distinct task ID; union and sort each task's relationship IDs and evidence references. Emit one signal for each file with at least two participating tasks, including all participants, rather than pairwise warnings.
6. Sort tasks, evidence references and signals lexically (not locale-dependently). Replays, duplicate edges and reordered events/graph arrays produce identical results. The detector does not mutate graph data; output arrays are newly allocated.

The index/group pass is linear in nodes, edges and examined references before sorting, with memory proportional to the graph index and accepted relationships. Repeated evidence union work grows with evidence per task/file; v1 expects reduced graph snapshots rather than unbounded duplicate edge streams.

## Signal identity

The ID is `['change-impact', 'v1', projectId, 'potential_file_overlap', normalizedPath].map(encodeURIComponent).join(':')`.

This escaped tuple prevents separator collisions and isolates projects. Timestamps, provider, task-list ordering and evidence do not determine identity. Adding a third task or more evidence updates the same project/file candidate. A different file or project creates a different ID. Consumers must not treat a stable ID as proof that its participants/evidence are unchanged; any acknowledgement policy should account for changed contents. IDs describe candidates in a snapshot, not immutable incident episodes.

## Evidence provenance

`file.changed` in #70 emits task/file `CHANGED` edges when the structured event carries a task ID. Their references identify observations supporting that specific relationship. The signal's `taskEvidence` entries contain the task ID, canonical task/file node IDs, relationship IDs and accepted evidence references. Top-level `evidenceRefs` is only their sorted union; use per-task entries for attribution and drill-down.

Never copy evidence from the shared file node: it aggregates events from all tasks. Task-node evidence also contains unrelated task observations. The engine uses relationship evidence instead. Resolution verifies graph consistency, not authenticity or source payloads: producers and evidence storage remain responsible for truthful event attribution. The detector consumes typed graph snapshots; it is not a general schema validator for arbitrary JSON.

Run `BELONGS_TO` and task/run `PRODUCED` edges reliably represent individual observed memberships/production, but they can accumulate across events, reused sessions and shared commits. `getTasksChangingFile` traverses broader run context and does not expose provenance per task. V1 deliberately does not join those paths: taskless, run-only and indirect-only observations are omitted. A future path-based extension must correlate evidence across every hop, address ambiguity and add reused-run/commit tests before enabling attribution.

## Example

Two task-specific events (`event-a`, `event-b`) changing `src/auth/session.ts` in project `p` produce:

```json
{
  "signalId": "change-impact:v1:p:potential_file_overlap:src%2Fauth%2Fsession.ts",
  "projectId": "p",
  "signalType": "potential_file_overlap",
  "taskIds": ["a", "b"],
  "affectedFiles": ["src/auth/session.ts"],
  "evidenceRefs": ["event-a", "event-b"],
  "taskEvidence": [
    {
      "taskId": "a",
      "taskNodeId": "project:p:task:a",
      "fileNodeId": "project:p:file:src%2Fauth%2Fsession.ts",
      "relationshipIds": ["edge:p:CHANGED:project%3Ap%3Atask%3Aa:project%3Ap%3Afile%3Asrc%252Fauth%252Fsession.ts"],
      "evidenceRefs": ["event-a"]
    },
    {
      "taskId": "b",
      "taskNodeId": "project:p:task:b",
      "fileNodeId": "project:p:file:src%2Fauth%2Fsession.ts",
      "relationshipIds": ["edge:p:CHANGED:project%3Ap%3Atask%3Ab:project%3Ap%3Afile%3Asrc%252Fauth%252Fsession.ts"],
      "evidenceRefs": ["event-b"]
    }
  ],
  "explanation": "2 distinct tasks have evidence-backed CHANGED relationships to src/auth/session.ts. This potential file overlap does not establish a conflict, dependency, causal impact or temporal concurrency."
}
```

## Limits and future dependencies

File overlap is a candidate for human attention. Tasks can modify different lines, work sequentially or already be completed. Historical graph accumulation can yield stale candidates. V1 does not infer active status or concurrency from node timestamps. It does not infer ownership/modules from directories, dependencies from shared files, actual merge conflicts or causal impact. It adds no numerical risk score, execution blocking, automatic edits or merges.

No source files or raw conversations are scanned. Renames follow #70's destination file identity; `oldPath` metadata alone does not create a relationship to the previous path. Commits without authoritative file lists cannot participate. Missing task IDs/evidence cause false negatives. Graph truncation or missing evidence nodes can suppress signals. Same relative paths across repositories inside one project remain subject to #70's project/file identity model; the detector does not invent repository identity.

Future explicit dependency detection needs an authoritative structured producer contract: dependency direction, stable project/task identities, evidence identifying the assertion, validity/retraction semantics and, for API/module/schema impact, explicit contract identity and change/use relationships. Existing `DEPENDS_ON`/`IMPACTS` vocabulary alone is not such a producer. Concurrency needs trustworthy interval data. Merge conflict conclusions need an actual merge/conflict computation and its evidence. Each requires a separately reviewed contract and tests.

## Integration requirements (#52-B / #51-B Project Map)

- Supply the complete authorized project graph or retain all needed task/file/evidence nodes in a filtered snapshot. No Project State Engine types are required or changed; call this engine independently from the same #70 snapshot.
- Join task IDs with #51-A's compressed state outside this domain module. Preserve project scope and label outputs as potential file overlap, with evidence drill-down. Folder workspaces, native/WSL/SSH and agent providers share the same structured contracts; transport loss is not a task/run state change.
- Define lifecycle/snapshot freshness and any active-work/time-window selection explicitly before presenting historical candidates as current attention. Choose acknowledgement/dismissal persistence and rerouting rules in #52-B, taking account of new participants/evidence under the same signal ID.
- No `DEPENDENCY_IMPACT` event or graph `IMPACTS` edge is emitted here. Future Attention Router or Project Map adapters must preserve candidate semantics and must not convert overlap into a proven dependency/conflict.
- If exchanging signals over a remote wire later, follow remote-wire compatibility/versioning rules separately; this change introduces no RPC or stream contract.
