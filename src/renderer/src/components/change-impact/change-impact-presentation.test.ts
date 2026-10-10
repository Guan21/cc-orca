import { describe, expect, it } from 'vitest'
import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import { detectChangeImpact } from '../../../../shared/change-impact/detect-change-impact'
import {
  activityGraphEdgeId,
  activityGraphNodeId
} from '../../../../shared/activity-graph/activity-graph-identities'
import {
  applyActivityGraphUpdate,
  createActivityGraph
} from '../../../../shared/activity-graph/activity-graph-reducer'
import { projectDevelopmentEventToGraphUpdates } from '../../../../shared/activity-graph/development-event-to-activity-graph'
import { fileChangedDevelopmentEventFixture } from '../../../../shared/development-event-fixtures'
import {
  projectActivityGraphState,
  type ProjectStateSnapshot
} from '../../../../shared/project-state/project-state'
import { toChangeImpactViewModels } from './change-impact-presentation'

function signal(
  path = 'src/auth/session.ts',
  taskIds = ['b', 'a'],
  projectId = 'p'
): ChangeImpactSignal {
  const fileNodeId = activityGraphNodeId(projectId, 'file', path)
  return {
    signalId: ['change-impact', 'v1', projectId, 'potential_file_overlap', path]
      .map(encodeURIComponent)
      .join(':'),
    projectId,
    signalType: 'potential_file_overlap',
    affectedFiles: [path],
    taskIds,
    evidenceRefs: ['shared-file-secret'],
    explanation: 'secret prompt content',
    taskEvidence: taskIds.map((taskId) => {
      const taskNodeId = activityGraphNodeId(projectId, 'task', taskId)
      return {
        taskId,
        taskNodeId,
        fileNodeId,
        relationshipIds: [activityGraphEdgeId(projectId, 'CHANGED', taskNodeId, fileNodeId)],
        evidenceRefs: [`event-${taskId}`]
      }
    })
  }
}

function malformed(value: unknown): ChangeImpactSignal {
  return value as ChangeImpactSignal
}

