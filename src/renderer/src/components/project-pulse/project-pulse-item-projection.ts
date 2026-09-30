import type {
  DevelopmentEvent,
  DevelopmentEventActor,
  DevelopmentEventType
} from '../../../../shared/development-event-types'
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

function capitalize(value: string): string {
  const trimmed = value.trim()
  return trimmed ? `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}` : ''
}

function providerLabel(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'github') {
    return 'GitHub'
  }
  if (normalized === 'gitlab') {
    return 'GitLab'
  }
  return capitalize(normalized)
}

function actorViewModel(actor: DevelopmentEventActor): TimelineItemActorViewModel {
  const provider = providerLabel(actor.provider)
  const label = provider ?? capitalize(actor.id.replace(/[-_]+/g, ' ')) ?? actor.id
  return { id: actor.id, label, type: actor.type, provider: actor.provider }
}

function taskLabel(taskId: string | undefined): string {
  return taskId ? `task #${taskId.replace(/^#/, '')}` : 'task'
}

function prLabel(pullRequestId: string | undefined): string {
  return pullRequestId ? `PR #${pullRequestId.replace(/^#/, '')}` : 'PR'
}

function shortSha(sha: string): string {
  return sha.slice(0, 7)
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
        title: event.taskId ? `Started ${label}` : 'Started task',
        summary: event.payload.title ?? 'Task work started.',
        status: 'active',
        badges: [label]
      }
    }
    case 'task.completed': {
      const label = taskLabel(event.taskId)
      return {
        ...base,
        title: event.taskId ? `Completed ${label}` : 'Completed task',
        summary: event.payload.title ?? event.payload.result ?? 'Task completed.',
        status: 'success',
        badges: [label]
      }
    }
    case 'agent.started':
      return {
        ...base,
        title: `${base.actor.label} started`,
        summary: `Agent ${event.payload.agentId} started work.`,
        status: 'active',
        badges: [event.payload.agentId]
      }
    case 'agent.completed':
      return {
        ...base,
        title: `${base.actor.label} completed`,
        summary: `Agent ${event.payload.agentId} completed work.`,
        status: 'success',
        badges: [event.payload.agentId]
      }
    case 'agent.failed':
      return {
        ...base,
        title: `${base.actor.label} failed`,
        summary: event.payload.errorMessage || `Agent ${event.payload.agentId} failed.`,
        status: 'danger',
        badges: [event.payload.agentId]
      }
    case 'file.changed':
      return {
        ...base,
        title: `${event.payload.path} changed`,
        summary:
          event.payload.changeType === 'renamed' && event.payload.oldPath
            ? `Renamed from ${event.payload.oldPath}.`
            : `${capitalize(event.payload.changeType)} file.`,
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
        title: `Commit ${shortSha(event.payload.sha)} created`,
        summary: event.payload.message || 'Commit created.',
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
        title: `${prLabel(event.payload.pullRequestId)} created`,
        summary:
          event.payload.title ||
          `${providerLabel(event.payload.provider) ?? 'Provider'} pull request created.`,
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
        title: `Review requested for ${prLabel(event.payload.pullRequestId)}`,
        summary: `${providerLabel(event.payload.provider) ?? 'Provider'} review requested.`,
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
        title: `Review completed for ${prLabel(event.payload.pullRequestId)}`,
        summary: `${providerLabel(event.payload.provider) ?? 'Provider'} review completed.`,
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
          ? `${event.payload.passed ?? 0} passed, ${event.payload.failed ?? 0} failed`
          : event.payload.suite
            ? event.payload.suite
            : 'Test run completed.'
      return {
        ...base,
        title: failed ? 'Tests failed' : skipped ? 'Tests skipped' : 'Tests passed',
        summary: countSummary,
        status: failed ? 'danger' : skipped ? 'attention' : 'success',
        badges: event.payload.suite ? [event.payload.suite] : []
      }
    }
  }
}
