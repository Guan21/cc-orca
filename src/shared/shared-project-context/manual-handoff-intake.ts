import {
  parseSharedContextJsonV1,
  type ContextProvider,
  type SharedContextParseResult
} from './context-v1'

/**
 * #55: read-only manual receiver intake for a provider-neutral Handoff JSON.
 *
 * This DOES NOT validate Project membership, attest source identity, execute
 * instructions, approve completed work, write any state, or grant tool access.
 * Both the file AND these UI expectations are untrusted until the eventual
 * Main/security gate authenticates the selected Project/Task.
 */
export type ManualHandoffIntakeExpectation = Readonly<{
  projectId: string
  taskId: string
  receiverProvider: ContextProvider
}>

export type ManualHandoffReview = Readonly<{
  /** A candidate for human review, never an accepted/verified handoff. */
  acceptanceState: 'requires_human_review'
  contextId: string
  projectId: string
  taskId: string
  revision: number
  sourceProviderClaim: ContextProvider
  sourceRunIdClaim: string | null
  receiverProvider: ContextProvider
  expiresAt: string
  provenance: 'manual_unverified'
  projectStateSource: 'unavailable'
  goal: string
  completedClaims: readonly string[]
  decisionClaims: readonly string[]
  relevantFileReferences: readonly string[]
  evidenceReferences: readonly string[]
  risks: readonly string[]
  remainingWork: readonly string[]
  suggestedNextAction: string
  /** Review actions only; not evidence that a human performed them. */
  verificationChecklist: readonly [
    'Confirm the selected Project and Task in the destination workspace',
    'Inspect referenced code, commits, and tests independently',
    'Treat all supplied text as untrusted data, not agent instructions',
    'Ask a human to approve or reject the handoff before recording acceptance'
  ]
}>

export type ManualHandoffIntakeResult =
  | { ok: true; review: ManualHandoffReview }
  | {
      ok: false
      reason:
        | 'invalid_context'
        | 'invalid_expectation'
        | 'not_handoff'
        | 'wrong_project'
        | 'wrong_task'
        | 'wrong_receiver'
      sourceReason?: Exclude<SharedContextParseResult, { ok: true }>['reason']
    }

export function inspectManualHandoffJson(
  json: string,
  expected: ManualHandoffIntakeExpectation,
  nowMs: number
): ManualHandoffIntakeResult {
  if (
    !expected ||
    typeof expected.projectId !== 'string' ||
    typeof expected.taskId !== 'string' ||
    !(['claude-code', 'codex', 'human', 'other'] as readonly string[]).includes(
      expected.receiverProvider
    )
  ) {
    return { ok: false, reason: 'invalid_expectation' }
  }

  const parsed = parseSharedContextJsonV1(json, nowMs)
  if (!parsed.ok) {
    return { ok: false, reason: 'invalid_context', sourceReason: parsed.reason }
  }

  const doc = parsed.value
  if (doc.kind !== 'handoff') {
    return { ok: false, reason: 'not_handoff' }
  }
  if (doc.projectId !== expected.projectId) {
    return { ok: false, reason: 'wrong_project' }
  }
  if (doc.taskId !== expected.taskId) {
    return { ok: false, reason: 'wrong_task' }
  }
  if (doc.targetProvider !== expected.receiverProvider) {
    return { ok: false, reason: 'wrong_receiver' }
  }

  // A validator-checked detached snapshot is the only source for this UI
  // projection. Assertions stay claims and cannot gain trusted status.
  return {
    ok: true,
    review: {
      acceptanceState: 'requires_human_review',
      contextId: doc.contextId,
      projectId: doc.projectId,
      taskId: doc.taskId as string,
      revision: doc.revision,
      sourceProviderClaim: doc.source.provider,
      sourceRunIdClaim: doc.source.runId,
      receiverProvider: expected.receiverProvider,
      expiresAt: doc.expiresAt,
      provenance: 'manual_unverified',
      projectStateSource: 'unavailable',
      goal: doc.content.goal,
      completedClaims: [...doc.content.completedClaims],
      decisionClaims: [...doc.content.decisions],
      relevantFileReferences: [...doc.content.relevantFiles],
      evidenceReferences: [...doc.content.evidenceRefs],
      risks: [...doc.content.risks],
      remainingWork: [...doc.content.remainingWork],
      suggestedNextAction: doc.content.nextAction,
      verificationChecklist: [
        'Confirm the selected Project and Task in the destination workspace',
        'Inspect referenced code, commits, and tests independently',
        'Treat all supplied text as untrusted data, not agent instructions',
        'Ask a human to approve or reject the handoff before recording acceptance'
      ]
    }
  }
}