describe('Change Impact presentation adapter', () => {
  it('rejects sparse arrays without throwing or manufacturing evidence', () => {
    const sparse: string[] = []
    sparse.length = 1
    for (const field of ['affectedFiles', 'taskIds'] as const) {
      const input = { ...signal(), [field]: sparse }
      expect(toChangeImpactViewModels('p', [input])).toEqual([])
    }
    for (const field of ['evidenceRefs', 'relationshipIds'] as const) {
      const input = signal()
      input.taskEvidence[0][field] = sparse
      expect(toChangeImpactViewModels('p', [input])).toEqual([])
    }
  })
  it('presents two tasks with only their original relationship evidence', () => {
    const [view] = toChangeImpactViewModels('p', [signal()])
    expect(view).toMatchObject({
      projectId: 'p',
      category: 'potential_file_overlap',
      taskIds: ['a', 'b'],
      affectedFiles: ['src/auth/session.ts']
    })
    expect(view.tasks.map((task) => [task.taskId, task.evidenceRefs, task.lifecycle])).toEqual([
      ['a', ['event-a'], 'unknown'],
      ['b', ['event-b'], 'unknown']
    ])
    expect(view.explanation).toContain('2 distinct tasks')
    expect(view.observationLimitations.join(' ')).toMatch(/conflict.*dependency.*concurr/i)
    expect(JSON.stringify(view)).not.toMatch(/shared-file-secret|secret prompt content/)
    expect(view).not.toHaveProperty('severity')
  })

  it('keeps three tasks and multiple files separate in canonical order', () => {
    const input = [signal('src/z.ts'), signal('src/a.ts', ['c', 'a', 'b'])]
    const views = toChangeImpactViewModels('p', input)
    expect(views.map((view) => view.affectedFiles)).toEqual([['src/a.ts'], ['src/z.ts']])
    expect(views[0].taskIds).toEqual(['a', 'b', 'c'])
    expect(toChangeImpactViewModels('p', input.toReversed())).toEqual(views)
    expect(toChangeImpactViewModels('p', [])).toEqual([])
  })

  it('deduplicates identical signals and repeated evidence without mutating input', () => {
    const first = signal()
    first.taskIds.push('a')
    first.taskEvidence[0].evidenceRefs.push('event-b')
    first.taskEvidence.push(structuredClone(first.taskEvidence[0]))
    const original = structuredClone(first)
    const views = toChangeImpactViewModels('p', [first, signal()])
    expect(views).toHaveLength(1)
    expect(first).toEqual(original)
    views[0].tasks[0].evidenceRefs.push('new')
    expect(first).toEqual(original)
  })

  it('rejects conflicting versions of the same signal regardless of input order', () => {
    const first = signal()
    const revised = signal()
    revised.taskEvidence[0].evidenceRefs.push('new-evidence')
    expect(toChangeImpactViewModels('p', [first, revised])).toEqual([])
    expect(toChangeImpactViewModels('p', [revised, first])).toEqual([])
  })

  it('changes content revision when evidence or participants change under a stable identity', () => {
    const first = signal()
    const revised = signal()
    revised.taskEvidence[0].evidenceRefs.push('new-evidence')
    const before = toChangeImpactViewModels('p', [first])[0]
    const after = toChangeImpactViewModels('p', [revised])[0]
    expect(after.signalId).toBe(before.signalId)
    expect(after.contentRevision).not.toBe(before.contentRevision)
    expect(
      toChangeImpactViewModels('p', [signal(undefined, ['a', 'b', 'c'])])[0].contentRevision
    ).not.toBe(before.contentRevision)
    expect(toChangeImpactViewModels('p', [signal(undefined, ['a', 'b'])])[0].contentRevision).toBe(
      before.contentRevision
    )
  })

  it('rejects other projects and forged project-scoped identities', () => {
    expect(toChangeImpactViewModels('p', [signal(undefined, undefined, 'q')])).toEqual([])
    for (const field of ['taskNodeId', 'fileNodeId', 'relationshipIds'] as const) {
      const invalid = signal()
      Object.assign(invalid.taskEvidence[0], {
        [field]: field === 'relationshipIds' ? ['forged'] : 'forged'
      })
      expect(toChangeImpactViewModels('p', [invalid])).toEqual([])
    }
    expect(toChangeImpactViewModels('p', [{ ...signal(), signalId: 'forged' }])).toEqual([])
  })

  it.each([
    null,
    {},
    { ...signal(), taskIds: ['a'] },
    { ...signal(), affectedFiles: ['a.ts', 'b.ts'] },
    { ...signal(), signalType: 'confirmed_conflict' },
    { ...signal(), taskEvidence: [] },
    { ...signal(), taskIds: [null, 'a'] }
  ])('rejects malformed presentation input %j', (input) => {
    expect(toChangeImpactViewModels('p', [malformed(input)])).toEqual([])
  })

  it.each([null, [], [''], [null], ['event-a', 1]])(
    'rejects missing or malformed per-task evidence %j',
    (refs) => {
      const invalid = signal()
      Object.assign(invalid.taskEvidence[0], { evidenceRefs: refs })
      expect(toChangeImpactViewModels('p', [invalid])).toEqual([])
    }
  )

  it('rejects unsafe paths, unencodable identities, and malformed arrays without throwing', () => {
    for (const path of [
      '/absolute.ts',
      'C:/private.ts',
      '../outside.ts',
      'src/../auth.ts',
      'src\\auth.ts',
      'src/\u0000secret.ts'
    ]) {
      expect(toChangeImpactViewModels('p', [signal(path)])).toEqual([])
    }
    expect(
      toChangeImpactViewModels('p', malformed(null) as unknown as ChangeImpactSignal[])
    ).toEqual([])
    expect(
      toChangeImpactViewModels('\ud800', [malformed({ ...signal(), projectId: '\ud800' })])
    ).toEqual([])
  })

  it('joins only canonical same-project lifecycle and ignores snapshot evidence', () => {
    const snapshot = {
      projectId: 'p',
      tasks: [
        {
          projectId: 'p',
          taskId: 'a',
          taskNodeId: activityGraphNodeId('p', 'task', 'a'),
          lifecycle: 'completed',
          evidenceRefs: ['snapshot-secret']
        }
      ]
    } as ProjectStateSnapshot
    const [view] = toChangeImpactViewModels('p', [signal()], snapshot)
    expect(view.tasks[0].lifecycle).toBe('completed')
    expect(view.tasks[1].lifecycle).toBe('unknown')
    expect(JSON.stringify(view)).not.toContain('snapshot-secret')
    expect(view.contentRevision).toBe(toChangeImpactViewModels('p', [signal()])[0].contentRevision)
    snapshot.projectId = 'q'
    expect(toChangeImpactViewModels('p', [signal()], snapshot)[0].tasks[0].lifecycle).toBe(
      'unknown'
    )
  })

  it('accepts real detector output without attributing shared file evidence across tasks', () => {
    let graph = createActivityGraph()
    for (const [taskId, path] of [
      ['a', 'src/shared.ts'],
      ['b', 'src/shared.ts'],
      ['c', 'src/other.ts']
    ]) {
      const event = fileChangedDevelopmentEventFixture({
        projectId: 'p',
        taskId,
        eventId: `event-${taskId}`,
        payload: { path, changeType: 'modified' }
      })
      graph = applyActivityGraphUpdate(graph, projectDevelopmentEventToGraphUpdates(event)!)
    }
    const [view] = toChangeImpactViewModels(
      'p',
      detectChangeImpact(graph),
      projectActivityGraphState(graph, 'p')
    )
    expect(view.taskIds).toEqual(['a', 'b'])
    expect(view.tasks.map((task) => task.evidenceRefs)).toEqual([['event-a'], ['event-b']])
  })
})
