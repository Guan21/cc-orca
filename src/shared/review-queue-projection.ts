import type { DevelopmentEvent } from './development-event-types'
import type { DisagreementSignal } from './disagreement-signal-types'
import { buildDisagreementReviewReasons } from './review-queue-disagreement'
import {
  buildReviewEvidenceSummary,
  buildReviewPriorityReasons,
  deriveReviewState,
  isSecuritySensitiveReviewPath
} from './review-queue-evidence'
import {
  compareReviewQueueItems,
  resolveReviewPriority,
  sortReviewPriorityReasons
} from './review-queue-priority'
import {
  buildReviewSubjectIndex,
  resolveReviewSubjectIdentity,
  sortDevelopmentEvents,
  type ReviewSubjectIdentity
} from './review-queue-subject-identity'
import type { ReviewActorType, ReviewItem, ReviewPriorityReason } from './review-queue-types'

export type ProjectReviewQueueOptions = {
  disagreementSignals?: readonly DisagreementSignal[]
}

type ReviewEventRecord = {
  reviewId: string
  status: 'requested' | 'completed'
  eventId: string
}

type MutableReviewAggregate = {
  identity: ReviewSubjectIdentity
  projectId: string
  taskId?: string
  sessionId?: string
  actor?: {
    type: ReviewActorType
    id?: string
    provider?: string
  }
  lastUpdatedAt: string
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

export function projectReviewQueue(
  events: readonly DevelopmentEvent[],
  options: ProjectReviewQueueOptions = {}
): ReviewItem[] {
  const orderedEvents = sortDevelopmentEvents([...events])
  const subjectIndex = buildReviewSubjectIndex(orderedEvents)
  const aggregates = new Map<string, MutableReviewAggregate>()
  const disagreementReasonsBySubject = options.disagreementSignals
    ? buildDisagreementReviewReasons(orderedEvents, options.disagreementSignals)
    : new Map()

  for (const event of orderedEvents) {
    const identity = resolveReviewSubjectIdentity(event, subjectIndex)

    if (!identity) {
      continue
    }

    const aggregate = getOrCreateAggregate(aggregates, identity, event)
    applyEventToAggregate(aggregate, event)
  }

  return sortReviewQueueItems(
    [...aggregates.values()].map((aggregate) =>
      toReviewItem(aggregate, disagreementReasonsBySubject.get(aggregate.identity.key) ?? [])
    )
  )
}

export function sortReviewQueueItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort(compareReviewQueueItems)
}

function getOrCreateAggregate(
  aggregates: Map<string, MutableReviewAggregate>,
  identity: ReviewSubjectIdentity,
  event: DevelopmentEvent
): MutableReviewAggregate {
  const existing = aggregates.get(identity.key)

  if (existing) {
    mergeSubjectDetails(existing.identity, identity)
    return existing
  }

  const aggregate: MutableReviewAggregate = {
    identity: { ...identity },
    projectId: event.projectId,
    taskId: event.taskId,
    sessionId: event.sessionId,
    lastUpdatedAt: event.occurredAt,
    relatedEventIds: [],
    testStatuses: new Set(),
    passedTests: 0,
    failedTests: 0,
    hasPassedCount: false,
    hasFailedCount: false,
    failedTestEventIds: [],
    reviewEvents: [],
    agentFailedEventIds: [],
    changedFiles: [],
    securitySensitiveChangeEventIds: []
  }

  aggregates.set(identity.key, aggregate)
  return aggregate
}

function mergeSubjectDetails(target: ReviewSubjectIdentity, source: ReviewSubjectIdentity): void {
  target.url ??= source.url
  target.title ??= source.title
  target.provider ??= source.provider
}

function applyEventToAggregate(aggregate: MutableReviewAggregate, event: DevelopmentEvent): void {
  aggregate.taskId ??= event.taskId
  aggregate.sessionId ??= event.sessionId
  aggregate.actor ??= toReviewActor(event.actor)
  aggregate.lastUpdatedAt = event.occurredAt
  aggregate.relatedEventIds.push(event.eventId)

  if (event.eventType === 'test.completed') {
    aggregate.testStatuses.add(event.payload.status)

    if (typeof event.payload.passed === 'number') {
      aggregate.passedTests += event.payload.passed
      aggregate.hasPassedCount = true
    }

    if (typeof event.payload.failed === 'number') {
      aggregate.failedTests += event.payload.failed
      aggregate.hasFailedCount = true
    }

    if (event.payload.status === 'failed') {
      aggregate.failedTestEventIds.push(event.eventId)
    }
  }

  if (event.eventType === 'review.requested' || event.eventType === 'review.completed') {
    aggregate.reviewEvents.push({
      reviewId: event.payload.reviewId,
      status: event.payload.status,
      eventId: event.eventId
    })
  }

  if (event.eventType === 'agent.failed') {
    aggregate.agentFailedEventIds.push(event.eventId)
  }

  if (event.eventType === 'file.changed') {
    appendUnique(aggregate.changedFiles, event.payload.path)

    if (isSecuritySensitiveReviewPath(event.payload.path)) {
      aggregate.securitySensitiveChangeEventIds.push(event.eventId)
    }
  }

  if (event.eventType === 'commit.created') {
    aggregate.latestCommit = { sha: event.payload.sha, occurredAt: event.occurredAt }
  }
}

function toReviewActor(actor: DevelopmentEvent['actor']): ReviewItem['actor'] {
  return {
    type: actor.type,
    id: actor.id,
    provider: actor.provider
  }
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value)
  }
}

function toReviewItem(
  aggregate: MutableReviewAggregate,
  disagreementReasons: ReviewPriorityReason[] = []
): ReviewItem {
  const reasons = sortReviewPriorityReasons([
    ...buildReviewPriorityReasons(aggregate),
    ...disagreementReasons
  ])
  const evidence = buildReviewEvidenceSummary(aggregate)
  const priority = resolveReviewPriority(reasons)

  return {
    id: aggregate.identity.key,
    projectId: aggregate.projectId,
    taskId: aggregate.taskId,
    sessionId: aggregate.sessionId,
    subject: {
      type: aggregate.identity.type,
      id: aggregate.identity.id,
      provider: aggregate.identity.provider,
      url: aggregate.identity.url,
      title: aggregate.identity.title
    },
    actor: aggregate.actor ?? { type: 'system' },
    state: deriveReviewState(reasons, evidence),
    priority,
    reasons,
    evidence,
    relatedEventIds: aggregate.relatedEventIds,
    lastUpdatedAt: aggregate.lastUpdatedAt
  }
}
