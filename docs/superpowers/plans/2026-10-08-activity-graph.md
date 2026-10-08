# Activity Graph v1 implementation plan

**Goal:** Implement #70 from company-work@244767ebd1ffdf213cc89ca2648d2ac1c088e1c1 without changing Phase 1 contracts or UI.

**Architecture:** Pure DevelopmentEvent projection into project-scoped typed nodes and edges, deterministic incremental reduction, and bounded domain queries. Existing session IDs identify runs; normalized review results supply findings. Events remain the source of truth.

**Tech stack:** TypeScript, existing Zod event validator, Vitest; no dependencies.

- [x] Define contract and escaped project-scoped identities under `src/shared/activity-graph/`; test delimiter collisions, path normalization and actor distinction first.
- [x] Implement event projection covering all eleven v1 categories, minimal referenced nodes, event evidence, explicit review adapters, and metadata allowlists. Do not infer assignment from an actor or execution from a reviewer.
- [x] Implement reducer with project validation, endpoint validation, evidence union, chronological metadata updates with stable event-ID tie-breaks, sorted output and replay deduplication. Test replay and reversed arrival order.
- [x] Implement `getNodeById`, incoming/outgoing edges, typed node filtering and task/run neighborhoods. Demonstrate shared-file impact without fabricated dependency edges.
- [x] Document vocabulary, identity/version rules, all mappings, security boundary, review semantics and downstream examples in `docs/reference/activity-graph.md`.
- [x] Run graph and Phase 1 focused tests, aggregate and Node/web typechecks, changed-code quality, corporate build and `git diff --check`. Independently review contract and correct findings.
- [ ] Commit with Lore trailers, push dedicated feature branch and open PR against company-work without closing #70. Report evidence and remaining CI/review gates.
