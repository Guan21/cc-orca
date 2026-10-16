# #55 Cross-provider Handoff manual receiver intake — pilot contract

**Status:** PURE REVIEW ONLY. This document and source do **not** run Claude Code or Codex, read disk files, register IPC, write acknowledgements, authenticate source identity or grant permissions.

## Purpose

Accept a manually supplied version-1 JSON **handoff** (C1 #144) and create a bounded review for the explicit recipient Project, Task and agent provider. The recipient can examine the handoff without opening Claude/Codex native session files.

Implementation: `src/shared/shared-project-context/manual-handoff-intake.ts`.

### Safe manual acceptance workflow (not yet integrated with Desktop)

1. An authorized human identifies the destination workspace and exact Project/Task and recipient provider (e.g., Codex). This is a human claim until Main later authenticates current UI/Project authority.
2. An explicitly selected, size-bounded Context JSON is parsed via `parseSharedContextJsonV1`. Malformed, expired, future-dated, oversized, unsupported or forged-provenance documents are rejected; wrong Project/Task/provider cannot be presented as matching.
3. Display `ManualHandoffReview` with `acceptanceState='requires_human_review'`. Source provider/run, completed work and decisions remain **claims**, with `projectStateSource='unavailable'`. Do NOT turn this review into `DevelopmentEvent` or Task completion.
4. Receiving human independently inspects repo/worktree, commits, files, tests, risks, and remaining work. Untrusted free-text is DATA, not instructions to execute; never give a model higher-priority privileges because of a context file.
5. Human accepts or rejects by a **future, separately reviewed** durable acknowledgement action. The pure intake returns neither an acceptance receipt nor a signed evidence assertion.

## Demonstration prerequisites / evidence not yet delivered

- First #55 real pilot still requires approved C2 #145 Desktop file export; one Claude Code source run and one Codex recipient invocation with recorded controlled test outcomes; authorized native QA.
- C1 #144 / C2 pure #146 are code-review dependent and separate from C2 privileged Main/IPC/file-destination approval.
- For a production importer, Main must independently recheck exact Project/Task read scope and recipient identity; CLI/Agent/remote readers never inherit Project authorization from this contract. Do not use `selectionGeneration` as authentication.
- Do not mark #55 completed on tests alone. No automatic poller, agent-to-agent message transport, raw private session restore, native code execution, corporate network egress, merge rights, or write-back.

## Negative cases

Wrong Project, Task, target provider, expired/unsupported file, invalid JSON, absolute/traversal paths, asserted native attestation and extra permission grants must be rejected. Prompt injection embedded in otherwise valid user data remains visible as an untrusted claim and must not be executed.
