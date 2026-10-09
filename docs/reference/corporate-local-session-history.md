# Corporate local Agent Session History (Issue #99)

Base: `244767ebd1ffdf213cc89ca2648d2ac1c088e1c1` (`origin/company-work`).

## Investigation before implementation

The right sidebar `AiVaultPanel.tsx` obtains rows through `useAiVaultSessions` /
`ai-vault-session-refresh.ts` and `window.api.aiVault.listSessions`. The preload
`corporate-preload-api-filter.ts` replaces the entire namespace with rejecting
functions because `ai-vault` is disabled. This produces the reported error before
any scanner runs. Core handlers already register the backend in Corporate mode.

The name is not a cloud-only subsystem. `ipc/ai-vault.ts` routes local requests
to `cached-session-list.ts`, then `session-scanner-background.ts`. The production
scanner service is a local child process using Node IPC, not a network service.
Discovery reads provider directories, including Claude's projects and Codex's
sessions, environment-configured roots, managed account homes and running WSL
homes. Existing parsers read JSON/JSONL/SQLite stores. The parse cache is persisted
under local user data; the list cache is in memory. Titles and first prompts are
read from local records. Observability spans write to a local diagnostic sink.
These paths contain no HTTP client, cloud sync or account authentication calls.

The same namespace also supports `all`, SSH and paired-runtime scopes. Those
routes discover remote hosts and use SSH or runtime RPC. Simply removing the
preload gate would expose them. Title resolution and resume preparation also
have remote routes. Corporate must refuse those routes before discovery or
dispatch. Existing cloud-relay, SSH, mobile, native-chat and telemetry capability
gates and the Corporate Network Contract remain in force.

Search and workspace/project filters run locally in
`shared/ai-vault-session-filters.ts`; folder projects are supported by the existing
project mapping. Listing preserves scoped discovery beyond the global recency
limit. Resume uses existing preparation, account-home refusal and terminal launch
policies. Corporate permits only Claude and Codex launches; browsing a transcript
does not grant permission to launch another provider. Scanners already handle
absent roots, malformed files and partial failures through empty results and
issue rows; the UI has empty, recoverable-empty, error and retry states.

## Design and implementation plan

1. Add regressions for Corporate preload exposure and main-process local routing,
   including denial before remote discovery/preparation. Observe the failures.
