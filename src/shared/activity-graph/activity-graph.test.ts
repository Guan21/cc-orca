import { describe, expect, it } from 'vitest'
import type { ActivityGraph } from './activity-graph'
import { DEVELOPMENT_EVENT_TYPES, type DevelopmentEventType } from '../development-event-types'
import {
  activityGraphEdgeId,
  activityGraphNodeId,
  normalizeActivityGraphPath
} from './activity-graph-identities'
import { applyActivityGraphUpdate, createActivityGraph } from './activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from './development-event-to-activity-graph'
import {
  agentActionDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  commitDevelopmentEventFixture
} from '../development-event-fixtures'

const project = (raw: unknown) => projectDevelopmentEventToGraphUpdates(raw)!
const replay = (events: unknown[]) =>
  events.reduce<ActivityGraph>(
    (graph, event) => applyActivityGraphUpdate(graph, project(event)),
    createActivityGraph()
  )

describe('Activity Graph identities', () => {
  it('escapes components, isolates projects and distinguishes actors', () => {
    expect(activityGraphNodeId('p:a', 'task', 'b')).not.toBe(
      activityGraphNodeId('p', 'task', 'a:b')
    )
    expect(activityGraphNodeId('a', 'task', '1')).not.toBe(activityGraphNodeId('b', 'task', '1'))
    expect(activityGraphNodeId('p', 'human', '1')).not.toBe(
      activityGraphNodeId('p', 'agent', 'codex', '1')
    )
    expect(activityGraphNodeId('p', 'agent', 'future', '1')).toBe(
      activityGraphNodeId('p', 'agent', 'future', '1')
    )
    expect(activityGraphEdgeId('p', 'CHANGED', 'a', 'b')).toBe(
      activityGraphEdgeId('p', 'CHANGED', 'a', 'b')
    )
  })
  it('normalizes repository paths consistently without case folding', () => {
    expect(normalizeActivityGraphPath('.\\src\\auth\\..\\session.ts')).toBe('src/session.ts')
    expect(normalizeActivityGraphPath('src/./session.ts')).toBe('src/session.ts')
    expect(normalizeActivityGraphPath('../secret')).toBeUndefined()
    expect(normalizeActivityGraphPath('C:\\secret')).toBeUndefined()
    expect(normalizeActivityGraphPath('/secret')).toBeUndefined()
  })
})

