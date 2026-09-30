import { describe, expect, it } from 'vitest'
import {
  DEVELOPMENT_EVENT_TYPES,
  parseDevelopmentEvent,
  parseDevelopmentEventReplay,
  serializeDevelopmentEvent
} from './development-event-schema'
import {
  agentActionDevelopmentEventFixture,
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from './development-event-fixtures'

describe('DevelopmentEvent v1 validation', () => {
  it('accepts representative human, agent, lifecycle, source-control, review, and test events', () => {
    const fixtures = [
      humanActionDevelopmentEventFixture(),
      agentActionDevelopmentEventFixture(),
      taskLifecycleDevelopmentEventFixture(),
      fileChangedDevelopmentEventFixture(),
      commitDevelopmentEventFixture(),
      pullRequestDevelopmentEventFixture(),
      reviewDevelopmentEventFixture(),
      testCompletedDevelopmentEventFixture()
    ]

    for (const fixture of fixtures) {
      expect(parseDevelopmentEvent(fixture)).toEqual({ ok: true, value: fixture })
    }
  })

  it('keeps the initial v1 taxonomy intentionally small', () => {
    expect(DEVELOPMENT_EVENT_TYPES).toEqual([
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
    ])
  })

  it('rejects invalid version, event type, timestamp, and missing required identity fields', () => {
    const event = humanActionDevelopmentEventFixture()

    expect(parseDevelopmentEvent({ ...event, version: 2 }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, eventType: 'timeline.created' }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, occurredAt: 'yesterday' }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, projectId: '' }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, actor: { type: 'human', id: '' } }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, actor: { type: 'robot', id: 'u-1' } }).ok).toBe(false)
  })

  it('validates optional task and session identifiers when present', () => {
    const event = taskLifecycleDevelopmentEventFixture()

    expect(parseDevelopmentEvent({ ...event, taskId: '' }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, sessionId: '' }).ok).toBe(false)
    expect(parseDevelopmentEvent({ ...event, taskId: undefined, sessionId: undefined }).ok).toBe(
      true
    )
  })

  it('validates event-specific payload fields without admitting raw provider objects', () => {
    expect(
      parseDevelopmentEvent({
        ...fileChangedDevelopmentEventFixture(),
        payload: { path: 'src/index.ts', changeType: 'rewritten' }
      }).ok
    ).toBe(false)
    expect(
      parseDevelopmentEvent({ ...commitDevelopmentEventFixture(), payload: { sha: '' } }).ok
    ).toBe(false)
    expect(
      parseDevelopmentEvent({
        ...pullRequestDevelopmentEventFixture(),
        payload: { provider: 'github', pullRequestId: 12, url: 'https://example.test/pr/12' }
      }).ok
    ).toBe(false)
    expect(
      parseDevelopmentEvent({
        ...reviewDevelopmentEventFixture(),
        payload: { provider: 'github', reviewId: 'review-1', status: 'dismissed' }
      }).ok
    ).toBe(false)
    expect(
      parseDevelopmentEvent({
        ...testCompletedDevelopmentEventFixture(),
        payload: { status: 'unknown' }
      }).ok
    ).toBe(false)
    expect(
      parseDevelopmentEvent({
        ...commitDevelopmentEventFixture(),
        payload: { sha: 'abc1234', metadata: { rawProviderObject: () => 'not-json' } }
      }).ok
    ).toBe(false)
  })
})

describe('DevelopmentEvent v1 serialization and replay', () => {
  it('round-trips through JSON without changing the canonical event', () => {
    const event = agentActionDevelopmentEventFixture()
    const serialized = serializeDevelopmentEvent(event)

    expect(JSON.parse(serialized)).toEqual(event)
    expect(parseDevelopmentEvent(JSON.parse(serialized))).toEqual({ ok: true, value: event })
  })

  it('parses replay batches in the order supplied by the caller', () => {
    const first = taskLifecycleDevelopmentEventFixture({
      eventId: 'evt-task-started',
      eventType: 'task.started'
    })
    const second = taskLifecycleDevelopmentEventFixture({
      eventId: 'evt-task-completed',
      eventType: 'task.completed'
    })

    expect(parseDevelopmentEventReplay([first, second])).toEqual({
      ok: true,
      events: [first, second]
    })
  })

  it('fails replay parsing predictably on the first invalid event', () => {
    const first = taskLifecycleDevelopmentEventFixture()
    const second = { ...commitDevelopmentEventFixture(), occurredAt: 'not-a-date' }

    expect(parseDevelopmentEventReplay([first, second])).toMatchObject({
      ok: false,
      index: 1
    })
  })
})
