import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import { projectEventToTimelineItem } from './project-pulse-item-projection'
import type {
  ProjectPulseSummary,
  TimelineFilters,
  TimelineItemViewModel,
  TimelineTimeWindow
} from './project-pulse-types'

export type {
  ProjectPulseSummary,
  TimelineFilters,
  TimelineItemActorViewModel,
  TimelineItemCategory,
  TimelineItemStatus,
  TimelineItemViewModel,
  TimelineTimeWindow
} from './project-pulse-types'

export function projectDevelopmentEventsToTimeline(
  events: readonly DevelopmentEvent[]
): TimelineItemViewModel[] {
  return events
    .map((event, index) => ({ item: projectEventToTimelineItem(event), index }))
    .sort((a, b) => b.item.occurredAtMs - a.item.occurredAtMs || a.index - b.index)
    .map(({ item }) => item)
}

function timeWindowMs(window: TimelineTimeWindow | undefined): number | null {
  if (!window || window === 'all') {
    return null
  }
  return window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
}

export function filterTimelineItems(
  items: readonly TimelineItemViewModel[],
  filters: TimelineFilters,
  nowMs = Date.now()
): TimelineItemViewModel[] {
  const maxAge = timeWindowMs(filters.timeWindow)
  return items.filter((item) => {
    if (filters.category && filters.category !== 'all' && item.category !== filters.category) {
      return false
    }
    if (filters.eventType && filters.eventType !== 'all' && item.eventType !== filters.eventType) {
      return false
    }
    if (filters.actorId && filters.actorId !== 'all' && item.actor.id !== filters.actorId) {
      return false
    }
    if (filters.taskId && filters.taskId !== 'all' && item.related.taskId !== filters.taskId) {
      return false
    }
    return maxAge === null || nowMs - item.occurredAtMs <= maxAge
  })
}

export function projectPulseSummary(events: readonly DevelopmentEvent[]): ProjectPulseSummary {
  const startedTasks = new Set<string>()
  const completedTasks = new Set<string>()
  const startedAgents = new Set<string>()
  const settledAgents = new Set<string>()
  const requestedReviews = new Set<string>()
  const completedReviews = new Set<string>()
  let recentFailures = 0

  for (const event of events) {
    if (event.eventType === 'task.started' && event.taskId) {
      startedTasks.add(event.taskId)
    }
    if (event.eventType === 'task.completed' && event.taskId) {
      completedTasks.add(event.taskId)
    }
    if (event.eventType === 'agent.started') {
      startedAgents.add(event.payload.agentId)
    }
    if (event.eventType === 'agent.completed' || event.eventType === 'agent.failed') {
      settledAgents.add(event.payload.agentId)
    }
    if (event.eventType === 'review.requested') {
      requestedReviews.add(event.payload.reviewId)
    }
    if (event.eventType === 'review.completed') {
      completedReviews.add(event.payload.reviewId)
    }
    if (
      event.eventType === 'agent.failed' ||
      (event.eventType === 'test.completed' && event.payload.status === 'failed')
    ) {
      recentFailures += 1
    }
  }

  return {
    activeTasks: [...startedTasks].filter((taskId) => !completedTasks.has(taskId)).length,
    activeAgents: [...startedAgents].filter((agentId) => !settledAgents.has(agentId)).length,
    pendingReviews: [...requestedReviews].filter((reviewId) => !completedReviews.has(reviewId))
      .length,
    recentFailures,
    recentlyCompletedTasks: completedTasks.size
  }
}
