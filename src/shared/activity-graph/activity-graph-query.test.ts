import { describe, expect, it } from 'vitest'
import {
  fileChangedDevelopmentEventFixture,
  agentActionDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture
} from '../development-event-fixtures'
import { createActivityGraph, applyActivityGraphUpdate } from './activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from './development-event-to-activity-graph'
import { activityGraphNodeId } from './activity-graph-identities'
import {
  getNodeById,
  getNodesByType,
  getOutgoingEdges,
  getIncomingEdges,
  getTaskGraph,
  getRunGraph,
  getTasksChangingFile
} from './activity-graph-query'
import type { DevelopmentEvent } from '../development-event-types'
import { projectNormalizedReviewResultToGraphUpdates } from './normalized-review-to-activity-graph'
import { commitDevelopmentEventFixture } from '../development-event-fixtures'

function graphFor(events: DevelopmentEvent[]) {
  return events.reduce((graph, event) => {
    const update = projectDevelopmentEventToGraphUpdates(event)
    return update ? applyActivityGraphUpdate(graph, update) : graph
  }, createActivityGraph())
}

describe('activity graph domain queries', () => {
  const context = { projectId: 'p', taskId: 't', sessionId: 's' }

  it('joins event review packages to existing normalized findings and evidence', () => {
    const graph = graphFor([reviewDevelopmentEventFixture(context)])
    const update = projectNormalizedReviewResultToGraphUpdates(
      {
        projectId: 'p',
        provider: 'github',
        subject: {
          key: 'p:pull_request:github:42',
          type: 'pull_request',
          id: '42',
          provider: 'github'
        }
      },
      {
        reviewId: 'review-1',
        subjectId: 'p:pull_request:github:42',
        reviewer: { type: 'agent', id: 'review-agent-1', provider: 'codex' },
        verdict: 'issue',
        reviewedAt: '2026-10-08T00:00:00Z',
        evidenceRefs: ['audit'],
        findings: [
          {
            findingId: 'finding-1',
            category: 'security',
            severity: 'high',
            summary: 'omitted',
            evidenceRefs: ['finding-evidence']
          }
        ]
      }
    )!
    const slice = getTaskGraph(applyActivityGraphUpdate(graph, update), 'p', 't')
    const packages = getNodesByType(slice, 'review_package')
    expect(packages).toHaveLength(1)
    const findings = getOutgoingEdges(slice, packages[0].id, 'HAS_FINDING')
    expect(findings).toHaveLength(1)
    expect(getOutgoingEdges(slice, findings[0].to, 'EVIDENCED_BY')).toHaveLength(1)
    expect(getOutgoingEdges(slice, packages[0].id, 'REVIEWED_BY')).toHaveLength(1)
  })

  it('keeps evidence from shared actors and files scoped to the requested task', () => {
    const graph = graphFor([
      fileChangedDevelopmentEventFixture({ ...context, eventId: 'a-file' }),
      fileChangedDevelopmentEventFixture({
        ...context,
        taskId: 'other',
        sessionId: 'other-run',
        eventId: 'b-file'
      })
    ])
    const slice = getTaskGraph(graph, 'p', 't')
    expect(getNodesByType(slice, 'evidence').map((node) => node.metadata.evidenceId)).toEqual([
      'a-file'
    ])
    expect(getNodesByType(slice, 'file')).toHaveLength(1)
    expect(getNodesByType(slice, 'file')[0].evidenceRefs).toEqual(['a-file'])
    expect(getNodesByType(graph, 'file')[0].evidenceRefs).toEqual(['a-file', 'b-file'])
  })

  it('scopes evidence for a shared executor', () => {
    const graph = graphFor([
      agentActionDevelopmentEventFixture({ ...context, eventId: 'a-agent' }),
      agentActionDevelopmentEventFixture({
        ...context,
        taskId: 'other',
        sessionId: 'other-run',
        eventId: 'b-agent'
      })
    ])
    const slice = getTaskGraph(graph, 'p', 't')
    expect(getNodesByType(slice, 'evidence').map((node) => node.metadata.evidenceId)).toEqual([
      'a-agent'
    ])
    expect(getNodesByType(slice, 'agent')[0].evidenceRefs).toEqual(['a-agent'])
    expect(getNodesByType(graph, 'agent')[0].evidenceRefs).toEqual(['a-agent', 'b-agent'])
  })

  it('scopes shared commit evidence without mutating global provenance', () => {
    const graph = graphFor([
      commitDevelopmentEventFixture({ ...context, eventId: 'a-commit' }),
      commitDevelopmentEventFixture({
        ...context,
        taskId: 'other',
        sessionId: 'other-run',
        eventId: 'b-commit'
      })
    ])
    const slice = getTaskGraph(graph, 'p', 't')
    expect(getNodesByType(slice, 'evidence').map((node) => node.metadata.evidenceId)).toEqual([
      'a-commit'
    ])
    expect(getNodesByType(slice, 'code_change')[0].evidenceRefs).toEqual(['a-commit'])
    expect(getNodesByType(graph, 'code_change')[0].evidenceRefs).toEqual(['a-commit', 'b-commit'])
  })

  it('answers task/run awareness including files, tests, agent and PR', () => {
    const graph = graphFor([
      agentActionDevelopmentEventFixture(context),
      fileChangedDevelopmentEventFixture(context),
      testCompletedDevelopmentEventFixture(context),
      pullRequestDevelopmentEventFixture(context)
    ])
    const task = activityGraphNodeId('p', 'task', 't')
    const run = activityGraphNodeId('p', 'run', 's')
    expect(getNodeById(graph, task)?.type).toBe('task')
    expect(getIncomingEdges(graph, task, 'BELONGS_TO').some((edge) => edge.from === run)).toBe(true)
    expect(getOutgoingEdges(graph, run, 'EXECUTED_BY')).toHaveLength(1)
    expect(getNodesByType(getTaskGraph(graph, 'p', 't'), 'file')).toHaveLength(1)
    expect(getNodesByType(getRunGraph(graph, 'p', 's'), 'test_result')).toHaveLength(1)
    expect(getNodesByType(getTaskGraph(graph, 'p', 't'), 'pull_request')).toHaveLength(1)
  })

  it('answers review identity and supporting evidence without crossing unrelated task edges', () => {
    const graph = graphFor([
      reviewDevelopmentEventFixture(context),
      fileChangedDevelopmentEventFixture({
        projectId: 'p',
        taskId: 'other',
        sessionId: 'other-run',
        eventId: 'other-file'
      })
    ])
    const slice = getTaskGraph(graph, 'p', 't')
    const reviews = getNodesByType(slice, 'review_package')
    expect(reviews).toHaveLength(1)
    expect(getOutgoingEdges(slice, reviews[0].id, 'REVIEWED_BY')).toHaveLength(1)
    expect(getOutgoingEdges(slice, reviews[0].id, 'EVIDENCED_BY')).toHaveLength(1)
    expect(getNodesByType(slice, 'task').map((node) => node.id)).toEqual([
      activityGraphNodeId('p', 'task', 't')
    ])
  })

  it('finds tasks sharing a normalized changed file within a project', () => {
    const graph = graphFor([
      fileChangedDevelopmentEventFixture({
        ...context,
        payload: { path: './auth/session.ts', changeType: 'modified' }
      }),
      fileChangedDevelopmentEventFixture({
        ...context,
        taskId: 't2',
        sessionId: 's2',
        eventId: 'e2',
        payload: { path: 'auth\\session.ts', changeType: 'modified' }
      }),
      fileChangedDevelopmentEventFixture({
        ...context,
        projectId: 'other',
        taskId: 't3',
        eventId: 'e3',
        payload: { path: 'auth/session.ts', changeType: 'modified' }
      })
    ])
    expect(getTasksChangingFile(graph, 'p', 'auth/session.ts').map((node) => node.id)).toEqual([
      activityGraphNodeId('p', 'task', 't'),
      activityGraphNodeId('p', 'task', 't2')
    ])
    expect(getTaskGraph(graph, 'missing', 't').nodes).toEqual([])
  })
})
