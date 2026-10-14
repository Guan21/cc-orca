# B3 Main identity and binding evidence

Status: Main-private, unwired infrastructure. No DevelopmentEvent producer is approved or attached. A desktop application session identifies a local application reader; it is not personal consent, enterprise authentication or a grant.

## Trust boundaries

The B2 registry catalog and principal list are injected trust assumptions. B3 does not make a catalog an attestation authority. No production composition, preload, IPC, CLI or RPC surface is added. Structural identity resolution must stay distinct from source approval and registration. Missing proof is NOT_PROVEN, never a local fallback or an authorized empty observation.

Existing Main records inspected include Store project/repository/setup inventories, `project-types.ts`, `folder-workspace-types.ts`, worktree metadata and `worktree-host-ownership.ts`. The latter deliberately supports legacy host fallback for other callers; that fallback is insufficient for a trusted source. Folder project-group membership and renderer-owned host stamps do not prove exact project/setup/repository ownership. `updatedAt` is not a monotonic ownership or registration revision. Runtime preferences and host labels do not attest the realm that actually executed an operation.

`inspectProjectSourceIdentity` reconciles unique exact project/setup/repository/worktree records and canonical checkout identity. Its immutable `matched-records` snapshot is a consistency/change detector, never a source scope, ownership revision or authority. `resolveProjectSourceBinding` always refuses registration with typed NOT_PROVEN, including when a fabricated inventory matches. Folder ownership cannot currently be independently reconciled. B2 registration/incarnation and policy fences remain unchanged.

`ProjectSourceReaderIdentity` reuses the real Main trusted desktop registration lookup, checks exact window/WebContents/current-frame objects and exact authorized document path, and mints per-instance application session and per-document generation proofs. No URL-origin fallback is used. A Main-private monotonic registration revision in `ipc/ui.ts` prevents replacement/restoration and same-ID registration from preserving old authority. Navigation start/commit, renderer loss/destruction and window close retire old proofs; session close permanently ends the boundary. Main must supply the authorized application document. Capture must run synchronously at original event admission, before retaining an Electron event or awaiting: Electron may preserve the frame object across reload. Validate the captured proof after every await and immediately before any future delivery. No future IPC wrapper is implemented or attested here.

## Native root and producer evidence

| Existing surface                                    | Evidence and limitation                                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filesystem-path-containment.ts`                    | `relative` prevents textual traversal; `normalizeExistingPath` uses realpath but retains the textual path on ENOENT. Neither establishes an operation-time stable root.                                                          |
| `registered-worktree-roots-cache.ts`                | Main cache records repo root revisions and Git-confirmed roots. Fast paths accept textual membership; canonical aliases are added to a union. A cache revision does not attest filesystem object identity or ancestor stability. |
| `filesystem-allowed-roots.ts`                       | Existing filesystem routing excludes SSH repos by connection ID, accepts folder/group roots, and considers WSL workspace placement. This is broader filesystem permission, not proof of native source provenance.                |
| `runtime-file-commands-write-file-explorer-file.ts` | Existing exclusive create is unchanged and has no B3 observer. Successful creation alone does not prove source approval or stable root ownership.                                                                                |

Windows UNC and network paths can name remote storage despite native API execution. WSL UNC paths and mirrors are not native-local producer proof. Symlinks, junctions and reparse points can redirect roots or ancestors; realpath observes only one instant. An ancestor or root can be replaced after checking, including while a later asynchronous operation is pending. Stale or contradictory stored roots cannot be repaired by choosing the nearest path or display name. Runtime/SSH roots must never be substituted with client-local paths.

No existing helper supplies a reviewed handle-relative, operation-time ownership mechanism across supported platforms. Source binding therefore remains NOT_PROVEN and cannot supply a production registration. No claim is made that realpath or textual containment closes TOCTOU. Future activation needs exact immutable owner/revision evidence, concrete native realm evidence, approved stable-root ownership and independently approved producer provenance.

## Withdrawal notification contract

The future authorization authority must synchronously notify every explicit withdrawal before yielding or accepting replacement work. `revoke(id)` first invalidates previously accepted registrations independently of the current authority list. It now isolates lookup exceptions and returns `authority-unavailable`; it conservatively invalidates all remaining accepted registrations on authority loss. This prevents an exception from aborting a notification loop. The future dispatcher must inspect/report that result and keep processing notifications; no logging, polling or authority is installed here.

Use unique issuance IDs and fresh generation records. Repeated or unknown notification cannot create authority. A reused ID requires serialized revoke-before-reissue and exclusion of delayed notifications. Silent record removal still cannot guarantee instantaneous passive purge. Access and final asynchronous delivery must revalidate, and source/document/session changes must invalidate pending work. The B2 accepted-ID-first ordering and registration invalidation listeners remain the purge mechanism.

## Verification limits

Tests with controlled Main record inventories and Electron doubles prove boundary logic and refusal behavior. They do not attest a real filesystem root, a deployed desktop integration, an approved source or enterprise identity. No security-owner activation approval is implied by passing tests, code review or CI. Production Project Map remains Source Unavailable; Corporate, WSL, SSH and paired-runtime sources remain disabled.
