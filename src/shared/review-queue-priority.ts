import type { ReviewItem, ReviewPriority, ReviewPriorityReason } from './review-queue-types'

const PRIORITY_RANK: Record<ReviewPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

const REASON_PRIORITY_ORDER: Record<ReviewPriorityReason['type'], number> = {
  failed_tests: 0,
  agent_failure: 1,
  security_sensitive_change: 2,
  review_pending: 3,
  large_change: 4,
  review_disagreement: 5
}

export function resolveReviewPriority(reasons: ReviewPriorityReason[]): ReviewPriority {
  return reasons.reduce<ReviewPriority>((priority, reason) => {
    return PRIORITY_RANK[reason.severity] > PRIORITY_RANK[priority] ? reason.severity : priority
  }, 'low')
}

export function sortReviewPriorityReasons(reasons: ReviewPriorityReason[]): ReviewPriorityReason[] {
  return [...reasons].sort((left, right) => {
    const severityDelta = PRIORITY_RANK[right.severity] - PRIORITY_RANK[left.severity]

    if (severityDelta !== 0) {
      return severityDelta
    }

    return REASON_PRIORITY_ORDER[left.type] - REASON_PRIORITY_ORDER[right.type]
  })
}

export function compareReviewQueueItems(left: ReviewItem, right: ReviewItem): number {
  const priorityDelta = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority]

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const updatedDelta = Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt)

  if (updatedDelta !== 0) {
    return updatedDelta
  }

  return left.id.localeCompare(right.id)
}
