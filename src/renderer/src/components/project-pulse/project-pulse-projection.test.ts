import { describe, expect, it } from 'vitest'
import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import {
  filterTimelineItems,
  projectDevelopmentEventsToTimeline,
  projectPulseSummary
} from './project-pulse-projection'

function eventAt<T extends DevelopmentEvent>(event: T, occurredAt: string): T {
  return { ...event, occurredAt }
}

type AgentDevelopmentEvent = Extract<
  DevelopmentEvent,
  { eventType: 'agent.started' | 'agent.completed' | 'agent.failed' }
>

function agentDevelopmentEventFixture(
  overrides: Partial<AgentDevelopmentEvent> & Pick<AgentDevelopmentEvent, 'eventType'>
): AgentDevelopmentEvent {
  return {
    version: 1,
    eventId: 'agent-event',
    occurredAt: '2026-09-30T00:00:00.000Z',
    projectId: 'project-1',
    source: 'devcrew.fixture',
    actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
    payload: { agentId: 'agent-1', status: 'started' },
    ...overrides
  } as AgentDevelopmentEvent
}

describe('projectDevelopmentEventsToTimeline', () => {
  it('sorts by occurredAt with the most recent event first', () => {
    const items = projectDevelopmentEventsToTimeline([
      eventAt(taskLifecycleDevelopmentEventFixture({ eventId: 'older' }), '2026-09-30T14:22:00Z'),
      eventAt(commitDevelopmentEventFixture({ eventId: 'newer' }), '2026-09-30T14:31:00Z')
    ])

    expect(items.map((item) => item.eventId)).toEqual(['newer', 'older'])
    expect(items.map((item) => item.timeLabel)).toEqual(['14:31', '14:22'])
  })

  it('projects representative DevelopmentEvent v1 events into human-readable timeline rows', () => {
    const items = projectDevelopmentEventsToTimeline([
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-started',
        eventType: 'task.started',
        taskId: '42',
        payload: { title: 'Wire Project Pulse' }
      }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-completed',
        eventType: 'task.completed',
        taskId: '42',
        payload: { title: 'Wire Project Pulse', result: 'done' }
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-started',
        eventType: 'agent.started',
        actor: { type: 'agent', id: 'claude-1', provider: 'claude' },
        payload: { agentId: 'claude-1', status: 'started' }
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-completed',
        eventType: 'agent.completed',
        actor: { type: 'agent', id: 'codex-2', provider: 'codex' },
        payload: { agentId: 'codex-2', status: 'completed' }
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-failed',
        eventType: 'agent.failed',
        actor: { type: 'agent', id: 'codex-1', provider: 'codex' },
        payload: { agentId: 'codex-1', status: 'failed', errorMessage: 'typecheck failed' }
      }),
      fileChangedDevelopmentEventFixture({
        eventId: 'file-changed',
        payload: { path: 'src/auth.ts', changeType: 'modified' }
      }),
      commitDevelopmentEventFixture({
        eventId: 'commit-created',
        payload: { sha: 'abcdef123456', message: 'Add Project Pulse', branch: 'feature/pulse' }
      }),
      pullRequestDevelopmentEventFixture({
        eventId: 'pr-created',
        payload: {
          provider: 'github',
          pullRequestId: '105',
          url: 'https://github.com/acme/app/pull/105',
          title: 'Add Project Pulse'
        }
      }),
      humanActionDevelopmentEventFixture({
        eventId: 'review-requested',
        payload: {
          provider: 'github',
          reviewId: 'review-105',
          status: 'requested',
          pullRequestId: '105'
        }
      }),
      reviewDevelopmentEventFixture({
        eventId: 'review-completed',
        payload: {
          provider: 'github',
          reviewId: 'review-105',
          status: 'completed',
          pullRequestId: '105'
        }
      }),
      testCompletedDevelopmentEventFixture({
        eventId: 'tests-passed',
        payload: { status: 'passed', suite: 'unit', passed: 128, failed: 0 }
      }),
      testCompletedDevelopmentEventFixture({
        eventId: 'tests-failed',
        payload: { status: 'failed', suite: 'typecheck', passed: 12, failed: 1 }
      })
    ])

    expect(items.map((item) => [item.eventId, item.title, item.status])).toEqual([
      ['task-started', 'Started task #42', 'active'],
      ['task-completed', 'Completed task #42', 'success'],
      ['agent-started', 'Claude started', 'active'],
      ['agent-completed', 'Codex completed', 'success'],
      ['agent-failed', 'Codex failed', 'danger'],
      ['file-changed', 'src/auth.ts changed', 'neutral'],
      ['commit-created', 'Commit abcdef1 created', 'success'],
      ['pr-created', 'PR #105 created', 'success'],
      ['review-requested', 'Review requested for PR #105', 'attention'],
      ['review-completed', 'Review completed for PR #105', 'success'],
      ['tests-passed', 'Tests passed', 'success'],
      ['tests-failed', 'Tests failed', 'danger']
    ])
    expect(items.find((item) => item.eventId === 'file-changed')?.related.file).toEqual({
      path: 'src/auth.ts',
      changeType: 'modified'
    })
  })

  it('handles missing optional data without leaking raw payload objects', () => {
    const items = projectDevelopmentEventsToTimeline([
      commitDevelopmentEventFixture({
        eventId: 'minimal-commit',
        payload: { sha: '1234567', metadata: { hidden: 'do-not-render' } }
      }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'minimal-task',
        taskId: undefined,
        payload: { metadata: { hidden: 'do-not-render' } }
      })
    ])

    const renderedText = items
      .flatMap((item) => [item.title, item.summary, item.actor.label, ...item.badges])
      .join(' ')

    expect(items.map((item) => item.title)).toEqual(['Commit 1234567 created', 'Started task'])
    expect(renderedText).not.toContain('do-not-render')
    expect(renderedText).not.toContain('{')
    expect(renderedText).not.toContain('"metadata"')
  })
})