describe('DevelopmentEvent projection', () => {
  it('replays idempotently and relates tasks, runs and future-provider executors', () => {
    const event = agentActionDevelopmentEventFixture({
      taskId: 't',
      actor: { type: 'agent', id: 'agent-1', provider: 'future' }
    })
    const graph = replay([event])
    expect(replay([event, event])).toEqual(graph)
    expect(graph.edges.map((edge) => edge.type)).toContain('EXECUTED_BY')
    expect(graph.edges.map((edge) => edge.type)).toContain('BELONGS_TO')
    expect(graph.nodes.find((node) => node.type === 'agent')?.metadata).toMatchObject({
      provider: 'future'
    })
  })
  it('does not assign a task actor or infer a reviewer as executor', () => {
    const graph = replay([
      taskLifecycleDevelopmentEventFixture({ actor: { type: 'human', id: 'h' } }),
      reviewDevelopmentEventFixture({ sessionId: 'r' })
    ])
    expect(
      graph.edges.some((edge) => edge.type === 'ASSIGNED_TO' || edge.type === 'EXECUTED_BY')
    ).toBe(false)
    expect(graph.edges.some((edge) => edge.type === 'REVIEWED_BY')).toBe(true)
  })
  it('projects files, commits, tests, reviews and PRs using structured fields', () => {
    const events = [
      fileChangedDevelopmentEventFixture({
        taskId: 't',
        payload: { path: 'src\\auth.ts', changeType: 'modified' }
      }),
      commitDevelopmentEventFixture({ taskId: 't', sessionId: 'session-1' }),
      testCompletedDevelopmentEventFixture({ taskId: 't', sessionId: 'session-1' }),
      humanActionDevelopmentEventFixture({ taskId: 't', sessionId: 'session-1' }),
      reviewDevelopmentEventFixture({ taskId: 't', sessionId: 'session-1' }),
      pullRequestDevelopmentEventFixture({ taskId: 't', sessionId: 'session-1' })
    ]
    const graph = replay(events)
    for (const type of [
      'file',
      'code_change',
      'test_result',
      'review_package',
      'pull_request',
      'evidence'
    ]) {
      expect(graph.nodes.some((node) => node.type === type)).toBe(true)
    }
    expect(graph.nodes.find((node) => node.type === 'file')?.metadata).toMatchObject({
      path: 'src/auth.ts'
    })
    expect(graph.edges.some((edge) => edge.type === 'CHANGED')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'PRODUCED')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'EVIDENCED_BY')).toBe(true)
    expect(graph.nodes.find((node) => node.type === 'test_result')?.evidenceRefs).toContain(
      'evt-test-completed'
    )
  })
  it('converges with out-of-order placeholders and timestamp ties', () => {
    const events = [
      agentActionDevelopmentEventFixture({
        eventId: 'b',
        occurredAt: '2026-09-30T00:00:01Z',
        taskId: 't'
      }),
      fileChangedDevelopmentEventFixture({
        eventId: 'c',
        occurredAt: '2026-09-30T00:00:02Z',
        taskId: 't'
      }),
      taskLifecycleDevelopmentEventFixture({ eventId: 'a', taskId: 't' }),
      taskLifecycleDevelopmentEventFixture({
        eventId: 'z',
        taskId: 't',
        eventType: 'task.completed'
      })
    ]
    expect(replay(events)).toEqual(replay(events.toReversed()))
    expect(replay(events).nodes.find((node) => node.type === 'task')?.metadata).toMatchObject({
      status: 'completed'
    })
  })
  it('isolates collisions and rejects cross-project updates atomically', () => {
    const a = fileChangedDevelopmentEventFixture({ projectId: 'a', taskId: 't' })
    const b = { ...a, projectId: 'b' }
    const graph = replay([a, b])
    expect(graph.nodes.filter((node) => node.type === 'file')).toHaveLength(2)
    const update = project(a)
    update.upsertNodes[0] = { ...update.upsertNodes[0], projectId: 'b' }
    expect(() => applyActivityGraphUpdate(graph, update)).toThrow()
  })
  it('fails safely for unknown types, versions and malformed payloads', () => {
    for (const raw of [
      {},
      { ...fileChangedDevelopmentEventFixture(), eventType: 'future.event' },
      { ...fileChangedDevelopmentEventFixture(), version: 2 }
    ]) {
      expect(projectDevelopmentEventToGraphUpdates(raw)).toBeUndefined()
    }
  })
  it('does not copy free-form content or arbitrary metadata', () => {
    const graph = replay([
      taskLifecycleDevelopmentEventFixture({
        payload: {
          title: 'secret prompt',
          result: 'secret output',
          metadata: { credentials: 'secret' }
        }
      }),
      agentActionDevelopmentEventFixture({
        payload: {
          agentId: 'a',
          errorMessage: 'secret command',
          metadata: { transcript: 'secret' }
        }
      }),
      commitDevelopmentEventFixture({ payload: { sha: 'abc', message: 'secret source' } })
    ])
    expect(JSON.stringify(graph)).not.toContain('secret')
  })

  it.each(DEVELOPMENT_EVENT_TYPES)(
    'projects current v1 category %s',
    (eventType: DevelopmentEventType) => {
      const fixtures = [
        taskLifecycleDevelopmentEventFixture(),
        agentActionDevelopmentEventFixture(),
        fileChangedDevelopmentEventFixture(),
        commitDevelopmentEventFixture(),
        pullRequestDevelopmentEventFixture(),
        humanActionDevelopmentEventFixture(),
        reviewDevelopmentEventFixture(),
        testCompletedDevelopmentEventFixture()
      ]
      const fixture = fixtures.find(
        (event) => event.eventType.split('.')[0] === eventType.split('.')[0]
      )!
      const event = { ...fixture, eventType, taskId: 't', sessionId: 'r' }
      const update = project(event)
      expect(update).toBeDefined()
      const graph = applyActivityGraphUpdate(createActivityGraph(), update)
      expect(applyActivityGraphUpdate(graph, update)).toEqual(graph)
      if (eventType.startsWith('agent.')) {
        expect(graph.nodes.find((node) => node.type === 'run')?.metadata).toMatchObject({
          status: eventType.split('.')[1]
        })
      }
      if (eventType.startsWith('task.')) {
        expect(graph.nodes.find((node) => node.type === 'task')?.metadata).toMatchObject({
          status: eventType.split('.')[1]
        })
      }
      if (eventType.startsWith('review.')) {
        expect(graph.nodes.find((node) => node.type === 'review_package')?.metadata).toMatchObject({
          status: eventType.split('.')[1]
        })
      }
    }
  )

  it('converges for equivalent timestamp encodings and later incomplete metadata', () => {
    const a = taskLifecycleDevelopmentEventFixture({
      eventId: 'a',
      occurredAt: '2026-09-30T00:00:00Z'
    })
    const z = taskLifecycleDevelopmentEventFixture({
      eventId: 'z',
      eventType: 'task.completed',
      occurredAt: '2026-09-30T09:00:00+09:00'
    })
    const placeholder = testCompletedDevelopmentEventFixture({
      eventId: 'later',
      taskId: 'task-1',
      occurredAt: '2026-09-30T01:00:00Z'
    })
    expect(replay([a, z, placeholder])).toEqual(replay([placeholder, z, a]))
    expect(
      replay([a, z, placeholder]).nodes.find((node) => node.type === 'task')?.metadata
    ).toMatchObject({ status: 'completed' })
  })

  it('rejects forged edge identities and cross-project endpoints without mutating input', () => {
    const graph = replay([
      fileChangedDevelopmentEventFixture({ projectId: 'a' }),
      fileChangedDevelopmentEventFixture({ projectId: 'b' })
    ])
    const snapshot = JSON.stringify(graph)
    const update = project(fileChangedDevelopmentEventFixture({ projectId: 'a' }))
    const edge = update.upsertEdges[0]
    const foreign = graph.nodes.find((node) => node.projectId === 'b')!
    edge.to = foreign.id
    edge.id = activityGraphEdgeId('a', edge.type, edge.from, edge.to)
    expect(() => applyActivityGraphUpdate(graph, update)).toThrow()
    expect(JSON.stringify(graph)).toBe(snapshot)
    edge.to = update.upsertNodes[0].id
    edge.id = 'forged'
    expect(() => applyActivityGraphUpdate(graph, update)).toThrow()
  })

  it('does not fabricate identities or relationships from arbitrary metadata', () => {
    const graph = replay([
      testCompletedDevelopmentEventFixture({
        payload: {
          status: 'passed',
          metadata: { taskId: 'fake', runId: 'fake', findingId: 'fake', evidenceRefs: ['fake'] }
        }
      })
    ])
    expect(graph.nodes.some((node) => ['task', 'run', 'review_finding'].includes(node.type))).toBe(
      false
    )
    expect(JSON.stringify(graph)).not.toContain('fake')
  })

  it('isolates review IDs reused across task and PR subjects', () => {
    const event = reviewDevelopmentEventFixture({
      payload: { provider: 'github', reviewId: 'same', status: 'completed' }
    })
    const graph = replay([
      { ...event, eventId: 'a', taskId: 'a' },
      { ...event, eventId: 'b', taskId: 'b' },
      { ...event, eventId: 'pr', payload: { ...event.payload, pullRequestId: '42' } }
    ])
    expect(graph.nodes.filter((node) => node.type === 'review_package')).toHaveLength(3)
  })
})
