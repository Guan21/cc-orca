# Personal-local Run assignment A2 implementation plan

**Status: privilege, production schema, and installed acceptance BLOCKED.**
This Draft is preparation, not a delivered desktop feature. It is stacked on
reviewed A1 #140, `359d351bab3a4673f0ed69e61de2805c76d09a5b`, and reuses that ledger.
No duplicate storage implementation, production import, migration, IPC, preload
capability, operational button, or event producer is authorized by this plan.

**Goal:** let a Personal desktop user explicitly select an existing local,
nonlegacy orchestration Run and registered local Project, associate/reassociate
or revoke it, and read a minimal declaration without implying execution.

**Architecture:** one small real Run selector and assignment section, a dedicated
Main desktop handler, Main-owned native confirmation, and A1's existing SQLite
writer. Renderer selection is a candidate only. Main owns every eligibility,
identity, freshness, confirmation, and redaction decision. No generic authorization
framework and no new orchestration RPC method.

**Tech stack:** existing Electron, React, shadcn primitives, Store Project catalog,
OrchestrationDb, A1 RunProjectAssignmentLedger, Vitest, and Playwright CDP.

## Approval audit and decision owners

On 2026-10-15, read all current #138/#139 comments and #141's body, plus A1's
final-head review. Evidence:

- [#138 product choice](https://github.com/Guan21/cc-orca/issues/138#issuecomment-6184212451)
  selects A first and explicitly withholds security consent.
- [#138 formal gate request](https://github.com/Guan21/cc-orca/issues/138#issuecomment-6190935892)
  requests named approval; it does not give it.
- [A1 technical COMMENT](https://github.com/Guan21/cc-orca/pull/140#pullrequestreview-5530720465)
  reviews inert storage only. Green code CI is not approval.
- #139's latest comment says approvals are requested, nobody is auto-assigned as
  security approver, and without approval only contract/view-model work may proceed.
- `.github/CODEOWNERS` names localization and cloud owners, no Main/SQLite/security
  owner. Neither #141 assignees nor those unrelated ownership rules appoint one.

| Responsible decision maker                                          | Required explicit decision                                                                                                                                                                            | Current evidence                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **@Guan21, repository owner/maintainer**                            | Name the accountable schema maintainer and security approver; record their roles and scope. May approve as maintainer explicitly, but ownership/product priority alone grants nothing.                | No named security approver or approval found                     |
| **Schema maintainer and security owner appointed by @Guan21**       | Production versioned migration, allowed profile, append-only retention duration, export, Run/Project deletion and whole-profile erasure, backups/WAL cleanup, downgrade and upgrade compatibility     | Missing; cannot invent a retention default or activate installer |
| **Main/preload maintainer and security owner appointed by @Guan21** | Exact Personal-only caller/frame/document/session lifecycle below, native confirmation contract, dedicated read/write/list capability and minimal DTO, post-dialog fences and remote/Corporate denial | Missing; COMMENT review is insufficient                          |
| **Authorized QA operator/environment owner, appointed by @Guan21**  | Supply an isolated authorized installed-app environment and approve native test execution/release acceptance                                                                                          | Missing; frozen #119 Windows VM must remain untouched            |

Security ownership is **unassigned**, not an inferred person's name. @Guan21 must
appoint the person before implementation can claim named security approval.
Record separate yes/no decisions with reviewer handle, role, exact reviewed SHA,
contract version, conditions, and link in #138/#139. No self-approval by this agent.

## Repository evidence: real entry points and gaps

| Concern                | Verified code and implication                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Run management | No orchestration Run management view exists. `components/automations/AutomationListToolbar.tsx`, `AutomationRunsDashboardSurface.tsx`, and `AutomationRunHistory.tsx` handle **AutomationRun**, not orchestration RunRow. Do not reuse those IDs.                                                                           |
| Storyboard             | `src/renderer/src/components/feature-wall/agents-orchestration/OrchestrationPage.tsx` is a demo. Do not mount assignment there.                                                                                                                                                                                             |
| Real Run data          | `src/main/runtime/rpc/methods/orchestration/runs/runs.ts`: `runList/runShow` use `runtime.getOrchestrationDb().listRuns/getRun`; `runCreate` remains objective/from only. Reuse DB operations, not raw RPC receipts that include objective/coordinator metadata.                                                            |
| Main registration      | `src/main/startup/main-window-core-services.ts` passes mainWindow.webContents.id to `src/main/ipc/register-core-handlers/register-core-handlers.ts`; once-only registration refreshes trusted window identity on recreation.                                                                                                |
| Existing trust         | `src/main/ipc/ui.ts` tracks the exact trusted webContents ID. `isTrustedUIRenderer` also allows a dev-origin fallback; never use that fallback here. `ui:get/ui:set` are not privileged selection authority.                                                                                                                |
| Window/document        | `src/main/window/createMainWindow.ts` constructs sandboxed/context-isolated desktop window with preload and loads dev URL or packaged renderer index. No separate session partition: capture the actual Session object. Existing `renderer-document-navigation.ts` same-origin rules are broader than exact document trust. |
| Generic bridge         | `src/main/ipc/runtime.ts` checks main frame for `runtime:call`, then dispatches ALL_RPC_METHODS. This does not establish this operation's desktop identity. Do not add assignment to that registry, CLI, relay or paired wire.                                                                                              |
| Profile                | `src/shared/corporate-build-profile.ts:getOrcaBuildProfile` reads the build literal before environment fallback; `electron.vite.config.ts` stamps Main/preload/renderer. Personal is `default`. Main must reject corporate independently of masking.                                                                        |
| Preload                | `src/preload/index.ts` composes window.api and applies `corporate-preload-api-filter.ts`; `src/preload/api-types.ts` is its type contract. There is no assignment namespace.                                                                                                                                                |
| SQLite                 | `src/main/runtime/orca-runtime-automation-operations.ts:getOrchestrationDb` owns lazy userData/orchestration.db; `db/orchestration-db.ts` owns connection/WAL/migrate. Use `new RunProjectAssignmentLedger(runtime.getOrchestrationDb().db)` only after gates. No second DB, connection or JSON ledger.                     |
| Projects               | `src/main/ipc/repos/repo-catalog-handlers.ts` uses Store.getProjects/getProjectHostSetups. `src/shared/project-types.ts` separates Project and host setup. Logical Project membership alone says nothing about local execution. Folder workspaces remain supported.                                                         |

## Concrete desktop surface after approval

Add a compact **Run associations** section to the real Settings surface, implemented
in `src/renderer/src/components/run-project-assignment/RunAssignmentSection.tsx`.
Mount inside `src/renderer/src/components/settings/GeneralPane.tsx` after its
workspace settings section, reached through `settings-setup-workflow-section-renderers.tsx`.
Add the corresponding search entries in the existing General settings search
module. Label Run IDs as orchestration Runs; do not use AutomationRun or demo data.
Use existing shadcn Button/Select and main.css tokens; follow docs/STYLEGUIDE.md.

1. Explicit bounded Run chooser (ID and created time, no objective/task/log/path).
   Empty initial selection; next-page cursor is scoped/bounded by Main. This new
   selector read privilege is part of the approval, not a hidden use of generic RPC.
2. Explicit registered local Project chooser; no default-first Project. Show only
   Main-projected eligible labels/IDs. Require one unambiguous local host setup;
   reject SSH/WSL/paired/remote setup even when the Run's home DB is local.
3. Selected Run status: Unassigned, User-declared association, Needs reconfirmation,
   Revoked, or Unavailable. Always show **Not verified execution** for declarations.
4. Assign/Reassign/Reconfirm and Revoke require native confirmation. Revoke targets
   the current ledger Project ID, including a deleted Project; deletion must not
   strand the user with an unrevokable declaration. Do not display retained labels
   or paths for deleted/ineligible Projects. Select a fresh eligible Project to
   reassign; never silently resolve a renamed/recreated ID.
5. Pending dialog disables repeated actions. Cancel leaves state unchanged.
   Conflict invalidates the read and asks the user to refresh/reconfirm; no silent
   retry. Error/rollback never shows success. Selection/navigation advances an
   in-memory generation; ignore late responses even after A→B→A selection. Call
   `beginAssignmentRead` before every refresh, including catalog invalidation;
   same assignment revision does not mean same catalog/session state. Only one
   response belongs to each read generation.

Only `run-assignment-model.ts` and its tests are implemented in this Draft. They
are unmounted, import no Main/SQLite/Electron/bridge, and cannot authorize or write.
Their generation checks protect display state, not Main identity. Full UI and
redacted Main reads remain gated; no user-visible delivery is claimed.

## Exact proposed Main contract (requires security approval)

Implement `src/main/ipc/run-project-assignment.ts` only after signoff. Proposed
channels: `runProjectAssignment:listRuns`, `:read`, `:confirmMutation` in core
registration, not generic RPC. No global assignment history/read-all channel.

The dedicated `:read` accepts `{runId: string | null, selectedProjectId: string | null}`. At
admission, increment a Main per-window selectionRevision even for identical
candidates; clear the old selection binding and any pending dialog authority.
`runId:null` clears selection and returns no assignment data. A valid Run with
`selectedProjectId:null` still permits its scoped summary and a revoke binding
to the **current ledger Project**, even if that Project is deleted; it permits
no assign. For assign, resolve the candidate and bind its eligible Project/setup
separately from the current ledger Project. Return
`{selectionRevision, assignment: AssignmentSummary}` only to that exact document.
`:confirmMutation` includes this selectionRevision; compare against Main's current
binding as well as exact Run, operation-specific Project and revision. It is a stale-selection fence,
never an authorization credential. Any read failure leaves no mutation binding.
Navigating away must cancel/invalidate the binding through another scoped read
with no selection or the document lifecycle; UI disables selection while a dialog
is pending. A failed IPC delivery does not preserve authority. `:listRuns` accepts
only a bounded limit and validated cursor and returns IDs/created times/cursor,
not existing raw Run receipts. No renderer-supplied setup or profile is trusted.

### Identity and admission

- Obtain the current registered BrowserWindow object from Main; require not
  destroyed, exact event.sender === window.webContents, exact current trusted ID,
  event.senderFrame === window.webContents.mainFrame, frame.parent === null,
  same captured Session object, and a live Main-issued application-session epoch.
- Main's loader records the expected canonical app document (packaged index file
  via Node URL/path utilities, or the explicitly configured dev document URL).
  Compare protocol/host/path/query exactly. Permit only reviewed hash routing;
  origin match alone or arbitrary same-origin paths never qualify. Dev origin
  fallback in ui.ts is excluded. Security owner must explicitly approve whether
  configured dev documents are eligible; default proposal is packaged-only for
  production acceptance.
- Main maintains a per-desktop document generation, minted only after its known
  document finishes loading. Invalidate synchronously on main-frame navigation
  start (including same URL reload), render-process-gone, window close/destruction,
  replacement, session change and selected Project/setup change. Capture current
  WebFrameMain object plus process/routing IDs and generation synchronously at IPC
  admission. A frame object/URL alone cannot distinguish same-URL reload.
- Require Main build-stamped effective profile `default`; corporate always denied.
  Reject non-desktop, remote/serve/paired, SSH and WSL contexts before DB access or
  dialog. Profile, confirmed flags, app-session IDs and epoch supplied by renderer
  are never authority. Main session pseudonym does not authenticate a human login.
- Parse strict bounded keys only per operation: mutation runId/projectId (nonempty,
  ≤256, no control characters), action assign/revoke, safe expectedRevision ≥0 and
  below MAX_SAFE_INTEGER, and current selectionRevision. Reads allow nullable
  candidates with the distinct clear-selection and revoke-only behavior above.
  Main generates requestId and applicationSessionId. Reject unexpected fields.

### Freshness, confirmation and commit

1. Independently re-fetch exact Run from local OrchestrationDb, require nonlegacy
   and home_database=this_database. Local storage alone does not prove local
   execution: deny known remote coordinator/setup context and unverifiable context.
   Assign requires explicit eligible local Project/setup selection, including
   folders. Revoke instead binds the current ledger Project ID and revision;
   absence/ineligibility of that Project does not block deletion of the claim.
   Never display a deleted/ineligible Project label or accept a different ID for revoke.
2. Main keeps per-window selected Run/Project/setup and a monotonically increasing
   selection/catalog epoch. Bind current selection to the request, not ui:set or
   renderer generations. Snapshot exact Project/setup identity and current ledger
   revision. Track **every** catalog mutation, including remove/recreate and ABA,
   plus selection changes, before awaiting. Do not infer an epoch from equality
   after awaiting. A1 assignment CAS alone does not fence Store JSON.
3. Use `dialog.showMessageBox(currentMainWindow, ...)`; Main constructs sanitized,
   bounded text from freshly fetched Run ID and Project label. Explicit buttons
   Cancel (default and cancelId) and Associate/Reassign/Revoke; show old→new for
   reassignment and user-declared/not verified execution. Strip controls/bidi
   spoofing from display labels. No renderer HTML or confirmed=true shortcut.
4. After dialog resolves, repeat every identity/profile/session/frame/document,
   window, selected Run/Project/setup and catalog epoch check; re-fetch Run and
   both involved Project records; compare expected assignment revision. Reject any
   invalidation, including same-URL reload, A→B→A or mode switch. Cancellation
   performs no write. At most one pending mutation per window/Run.
5. On unchanged state, without another await, call existing A1 append once with
   Main-generated receipt/session fields. Keep catalog/selection fencing and
   append synchronous in Main; cross-process writers require a durable catalog
   fencing design and new review, not this in-memory epoch. No production activation
   until all catalog writers are accounted for.
6. A1 owns outermost BEGIN IMMEDIATE, CAS and COMMIT/ROLLBACK. Return no success
   before COMMIT. Map revision conflict to conflict, SQLITE_BUSY to retryable
   unavailable (fresh confirmation required), rollback/failure to unavailable.
   Never leak SQL/error text. No automatic replay as new consent. A historical
   duplicate receipt is not current success: re-read current revision/action/Project
   after append and project current state; fence delivery again. No broadcast.

### Read and reconfirmation

Authorize read independently on every invocation with the same identity/profile
and selection checks; recheck immediately before delivery. No background polling,
network, telemetry, cross-Run dump or generic RPC widening. Bounded current DTO:

```ts
type AssignmentSummary = {
  runId: string
  projectId: string | null
  projectLabel: string | null
  status: 'unassigned' | 'user_declared' | 'needs_reconfirmation' | 'revoked' | 'unavailable'
  revision: number
}
```

Construct fields explicitly in Main, never spread raw ledger rows. Omit requestId,
applicationSessionId, global sequence, objective, tasks/spec/results, evidence,
logs, paths, coordinator/pane IDs and raw exceptions. Show Project label only if
currently registered, eligible and within the selected caller scope. A foreign
Project claim yields unavailable without its ID/label; no existence oracle.
Missing Project may yield opaque current declaration ID only for explicitly
authorized revoke of that selected Run; never reuse its old label. Scope of that
ID disclosure must be explicitly approved. History, if approved, is per-selected
Run, at most 100 entries with the same projection and independent checks.

After restart/session loss/catalog mutation, existing assigned rows are historical
and **needs_reconfirmation**. A1 has no durable catalog owner epoch: keep a
Main-only current-session confirmation map keyed by Run/revision/catalog epoch;
absence means reconfirmation, never auto-promotion. Rename/setup rebind/remove and
recreate invalidate confirmations. Revoked remains revoked. Reconfirm is an
explicit new assign row with current CAS and another native confirmation. Missing
schema/unsupported version is unavailable; reads must never install schema.

## Ordered execution and adversarial verification

- [x] Read approval evidence and inspect actual desktop/Main/preload/DB entry points.
- [x] Stack on reviewed A1; preserve its five files byte-for-byte.
- [x] Add pure selection/intent/read-presentation tests, without importing model
      into production UI. Test selection ABA, cross-Run responses, stale revision,
      unsupported contexts, reconfirmation, missing labels and projection leakage.
- [ ] Record named schema/retention and Main/security decisions above. **STOP gate**
      for all following production work; do not translate this checkbox into approval.
- [ ] Add approved versioned migration in `db/schema/migrate.ts` with old DB,
      repeat migration, unsupported future version, rollback and downgrade tests.
      Reuse A1 schema installer; decide profile lifecycle before changing user_version.
- [ ] Add dedicated Main handler and strict narrow preload API after writing
      negative tests first. Touch core registration, desktop loader lifecycle,
      preload index/api-types/filter only within the approved contract. Audit every
      Store catalog writer and Project/setup selection writer for epoch fencing.
- [ ] Mount section in Settings; add bounded eligible selector adapter rather than
      exposing runShow receipts. Test React empty/loading/disabled/conflict/cancel and
      accessible button labels. No feature-wall, AutomationRun, Project Map changes.
- [ ] Main adversarial tests: foreign/unregistered/replaced window; popout/browser;
      subframe; spoofed origin; same-origin wrong path; wrong Session; reload and
      same-URL navigation during dialog; render crash; after-await profile change;
      spoofed confirmed flag; malformed payload; absent/legacy/foreign-home Run;
      Corporate packaged profile with forged environment; remote/SSH/WSL/paired denial.
- [ ] Main freshness tests: Run switch, Project switch and ABA, catalog rename,
      setup rebind, remove/recreate, concurrent revision, stale duplicate receipt,
      cancel, double click, post-dialog Run deletion, rollback and SQLITE_BUSY.
      Assert zero append/dialog/read calls where admission fails, zero success on
      rollback, and no raw ledger fields/error text on current/history/error paths.
- [ ] Real SQLite integration uses A1 two-connection tests for COMMIT/ROLLBACK,
      CAS, append-only/replacement guards and restart. Add Main→real ledger conflict
      tests; pure model tests cannot establish unauthorized sender or native safety.
- [ ] Background hidden-renderer CDP checks with ORCA_BACKGROUND_LAUNCH=1 using
      electron skill; no window activation/focus APIs. Rendered checks not run here.
- [ ] Installed native acceptance on a separately authorized environment. Existing
      frozen Windows VM remains untouched and native acceptance remains BLOCKED.

Run scoped Vitest plus A1 ledger/schema and profile/preload suites; `pnpm tc`,
changed-file static analysis, scoped Oxlint/oxfmt, and
`node config/scripts/corporate-forbidden-endpoint-scanner.mjs`. Publish exact-head
GitHub CI evidence, separating skipped native lanes and auxiliary failures.
This preparatory draft does not claim the pending Main adversarial tests pass.

## Boundaries and completion

No new dependencies, RPC/wire change, CLI runCreate change, source authority,
DevelopmentEvent producer, Task/Dispatch privilege or Project Map activity.
User-declared associations are organizational metadata only. Keep #140 and this
A2 PR Draft; do not merge Drafts, close #138/#139/#141 or close Phase 2. Update
those issues with exact SHA/CI, approval audit, named decision request and native
BLOCKED status. Delivery requires approval, privileged implementation and native
acceptance; this plan and model deliberately do not assert those outcomes.
