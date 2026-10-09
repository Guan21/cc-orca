# Change Impact Detection v1 implementation plan

**Goal:** Deliver #52-A independently of #51-A, directly on Activity Graph v1.
**Base:** `company-work` at `69f00cd2b7cb95fe59da631ad7373f8a788690fd` (PR #98).
**Branch:** `feature/issue-52-change-impact-detection`.
**Architecture:** Pure TypeScript graph projection with one potential-overlap signal per project/file. Reuse graph identities and path normalization; keep evidence attached to each task/file relationship.
**Stack:** Existing TypeScript, Vitest and repository quality/security gates; no dependencies.

## Investigation and boundaries (before implementation)

Read #52, canonical roadmap #47, #70, graph contracts, projector, reducer and queries.
The user's explicit independent #52-A instruction permits this domain-only slice ahead of #51; roadmap UI sequencing remains intact.

- `file.changed` with a task ID emits direct `task -> CHANGED -> file` edges. Edge evidence is the event ID, while shared file-node evidence aggregates every task's events.
- `run -> BELONGS_TO -> task` and `task/run -> PRODUCED -> code_change -> CHANGED -> file` exist, but traversal alone is insufficient: runs and commits can be reused, and evidence accumulates. `getTasksChangingFile` traverses run context and does not return task-specific provenance.
- Choose direct task `CHANGED` edges for v1, rather than broad context traversal or event/source scanning. This covers #70's explicit task/file events and avoids joining unrelated observations. Run-only and indirect-only observations remain unsupported rather than guessed.
- Require canonical task/file/edge identities and resolvable same-project development-event evidence on each accepted edge. Normalize paths through `normalizeActivityGraphPath` with case sensitivity preserved. Invalid relationships fail closed.
- No available data establishes temporal concurrency, module ownership, causal impact, dependencies, active-task scope or actual merge conflicts. `DEPENDS_ON`/`IMPACTS` are vocabulary, not authoritatively emitted dependency assertions.
- No Activity Graph or Project State types change. No UI, network, source/conversation scan, persistence, automatic execution action, Corporate Skills or #103 changes.

## Implementation sequence

- [x] Create dedicated tracking issue #110 referencing #52/#47/#70 and independence from #108/#109.
- [x] Add real #70 projector/reducer fixtures and failing overlap/provenance tests under `src/shared/change-impact/`.
- [x] Add explicit signal/evidence contract and pure detector. Sort/deduplicate outputs and encode identity components without hashing dependencies.
- [x] Cover 2/3+ tasks, repeats, replay/order, multiple files/projects, normalization/case, absent identities, malformed/dangling/cross-project evidence, shared runs, ID stability and immutable inputs/outputs.
- [x] Document algorithm, evidence validation, historical false positives and integration requirements in `docs/reference/change-impact.md`.
- [ ] Run focused graph/detector Vitest, TypeScript, changed-code/static gates and Corporate endpoint scan; obtain independent correctness/security review.
- [ ] Commit with Lore trailers, push, open draft PR to `company-work`, inspect applicable CI, and report results/gaps without merging.
