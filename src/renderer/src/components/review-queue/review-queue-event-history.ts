import { translate } from '@/i18n/i18n'
import type {
  DevelopmentEvent,
  DevelopmentEventActor,
  DevelopmentEventType
} from '../../../../shared/development-event-types'
import { reviewTestStatusLabel } from './review-queue-view-model'

export type ReviewEventHistoryEntry = {
  id: string
  occurredAt: string
  eventType: DevelopmentEventType
  actor: string
  summary: string
}

export function reviewEventHistoryEntries(
  relatedEvents: readonly DevelopmentEvent[]
): ReviewEventHistoryEntry[] {
  return relatedEvents.map((event) => ({
    id: event.eventId,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    actor: reviewEventActorLabel(event.actor),
    summary: reviewEventSummary(event)
  }))
}

function reviewEventActorLabel(actor: DevelopmentEventActor): string {
  return actor.provider ? `${actor.provider}:${actor.id}` : `${actor.type}:${actor.id}`
}

function reviewEventSummary(event: DevelopmentEvent): string {
  switch (event.eventType) {
    case 'task.started':
    case 'task.completed':
      return event.payload.title
        ? translate('auto.components.reviewQueue.event.taskWithTitle', 'Task {{value0}}', {
            value0: event.payload.title
          })
        : translate('auto.components.reviewQueue.event.task', 'Task lifecycle event')
    case 'agent.started':
    case 'agent.completed':
    case 'agent.failed':
      return translate('auto.components.reviewQueue.event.agent', 'Agent {{value0}} {{value1}}', {
        value0: event.payload.agentId,
        value1: event.payload.status ?? event.eventType.split('.')[1]
      })
    case 'file.changed':
      return translate('auto.components.reviewQueue.event.file', '{{value0}} {{value1}}', {
        value0: event.payload.changeType,
        value1: event.payload.path
      })
    case 'commit.created':
      return translate('auto.components.reviewQueue.event.commit', 'Commit {{value0}}', {
        value0: event.payload.sha.slice(0, 7)
      })
    case 'pull_request.created':
      return event.payload.title
        ? translate(
            'auto.components.reviewQueue.event.pullRequestWithTitle',
            'PR {{value0}}: {{value1}}',
            {
              value0: event.payload.pullRequestId,
              value1: event.payload.title
            }
          )
        : translate('auto.components.reviewQueue.event.pullRequest', 'PR {{value0}}', {
            value0: event.payload.pullRequestId
          })
    case 'review.requested':
    case 'review.completed':
      return translate('auto.components.reviewQueue.event.review', 'Review {{value0}} {{value1}}', {
        value0: event.payload.reviewId,
        value1: event.payload.status
      })
    case 'test.completed':
      return reviewTestEventSummary(event)
  }
}

function reviewTestEventSummary(
  event: Extract<DevelopmentEvent, { eventType: 'test.completed' }>
): string {
  const counts = [
    typeof event.payload.passed === 'number'
      ? translate('auto.components.reviewQueue.evidence.testsPassed', '{{value0}} passed', {
          value0: event.payload.passed
        })
      : undefined,
    typeof event.payload.failed === 'number'
      ? translate('auto.components.reviewQueue.evidence.testsFailed', '{{value0}} failed', {
          value0: event.payload.failed
        })
      : undefined
  ].filter(Boolean)
  return [
    reviewTestStatusLabel(event.payload.status === 'skipped' ? 'unknown' : event.payload.status),
    event.payload.suite,
    counts.length > 0 ? counts.join(' · ') : undefined
  ]
    .filter(Boolean)
    .join(' · ')
}
