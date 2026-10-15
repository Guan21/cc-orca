import {
  parseSharedContextV1,
  type ContextProvider,
  type SharedContextV1
} from './context-v1'

/**
 * #145 C2-PURE: Construct a bounded, manual/unverified Context preview.
 *
 * This is not an authorization or consent API. Every caller-controlled selector
 * and candidate field is UNTRUSTED. A future approved Electron Main exporter must
 * independently authenticate the selected Project/Task and current document/session
 * before and after asynchronous file/destination operations.
 *
 * No fs, network, IPC, database, auth grant, or authoritative state mutation.
 */
export type ManualContextExportSelection = {
  readonly projectId: string
  readonly taskId: string | null
  readonly kind: 'project-context' | 'handoff'
  readonly targetProvider: ContextProvider | null
  /** UI generation, not an authenticated catalog/assignment revision. */
  readonly selectionGeneration: number
}

export type ManualContextExportCandidate = {
  readonly contextId: string
  readonly projectId: string
  readonly taskId: string | null
  readonly kind: 'project-context' | 'handoff'
  readonly targetProvider: ContextProvider | null
  readonly revision: number
  readonly selectionGeneration: number
  readonly generatedAt: string
  readonly expiresAt: string
  readonly source: {
    readonly provider: ContextProvider
    readonly runId: string | null
    readonly provenance?: 'manual_unverified'
  }
  readonly content: SharedContextV1['content']
}

export type ManualContextExportPreview =
  | { readonly ok: true; readonly document: SharedContextV1; readonly json: string }
  | {
      readonly ok: false
      readonly reason:
        | 'invalid_input'
        | 'selection_mismatch'
        | 'stale_selection'
        | 'invalid_contract'
        | 'unsupported_version'
        | 'oversized'
        | 'expired'
    }

function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function copyStringList(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    !value.every((item: unknown) => typeof item === 'string')
  ) {
    return null
  }
  return value.slice() as string[]
}

/**
 * Bounded metadata-only projection. An allowlist prevents accidental copying
 * of arbitrary nested fields (rawPrompt, accessToken, conversationHistory, etc).
 * It CANNOT recognize secrets inserted inside allowed free-text fields.
 * Preview must still undergo human review and Main policy/data minimization.
 */
export function buildManualContextExportPreview(
  selection: unknown,
  candidate: unknown,
  nowMs: number
): ManualContextExportPreview {
  if (!object(selection) || !object(candidate)) {
    return { ok: false, reason: 'invalid_input' }
  }
  if (
    !Number.isSafeInteger(selection.selectionGeneration) ||
    (selection.selectionGeneration as number) < 1 ||
    !Number.isSafeInteger(candidate.selectionGeneration) ||
    (candidate.selectionGeneration as number) < 1
  ) {
    return { ok: false, reason: 'invalid_input' }
  }
  if (candidate.selectionGeneration !== selection.selectionGeneration) {
    return { ok: false, reason: 'stale_selection' }
  }
  if (
    candidate.projectId !== selection.projectId ||
    candidate.taskId !== selection.taskId ||
    candidate.kind !== selection.kind ||
    candidate.targetProvider !== selection.targetProvider
  ) {
    return { ok: false, reason: 'selection_mismatch' }
  }
  if (!object(candidate.source) || !object(candidate.content)) {
    return { ok: false, reason: 'invalid_input' }
  }
  if (
    candidate.source.provenance !== undefined &&
    candidate.source.provenance !== 'manual_unverified'
  ) {
    return { ok: false, reason: 'invalid_contract' }
  }

  const content = candidate.content
  const completedClaims = copyStringList(content.completedClaims)
  const decisions = copyStringList(content.decisions)
  const relevantFiles = copyStringList(content.relevantFiles)
  const evidenceRefs = copyStringList(content.evidenceRefs)
  const risks = copyStringList(content.risks)
  const remainingWork = copyStringList(content.remainingWork)
  if (
    completedClaims === null ||
    decisions === null ||
    relevantFiles === null ||
    evidenceRefs === null ||
    risks === null ||
    remainingWork === null
  ) {
    return { ok: false, reason: 'invalid_input' }
  }

  // Explicitly construct every field; never spread untrusted renderer/agent data.
  // Assertion is for TS only. The runtime parser validates the actual values.
  const projected = {
    schemaVersion: 1,
    kind: candidate.kind,
    contextId: candidate.contextId,
    projectId: candidate.projectId,
    taskId: candidate.taskId,
    revision: candidate.revision,
    generatedAt: candidate.generatedAt,
    expiresAt: candidate.expiresAt,
    projectStateSource: 'unavailable',
    source: {
      provider: candidate.source.provider,
      runId: candidate.source.runId,
      provenance: 'manual_unverified'
    },
    targetProvider: candidate.targetProvider,
    content: {
      goal: content.goal,
      completedClaims,
      decisions,
      relevantFiles,
      evidenceRefs,
      risks,
      remainingWork,
      nextAction: content.nextAction
    }
  }

  const parsed = parseSharedContextV1(projected, nowMs)
  if (!parsed.ok) {
    return parsed.reason === 'invalid_json'
      ? { ok: false, reason: 'invalid_contract' }
      : { ok: false, reason: parsed.reason }
  }
  if (Date.parse(parsed.value.generatedAt) > nowMs) {
    return { ok: false, reason: 'invalid_contract' }
  }

  return {
    ok: true,
    document: parsed.value,
    json: JSON.stringify(parsed.value, null, 2) + '\n'
  }
}
