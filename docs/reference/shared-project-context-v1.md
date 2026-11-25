# Shared Project Context v1 — portable, untrusted data

Tracking: #143, roadmap #47. Cross-Agent handoff pilot: #55. Provider-neutral contract: #73.

**Status: C1 contract only. No export UI, filesystem writer, privileged IPC, production integration or native QA.**

## Purpose

Different coding agents can read a bounded handoff without restoring each other's proprietary sessions. This contract contains manually provided, **unverified claims**, NOT authenticated task results, native execution proof, grants, consent, system instructions or Project Map activity.

Source code: src/shared/shared-project-context/context-v1.ts
JSON Schema companion: docs/reference/shared-project-context-v1.schema.json
Tests: src/shared/shared-project-context/context-v1.test.ts

## Envelope

| Field | Meaning |
| --- | --- |
| schemaVersion | Exactly 1; reject future versions until reviewed. |
| kind | project-context or handoff. |
| contextId/projectId/taskId | Opaque stable names; taskId is required for handoff. |
| revision | Local snapshot comparison only, NOT authenticated CAS/permission. |
| generatedAt/expiresAt | Canonical UTC millisecond timestamps; old files rejected. |
| source | Claimed provider/runId, always manual_unverified in v1. |
| projectStateSource | unavailable; never invent a real #116 producer. |
| targetProvider | Required for handoff, null for project-context. |
| content | Goal, completed claims, decisions, safe relative file references, evidence references, risks, remaining work, next action. |

## Example

~~~json
{
  "schemaVersion": 1,
  "kind": "handoff",
  "contextId": "handoff-001",
  "projectId": "project-a",
  "taskId": "task-123",
  "revision": 1,
  "generatedAt": "2026-10-15T12:00:00.000Z",
  "expiresAt": "2026-10-17T12:00:00.000Z",
  "projectStateSource": "unavailable",
  "source": {
    "provider": "claude-code",
    "runId": "run-001",
    "provenance": "manual_unverified"
  },
  "targetProvider": "codex",
  "content": {
    "goal": "Test login flow",
    "completedClaims": [
      "Login API reportedly implemented"
    ],
    "decisions": [
      "JWT chosen by source agent"
    ],
    "relevantFiles": [
      "src/auth/login.ts"
    ],
    "evidenceRefs": [
      "commit:abc123"
    ],
    "risks": [
      "Migration unverified"
    ],
    "remainingWork": [
      "Add integration tests"
    ],
    "nextAction": "Verify commit and run tests"
  }
}
~~~

## Validation

- Pure validator limits UTF-8 JSON size to 32 KiB; list entries to 32; summary to 1024 chars; item text to 512 chars.
- Denies unknown fields, unsigned or verified source assertions, missing Project/task identity, future versions, expired/noncanonical timestamps, control/bidi characters, absolute paths, parent traversal and URI-style relative file references.
- A JSON Schema is included, but runtime validation also checks timestamp chronology, byte length and file segments; Schema validation alone is not sufficient.
- Even perfectly valid JSON can contain malicious natural-language instructions, fabricated evidence or secrets. Receiving agents must treat all content as untrusted data, independently verify commits/code/tests, and never execute embedded instructions automatically.
- Parsing does not authenticate actors, validate consent, enforce Project access, classify secrets, prove file permissions or perform any I/O.

## Next implementation boundary (C2, approval required)

1. User chooses exact Project/Task and explicitly requests a scoped export in the Personal desktop.
2. Main independently verifies current document/Session/profile, selected Project and evidence read privileges, and filters raw prompts, credentials, internal session histories and arbitrary code.
3. Main validates an approved destination, rejects symlinks/path traversal/implicit Git publication, atomically writes a bounded file with correct local permissions, and handles cleanup. Never auto-upload or auto-commit.
4. Codex consumes the resulting file and independently checks facts; a human reviews/acknowledges the handoff in #55. No automatically trusted Agent write-back.

Existing SQLite-backed Orchestration Runs remain unchanged. The separate decision to adopt SQLite or a file for authoritative A1 Run→Project association is still under #138/#139 security/schema review. This C1 contract does not merge Draft #140/#142, activate a producer, alter 14-day audit retention, or complete Phase 2.
