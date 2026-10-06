import { translate } from '@/i18n/i18n'
import type {
  ReviewEvidenceSummary,
  ReviewItem,
  ReviewPriority,
  ReviewPriorityReason,
  ReviewPriorityReasonType,
  ReviewState
} from '../../../../shared/review-queue-types'

export type ReviewQueueSummary = {
  total: number
  urgent: number
  blocked: number
  pendingReview: number
  failedTests: number
}

export function summarizeReviewQueue(items: readonly ReviewItem[]): ReviewQueueSummary {
  return {
    total: items.filter((item) => item.state !== 'reviewed').length,
    urgent: items.filter((item) => item.priority === 'critical' || item.priority === 'high').length,
    blocked: items.filter((item) => item.state === 'blocked').length,
    pendingReview: items.filter(
      (item) => item.state === 'review_required' || item.state === 'in_review'
    ).length,
    failedTests: items.filter((item) =>
      item.reasons.some((reason) => reason.type === 'failed_tests')
    ).length
  }
}

export function reviewPriorityLabel(priority: ReviewPriority): string {
  const labels: Record<ReviewPriority, string> = {
    low: translate('auto.components.reviewQueue.priority.low', 'Low'),
    medium: translate('auto.components.reviewQueue.priority.medium', 'Medium'),
    high: translate('auto.components.reviewQueue.priority.high', 'High'),
    critical: translate('auto.components.reviewQueue.priority.critical', 'Critical')
  }
  return labels[priority]
}

export function reviewStateLabel(state: ReviewState): string {
  const labels: Record<ReviewState, string> = {
    review_required: translate('auto.components.reviewQueue.state.reviewRequired', 'Review needed'),
    in_review: translate('auto.components.reviewQueue.state.inReview', 'In review'),
    reviewed: translate('auto.components.reviewQueue.state.reviewed', 'Reviewed'),
    blocked: translate('auto.components.reviewQueue.state.blocked', 'Blocked')
  }
  return labels[state]
}

export function reviewReasonLabel(reason: ReviewPriorityReason): string {
  const fallback: Record<ReviewPriorityReasonType, string> = {
    failed_tests: translate('auto.components.reviewQueue.reason.failedTests', 'Tests failed'),
    review_pending: translate(
      'auto.components.reviewQueue.reason.reviewPending',
      'Review requested but not completed'
    ),
    agent_failure: translate(
      'auto.components.reviewQueue.reason.agentFailure',
      'Agent execution failed'
    ),
    security_sensitive_change: translate(
      'auto.components.reviewQueue.reason.securitySensitiveChange',
      'Security-sensitive area changed'
    ),
    large_change: translate('auto.components.reviewQueue.reason.largeChange', 'Large change'),
    review_disagreement: translate(
      'auto.components.reviewQueue.reason.reviewDisagreement',
      'Reviewer disagreement'
    )
  }
  return fallback[reason.type]
}

export function reviewSubjectTitle(item: ReviewItem): string {
  return (
    item.subject.title ??
    (item.subject.type === 'pull_request'
      ? translate('auto.components.reviewQueue.subject.pullRequest', 'Pull request {{value0}}', {
          value0: item.subject.id
        })
      : translate('auto.components.reviewQueue.subject.change', 'Change {{value0}}', {
          value0: item.subject.id
        }))
  )
}

export function reviewSubjectMeta(item: ReviewItem): string {
  const subject =
    item.subject.type === 'pull_request'
      ? translate('auto.components.reviewQueue.subject.prLabel', 'PR {{value0}}', {
          value0: item.subject.id
        })
      : translate('auto.components.reviewQueue.subject.changeLabel', 'Change {{value0}}', {
          value0: item.subject.id
        })
  return [item.subject.provider, subject, item.taskId].filter(Boolean).join(' · ')
}

export function reviewActorLabel(item: ReviewItem): string {
  const id = item.actor.id ?? translate('auto.components.reviewQueue.actor.unknown', 'unknown')
  if (item.actor.provider) {
    return `${item.actor.provider}:${id}`
  }
  return id
}

export function reviewTimeLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