describe('filterTimelineItems', () => {
  it('filters projected items by category, actor, task, and time window', () => {
    const items = projectDevelopmentEventsToTimeline([
      eventAt(
        taskLifecycleDevelopmentEventFixture({
          eventId: 'task-1',
          taskId: 'task-1',
          occurredAt: '2026-09-30T10:00:00Z'
        }),
        '2026-09-30T10:00:00Z'
      ),
      eventAt(
        agentDevelopmentEventFixture({
          eventId: 'agent-1',
          eventType: 'agent.started',
          taskId: 'task-1',
          actor: { type: 'agent', id: 'agent-1', provider: 'codex' }
        }),
        '2026-09-30T10:05:00Z'
      ),
      eventAt(
        fileChangedDevelopmentEventFixture({
          eventId: 'file-1',
          taskId: 'task-2',
          actor: { type: 'agent', id: 'agent-2', provider: 'claude' }
        }),
        '2026-09-28T10:05:00Z'
      )
    ])

    expect(filterTimelineItems(items, { category: 'agent' }).map((item) => item.eventId)).toEqual([
      'agent-1'
    ])
    expect(filterTimelineItems(items, { actorId: 'agent-2' }).map((item) => item.eventId)).toEqual([
      'file-1'
    ])
    expect(filterTimelineItems(items, { taskId: 'task-1' }).map((item) => item.eventId)).toEqual([
      'agent-1',
      'task-1'
    ])
    expect(
      filterTimelineItems(items, { timeWindow: '24h' }, Date.parse('2026-09-30T12:00:00Z')).map(
        (item) => item.eventId
      )
    ).toEqual(['agent-1', 'task-1'])
  })
})

describe('projectPulseSummary', () => {
  it('derives pulse counters from the same event collection', () => {
    const events = [
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-a-start',
        eventType: 'task.started',
        taskId: 'task-a'
      }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-b-start',
        eventType: 'task.started',
        taskId: 'task-b'
      }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'task-b-complete',
        eventType: 'task.completed',
        taskId: 'task-b'
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-a-start',
        eventType: 'agent.started',
        payload: { agentId: 'agent-a', status: 'started' }
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-b-start',
        eventType: 'agent.started',
        payload: { agentId: 'agent-b', status: 'started' }
      }),
      agentDevelopmentEventFixture({
        eventId: 'agent-b-failed',
        eventType: 'agent.failed',
        payload: { agentId: 'agent-b', status: 'failed' }
      }),
      humanActionDevelopmentEventFixture({
        eventId: 'review-open',
        payload: {
          provider: 'github',
          reviewId: 'review-open',
          status: 'requested',
          pullRequestId: '7'
        }
      }),
      testCompletedDevelopmentEventFixture({
        eventId: 'test-failed',
        payload: { status: 'failed', suite: 'unit', failed: 2 }
      })
    ]

    expect(projectPulseSummary(events)).toEqual({
      activeTasks: 1,
      activeAgents: 1,
      pendingReviews: 1,
      recentFailures: 2,
      recentlyCompletedTasks: 1
    })
  })
})
