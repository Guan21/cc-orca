import { describe, expect, it } from 'vitest'
import type { ActivityGraph } from '../activity-graph/activity-graph'
import { applyActivityGraphUpdate, createActivityGraph } from '../activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../activity-graph/development-event-to-activity-graph'
import {
  agentActionDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from '../development-event-fixtures'
import { projectActivityGraphState } from './project-state'

function graphOf(events: unknown[]): ActivityGraph {
  return events.reduce<ActivityGraph>((graph, event) => {
    const update = projectDevelopmentEventToGraphUpdates(event)
    return update ? applyActivityGraphUpdate(graph, update) : graph
  }, createActivityGraph())
}

describe('Project State Engine v1', () => {
  it('reports an empty project without inventing tasks or state', () => {
    expect(projectActivityGraphState(createActivityGraph(), 'a')).toEqual({
      projectId: 'a',
      tasks: [],
      summary: {
        total: 0,
        unknown: 0,
        started: 0,
        completed: 0,
        withRequestedReviews: 0,
        withFailedTests: 0,
        withFailedRuns: 0
      }
    })
  })

  it('derives only explicit task lifecycle and converges across arrival order', () => {
    const start = taskLifecycleDevelopmentEventFixture({
      eventId: 'a',
      taskId: 'task-1',
      occurredAt: '2026-09-30T00:00:00Z'
    })
    const completed = taskLifecycleDevelopmentEventFixture({
      eventId: 'b',
      eventType: 'task.completed',
      taskId: 'task-1',
      occurredAt: '2026-09-30T00:01:00Z'
    })
    const events = [start, completed]
    const a = projectActivityGraphState(graphOf(events), 'project-1')
    const b = projectActivityGraphState(graphOf([completed, start, completed]), 'project-1')
    expect(a).toEqual(b)
    expect(a.tasks[0].lifecycle).toBe('completed')
    expect(a.summary).toMatchObject({ total: 1, completed: 1, started: 0 })
  })

  it('does not invent owner, module, dependency or blocker from an actor or file path', () => {
    const events = [
      fileChangedDevelopmentEventFixture({
        taskId: 'task-1',
        eventId: 'change-a',
        payload: {
          path: 'auth/session.ts',
          changeType: 'modified',
          metadata: { owner: 'alice', dependency: 'payment' }
        }
      }),
      taskLifecycleDevelopmentEventFixture({
        taskId: 'task-2',
        eventId: 'task-b',
        actor: { type: 'human', id: 'alice' }
      })
    ]
    const state = projectActivityGraphState(graphOf(events), 'project-1')
    expect(state.summary).toMatchObject({ total: 2, started: 1, unknown: 1 })
    expect(state.tasks.find((task) => task.taskId === 'task-1')).toMatchObject({
      lifecycle: 'unknown',
      changedFiles: ['auth/session.ts']
    })
    const body = JSON.stringify(state)
    expect(body).not.toContain('"owner"')
    expect(body).not.toContain('"dependency"')
    expect(body).not.toContain('"blocker"')
    expect(body).not.toContain('alice')
    expect(body).not.toContain('payment')
  })

  it('keeps overlapping runs separate and exposes failed runs and tests only as observations', () => {
    const completed = agentActionDevelopmentEventFixture({
      eventId: 'run-a',
      taskId: 'task-1',
      sessionId: 'session-a',
      occurredAt: '2026-09-30T00:00:00Z'
    })
    const failed = {
      ...completed,
      eventId: 'run-b',
      eventType: 'agent.failed',
      sessionId: 'session-b',
      occurredAt: '2026-09-30T00:01:00Z',
      payload: { agentId: 'agent-2', status: 'failed' }
    }
    const test = testCompletedDevelopmentEventFixture({
      eventId: 'test-failed',
      taskId: 'task-1',
      sessionId: 'session-b',
      payload: { status: 'failed', suite: 'unit', failed: 2 }
    })
    const state = projectActivityGraphState(graphOf([completed, failed, test]), 'project-1')
    const task = state.tasks[0]
    expect(task.lifecycle).toBe('unknown')
    expect(task.runs).toMatchObject([
      { runId: 'session-a', status: 'completed' },
      { runId: 'session-b', status: 'failed' }
    ])
    expect(task.runs.every((run) => run.agentIds.length === 1)).toBe(true)
    expect(task.testResults).toEqual({ passed: 0, failed: 1, skipped: 0 })
    expect(task.observedSignals).toEqual({
      failedTest: true,
      failedRun: true,
      reviewRequested: false
    })
    expect(state.summary).toMatchObject({ withFailedTests: 1, withFailedRuns: 1 })
    expect(task.evidenceRefs).toContain('test-failed')
  })

  it('tracks requested versus completed reviews without declaring tasks blocked', () => {
    const request = humanActionDevelopmentEventFixture({
      eventId: 'req',
      taskId: 'task-1',
      payload: {
        provider: 'github',
        reviewId: 'review-1',
        pullRequestId: '42',
        status: 'requested'
      }
    })
    const done = {
      ...request,
      eventId: 'done',
      eventType: 'review.completed',
      occurredAt: '2026-09-30T00:05:00Z',
      payload: { ...request.payload, status: 'completed' }
    }
    const other = humanActionDevelopmentEventFixture({
      eventId: 'other',
      taskId: 'task-1',
      occurredAt: '2026-09-30T00:06:00Z',
      payload: {
        provider: 'github',
        reviewId: 'review-2',
        pullRequestId: '42',
        status: 'requested'
      }
    })
    const state = projectActivityGraphState(graphOf([other, done, request]), 'project-1')
    expect(state.tasks[0].reviews).toEqual({ requested: 1, completed: 1 })
    expect(state.tasks[0].observedSignals.reviewRequested).toBe(true)
    expect(state.tasks[0].lifecycle).toBe('unknown')
    expect(state.summary.withRequestedReviews).toBe(1)
  })

  it('isolates two projects with the same task and session ids, without mutating the graph', () => {
    const a = fileChangedDevelopmentEventFixture({
      projectId: 'a',
      eventId: 'a-change',
      taskId: 'same',
      sessionId: 'same',
      payload: { path: 'a-only.ts', changeType: 'added' }
    })
    const b = fileChangedDevelopmentEventFixture({
      projectId: 'b',
      eventId: 'b-change',
      taskId: 'same',
      sessionId: 'same',
      payload: { path: 'b-only.ts', changeType: 'added' }
    })
    const graph = graphOf([a, b])
    const before = JSON.stringify(graph)
    const state = projectActivityGraphState(graph, 'a')
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].changedFiles).toEqual(['a-only.ts'])
    expect(state.tasks[0].evidenceRefs).not.toContain('b-change')
    expect(JSON.stringify(state)).not.toContain('b-only.ts')
    expect(JSON.stringify(graph)).toBe(before)
  })

  it('excludes unconstrained text, commands and secrets from the state projection', () => {
    const event = taskLifecycleDevelopmentEventFixture({
      taskId: 'task-1',
      payload: {
        title: 'private title phrase',
        result: 'private result phrase',
        metadata: { token: 'hidden credential' }
      }
    })
    const state = projectActivityGraphState(graphOf([event]), 'project-1')
    const text = JSON.stringify(state)
    for (const secret of ['private title phrase', 'private result phrase', 'hidden credential']) {
      expect(text).not.toContain(secret)
    }
  })
})