export function reviewTestStatusLabel(status: ReviewEvidenceSummary['tests']['status']): string {
  const labels: Record<ReviewEvidenceSummary['tests']['status'], string> = {
    passed: translate('auto.components.reviewQueue.evidence.testsPassedStatus', 'PASS'),
    failed: translate('auto.components.reviewQueue.evidence.testsFailedStatus', 'FAILED'),
    mixed: translate('auto.components.reviewQueue.evidence.testsMixedStatus', 'MIXED'),
    unknown: translate('auto.components.reviewQueue.evidence.testsUnknownStatus', 'UNKNOWN')
  }
  return labels[status]
}

export function reviewTestCountLine(evidence: ReviewEvidenceSummary): string | null {
  const counts = [
    typeof evidence.tests.passed === 'number'
      ? translate('auto.components.reviewQueue.evidence.testsPassed', '{{value0}} passed', {
          value0: evidence.tests.passed
        })
      : undefined,
    typeof evidence.tests.failed === 'number'
      ? translate('auto.components.reviewQueue.evidence.testsFailed', '{{value0}} failed', {
          value0: evidence.tests.failed
        })
      : undefined
  ].filter(Boolean)

  return counts.length > 0 ? counts.join(' · ') : null
}

export function reviewEvidenceLines(evidence: ReviewEvidenceSummary): string[] {
  const lines: string[] = []
  if (evidence.tests.status === 'unknown') {
    lines.push(reviewTestStatusLabel(evidence.tests.status))
  } else {
    const counts = reviewTestCountLine(evidence)
    lines.push(
      counts ??
        translate('auto.components.reviewQueue.evidence.testsStatus', 'Tests {{value0}}', {
          value0: reviewTestStatusLabel(evidence.tests.status)
        })
    )
  }

  if (evidence.review.requested && !evidence.review.completed) {
    lines.push(
      translate('auto.components.reviewQueue.evidence.reviewRequested', 'Review requested')
    )
  } else if (evidence.review.completed) {
    lines.push(
      translate('auto.components.reviewQueue.evidence.reviewCompleted', 'Review completed')
    )
  }

  if (evidence.agent.failed) {
    lines.push(
      translate('auto.components.reviewQueue.evidence.agentFailed', 'Agent execution failed')
    )
  }
  if (evidence.latestCommitSha) {
    lines.push(
      translate('auto.components.reviewQueue.evidence.commit', 'Latest commit {{value0}}', {
        value0: evidence.latestCommitSha.slice(0, 7)
      })
    )
  }
  return lines
}

export function reviewStatusLine(evidence: ReviewEvidenceSummary): string {
  if (evidence.review.completed) {
    return translate('auto.components.reviewQueue.evidence.reviewCompleted', 'Review completed')
  }
  if (evidence.review.requested) {
    return translate('auto.components.reviewQueue.evidence.reviewRequested', 'Review requested')
  }
  return translate('auto.components.reviewQueue.evidence.reviewUnknown', 'No review result yet')
}

export function reviewAgentStatusLine(evidence: ReviewEvidenceSummary): string {
  return evidence.agent.failed
    ? translate('auto.components.reviewQueue.evidence.agentFailed', 'Agent execution failed')
    : translate('auto.components.reviewQueue.evidence.agentClear', 'No agent failure recorded')
}

export function humanJudgmentLines(item: ReviewItem): string[] {
  const lines: string[] = []
  if (item.state === 'blocked') {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.blocked',
        'Decide whether the blocked work should be fixed, reverted, or escalated.'
      )
    )
  }
  if (item.reasons.some((reason) => reason.type === 'security_sensitive_change')) {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.security',
        'Confirm the security-sensitive path is intentional and safe.'
      )
    )
  }
  if (item.reasons.some((reason) => reason.type === 'review_disagreement')) {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.disagreement',
        'Resolve the reviewer disagreement before proceeding.'
      )
    )
  }
  if (item.reasons.some((reason) => reason.type === 'review_pending')) {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.review',
        'Complete the requested human review.'
      )
    )
  }
  if (lines.length === 0 && item.state !== 'reviewed') {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.default',
        'Confirm the change is ready to proceed.'
      )
    )
  }
  if (lines.length === 0 && item.state === 'reviewed') {
    lines.push(
      translate(
        'auto.components.reviewQueue.judgment.reviewed',
        'No human judgment is currently pending.'
      )
    )
  }
  return lines
}
