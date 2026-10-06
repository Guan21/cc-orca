import type { DevelopmentEvent } from './development-event-types'
import type { DisagreementSeverity, DisagreementSignal } from './disagreement-signal-types'
import type { ReviewPriorityReason, ReviewPrioritySeverity } from './review-queue-types'
import {
  buildReviewSubjectIndex,
  resolveReviewSubjectIdentity,
  sortDevelopmentEvents
} from './review-queue-subject-identity'

type DisagreementReasonAggregate = {
  severity: ReviewPrioritySeverity
  signalIds: Set<string>
  summaries: Set<string>
  evidenceEventIds: Set<string>
}

const REVIEW_SEVERITY_RANK: Record<ReviewPrioritySeverity, number> = {
  medium: 0,
  high: 1,
  critical: 2
}

export function buildDisagreementReviewReasons(
  events: readonly DevelopmentEvent[],
  signals: readonly DisagreementSignal[]
): Map<string, ReviewPriorityReason[]> {
  const reviewEventIds = reviewEventIdsBySubjectAndReviewId(events)
  const reasonsBySubject = new Map<string, DisagreementReasonAggregate>()

  for (const signal of signals) {
    const evidenceEventIds = matchedEvidenceEventIds(signal, reviewEventIds)

    if (evidenceEventIds.length === 0) {
      continue
    }

    const aggregate = getOrCreateReasonAggregate(reasonsBySubject, signal.subjectId)
    aggregate.signalIds.add(signal.signalId)
    aggregate.summaries.add(signal.summary)
    aggregate.severity = maxReviewSeverity(
      aggregate.severity,
      toReviewPrioritySeverity(signal.severity)
    )

    for (const eventId of evidenceEventIds) {
      aggregate.evidenceEventIds.add(eventId)
    }
  }

  return new Map(
    [...reasonsBySubject.entries()].map(([subjectId, aggregate]) => [
      subjectId,
      [toReviewPriorityReason(aggregate)]
    ])
  )
}

function reviewEventIdsBySubjectAndReviewId(
  events: readonly DevelopmentEvent[]
): Map<string, Map<string, Set<string>>> {
  const orderedEvents = sortDevelopmentEvents([...events])
  const subjectIndex = buildReviewSubjectIndex(orderedEvents)
  const reviewEventIds = new Map<string, Map<string, Set<string>>>()

  for (const event of orderedEvents) {
    if (event.eventType !== 'review.requested' && event.eventType !== 'review.completed') {
      continue
    }

    const identity = resolveReviewSubjectIdentity(event, subjectIndex)

    if (!identity) {
      continue
    }

    const eventsByReviewId = reviewEventIds.get(identity.key) ?? new Map<string, Set<string>>()
    const eventIds = eventsByReviewId.get(event.payload.reviewId) ?? new Set<string>()
    eventIds.add(event.eventId)
    eventsByReviewId.set(event.payload.reviewId, eventIds)
    reviewEventIds.set(identity.key, eventsByReviewId)
  }

  return reviewEventIds
}

function matchedEvidenceEventIds(
  signal: DisagreementSignal,
  reviewEventIds: Map<string, Map<string, Set<string>>>
): string[] {
  const eventsByReviewId = reviewEventIds.get(signal.subjectId)

  if (!eventsByReviewId) {
    return []
  }

  const evidenceEventIds = new Set<string>()

  for (const reviewId of signal.reviewIds) {
    for (const eventId of eventsByReviewId.get(reviewId) ?? []) {
      evidenceEventIds.add(eventId)
    }
  }

  return [...evidenceEventIds].sort()
}

function getOrCreateReasonAggregate(
  reasonsBySubject: Map<string, DisagreementReasonAggregate>,
  subjectId: string
): DisagreementReasonAggregate {
  const existing = reasonsBySubject.get(subjectId)

  if (existing) {
    return existing
  }

  const aggregate: DisagreementReasonAggregate = {
    severity: 'medium',
    signalIds: new Set(),
    summaries: new Set(),
    evidenceEventIds: new Set()
  }
  reasonsBySubject.set(subjectId, aggregate)
  return aggregate
}

function toReviewPriorityReason(aggregate: DisagreementReasonAggregate): ReviewPriorityReason {
  return {
    type: 'review_disagreement',
    severity: aggregate.severity,
    summary:
      aggregate.signalIds.size > 1
        ? 'Multiple reviewers disagree on verdict, severity, or finding category.'
        : ([...aggregate.summaries][0] ?? 'Reviewers disagree on this review subject.'),
    evidenceEventIds: [...aggregate.evidenceEventIds].sort()
  }
}

function toReviewPrioritySeverity(severity: DisagreementSeverity): ReviewPrioritySeverity {
  if (severity === 'high') {
    return 'high'
  }

  // Any surfaced disagreement represents at least medium human-attention priority.
  return 'medium'
}

function maxReviewSeverity(
  left: ReviewPrioritySeverity,
  right: ReviewPrioritySeverity
): ReviewPrioritySeverity {
  return REVIEW_SEVERITY_RANK[right] > REVIEW_SEVERITY_RANK[left] ? right : left
}
