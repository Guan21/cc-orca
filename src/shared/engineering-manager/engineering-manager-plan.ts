import type { ProjectStateSnapshot, ProjectTaskState } from '../project-state/project-state'

export type EngineeringManagerReason =
  | 'test_result_needs_review'
  | 'failed_run_needs_investigation'
  | 'review_status_needs_confirmation'
  | 'activity_freshness_needs_confirmation'

export type EngineeringManagerSuggestedAction =
  | 'inspect_test_evidence'
  | 'inspect_run_evidence'
  | 'verify_review_state'
  | 'request_status_confirmation'

export type EngineeringManagerSuggestion = {
  id: string
  projectId: string
  taskId: string
  reason: EngineeringManagerReason
  suggestedAction: EngineeringManagerSuggestedAction
  priority: 'high' | 'normal'
  evidenceRefs: string[]
  evidenceStatus: 'referenced' | 'not_linked'
  explanation: string
  authorization: 'human_decision_required'
  execution: 'not_authorized'
}

export type EngineeringManagerReceipt = {
  projectId: string
  taskId: string
  /** Same-clock local receipt, never a remote event timestamp. */
  receivedAtMs: number
  /** Both this receipt and nowMs must originate from the same local clock. */
  clockId: string
}

export type EngineeringManagerPlanOptions = {
  nowMs: number
  staleAfterMs: number
  clockId: string
  trustedReceipts?: readonly EngineeringManagerReceipt[]
}

export type EngineeringManagerPlan = {
  projectId: string
  suggestions: EngineeringManagerSuggestion[]
}

const REASON_ORDER: Record<EngineeringManagerReason, number> = {
  test_result_needs_review: 0,
  failed_run_needs_investigation: 1,
  review_status_needs_confirmation: 2,
  activity_freshness_needs_confirmation: 3
}

const ACTION_BY_REASON: Record<EngineeringManagerReason, EngineeringManagerSuggestedAction> = {
  test_result_needs_review: 'inspect_test_evidence',
  failed_run_needs_investigation: 'inspect_run_evidence',
  review_status_needs_confirmation: 'verify_review_state',
  activity_freshness_needs_confirmation: 'request_status_confirmation'
}

const EXPLANATION_BY_REASON: Record<EngineeringManagerReason, string> = {
  test_result_needs_review:
    'One or more failed test observations exist. Inspect the latest trusted verification; this does not establish the current result.',
  failed_run_needs_investigation:
    'A failed run observation exists. Investigate its evidence; a failed run does not mean the task failed.',
  review_status_needs_confirmation:
    'A review-request observation exists. Confirm its current status; aggregated counts do not prove a review remains pending.',
  activity_freshness_needs_confirmation:
    'A comparable local observation receipt has aged beyond the configured threshold. Verify status; this is not proof that the Agent stopped.'
}

function evidenceFor(task: ProjectTaskState): string[] {
  return [...new Set(task.evidenceRefs.filter((value) => value.length > 0))].sort()
}

/**
 * Offline suggestion projection only. No notification, execution, network access,
 * timers, state persistence or privileges are implied by any returned proposal.
 */
export function planEngineeringManagerSuggestions(
  snapshot: ProjectStateSnapshot,
  options: EngineeringManagerPlanOptions
): EngineeringManagerPlan {
  if (
    !Number.isFinite(options.nowMs) ||
    !Number.isFinite(options.staleAfterMs) ||
    options.staleAfterMs <= 0 ||
    !options.clockId
  ) {
    throw new Error('Invalid engineering manager observation clock')
  }

  const suggestions: EngineeringManagerSuggestion[] = []
  const seen = new Set<string>()

  const propose = (task: ProjectTaskState, reason: EngineeringManagerReason): void => {
    const id = [
      encodeURIComponent(snapshot.projectId),
      encodeURIComponent(task.taskId),
      reason
    ].join(':')
    if (seen.has(id)) {
      return
    }
    seen.add(id)
    const evidenceRefs = evidenceFor(task)
    suggestions.push({
      id,
      projectId: snapshot.projectId,
      taskId: task.taskId,
      reason,
      suggestedAction: ACTION_BY_REASON[reason],
      priority:
        reason === 'test_result_needs_review' || reason === 'failed_run_needs_investigation'
          ? 'high'
          : 'normal',
      evidenceRefs,
      evidenceStatus: evidenceRefs.length > 0 ? 'referenced' : 'not_linked',
      explanation: EXPLANATION_BY_REASON[reason],
      authorization: 'human_decision_required',
      execution: 'not_authorized'
    })
  }

  for (const task of [...snapshot.tasks].sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    if (
      task.projectId !== snapshot.projectId ||
      !task.taskId ||
      task.lifecycle === 'completed'
    ) {
      continue
    }

    if (task.testResults.failed > 0 && task.observedSignals.failedTest) {
      propose(task, 'test_result_needs_review')
    }
    if (task.runs.some((run) => run.status === 'failed') && task.observedSignals.failedRun) {
      propose(task, 'failed_run_needs_investigation')
    }
    if (task.reviews.requested > 0) {
      propose(task, 'review_status_needs_confirmation')
    }

    // The Activity Graph event timestamp is not necessarily on this machine's clock.
    // Only a separately trusted, matching local receipt can justify a freshness check.
    const freshestReceiptAt = (options.trustedReceipts ?? []).reduce((latest, entry) => {
      if (
        entry.projectId !== snapshot.projectId ||
        entry.taskId !== task.taskId ||
        entry.clockId !== options.clockId ||
        !Number.isFinite(entry.receivedAtMs) ||
        entry.receivedAtMs < 0 ||
        entry.receivedAtMs > options.nowMs
      ) {
        return latest
      }
      return Math.max(latest, entry.receivedAtMs)
    }, Number.NEGATIVE_INFINITY)
    if (
      task.lifecycle === 'started' &&
      Number.isFinite(freshestReceiptAt) &&
      options.nowMs - freshestReceiptAt > options.staleAfterMs
    ) {
      propose(task, 'activity_freshness_needs_confirmation')
    }
  }

  suggestions.sort(
    (a, b) =>
      a.taskId.localeCompare(b.taskId) ||
      REASON_ORDER[a.reason] - REASON_ORDER[b.reason]
  )
  return { projectId: snapshot.projectId, suggestions }
}
