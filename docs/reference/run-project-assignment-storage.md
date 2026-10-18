# Inert Run-to-Project assignment storage (#139 A1)

This ledger stores organizational declarations only. Every row has
`provenance = user_declared`. Neither a Project reference nor an application
session pseudonym proves human login, consent, Project/Repo/Worktree ownership,
execution location, Task/Dispatch access, or native source authority.

## Activation and approval boundary

`installRunProjectAssignmentSchema` is an explicit, transactional installer.
It is not imported by production composition or the migration chain, does not
change `user_version`, and does not run when constructing the ledger or
`OrchestrationDb`. Normal databases therefore have no assignment table.
Maintainer/security approval of schema, retention and migration is still required
before production activation or merge. This is Draft infrastructure, not feature
delivery. Retention is deliberately unresolved: the append-only triggers prohibit
deletion, including declarations whose Run has subsequently been deleted.

A2 UI/IPC and Lane B remain unimplemented. This change adds no IPC, preload,
RPC, UI, consent/grant issuer, DevelopmentEvent producer, Project Map live data,
Corporate network behavior, external service or dependency. Actual activity
remains Source Unavailable. No existing Draft PR is altered or merged.

## Write contract and transactions

- The caller supplies bounded opaque IDs, an action and an expected per-Run
  revision. These inputs have no authorization meaning at the storage boundary.
  Future approved Main composition must validate the exact Project catalog entry,
  personal-local mode, caller/session and explicit confirmation independently.
- `append` requires an outermost transaction and takes SQLite's writer lock with
  `BEGIN IMMEDIATE`. It re-fetches Run identity from this connection's `runs`
  table and rejects missing, legacy and foreign-home Runs. Existing Run creation
  and legacy migration remain unchanged; no automatic association/backfill occurs.
- SQLite issues a global `INTEGER PRIMARY KEY AUTOINCREMENT` sequence for each
  committed record. It is increasing, not a promise of gap-free numbering or of
  reserving numbers from rolled-back transactions.
- Each new assign/reassign/revoke increments that Run's revision by one, records
  its predecessor, and compares the expected revision under the same writer lock.
  Reassignment appends an assign row; revocation must name the current assigned
  Project. A revoked row remains the latest journal state. A subsequent assign
  must use its revision, so assignment A-to-B-to-A cannot reuse an old revision.
- Request IDs are globally unique. A replay returns the exact original historical
  receipt only when Run, Project, action, session and expected revision match.
  A conflicting replay fails; a receipt is never proof of a current assignment.
  Run eligibility is rechecked even for duplicate requests, so deletion or a
  changed home/legacy status can deny a formerly successful replay.
- No result escapes before COMMIT succeeds. Failed inserts or COMMIT roll back;
  failed request IDs can be retried. Nested writes/schema installation are refused
  without ending the caller's transaction. A busy second writer must retry and
  recheck CAS after the first writer releases the lock.
- Schema CHECKs fix provenance/version/action and predecessor shape; uniqueness
  enforces one revision per Run. Triggers reject UPDATE/DELETE and conflicting
  INSERT OR REPLACE on sequence, request ID or Run/revision. This is an API and
  integrity contract for a Main-owned database, not protection from an actor with
  arbitrary SQL/schema access.

## Assignment revision is not a Project Catalog ownership epoch

The revision protects **assignment history only**. The separately persisted JSON
Project/Setup Catalog is not transactionally coupled to SQLite. Its A-to-B-to-A
ownership changes are not fenced by this journal, and IDs/session pseudonyms
cannot bridge that gap. A catalog entry can disappear while its declaration
remains stored. Storage deliberately does not infer validity from a checkout path,
PTY, coordinator pane, Store timestamp or Run consumer generation.

Future consumers must re-fetch/revalidate the catalog at the approved action and
read boundaries. Missing, ambiguous or changed entries require unavailable/needs
reconfirmation handling. After restart, old rows are historical user declarations;
do not silently promote them into verified current ownership. This conservative
rule does not claim that every offline catalog ownership transition is observable.

## Read, privacy and compatibility contract

`current(runId)` returns at most one latest journal row, including a revoke.
`history` requires one Run ID and a limit of 1 through 100, with an optional
exclusive global sequence cursor. It returns journal order, not other Runs.
Neither method validates current catalog ownership or authorizes a reader.

The explicit returned column list contains only sequence, request/Run/Project IDs,
action, fixed provenance, local session pseudonym, revision/predecessor, schema
version and SQLite timestamp. No Run objective, Task spec/result, messages,
prompts, logs, evidence, secrets or filesystem paths are joined or returned.
IDs must be opaque references, not containers for private content. This internal
storage shape is not an approved renderer/wire payload; future scoped reads need
their own authorization and field minimization.

Explicit installation is idempotent and creates no records for existing Runs.
Opening the database again preserves declarations without changing the normal
schema version or existing Run APIs. No peer wire format changes. Uninstalled
storage calls fail rather than installing implicitly. Existing migration/version
skew regressions remain the compatibility checks; production upgrade/downgrade
activation and retention require separate approval.

## Local work preservation

The original Windows candidate was found on `feature/136-run-creation-provenance`
at `e528ec10b`, rather than in the publication worktree. Its three storage files
were copied byte-for-byte, with SHA-256 comparison, onto a dedicated branch from
`company-work`. The originals and their index state were left untouched.
After copying, review hardened the schema against replacement inserts and added
separate integrity/restart tests; the original ledger implementation/test stayed
unchanged.

Excluded from this PR:

- #119 controller: `config/scripts/run-windows-acceptance.mjs` and its `.test.mjs`.
- Windows QA docs: `docs/reference/windows-acceptance-workflow.md` and
  `docs/reference/windows-development-qa-controller-2026-10-15.md`.
- Combined planning note:
  `docs/superpowers/plans/2026-10-15-windows-qa-and-assignment-storage.md`.
- OMX runtime notes, local tool binaries, prior Draft-stack work, private VM
  evidence, raw logs/screenshots and build artifacts.

No VM is used for A1 verification. Host storage/static checks are not native
Windows QA PASS. #119/native release QA remains blocked; #139 and Phase 2 remain
open. See the [implementation-readiness comment](https://github.com/Guan21/cc-orca/issues/139#issuecomment-6187249463)
and [Windows QA report](https://github.com/Guan21/cc-orca/issues/119#issuecomment-6186555134).
