import type { ReviewEvidenceSummary, ReviewPriorityReason, ReviewState } from './review-queue-types'

type ReviewEventRecord = {
  reviewId: string
  status: 'requested' | 'completed'
  eventId: string
}

type ReviewQueueEvidenceInput = {
  relatedEventIds: string[]
  testStatuses: Set<'passed' | 'failed' | 'skipped'>
  passedTests: number
  failedTests: number
  hasPassedCount: boolean
  hasFailedCount: boolean
  failedTestEventIds: string[]
  reviewEvents: ReviewEventRecord[]
  agentFailedEventIds: string[]
  changedFiles: string[]
  securitySensitiveChangeEventIds: string[]
  latestCommit?: {
    sha: string
    occurredAt: string
  }
}

const SENSITIVE_PATH_SEGMENTS = new Set([
  'auth',
  'security',
  'permissions',
  'credentials',
  'session'
])

export function isSecuritySensitiveReviewPath(path: string): boolean {
  return path
    .replaceAll('\\', '/')
    .toLowerCase()
    .split('/')
    .some((segment) => SENSITIVE_PATH_SEGMENTS.has(segment))
}

export function buildReviewPriorityReasons(
  aggregate: ReviewQueueEvidenceInput
): ReviewPriorityReason[] {
  const reasons: ReviewPriorityReason[] = []
  const pendingReviewEventIds = getPendingReviewRequestedEventIds(aggregate.reviewEvents)

  if (aggregate.failedTestEventIds.length > 0) {
    reasons.push({
      type: 'failed_tests',
      severity: 'high',
      summary: 'Tests failed',
      evidenceEventIds: aggregate.failedTestEventIds
    })
  }

  if (aggregate.agentFailedEventIds.length > 0) {
    reasons.push({
      type: 'agent_failure',
      severity: 'high',
      summary: 'Agent failed',
      evidenceEventIds: aggregate.agentFailedEventIds
    })
  }

  if (aggregate.securitySensitiveChangeEventIds.length > 0) {
    reasons.push({
      type: 'security_sensitive_change',
      severity: 'high',
      summary: 'Security-sensitive area changed',
      evidenceEventIds: aggregate.securitySensitiveChangeEventIds
    })
  }

  if (pendingReviewEventIds.length > 0) {
    reasons.push({
      type: 'review_pending',
      severity: 'medium',
      summary: 'Review requested but not completed',
      evidenceEventIds: pendingReviewEventIds
    })
  }

  return reasons
}

export function buildReviewEvidenceSummary(
  aggregate: ReviewQueueEvidenceInput
): ReviewEvidenceSummary {
  const reviewRequested = aggregate.reviewEvents.some((event) => event.status === 'requested')
  const reviewCompleted = aggregate.reviewEvents.some((event) => event.status === 'completed')

  return {
    tests: {
      status: getTestStatus(aggregate),
      passed: aggregate.hasPassedCount ? aggregate.passedTests : undefined,
      failed: aggregate.hasFailedCount ? aggregate.failedTests : undefined
    },
    review: {
      requested: reviewRequested,
      completed: reviewCompleted
    },
    agent: {
      failed: aggregate.agentFailedEventIds.length > 0
    },
    changedFiles: aggregate.changedFiles.length > 0 ? aggregate.changedFiles : undefined,
    latestCommitSha: aggregate.latestCommit?.sha,
    evidenceEventIds: aggregate.relatedEventIds
  }
}

export function deriveReviewState(
  reasons: ReviewPriorityReason[],
  evidence: ReviewEvidenceSummary
): ReviewState {
  if (reasons.some((reason) => reason.type === 'failed_tests' || reason.type === 'agent_failure')) {
    return 'blocked'
  }

  if (reasons.some((reason) => reason.type === 'review_pending')) {
    return 'in_review'
  }

  if (evidence.review.completed) {
    return 'reviewed'
  }

  return 'review_required'
}

function getPendingReviewRequestedEventIds(reviewEvents: ReviewEventRecord[]): string[] {
  const completedReviewIds = new Set(
    reviewEvents.filter((event) => event.status === 'completed').map((event) => event.reviewId)
  )

  return reviewEvents
    .filter((event) => event.status === 'requested' && !completedReviewIds.has(event.reviewId))
    .map((event) => event.eventId)
}

function getTestStatus(
  aggregate: ReviewQueueEvidenceInput
): ReviewEvidenceSummary['tests']['status'] {
  if (aggregate.testStatuses.size === 0) {
    return 'unknown'
  }

  const hasFailed = aggregate.testStatuses.has('failed')
  const hasPassed = aggregate.testStatuses.has('passed')

  if (hasFailed && hasPassed) {
    return 'mixed'
  }

  if (hasFailed) {
    return 'failed'
  }

  return hasPassed ? 'passed' : 'unknown'
}
