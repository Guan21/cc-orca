import type {
  DevelopmentEventActor,
  DevelopmentEventType
} from '../../../../shared/development-event-types'

export type TimelineItemCategory =
  | 'task'
  | 'agent'
  | 'file'
  | 'commit'
  | 'pull-request'
  | 'review'
  | 'test'

export type TimelineItemStatus = 'neutral' | 'active' | 'success' | 'attention' | 'danger'

export type TimelineItemActorViewModel = {
  id: string
  label: string
  type: DevelopmentEventActor['type']
  provider?: string
}

export type TimelineItemViewModel = {
  eventId: string
  eventType: DevelopmentEventType
  category: TimelineItemCategory
  title: string
  summary: string
  occurredAt: string
  occurredAtMs: number
  timeLabel: string
  actor: TimelineItemActorViewModel
  status: TimelineItemStatus
  badges: string[]
  related: {
    taskId?: string
    sessionId?: string
    file?: { path: string; changeType: string; oldPath?: string }
    commit?: { sha: string; branch?: string }
    pullRequest?: { id: string; provider: string; url?: string }
    review?: { id: string; provider: string; pullRequestId?: string }
  }
}

export type ProjectPulseSummary = {
  activeTasks: number
  activeAgents: number
  pendingReviews: number
  recentFailures: number
  recentlyCompletedTasks: number
}

export type TimelineTimeWindow = 'all' | '24h' | '7d'

export type TimelineFilterId = 'all' | (string & {})

export type TimelineFilters = {
  category?: TimelineItemCategory | 'all'
  eventType?: DevelopmentEventType | 'all'
  actorId?: TimelineFilterId
  taskId?: TimelineFilterId
  timeWindow?: TimelineTimeWindow
}
