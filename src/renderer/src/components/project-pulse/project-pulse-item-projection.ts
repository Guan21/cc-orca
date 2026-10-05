import type {
  DevelopmentEvent,
  DevelopmentEventActor,
  DevelopmentEventType
} from '../../../../shared/development-event-types'
import {
  agentCompletedSummary,
  agentCompletedTitle,
  agentFailedSummary,
  agentFailedTitle,
  agentStartedSummary,
  agentStartedTitle,
  capitalize,
  commitCreatedSummary,
  commitCreatedTitle,
  fileChangedSummary,
  fileChangedTitle,
  fileRenamedSummary,
  providerLabel,
  pullRequestCreatedSummary,
  pullRequestCreatedTitle,
  reviewCompletedSummary,
  reviewCompletedTitle,
  reviewRequestedSummary,
  reviewRequestedTitle,
  taskCompletedSummary,
  taskCompletedTitle,
  taskLabel,
  taskStartedTitle,
  taskWorkStartedSummary,
  testCountSummary,
  testRunCompletedSummary,
  testsCompletedTitle
} from './project-pulse-item-copy'
import type {
  TimelineItemActorViewModel,
  TimelineItemCategory,
  TimelineItemViewModel
} from './project-pulse-types'

function formatTimeLabel(occurredAt: string): { label: string; ms: number } {
  const ms = Date.parse(occurredAt)
  if (Number.isNaN(ms)) {
    return { label: '--:--', ms: 0 }
  }
  return { label: occurredAt.match(/T(\d{2}:\d{2})/)?.[1] ?? '--:--', ms }
}

function actorViewModel(actor: DevelopmentEventActor): TimelineItemActorViewModel {
  const provider = providerLabel(actor.provider)
  const label = provider ?? capitalize(actor.id.replace(/[-_]+/g, ' ')) ?? actor.id
  return { id: actor.id, label, type: actor.type, provider: actor.provider }
}

function categoryForEvent(eventType: DevelopmentEventType): TimelineItemCategory {
  if (eventType.startsWith('task.')) {
    return 'task'
  }
  if (eventType.startsWith('agent.')) {
    return 'agent'
  }
  if (eventType === 'file.changed') {
    return 'file'
  }
  if (eventType === 'commit.created') {
    return 'commit'
  }
  if (eventType === 'pull_request.created') {
    return 'pull-request'
  }
  if (eventType.startsWith('review.')) {
    return 'review'
  }
  return 'test'
}

function baseItem(
  event: DevelopmentEvent
): Pick<
  TimelineItemViewModel,
  | 'eventId'
  | 'eventType'
  | 'category'
  | 'occurredAt'
  | 'occurredAtMs'
  | 'timeLabel'
  | 'actor'
  | 'related'
> {
  const time = formatTimeLabel(event.occurredAt)
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    category: categoryForEvent(event.eventType),
    occurredAt: event.occurredAt,
    occurredAtMs: time.ms,
    timeLabel: time.label,
    actor: actorViewModel(event.actor),
    related: {
      taskId: event.taskId,
      sessionId: event.sessionId
    }
  }
}

