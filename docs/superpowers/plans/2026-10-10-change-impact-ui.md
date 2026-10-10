# Change Impact presentation implementation plan

Scope: Issue #113, presentation only, based on latest `origin/company-work`.

1. Inspect #113/#52, merged detector and Project State contracts, Corporate network
   boundaries and read-only PR #114 source. Do not alter Project Map or navigation.
2. Test and implement a pure project-scoped adapter. Validate canonical identities,
   preserve independent relationship evidence, sort and deduplicate without mutation,
   reject contradictory duplicate revisions, and expose a versioned content revision.
   Missing task state stays unknown; incomplete evidence cannot support a candidate.
3. Test and implement reusable section and detail components with shadcn primitives,
   neutral historical language, native keyboard selection and evidence IDs as text.
   Selection is local navigation only; implement no acknowledgement controls/storage.
4. Document integration replacing PR #114's inline overlap display, provenance,
   stale/false-positive limits and a future authorized audited revision-aware backend.
5. Run focused adapter/component/domain tests, TypeScript, changed-code static checks,
   Corporate endpoint scan and relevant CI. Obtain independent correctness/security
   review, fix findings and verify again. Keep desktop focus untouched.
6. Commit with Lore decision trailers, push the scoped branch, open a Draft PR against
   company-work and report exact evidence, review findings and remaining gates.

Design decision: use an independent adapter and section rather than changing the page
or storing a parallel project model. Use exact canonical content as a revision token
to avoid hash collisions; future backend may hash canonical bytes authoritatively.
No new dependencies, transport, persistence, notifications or execution effects.
