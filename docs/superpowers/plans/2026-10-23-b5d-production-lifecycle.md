# G2-B5d production lifecycle implementation plan

Goal: install conservative Main retirement bridges without enabling composition,
transport, privileged intents or Renderer delivery. Base: `26dfa692ce673310e695d63ceb61b15ac1713238`.

Architecture: reuse the catalog, credential revocation and actual Main window owners.
Keep production composition disabled and its lifecycle subscription map empty: partial
retirement observations cannot satisfy the thirteen before-publication contracts.
Do not promote Store save notifications or read-time identity comparisons to producers.

- [x] Add failing tests for earlier window/frame navigation retirement, partial installation,
  cleanup, callback reentrancy and incomplete production lifecycle coverage.
- [x] Add a deny-only production bridge in `project-source-production-lifecycle.ts` and
  attach it in the existing bootstrap before document loading. Preserve existing ownership,
  catalog and profile retirement; do not add dependencies or IPC methods.
- [x] Exercise the bridge with the real Task C composition/grant/provider offline fixture:
  pending HEAD/projection work and final handoff must not survive invalidation or ABA.
- [x] Audit all thirteen domains in `docs/reference/github-project-source-g2-b5d.md`,
  recording genuine Main signals separately from missing publication guarantees.
- [x] Run focused Vitest, Typecheck, lint, formatting, changed-code quality and Corporate
  Scanner; record failures and skips faithfully. Review the diff and use Lore commit trailers.
- [ ] Prepare stacked Draft PR and issue evidence. GitHub API administration is pending
  clarification because the task also explicitly forbids real GitHub API calls. Do not use
  native gh or credentials. Verify exact final SHA CI and PR test LoC only if permitted.

Restrictions: no live API/GraphQL, keyring, native gh, new policy, merge or issue closure.
No offline result establishes production readiness, Owner acceptance or installed QA.