2. Declare the existing local history methods explicitly in a dedicated policy
   module. Preserve rejecting bridges for undeclared methods. Keep the broad
   `ai-vault` capability disabled; do not edit CLI, Skills or branding (#100).
3. Guard list, title, resume, prompt, subagent and delete entry points in main.
   Corporate `all` means all local history; explicit remote or malformed hosts
   fail clearly. Default builds retain their existing host-routing behavior.
   Preserve provider launch and structured-session ownership restrictions.
   Require every Corporate resume to check the local transcript first; missing,
   unreadable or empty files return an actionable refresh-and-retry error.
   Refuse Windows external UNC/device UNC paths before file I/O, including
   configured scanner roots. Preserve supported WSL and local extended-drive paths.
4. Exercise real transcript discovery, local search and folder/project filtering,
   empty/corrupt/missing records, resume and forbidden network dispatch. Reuse
   existing scanner, renderer and Corporate network contract regression suites.
5. Run tests, typechecks, changed-file lint and Corporate build. Commit with Lore
   trailers, push and open a PR against `company-work`; do not merge or close #99.

Rejected: enabling the whole `ai-vault` capability (exposes remote dispatch).
Rejected: implementing another local scanner/API (duplicates working machinery).

## Security and validation boundaries

Local read operations require no Internet connection, remote authentication or
endpoint declarations. Explicit session resume starts an already permitted CLI;
any provider traffic remains governed by the existing provider-specific contract.
No endpoint, dependency, network permission or cloud sync is added.

The local list adapter passes its existing arguments directly to the shared
local-only cache rather than rebuilding an identical argument object. This keeps
the IPC module below its existing line limit without a new abstraction.

Network tripwires exercise app-owned HTTP/socket entrypoints; they do not observe
kernel traffic through filesystem mounts or mapped drives. External UNC spelling
is refused, but administrators must still control OS mounts and drive mappings.

Windows unit/build validation cannot establish signed packaged macOS behavior.
M2 Mac packaged Corporate acceptance remains required before closing #99.

## M2 Mac acceptance

1. Build and sign/package Corporate from the PR commit using the existing macOS
   Corporate packaging procedure. Record commit SHA, package hash and signature.
2. With Internet disconnected, open Agent Session History. Check there is no
   `ai-vault` capability error and existing Claude/Codex sessions appear.
3. Search known title/prompt text. Switch workspace/project/all, including a plain
   folder workspace. Confirm only matching local sessions are shown.
4. Resume a populated Claude and Codex session using the approved account and
   permission policy. Confirm the selected conversation opens. Do not change CLI
   code or bypass permission checks if the provider reports its own error.
5. Use an isolated test profile with empty history, malformed JSONL, a removed
   transcript and a stale managed Codex home. Verify empty/error/issue states and
   retry, with no crash or silent fallback to another account.
6. Use the Corporate runtime egress observer plus independent network capture
   during panel open/search/filter/refresh/focus/idle. Expect zero external traffic.
   Keep explicit provider invocation traffic separate and attributable.
7. Confirm SSH/cloud/mobile/native chat/telemetry remain restricted, and a normal
   build retains its local and existing remote history behavior.

## Changed files

- `src/shared/corporate-session-history-policy.ts` and its test: declared local
  methods, local host scope and Windows network-path refusal.
- `src/preload/corporate-preload-api-filter.ts` and its test: expose declared
  local history methods while keeping undeclared methods rejected.
- `src/main/ipc/ai-vault.ts`: local-only Corporate list routing and disabled
  native-chat ownership projection.
- `src/main/ipc/ai-vault-corporate.test.ts`: IPC routing, resume and security
  boundary regressions.
- `src/main/ipc/ai-vault-resume.ts`: host, provider and transcript preflight.
- `src/main/ipc/ai-vault-session-title-routing.ts`: local title routing guard.
- `src/main/ipc/ai-vault-subagent-list.ts`: local subagent host/path guard.
- `src/main/ipc/ai-vault-delete.ts`: local deletion host/path guard.
- `src/main/ai-vault/session-first-user-prompt-handler.ts`: local prompt guard.
- `src/main/ai-vault/session-history-local-paths.ts`: scanner root validation.
- `src/main/ai-vault/session-scanner-service-env.ts`: reuse the existing root
  variable allowlist for validation; child environment policy is unchanged.
- `src/main/ai-vault/session-scanner.ts`: validate local roots before scanning.
- `src/main/ai-vault/session-title-resolver.ts`: validate fallback roots before
  title discovery.
- `src/main/ai-vault/corporate-local-session-history.test.ts`: real filesystem
  fixtures, search/filter/empty/corrupt/missing cases and network tripwires.
- `src/renderer/src/lib/ai-vault-session-resume-preparation.ts` and its test:
  require Corporate resume preflight.
- This document: investigation, design, acceptance procedure and validation.
- `config/scripts/corporate-electron-generated-profile-contract.test.mjs`: locate
  the extracted profile chunk as well as the legacy selection chunk, so the
  existing pinned-profile check follows the new bundle layout.

## Verification on Windows / Node 24

- Focused history, cache, prompt, filters, refresh, preload, resume and Corporate
  network/capability policy suites: **231 passed in 15 files**. Includes real local
  transcript fixtures and forbidden network/remote-dispatch assertions.
- Codex account-home resume and Corporate runtime egress observer/installation
  suites: **31 passed in 4 files**.
- Corporate generated profile and packaging contracts: **7 passed in 2 files**.
  The generated resolver remains Corporate even with an unset or default ambient
  profile, including the scanner child process's bundled dependency graph.
- Broader local history run: **762 passed, 25 failed in 96 files**. A separate
  detached worktree at the exact base reran all seven failing files: the same
  **25 named failures** reproduced (72 other tests passed). These are existing
  Windows path/fixture failures; no unrelated fixes are included in this PR.
- Node, CLI and web TypeScript projects passed. The web project exceeded a 3 GB
  heap cap, then passed alone with `--max-old-space-size=4608`.
- Oxlint, changed-code quality, type-aware code quality and React Doctor passed
  against the exact base SHA. The max-lines ratchet passed without new bypasses.
- Corporate forbidden endpoint scan: **12,327 files, zero known baseline
  violations, zero new forbidden violations**.
- `pnpm run build:electron-vite:corporate` passed for main, preload and renderer;
  renderer boot-graph validation passed. A first concurrent run exhausted host
  memory; the sequential retry passed. Existing chunk-size/CSS warnings remain.
- Native dependency postinstall did not complete on this Windows checkout
  (native rebuild path/lock failures); dependencies were installed with frozen
  lockfile and scripts disabled for source tests/build. No lockfile change.
- Signed/packaged macOS Corporate runtime, actual M2 provider CLI resume and
  independent runtime packet capture remain **pending**. No macOS test is claimed.
