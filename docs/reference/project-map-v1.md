# DevCrew Project Map UI — Phase 2 / #51-B

Tracking: #112 (parent #51), canonical roadmap #47. Domain foundations: #70 / PR #98, #51-A / PR #109, #52-A / PR #111.

## Desktop presentation

Project Map is available from the desktop sidebar beside Activity and Review. It reuses top-level views, active-view persistence and Back conventions. The terminal workbench stays mounted while the map is open. The page is keyed by execution host and project, including folder workspaces, so selection cannot cross a project or SSH-host switch.

`ProjectMapPage` accepts a read-only `ProjectStateSnapshot`, optional existing historical `ChangeImpactSignal[]`, loading/error state and optional expected `projectId`. A snapshot for a different expected project or containing foreign-project tasks is rejected. The caller remains responsible for authorization: matching IDs alone does not establish access rights.

- Overview uses the engine summary: total, started, completed, unknown, tasks with failed runs, tasks with failed tests and tasks with pending review observations. The last three count **tasks**, not individual observations or business risk.
- Task list shows lifecycle, associated run count, requested/completed reviews, test observations and latest supported observation time. Detail shows run IDs/status/agent IDs and run evidence, changed files, passed/failed/skipped tests, requested/completed reviews and supporting evidence IDs.
- Unknown lifecycle, no supported run/test/review/evidence observation and unavailable source are distinct. Started/completed follow the latest supported lifecycle observation. Started does not establish current online presence.
- Selected task detail can show historical `potential_file_overlap` candidates, associated task IDs, changed paths and **per-task** evidence references.
- Unknown owner, blockers, modules, dependencies and next action stay unavailable. `started` is an event observation, not proof of live agent activity.
- Project mismatch candidates are excluded; selection keys scope project and task. Selection survives snapshot refresh when the task remains present; otherwise it falls back to the first task. Desktop view changes remount selection; task selection is not persisted to disk. Evidence IDs are inert references, not commands or automatically fetched URLs.
- Loading/error/empty/unavailable states. When no snapshot is supplied, the page clearly states that no authorized project-state source is connected, rather than showing fabricated demo activity.

## Data-source status: unavailable

There is no production authorized DevelopmentEvent → Activity Graph → Project State Engine source connected to desktop. The in-memory event bus and graph/state selectors have tests but no production ingestion/persistence/authorization adapter. Project Pulse and Review Queue demo defaults cannot supply live project truth.

`ProjectMapDesktopPage` intentionally supplies **no snapshot** and displays an explicit source-unavailable state. It imports no demo state, launches no agent, creates no transport, and claims no synchronization or observation persistence. Empty means an authorized snapshot with no observed tasks; unavailable means no connected authorized source. Loading/error hide prior task details.

The next source adapter must specify:

1. Mapping desktop project/workspace and execution-host identity to event `projectId`, including folder and SSH workspaces.
2. Authorization before ingestion, replay, snapshot delivery and evidence lookup.
3. Project-switch invalidation and rejection of late responses from the previous project/host.
4. Loading/failure/unavailable/empty states, and storage/subscription/reconnect/freshness only when implemented and tested separately.

No DevelopmentEvent, Activity Graph or Project State Engine contract changes are needed. The new active-view value is accepted by desktop persistence and the UI schema; older UI RPC peers omit unsupported optional values via existing `tolerateUnknownValues` behavior. #52-B presentation adapter integration remains deferred; the simple historical overlap display does not establish dependency, verified conflict or concurrency.

## Testing and review

Component tests cover overview values, detailed/missing observations, loading/error/empty/unavailable, native keyboard selection, snapshot refresh, stale/mixed-project rejection and foreign overlap rejection. Navigation tests cover sidebar action, Back, restoration, mounted Agent Sessions and project/host selection reset. Existing Pulse/Review and persistence tests are regression gates.

Run focused Vitest, TypeScript, changed-code quality, localization, forbidden-endpoint scan, Corporate build and fresh PR CI before marking ready. Rendered checks must use background/headless CDP without desktop activation. Report native test-wrapper failures or unavailable Electron validation separately: renderer tests cannot prove native runtime behavior.

Do **not** claim a connected live Project Map, complete #51, or close #112 from this presentation-only draft.
