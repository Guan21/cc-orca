# G2-B4a — Main-only repository registration boundary

Status: **Draft / offline-only / no live GitHub read / no production IPC**.

Tracking: #116, #151, #152. Stacked after #157 → #158 → #159. This increment deliberately does not enable the source, transport, or V1.

## What is implemented

\`MainRegisteredSelectedPrRepository\` derives one selected-PR binding only from callbacks that **must originate in Electron Main**:

- Main Store Project membership (\`Project.sourceRepoIds\`), ready \`ProjectHostSetup\`, local git \`Repo\`, exact canonical GitHub remote, and matching Project GitHub provider identity.
- Main-owned current Project/repo/setup/workspace/PR selection with a **monotonically increasing selectionRevision**. Changing A → B → A must advance this revision even when names and IDs return to the same values.
- A Main-resolved native GitHub principal and credential generation; the verified GraphQL repository numeric ID, opaque node ID, host and \`nameWithOwner\` must match the exact selected repository **and** that current principal/generation.
- Worktree selections require an additional Main-owned current-worktree ownership predicate; all SSH/WSL/runtime host selections are refused.
- Every asynchronous verification re-reads selection, credential and catalog after \`await\`. A revoked/replaced registration, changed selection epoch or edited catalog cannot be reinstated by a delayed response. \`currentBinding()\` invalidates mismatched registrations and supplies a copied binding for later #159 \`selectTrusted()\`.
- Registration remains only **session-memory**, never a grant or token cache. Explicit #158/#159 native consent is still mandatory for PR read.

The constructor has **no repository verifier by default**. In this state \`registerSelected()\` denies and there is **no egress**. The injected verifier interface is a future composition point, not a permission to add one without completing #151. No IPC handler, preload route, UI, credential reader, endpoint or persistence was added.

## Must happen before any live call (G2-B4b)

1. Verify exact native packaged Personal current account and credential **type/permissions**, with a Main-owned principal generation; no ambient \`GH_TOKEN\`, \`GITHUB_TOKEN\`, \`GH_HOST\`, \`GH_CONFIG_DIR\`, executable-path override, or silently reused host/WSL identity.
2. Separately approve explicit user-triggered **repository registration** and **one selected PR refresh** as distinct fixed GraphQL operations (with exact endpoint, query text, budgets, errors, token and CheckRun visibility). A direct \`ghExecFileAsync()\` call is **not acceptable**: the shared helper can perform WSL fallback, host fallback and transient retry. Pin a native-only executable and controlled environment and prove deadline/cancel, no fallback/retry, redaction.
3. Create actual Main Store/active worktree/credential callbacks; ensure Project switching increments the selection epoch even for A → B → A. Verify catalog source is current and unspoofable. Register only from a genuine native gesture, never renderer-provided IDs.
4. Perform #151 Owner architecture/Main/network self-review at exact code/query SHA; retain independent-signoff absence and Corporate disabled. Validate actual schema, private PR and Checks permissions before access. No credentials in Issues/PRs.
5. Only then wire guarded #159 authority, IPC/preload and B5 observed-facts UI. #153 must exercise real read, denied/revoked and Windows/macOS packaged QA.

## Test interpretation

Focused Vitest here is a **mocked source/contract test**, not a proven GitHub API identity, credential ACL, runtime host isolation, Electron integration or installed-app E2E. CI PASS must not be labeled \`G2-B DONE\`, \`#151 APPROVED\` or \`V1 GO\`.