export function projectEventToTimelineItem(event: DevelopmentEvent): TimelineItemViewModel {
  const base = baseItem(event)
  switch (event.eventType) {
    case 'task.started': {
      const label = taskLabel(event.taskId)
      return {
        ...base,
        title: taskStartedTitle(label, Boolean(event.taskId)),
        summary: event.payload.title ?? taskWorkStartedSummary(),
        status: 'active',
        badges: [label]
      }
    }
    case 'task.completed': {
      const label = taskLabel(event.taskId)
      return {
        ...base,
        title: taskCompletedTitle(label, Boolean(event.taskId)),
        summary: event.payload.title ?? event.payload.result ?? taskCompletedSummary(),
        status: 'success',
        badges: [label]
      }
    }
    case 'agent.started':
      return {
        ...base,
        title: agentStartedTitle(base.actor.label),
        summary: agentStartedSummary(event.payload.agentId),
        status: 'active',
        badges: [event.payload.agentId]
      }
    case 'agent.completed':
      return {
        ...base,
        title: agentCompletedTitle(base.actor.label),
        summary: agentCompletedSummary(event.payload.agentId),
        status: 'success',
        badges: [event.payload.agentId]
      }
    case 'agent.failed':
      return {
        ...base,
        title: agentFailedTitle(base.actor.label),
        summary: event.payload.errorMessage || agentFailedSummary(event.payload.agentId),
        status: 'danger',
        badges: [event.payload.agentId]
      }
    case 'file.changed':
      return {
        ...base,
        title: fileChangedTitle(event.payload.path),
        summary:
          event.payload.changeType === 'renamed' && event.payload.oldPath
            ? fileRenamedSummary(event.payload.oldPath)
            : fileChangedSummary(event.payload.changeType),
        status: 'neutral',
        badges: [event.payload.changeType],
        related: {
          ...base.related,
          file: {
            path: event.payload.path,
            changeType: event.payload.changeType,
            oldPath: event.payload.oldPath
          }
        }
      }
    case 'commit.created':
      return {
        ...base,
        title: commitCreatedTitle(event.payload.sha),
        summary: event.payload.message ?? commitCreatedSummary(),
        status: 'success',
        badges: event.payload.branch ? [event.payload.branch] : [],
        related: {
          ...base.related,
          commit: { sha: event.payload.sha, branch: event.payload.branch }
        }
      }
    case 'pull_request.created':
      return {
        ...base,
        title: pullRequestCreatedTitle(event.payload.pullRequestId),
        summary: event.payload.title || pullRequestCreatedSummary(event.payload.provider),
        status: 'success',
        badges: [providerLabel(event.payload.provider) ?? event.payload.provider],
        related: {
          ...base.related,
          pullRequest: {
            id: event.payload.pullRequestId,
            provider: event.payload.provider,
            url: event.payload.url
          }
        }
      }
    case 'review.requested':
      return {
        ...base,
        title: reviewRequestedTitle(event.payload.pullRequestId),
        summary: reviewRequestedSummary(event.payload.provider),
        status: 'attention',
        badges: [providerLabel(event.payload.provider) ?? event.payload.provider],
        related: {
          ...base.related,
          review: {
            id: event.payload.reviewId,
            provider: event.payload.provider,
            pullRequestId: event.payload.pullRequestId
          },
          pullRequest: event.payload.pullRequestId
            ? { id: event.payload.pullRequestId, provider: event.payload.provider }
            : undefined
        }
      }
    case 'review.completed':
      return {
        ...base,
        title: reviewCompletedTitle(event.payload.pullRequestId),
        summary: reviewCompletedSummary(event.payload.provider),
        status: 'success',
        badges: [providerLabel(event.payload.provider) ?? event.payload.provider],
        related: {
          ...base.related,
          review: {
            id: event.payload.reviewId,
            provider: event.payload.provider,
            pullRequestId: event.payload.pullRequestId
          },
          pullRequest: event.payload.pullRequestId
            ? { id: event.payload.pullRequestId, provider: event.payload.provider }
            : undefined
        }
      }
    case 'test.completed': {
      const failed = event.payload.status === 'failed'
      const skipped = event.payload.status === 'skipped'
      const countSummary =
        event.payload.passed !== undefined || event.payload.failed !== undefined
          ? testCountSummary(event.payload.passed, event.payload.failed)
          : event.payload.suite
            ? event.payload.suite
            : testRunCompletedSummary()
      return {
        ...base,
        title: testsCompletedTitle(event.payload.status),
        summary: countSummary,
        status: failed ? 'danger' : skipped ? 'attention' : 'success',
        badges: event.payload.suite ? [event.payload.suite] : []
      }
    }
  }
}
