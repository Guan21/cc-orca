import type { DevelopmentEvent, DevelopmentEventType } from './development-event-types'

const BASE_EVENT = {
  version: 1,
  occurredAt: '2026-09-30T00:00:00.000Z',
  projectId: 'project-1',
  source: 'devcrew.fixture'
} as const

type FixtureOverrides<TType extends DevelopmentEventType> = Partial<
  Extract<DevelopmentEvent, { eventType: TType }>
>

function withDefaults<TType extends DevelopmentEventType>(
  event: Extract<DevelopmentEvent, { eventType: TType }>,
  overrides: FixtureOverrides<TType> = {}
): Extract<DevelopmentEvent, { eventType: TType }> {
  return { ...event, ...overrides }
}

export function humanActionDevelopmentEventFixture(
  overrides: FixtureOverrides<'review.requested'> = {}
): Extract<DevelopmentEvent, { eventType: 'review.requested' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-human-review-requested',
      eventType: 'review.requested',
      actor: { type: 'human', id: 'user-1' },
      payload: {
        provider: 'github',
        reviewId: 'review-request-1',
        status: 'requested',
        pullRequestId: '42'
      }
    },
    overrides
  )
}

export function agentActionDevelopmentEventFixture(
  overrides: FixtureOverrides<'agent.completed'> = {}
): Extract<DevelopmentEvent, { eventType: 'agent.completed' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-agent-completed',
      eventType: 'agent.completed',
      sessionId: 'session-1',
      actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
      payload: { agentId: 'agent-1', status: 'completed' }
    },
    overrides
  )
}

export function taskLifecycleDevelopmentEventFixture(
  overrides: FixtureOverrides<'task.started' | 'task.completed'> = {}
): Extract<DevelopmentEvent, { eventType: 'task.started' | 'task.completed' }> {
  const eventType = overrides.eventType ?? 'task.started'
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-task-started',
      eventType,
      taskId: 'task-1',
      actor: { type: 'system', id: 'devcrew' },
      payload: { title: 'Implement shared event contract' }
    } as Extract<DevelopmentEvent, { eventType: 'task.started' | 'task.completed' }>,
    overrides
  )
}

export function fileChangedDevelopmentEventFixture(
  overrides: FixtureOverrides<'file.changed'> = {}
): Extract<DevelopmentEvent, { eventType: 'file.changed' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-file-changed',
      eventType: 'file.changed',
      sessionId: 'session-1',
      actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
      payload: { path: 'src/shared/development-event-types.ts', changeType: 'added' }
    },
    overrides
  )
}

export function commitDevelopmentEventFixture(
  overrides: FixtureOverrides<'commit.created'> = {}
): Extract<DevelopmentEvent, { eventType: 'commit.created' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-commit-created',
      eventType: 'commit.created',
      actor: { type: 'human', id: 'user-1' },
      payload: { sha: 'abc1234', message: 'Introduce DevelopmentEvent v1', branch: 'feature' }
    },
    overrides
  )
}

export function pullRequestDevelopmentEventFixture(
  overrides: FixtureOverrides<'pull_request.created'> = {}
): Extract<DevelopmentEvent, { eventType: 'pull_request.created' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-pull-request-created',
      eventType: 'pull_request.created',
      actor: { type: 'human', id: 'user-1' },
      payload: {
        provider: 'github',
        pullRequestId: '42',
        url: 'https://github.com/Guan21/cc-orca/pull/42',
        title: 'Introduce DevelopmentEvent v1'
      }
    },
    overrides
  )
}

export function reviewDevelopmentEventFixture(
  overrides: FixtureOverrides<'review.completed'> = {}
): Extract<DevelopmentEvent, { eventType: 'review.completed' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-review-completed',
      eventType: 'review.completed',
      actor: { type: 'agent', id: 'review-agent-1', provider: 'codex' },
      payload: {
        provider: 'github',
        reviewId: 'review-1',
        status: 'completed',
        pullRequestId: '42'
      }
    },
    overrides
  )
}

export function testCompletedDevelopmentEventFixture(
  overrides: FixtureOverrides<'test.completed'> = {}
): Extract<DevelopmentEvent, { eventType: 'test.completed' }> {
  return withDefaults(
    {
      ...BASE_EVENT,
      eventId: 'evt-test-completed',
      eventType: 'test.completed',
      actor: { type: 'system', id: 'vitest' },
      payload: { status: 'passed', suite: 'src/shared/development-event-schema.test.ts' }
    },
    overrides
  )
}
