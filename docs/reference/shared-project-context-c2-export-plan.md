# C2 — Shared Project Context manual export integration contract

Tracking [#145](https://github.com/Guan21/cc-orca/issues/145), parent #143, C1 Draft #144, #55 provider handoff.

**Status:** Pure preview implemented; actual Desktop export requires named Main/security signoff at an exact reviewed SHA. No production IPC, preload, File System, OS chooser, database or network access in this C2 Draft.

## Pure preview interface

- `buildManualContextExportPreview(selection, candidate, nowMs)` returns `{ok, document, json}` or a bounded failure reason; it is not an authorization API.
- Both `selection` and `candidate` are caller-controlled. `selectionGeneration` equality prevents stale UI previews, **not** spoofing or persisted Project Catalog ABA across restarts.
- Project/Task/kind/target match strictly. A Task is mandatory for a `handoff`, and target provider must be explicit. A regular project-context has no target.
- Explicit allowlist covers IDs, claimed provider/Run, dates, goal, completed *claims*, decisions, relative file references, evidence references, risks, remaining work and next action. No unrestricted spreading from candidate objects into output.
- Source provenance is `manual_unverified`; Project state source is `unavailable` until separate authorized native source proof (#116). Context revision is only presentation metadata, not a CAS/grant.
- C1 size, schema, UTC timestamp, expiry, unicode, bounded array and path checks apply. C2 preview additionally rejects future generated timestamps and stale selection-generation.
- NOTE: field allowlisting is not secret-scanning. An allowed free-text string can itself contain a secret, company information or hostile prompt. A reviewed Main data-minimization process and human preview are required before export.

## Proposed human-visible workflow — NOT wired

1. Open a **real** Personal Project management surface, choose exact Project and optional Task; explicitly choose Context vs Handoff and target provider. Do not mount on feature-wall demo.
2. Show only allowlisted metadata; visibly mark all asserted completion/decision information `manual_unverified`, source `unavailable`. Never synthesize task metrics or completed events.
3. Show generated JSON preview and chosen path. Human chooses **Export** explicitly. No background file watcher, implicit automatic export, Git commit, or remote upload.
4. Electron Main separately authenticates the *current* registered BrowserWindow/webContents/main frame, exact loaded document, Electron Session, Personal profile and non-remote/local Project/Task/evidence permission. It must not trust the preview's selector/identity or `selectionGeneration` as authority.
5. Main must re-read current source/catalog/project assignment revision and authenticate access both before and after dialog/destination `await`; reject navigation, project switch, reload, A→B→A catalog mutation, stale Source, unapproved dev document, Corporate, SSH/WSL/paired.
6. Main validates an explicit local output destination (or protected app-data default): canonical path, symlink/TOCTOU, path containment, repository visibility warning, existing file collision, appropriate permissions; atomically write temp/rename and verify success before confirming.
7. Track DevCrew-managed exports for stale/expired/revoked cleanup. Copies outside management cannot be forcibly deleted; audit history retention 14 days is distinct from generated file expiration.

## Approval/negative test matrix

| Concern | Deny/reject behavior expected |
| --- | --- |
| Stale UI preview or switched Project / target provider | Pure builder rejects generation or identity mismatch; Main later independently checks catalog epoch |
| Wrong Project or Task scope / missing current read authorization | Main denies with no export or data disclosure |
| Extra prompt/session/token/Grant fields in candidate | Pure builder does not copy them; Main must prevent secrets in allowed text |
| Expired, future, oversized, bidi/control, malformed, traversal path | Pure validator rejects |
| Agent-supplied `native_attested`, fake Task completion, false source status | No verification authority; fail or downgrade only as clearly unverified data, never promote |
| Foreign renderer, subframe, spoofed localhost, reload during save, Corporate/remote | Main rejects before data/file access and after each async boundary |
| Symlink replacement, path escape, repo export, collision, disk full | Main denies, warns/requests approval where allowed, or fails atomically |
| Agent edits generated JSON | Not authoritative; does not update SQLite/Project Map/task status/permissions |

## Dependency

Merge/review pure C1 contract #144 first; Main/Security reviewer must sign C2 before new file-system exporter/IPC code can be activated. UI/no-privilege mock adapter may be developed separately, but cannot be presented as real export. Installed-app QA must use an explicitly approved environment; frozen #119 VM remains untouched.
