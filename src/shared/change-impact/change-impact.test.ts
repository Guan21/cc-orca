import { describe, expect, it } from 'vitest'
import type { ActivityGraph } from '../activity-graph/activity-graph'
import { activityGraphNodeId } from '../activity-graph/activity-graph-identities'
import {
  applyActivityGraphUpdate,
  createActivityGraph
} from '../activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../activity-graph/development-event-to-activity-graph'
import { fileChangedDevelopmentEventFixture } from '../development-event-fixtures'
import { detectChangeImpact } from './detect-change-impact'

function changed(
  taskId: string | undefined,
  eventId = `event-${taskId}`,
  path = 'src/auth/session.ts',
  projectId = 'p'
) {
  return fileChangedDevelopmentEventFixture({
    taskId,
    eventId,
    projectId,
    payload: { path, changeType: 'modified' }
  })
}

function replay(events: unknown[]): ActivityGraph {
  return events.reduce<ActivityGraph>((graph, event) => {
    const update = projectDevelopmentEventToGraphUpdates(event)
    expect(update).toBeDefined()
    return applyActivityGraphUpdate(graph, update!)
  }, createActivityGraph())
}

const pair = () => replay([changed('a'), changed('b')])

describe('Change Impact Detection on Activity Graph v1', () => {
  it('reports two tasks with task-specific relationship evidence', () => {
    const graph = pair()
    const [signal] = detectChangeImpact(graph)
    expect(detectChangeImpact(graph)).toHaveLength(1)
    expect(signal).toMatchObject({
      signalId: 'change-impact:v1:p:potential_file_overlap:src%2Fauth%2Fsession.ts',
      projectId: 'p',
      signalType: 'potential_file_overlap',
      taskIds: ['a', 'b'],
      affectedFiles: ['src/auth/session.ts'],
      evidenceRefs: ['event-a', 'event-b']
    })
    expect(signal.taskEvidence).toEqual(
      ['a', 'b'].map((taskId) => ({
        taskId,
        taskNodeId: activityGraphNodeId('p', 'task', taskId),
        fileNodeId: activityGraphNodeId('p', 'file', 'src/auth/session.ts'),
        relationshipIds: graph.edges
          .filter(
            (edge) =>
              edge.type === 'CHANGED' && edge.from === activityGraphNodeId('p', 'task', taskId)
          )
          .map((edge) => edge.id),
        evidenceRefs: [`event-${taskId}`]
      }))
    )
    expect(signal.explanation).toContain('2 distinct tasks')
    expect(signal.explanation).toContain('does not establish')
  })

  it('groups three or more tasks into one candidate per file', () => {
    const signals = detectChangeImpact(replay(['d', 'c', 'b', 'a'].map((task) => changed(task))))
    expect(signals).toHaveLength(1)
    expect(signals[0].taskIds).toEqual(['a', 'b', 'c', 'd'])
    expect(signals[0].taskEvidence).toHaveLength(4)
  })

  it('does not signal different files or repeated changes by one task', () => {
    expect(
      detectChangeImpact(
        replay([changed('a', 'one'), changed('a', 'two'), changed('b', 'three', 'other.ts')])
      )
    ).toEqual([])
    expect(detectChangeImpact(createActivityGraph())).toEqual([])
  })

  it('keeps multiple overlapping files and their evidence separate in sorted output', () => {
    const graph = replay([
      changed('a', 'z-a', 'src/z.ts'),
      changed('b', 'z-b', 'src/z.ts'),
      changed('a', 'a-a', 'src/a.ts'),
      changed('c', 'a-c', 'src/a.ts')
    ])
    const signals = detectChangeImpact(graph)
    expect(signals.map((signal) => signal.affectedFiles)).toEqual([['src/a.ts'], ['src/z.ts']])
    expect(signals.map((signal) => signal.taskIds)).toEqual([
      ['a', 'c'],
      ['a', 'b']
    ])
    expect(signals.map((signal) => signal.evidenceRefs)).toEqual([
      ['a-a', 'a-c'],
      ['z-a', 'z-b']
    ])
  })

  it("does not attribute one task's changes to another task reusing the same run", () => {
    const graph = replay([
      changed('a', 'one', 'src/a.ts'),
      changed('b', 'two', 'src/b.ts'),
      changed(undefined, 'anonymous', 'src/a.ts')
    ])
    const runId = activityGraphNodeId('p', 'run', 'session-1')
    expect(
      graph.edges.filter((edge) => edge.type === 'BELONGS_TO' && edge.from === runId)
    ).toHaveLength(3)
    expect(detectChangeImpact(graph)).toEqual([])
  })

  it('deduplicates repeated observations and ignores replay/array ordering', () => {
    const events = [changed('b'), changed('a'), changed('a', 'again')]
    const expected = detectChangeImpact(replay(events))
    const graph = replay([...events.toReversed(), ...events])
    graph.nodes.reverse()
    graph.edges.reverse()
    graph.edges.push(...structuredClone(graph.edges))
    expect(detectChangeImpact(graph)).toEqual(expected)
    expect(expected[0].taskEvidence[0].evidenceRefs).toEqual(['again', 'event-a'])
  })

  it('isolates projects with the same task IDs and relative path', () => {
    const graph = replay([
      changed('a'),
      changed('b'),
      changed('a', 'q-a', 'src/auth/session.ts', 'q'),
      changed('b', 'q-b', 'src/auth/session.ts', 'q')
    ])
    const signals = detectChangeImpact(graph)
    expect(signals).toHaveLength(2)
    expect(signals[0].evidenceRefs).toEqual(['event-a', 'event-b'])
    expect(signals[1].evidenceRefs).toEqual(['q-a', 'q-b'])
    expect(signals[0].signalId).not.toBe(signals[1].signalId)
    expect(
      detectChangeImpact(replay([changed('a'), changed('b', 'q-b', 'src/auth/session.ts', 'q')]))
    ).toEqual([])
  })

  it('normalizes paths exactly as #70 and preserves case', () => {
    const graph = replay([
      changed('a', 'one', '.\\src\\auth\\..\\auth\\session.ts'),
      changed('b', 'two', 'src//auth/./session.ts'),
      changed('c', 'three', 'src/Auth/session.ts')
    ])
    expect(detectChangeImpact(graph)[0].taskIds).toEqual(['a', 'b'])
    for (const path of ['/absolute.ts', 'C:\\absolute.ts', '../escape.ts', '.', '\\\\host\\file']) {
      expect(
        detectChangeImpact(replay([changed('a', 'one', path), changed('b', 'two', path)]))
      ).toEqual([])
    }
  })

  it('ignores taskless observations and never attributes them through shared runs', () => {
    expect(detectChangeImpact(replay([changed('a'), changed(undefined, 'anonymous')]))).toEqual([])
    const graph = pair()
    graph.edges = graph.edges.filter(
      (edge) =>
        !(
          edge.type === 'CHANGED' &&
          graph.nodes.find((node) => node.id === edge.from)?.type === 'task'
        )
    )
    expect(detectChangeImpact(graph)).toEqual([])
  })

  it.each([undefined, null, '', [''], [null, 7], ['missing-event']])(
    'skips malformed or unresolvable edge evidence: %j',
    (refs) => {
      const graph = pair()
      const edge = graph.edges.find(
        (edge) => edge.type === 'CHANGED' && edge.from === activityGraphNodeId('p', 'task', 'a')
      )!
      Object.assign(edge, { evidenceRefs: refs })
      expect(detectChangeImpact(graph)).toEqual([])
    }
  )

  it('filters invalid evidence without dropping valid task evidence or copying shared file evidence', () => {
    const graph = pair()
    const edge = graph.edges.find(
      (edge) => edge.type === 'CHANGED' && edge.from === activityGraphNodeId('p', 'task', 'a')
    )!
    Object.assign(edge, { evidenceRefs: ['event-a', '', 42, 'dangling', 'event-a'] })
    expect(detectChangeImpact(graph)[0].taskEvidence[0].evidenceRefs).toEqual(['event-a'])
  })

  it('rejects dangling, cross-project and noncanonical relationships', () => {
    for (const patch of [
      { from: 'missing-task' },
      { to: 'missing-file' },
      { projectId: 'q' },
      { id: 'fake-edge' },
      { from: activityGraphNodeId('q', 'task', 'a') }
    ]) {
      const graph = pair()
      Object.assign(
        graph.edges.find(
          (edge) => edge.type === 'CHANGED' && edge.from === activityGraphNodeId('p', 'task', 'a')
        )!,
        patch
      )
      expect(detectChangeImpact(graph)).toEqual([])
    }
  })

  it('requires canonical task identity with a nonempty task ID', () => {
    for (const taskId of [undefined, '', 17, 'other']) {
      const graph = pair()
      Object.assign(
        graph.nodes.find((node) => node.type === 'task' && node.metadata.taskId === 'a')!.metadata,
        { taskId }
      )
      expect(detectChangeImpact(graph)).toEqual([])
    }
  })

  it('rejects malformed file metadata and noncanonical file identity', () => {
    for (const path of [undefined, 17, '../escape', '/absolute', 'other.ts']) {
      const graph = pair()
      Object.assign(graph.nodes.find((node) => node.type === 'file')!.metadata, { path })
      expect(detectChangeImpact(graph)).toEqual([])
    }
  })

  it('does not resolve evidence from other projects, reviews or corrupt evidence nodes', () => {
    for (const patch of [
      { projectId: 'q' },
      { id: 'fake' },
      { metadata: { evidenceId: 'event-a', kind: 'review_reference' } },
      { metadata: { evidenceId: 'other', kind: 'development_event' } }
    ]) {
      const graph = pair()
      Object.assign(
        graph.nodes.find(
          (node) => node.type === 'evidence' && node.metadata.evidenceId === 'event-a'
        )!,
        patch
      )
      expect(detectChangeImpact(graph)).toEqual([])
    }
  })

  it('keeps identity stable as evidence and participants grow and avoids delimiter collisions', () => {
    const [initial] = detectChangeImpact(pair())
    const [expanded] = detectChangeImpact(
      replay([changed('a'), changed('b'), changed('c'), changed('a', 'again')])
    )
    expect(expanded.signalId).toBe(initial.signalId)
    const ids = ['p:a', 'p'].map(
      (projectId) =>
        detectChangeImpact(
          replay([
            changed('a', 'one', 'src/x:y.ts', projectId),
            changed('b', 'two', 'src/x:y.ts', projectId)
          ])
        )[0].signalId
    )
    expect(new Set(ids).size).toBe(2)
  })

  it('does not mutate source data or share mutable result arrays with it', () => {
    const graph = pair()
    const snapshot = structuredClone(graph)
    function freeze(value: unknown): void {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze)
        Object.freeze(value)
      }
    }
    freeze(graph)
    const [signal] = detectChangeImpact(graph)
    signal.evidenceRefs.push('injected')
    signal.taskEvidence[0].evidenceRefs.length = 0
    signal.taskIds.reverse()
    expect(graph).toEqual(snapshot)
    expect(detectChangeImpact(graph)[0].evidenceRefs).toEqual(['event-a', 'event-b'])
  })

  it('rejects unsupported graph versions explicitly', () => {
    expect(() => detectChangeImpact({ ...pair(), version: 2 } as unknown as ActivityGraph)).toThrow(
      'Unsupported Activity Graph version'
    )
  })
})
