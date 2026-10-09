import { expect, it } from 'vitest'
import {
  applyActivityGraphUpdate,
  createActivityGraph
} from '../activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../activity-graph/development-event-to-activity-graph'
import { projectNormalizedReviewResultToGraphUpdates } from '../activity-graph/normalized-review-to-activity-graph'
import { humanActionDevelopmentEventFixture } from '../development-event-fixtures'
import { projectActivityGraphState } from './project-state'

function reviewGraph(
  evidenceRefs = ['audit'],
  findingRefs = ['finding-evidence'],
  reviewedAt = '2030-01-01T00:00:00Z'
) {
  const request = humanActionDevelopmentEventFixture({
    eventId: 'request',
    taskId: 'task',
    payload: { provider: 'gitlab', reviewId: 'review', pullRequestId: '42', status: 'requested' }
  })
  const requested = projectDevelopmentEventToGraphUpdates(request)!
  const completed = projectNormalizedReviewResultToGraphUpdates(
    {
      projectId: 'project-1',
      provider: 'gitlab',
      subject: {
        key: 'project-1:pull_request:gitlab:42',
        type: 'pull_request',
        id: '42',
        provider: 'gitlab'
      }
    },
    {
      reviewId: 'review',
      subjectId: 'project-1:pull_request:gitlab:42',
      reviewer: { type: 'agent', id: 'reviewer', provider: 'future' },
      verdict: 'issue',
      reviewedAt,
      evidenceRefs,
      findings: [
        {
          findingId: 'finding',
          category: 'security',
          summary: 'private review text',
          evidenceRefs: findingRefs
        }
      ]
    }
  )!
  return { requested, completed }
}

it('joins a subject-qualified normalized PR review without copying private findings', () => {
  const { requested, completed } = reviewGraph()
  const graph = applyActivityGraphUpdate(
    applyActivityGraphUpdate(createActivityGraph(), requested),
    completed
  )
  const state = projectActivityGraphState(graph, 'project-1')
  expect(state.tasks[0].reviews).toEqual({ requested: 0, completed: 1 })
  expect(state.tasks[0].lifecycle).toBe('unknown')
  expect(state.tasks[0].evidenceRefs).toEqual(['audit', 'finding-evidence', 'request'])
  expect(state.tasks[0].lastObservedAt).toBe('2030-01-01T00:00:00.000Z')
  expect(JSON.stringify(state)).not.toContain('private review text')
  expect(
    projectActivityGraphState(
      applyActivityGraphUpdate(
        applyActivityGraphUpdate(createActivityGraph(), completed),
        requested
      ),
      'project-1'
    )
  ).toEqual(state)
})

it('keeps normalized review provenance when the same package is associated with two tasks', () => {
  const { requested, completed } = reviewGraph()
  const other = projectDevelopmentEventToGraphUpdates(
    humanActionDevelopmentEventFixture({
      eventId: 'other-request',
      taskId: 'other',
      payload: { provider: 'gitlab', reviewId: 'review', pullRequestId: '42', status: 'requested' }
    })
  )!
  const graph = [requested, other, completed].reduce(
    applyActivityGraphUpdate,
    createActivityGraph()
  )
  const state = projectActivityGraphState(graph, 'project-1')
  for (const task of state.tasks) {
    expect(task.reviews.completed).toBe(1)
    expect(task.lastObservedAt).toBe('2030-01-01T00:00:00.000Z')
    expect(task.evidenceRefs).toEqual(
      ['audit', 'finding-evidence', task.taskId === 'task' ? 'request' : 'other-request'].sort()
    )
  }
})

it('does not report completion backed only by an earlier request reference', () => {
  const { requested, completed } = reviewGraph([], [])
  const graph = applyActivityGraphUpdate(
    applyActivityGraphUpdate(createActivityGraph(), requested),
    completed
  )
  const task = projectActivityGraphState(graph, 'project-1').tasks[0]
  expect(task.reviews).toEqual({ requested: 0, completed: 0 })
  expect(task.evidenceRefs).toEqual(['request'])
  expect(task.lastObservedAt).toBe('2026-09-30T00:00:00.000Z')
})

it('does not use historical normalized evidence to prove a newer empty completion', () => {
  const { requested, completed } = reviewGraph()
  const rerequest = projectDevelopmentEventToGraphUpdates(
    humanActionDevelopmentEventFixture({
      eventId: 'rerequest',
      taskId: 'task',
      occurredAt: '2031-01-01T00:00:00Z',
      payload: { provider: 'gitlab', reviewId: 'review', pullRequestId: '42', status: 'requested' }
    })
  )!
  const latest = reviewGraph([], [], '2032-01-01T00:00:00Z').completed
  const graph = [requested, completed, rerequest, latest].reduce(
    applyActivityGraphUpdate,
    createActivityGraph()
  )
  const task = projectActivityGraphState(graph, 'project-1').tasks[0]
  expect(task.reviews).toEqual({ requested: 0, completed: 0 })
  expect(task.lastObservedAt).toBe('2031-01-01T00:00:00.000Z')
  expect(task.evidenceRefs).toContain('audit')
})
