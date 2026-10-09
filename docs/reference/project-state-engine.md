# DevCrew Project State Engine v1 — Phase 2 / #51-A

Base: Activity Graph v1 (#70, PR #98). Implementation: `src/shared/project-state/project-state.ts`.

## Boundary and API

`projectActivityGraphState(graph, projectId)` returns a **read-only per-project snapshot** with stable task ordering, typed task lifecycle, separate run/test/review observations, changed-file paths, stable evidence references and summary counters. It is not an event store, transport, durable backend or Project Map UI.

A task is present only when the existing Activity Graph contains a project-scoped task node. The selector reuses the task graph query with task-scoped relationship evidence; it does not traverse shared files or agents backward into another task. Input must be a validated Activity Graph produced by the existing adapters/reducer, with stable producer event identities.

| Field                                         | Source                                                                         | Interpretation                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Task lifecycle `started/completed/unknown`    | Explicit `task.started/task.completed` projected status                        | A missing lifecycle is `unknown`, even if a run succeeded or a file changed                                     |
| Run status `started/completed/failed/unknown` | Explicit agent/session lifecycle                                               | Multiple concurrent/historical runs are preserved; failed run does **not** mark a task failed                   |
| Agent identities                              | Explicit `run —EXECUTED_BY→ agent`                                             | An executing agent is not automatically the task owner                                                          |
| Files changed                                 | Explicit `CHANGED` relationship in task/run context                            | A shared file is not a task dependency or impact assertion                                                      |
| Review counts                                 | Existing `review_package.status` of related packages                           | `requested` is observed; completion is not automatic task completion                                            |
| Test-result counts                            | Existing `test_result.status`                                                  | Counts **observed result nodes**, not total test cases                                                          |
| Observed signals                              | Failed test result, failed run, requested review                               | Evidence-backed historical observations, **not** risk/priority or blocking decisions                            |
| Evidence                                      | Project-scoped graph context `evidenceRefs`                                    | Stable references; no embedded prompt/terminal/review text                                                      |
| Last observation                              | Task-scoped event observations and supported normalized review status versions | Shared file/agent timestamps do not advance another task; **not** a wall-clock online or active-agent heartbeat |

## Not available in v1

No authoritative assignment, module attribution, blockers, dependencies, business risk or next action exists in the current DevelopmentEvent/ActivityGraph contract. The selector intentionally **does not produce** these fields. Consumer UI must present such missing values as unknown, not `none` or `safe`.

Neither `agent.completed` nor `test.completed` means `task.completed`. No `blocked` or `failed` task state is inferred from an agent failure, a stale run or a review request. Remote disconnection does not change any lifecycle in this pure selector.

## Determinism and data protection

The existing Activity Graph reducer owns replay, timestamp/source-event tie breaking and cross-project edge validation. The selector sorts tasks, runs, agent IDs, files and evidence references and mutates neither input nor global state. It does not include source payloads, prompts, credentials, raw terminal output, review summaries or uncontrolled metadata.

Activity Graph v1 already has event IDs and subject-qualified review IDs. Unknown multi-repository identities, incomplete producer correlation or missing taskId are producer/backend concerns; do not derive them from strings in this selector.

When a session is associated with multiple tasks, only each task's explicit event/relationship evidence is attributed to that task. Session-only observations are unavailable in that case. A uniquely associated session can contribute session-only observations. If a shared run's latest lifecycle belongs to another task, its task-scoped status is `unknown`: the merged graph cannot reconstruct an older value. Historical runs with distinct session IDs remain separate.

Subject-qualified normalized reviews can complete an already associated review package without a task ID. Their typed review references and finding references remain available to all explicitly associated tasks, while unrelated task DevelopmentEvent references stay filtered. A normalized completion without supporting review references is unavailable; an earlier request reference alone cannot prove completion. Review completion does not imply a passing verdict or task completion.

Counters count retained observations. Zero tests or reviews means no supported observations of that kind, not success. Failed tests remain historical observations even after a later passed result. Lifecycle contradictions resolve through the reducer's timestamp/event-ID field versions; an explicit later `task.started` can restart a task. The engine has no wall clock, heartbeat, retention or automatic stale-state transition. Recompute from the full current graph after new associations arrive; incremental append-only task caches can preserve obsolete attribution.

## Follow-up responsibilities

- **#51-B Project Map UI:** grouped, compressive visualization with clear unknown and stale indicators, filtered drilldown, usability and human attention.
- **#51 backend stage:** authoritative event ingestion, replay/checkpoint, durable team state, subscription/invalidation, reconnect recovery, versioned transport and access control.
- **#52:** dependency/change-impact signals require explicit typed, evidence-backed relationships; shared file overlap is only a candidate signal.
- **#71/#72/#73:** policy decisions, outcomes and execution contracts stay separate.

## Verification gates

Focused Vitest for empty/multi-project state; unknown/started/completed; replay and reordering; parallel runs; requested/completed reviews; failed tests; incomplete identity; no owner/blocker/dependency fabrication; no raw sensitive fields. Require TypeScript, security scans, Corporate build and PR review before merging. No release or real-time guarantee is implied by a green pure selector test.
