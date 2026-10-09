import { describe, expect, it } from 'vitest'
import type { ActivityGraph } from '../activity-graph/activity-graph'
import {
  applyActivityGraphUpdate,
  createActivityGraph
} from '../activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../activity-graph/development-event-to-activity-graph'
import {
  agentActionDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
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

describe('Project State task attribution', () => {
  it('does not advance observations through shared files or agents', () => {
    const events = [
      fileChangedDevelopmentEventFixture({ eventId: 'a-file', taskId: 'a', sessionId: 'a-run' }),
      agentActionDevelopmentEventFixture({ eventId: 'a-agent', taskId: 'a', sessionId: 'a-run' })
    ]
    const before = projectActivityGraphState(graphOf(events), 'project-1').tasks[0]
    const after = projectActivityGraphState(
      graphOf([
        ...events,
        fileChangedDevelopmentEventFixture({
          eventId: 'b-file',
          taskId: 'b',
          sessionId: 'b-run',
          occurredAt: '2030-01-01T00:00:00Z'
        }),
        agentActionDevelopmentEventFixture({
          eventId: 'b-agent',
          taskId: 'b',
          sessionId: 'b-run',
          occurredAt: '2030-01-01T00:00:00Z'
        })
      ]),
      'project-1'
    ).tasks.find((task) => task.taskId === 'a')
    expect(after).toEqual(before)
  })

  it('keeps another task artifacts and run evidence out of a reused session', () => {
    const events = [
      agentActionDevelopmentEventFixture({ eventId: 'a-run', taskId: 'a', sessionId: 'shared' }),
      testCompletedDevelopmentEventFixture({
        eventId: 'b-test',
        taskId: 'b',
        sessionId: 'shared',
        occurredAt: '2030-01-01T00:00:00Z',
        payload: { status: 'failed' }
      }),
      fileChangedDevelopmentEventFixture({
        eventId: 'b-file',
        taskId: 'b',
        sessionId: 'shared',
        occurredAt: '2030-01-01T00:00:00Z',
        payload: { path: 'b-only.ts', changeType: 'added' }
      })
    ]
    const state = projectActivityGraphState(graphOf(events), 'project-1')
    const task = state.tasks.find((candidate) => candidate.taskId === 'a')!
    expect(task.changedFiles).toEqual([])
    expect(task.testResults.failed).toBe(0)
    expect(task.evidenceRefs).toEqual(['a-run'])
    expect(task.runs[0].evidenceRefs).toEqual(['a-run'])
    expect(projectActivityGraphState(graphOf(events.toReversed()), 'project-1')).toEqual(state)
  })

  it('attributes session-only observations only with an unambiguous task association', () => {
    const started = taskLifecycleDevelopmentEventFixture({
      eventId: 'a-start',
      taskId: 'a',
      sessionId: 'shared'
    })
    const test = testCompletedDevelopmentEventFixture({
      eventId: 'session-test',
      taskId: undefined,
      sessionId: 'shared',
      payload: { status: 'passed' }
    })
    expect(
      projectActivityGraphState(graphOf([started, test]), 'project-1').tasks[0].testResults.passed
    ).toBe(1)
    const other = taskLifecycleDevelopmentEventFixture({
      eventId: 'b-start',
      taskId: 'b',
      sessionId: 'shared'
    })
    const state = projectActivityGraphState(graphOf([started, test, other]), 'project-1')
    expect(state.tasks.every((task) => task.testResults.passed === 0)).toBe(true)
    expect(state.tasks.every((task) => !task.evidenceRefs.includes('session-test'))).toBe(true)
  })

  it('does not borrow a later lifecycle or agent from another task in the session', () => {
    const completed = agentActionDevelopmentEventFixture({
      eventId: 'a-completed',
      taskId: 'a',
      sessionId: 'shared'
    })
    const failed = {
      ...completed,
      eventId: 'b-failed',
      taskId: 'b',
      eventType: 'agent.failed',
      occurredAt: '2030-01-01T00:00:00Z',
      actor: { type: 'agent', id: 'b-agent', provider: 'future-provider' },
      payload: { agentId: 'b-agent', status: 'failed' }
    }
    const state = projectActivityGraphState(graphOf([completed, failed]), 'project-1')
    const a = state.tasks.find((task) => task.taskId === 'a')!
    const b = state.tasks.find((task) => task.taskId === 'b')!
    expect(a.runs[0].status).toBe('unknown')
    expect(a.runs[0].agentNodeIds).not.toEqual(b.runs[0].agentNodeIds)
    expect(a.evidenceRefs).toEqual(['a-completed'])
    expect(a.lastObservedAt).toBe(completed.occurredAt)
    expect(a.observedSignals.failedRun).toBe(false)
    expect(b.runs[0].status).toBe('failed')
  })

  it('uses event identity to break equal-time lifecycle ties and permits explicit restarts', () => {
    const complete = taskLifecycleDevelopmentEventFixture({
      eventId: 'a',
      eventType: 'task.completed'
    })
    const restart = taskLifecycleDevelopmentEventFixture({
      eventId: 'z',
      eventType: 'task.started'
    })
    const state = projectActivityGraphState(graphOf([restart, complete, restart]), 'project-1')
    expect(state.tasks[0].lifecycle).toBe('started')
    expect(state.tasks[0].evidenceRefs).toEqual(['a', 'z'])
    expect(projectActivityGraphState(graphOf([complete, restart]), 'project-1')).toEqual(state)
  })

  it('does not discover a task from uncorrelated session observations', () => {
    const state = projectActivityGraphState(
      graphOf([
        agentActionDevelopmentEventFixture(),
        testCompletedDevelopmentEventFixture({ payload: { status: 'skipped' } })
      ]),
      'project-1'
    )
    expect(state.tasks).toEqual([])
    expect(state.summary.total).toBe(0)
  })
})
