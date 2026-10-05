import type { DevelopmentEvent } from './development-event-types'

export type ReviewSubjectIdentity = {
  key: string
  type: 'pull_request' | 'change'
  id: string
  provider?: string
  url?: string
  title?: string
}

type SubjectIndex = {
  taskSubjects: Map<string, Set<string>>
  sessionSubjects: Map<string, Set<string>>
  identitiesByKey: Map<string, ReviewSubjectIdentity>
}

export function sortDevelopmentEvents(events: DevelopmentEvent[]): DevelopmentEvent[] {
  return [...events].sort((left, right) => {
    const occurredDelta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt)

    if (occurredDelta !== 0) {
      return occurredDelta
    }

    return left.eventId.localeCompare(right.eventId)
  })
}

export function buildReviewSubjectIndex(events: DevelopmentEvent[]): SubjectIndex {
  const identitiesByKey = new Map<string, ReviewSubjectIdentity>()
  const taskSubjects = new Map<string, Set<string>>()
  const sessionSubjects = new Map<string, Set<string>>()

  for (const event of events) {
    const identity = getDirectPullRequestIdentity(event)

    if (!identity) {
      continue
    }

    identitiesByKey.set(identity.key, identity)

    if (event.taskId) {
      addIndexedSubject(taskSubjects, contextIndexKey(event.projectId, event.taskId), identity.key)
    }

    if (event.sessionId) {
      addIndexedSubject(
        sessionSubjects,
        contextIndexKey(event.projectId, event.sessionId),
        identity.key
      )
    }
  }

  return { taskSubjects, sessionSubjects, identitiesByKey }
}

export function resolveReviewSubjectIdentity(
  event: DevelopmentEvent,
  subjectIndex: SubjectIndex
): ReviewSubjectIdentity | undefined {
  const directIdentity = getDirectPullRequestIdentity(event)

  if (directIdentity) {
    return directIdentity
  }

  const taskIdentity = event.taskId
    ? getUniqueIndexedIdentity(
        subjectIndex,
        subjectIndex.taskSubjects,
        event.projectId,
        event.taskId
      )
    : undefined

  if (taskIdentity) {
    return taskIdentity
  }

  const sessionIdentity = event.sessionId
    ? getUniqueIndexedIdentity(
        subjectIndex,
        subjectIndex.sessionSubjects,
        event.projectId,
        event.sessionId
      )
    : undefined

  if (sessionIdentity) {
    return sessionIdentity
  }

  return getChangeIdentity(event)
}

function addIndexedSubject(
  index: Map<string, Set<string>>,
  contextKey: string,
  subjectKey: string
): void {
  const subjects = index.get(contextKey) ?? new Set<string>()
  subjects.add(subjectKey)
  index.set(contextKey, subjects)
}

function contextIndexKey(projectId: string, id: string): string {
  return `${projectId}:${id}`
}

function getUniqueIndexedIdentity(
  subjectIndex: SubjectIndex,
  index: Map<string, Set<string>>,
  projectId: string,
  contextId: string
): ReviewSubjectIdentity | undefined {
  const subjects = index.get(contextIndexKey(projectId, contextId))

  if (!subjects || subjects.size !== 1) {
    return undefined
  }

  const subjectKey = [...subjects][0]
  return subjectKey ? subjectIndex.identitiesByKey.get(subjectKey) : undefined
}

function getDirectPullRequestIdentity(event: DevelopmentEvent): ReviewSubjectIdentity | undefined {
  if (event.eventType === 'pull_request.created') {
    return {
      key: pullRequestSubjectKey(
        event.projectId,
        event.payload.provider,
        event.payload.pullRequestId
      ),
      type: 'pull_request',
      id: event.payload.pullRequestId,
      provider: event.payload.provider,
      url: event.payload.url,
      title: event.payload.title
    }
  }

  if (
    (event.eventType === 'review.requested' || event.eventType === 'review.completed') &&
    event.payload.pullRequestId
  ) {
    return {
      key: pullRequestSubjectKey(
        event.projectId,
        event.payload.provider,
        event.payload.pullRequestId
      ),
      type: 'pull_request',
      id: event.payload.pullRequestId,
      provider: event.payload.provider
    }
  }

  return undefined
}

function pullRequestSubjectKey(projectId: string, provider: string, pullRequestId: string): string {
  return `${projectId}:pull_request:${provider}:${pullRequestId}`
}

function getChangeIdentity(event: DevelopmentEvent): ReviewSubjectIdentity | undefined {
  const changeId = event.taskId ?? event.sessionId

  if (!changeId) {
    return undefined
  }

  if (!isReviewQueueRelevantEvent(event)) {
    return undefined
  }

  const scope = event.taskId ? 'task' : 'session'

  return {
    key: `${event.projectId}:change:${scope}:${changeId}`,
    type: 'change',
    id: changeId
  }
}

function isReviewQueueRelevantEvent(event: DevelopmentEvent): boolean {
  return (
    event.eventType === 'agent.failed' ||
    event.eventType === 'file.changed' ||
    event.eventType === 'commit.created' ||
    event.eventType === 'review.requested' ||
    event.eventType === 'review.completed' ||
    event.eventType === 'test.completed'
  )
}
