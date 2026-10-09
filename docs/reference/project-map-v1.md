# DevCrew Project Map UI — Phase 2 / #51-B

Tracking: #112 (parent #51), canonical roadmap #47. Domain foundations: #70 / PR #98, #51-A / PR #109, #52-A / PR #111.

## Initial deliverable

`src/renderer/src/components/project-map/ProjectMapPage.tsx` is a first **read-only visual consumer**. It accepts a `ProjectStateSnapshot` and optional `ChangeImpactSignal[]`, not raw agent transcripts or new network routes.

- Compact project metrics: observed task count, started and unknown lifecycle counts, historical overlap candidate count.
- List/detail layout for task lifecycle, observed runs, failed test/run counts, review completions, changed paths, last *recorded* observation timestamp and evidence references.
- Selected task detail can show historical `potential_file_overlap` candidates, associated task IDs, changed paths and **per-task** evidence references.
- Unknown owner, blockers, modules, dependencies and next action stay unavailable. `started` is an event observation, not proof of live agent activity.
- Project mismatch candidates are excluded; selection keys scope project and task. Project-scoped authorized input remains the responsibility of the eventual source adapter.
- Loading/error/empty/unavailable states. When no snapshot is supplied, the page clearly states that no authorized project-state source is connected, rather than showing fabricated demo activity.

## Why isolated first

The existing Project Pulse and Review Queue are presentation MVPs with demo-event defaults. Neither is yet a dependable shared Team backend. Exposing a new Project Map in desktop navigation without an authorized data source could misrepresent synthetic or stale state as live project truth.

This draft introduces an independently reviewable component with injected read-only typed data. It is **not currently mounted in `AppWorkspaceShell`**, and is **not** a completed user-visible Project Map release.

Follow-on stages must:

1. Confirm intended navigation entry, view type/store persistence and Corporate-only visibility rules without affecting existing workspace view persistence.
2. Identify/implement an **authorized, project-scoped event/graph data source** with project-switch isolation. If no source is available, explicitly communicate the limitation; do not invent IPC or internet egress.
3. Keep one evidence/provenance contract for Task detail, File overlap detail and future Review attention; design drill-down to actual source events only when those events are authorized and available.
4. Preserve errors, disconnection, unknown and stale status; add accessibility, responsive and localization validation.
5. Define backend-owned persistence/realtime/reconnect separately under parent #51, and later durable warning ack/dismiss under #52-B.

## Testing and review

The draft component tests cover empty/unavailable and error presentation, task selection, candidate visibility, foreign-project candidate rejection and explicit unknown-state text. Run focused Vitest, Node/web typecheck, static analysis, localization/formatting, Corporate endpoint checks and overall CI before marking ready or merging.

Do **not** claim a connected live Project Map, complete #51, or close #112 from this presentation-only draft.
