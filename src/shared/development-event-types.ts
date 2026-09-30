export const DEVELOPMENT_EVENT_VERSION = 1 as const

export const DEVELOPMENT_EVENT_TYPES = [
  'task.started',
  'task.completed',
  'agent.started',
  'agent.completed',
  'agent.failed',
  'file.changed',
  'commit.created',
  'pull_request.created',
  'review.requested',
  'review.completed',
  'test.completed'
] as const

export type DevelopmentEventType = (typeof DEVELOPMENT_EVENT_TYPES)[number]

export type DevelopmentEventActorType = 'human' | 'agent' | 'system'

export type DevelopmentEventActor = {
  type: DevelopmentEventActorType
  id: string
  provider?: string
}

export type DevelopmentEventBase<TType extends DevelopmentEventType, TPayload> = {
  version: typeof DEVELOPMENT_EVENT_VERSION
  eventId: string
  eventType: TType
  occurredAt: string
  projectId: string
  taskId?: string
  sessionId?: string
  actor: DevelopmentEventActor
  source: string
  payload: TPayload
}

export type DevelopmentEventJsonValue =
  | string
  | number
  | boolean
  | null
  | DevelopmentEventJsonValue[]
  | { [key: string]: DevelopmentEventJsonValue }

export type DevelopmentEventMetadata = Record<string, DevelopmentEventJsonValue>

export type TaskLifecycleDevelopmentEventPayload = {
  title?: string
  result?: string
  metadata?: DevelopmentEventMetadata
}

export type AgentDevelopmentEventPayload = {
  agentId: string
  status?: 'started' | 'completed' | 'failed'
  errorMessage?: string
  metadata?: DevelopmentEventMetadata
}

export type FileChangedDevelopmentEventPayload = {
  path: string
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  metadata?: DevelopmentEventMetadata
}

export type CommitCreatedDevelopmentEventPayload = {
  sha: string
  message?: string
  branch?: string
  metadata?: DevelopmentEventMetadata
}

export type PullRequestCreatedDevelopmentEventPayload = {
  provider: string
  pullRequestId: string
  url: string
  title?: string
  metadata?: DevelopmentEventMetadata
}

export type ReviewDevelopmentEventPayload = {
  provider: string
  reviewId: string
  status: 'requested' | 'completed'
  pullRequestId?: string
  metadata?: DevelopmentEventMetadata
}

export type TestCompletedDevelopmentEventPayload = {
  status: 'passed' | 'failed' | 'skipped'
  suite?: string
  passed?: number
  failed?: number
  skipped?: number
  metadata?: DevelopmentEventMetadata
}

export type DevelopmentEventPayloadByType = {
  'task.started': TaskLifecycleDevelopmentEventPayload
  'task.completed': TaskLifecycleDevelopmentEventPayload
  'agent.started': AgentDevelopmentEventPayload
  'agent.completed': AgentDevelopmentEventPayload
  'agent.failed': AgentDevelopmentEventPayload
  'file.changed': FileChangedDevelopmentEventPayload
  'commit.created': CommitCreatedDevelopmentEventPayload
  'pull_request.created': PullRequestCreatedDevelopmentEventPayload
  'review.requested': ReviewDevelopmentEventPayload
  'review.completed': ReviewDevelopmentEventPayload
  'test.completed': TestCompletedDevelopmentEventPayload
}

export type DevelopmentEvent = {
  [TType in DevelopmentEventType]: DevelopmentEventBase<TType, DevelopmentEventPayloadByType[TType]>
}[DevelopmentEventType]

export type DevelopmentEventCallback = (event: DevelopmentEvent) => void

export type DevelopmentEventConsumer = {
  subscribe(callback: DevelopmentEventCallback): () => void
}

export type DevelopmentEventProducer = {
  emit(event: unknown): DevelopmentEvent
}
