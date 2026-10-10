import type { ChangeImpactSignal } from '../../../../shared/change-impact/change-impact'
import {
  activityGraphEdgeId,
  activityGraphNodeId,
  normalizeActivityGraphPath
} from '../../../../shared/activity-graph/activity-graph-identities'
import type {
  ProjectStateSnapshot,
  ProjectTaskLifecycle
} from '../../../../shared/project-state/project-state'
import { translate } from '../../i18n/i18n'

export type ChangeImpactTaskViewModel = {
  taskId: string
  taskNodeId: string
  fileNodeId: string
  relationshipIds: string[]
  evidenceRefs: string[]
  lifecycle: ProjectTaskLifecycle
}

export type ChangeImpactViewModel = {
  signalId: string
  projectId: string
  category: 'potential_file_overlap'
  affectedFiles: string[]
  taskIds: string[]
  tasks: ChangeImpactTaskViewModel[]
  explanation: string
  observationLimitations: string[]
  /** Exact versioned content token; opaque to consumers and independent of locale/lifecycle. */
  contentRevision: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) &&
    value.isWellFormed()
  )
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length > 0 && [...value].every(isText)
    ? [...new Set(value)].sort()
    : undefined
}

function lifecycleFor(
  projectId: string,
  taskId: string,
  taskNodeId: string,
  snapshot?: ProjectStateSnapshot
): ProjectTaskLifecycle {
  if (!isRecord(snapshot) || snapshot.projectId !== projectId || !Array.isArray(snapshot.tasks)) {
    return 'unknown'
  }
  const matches = snapshot.tasks.filter(
    (task) =>
      isRecord(task) &&
      task.projectId === projectId &&
      task.taskId === taskId &&
      task.taskNodeId === taskNodeId
  )
  const lifecycles = new Set(matches.map((task) => task.lifecycle))
  if (lifecycles.size !== 1) {
    return 'unknown'
  }
  const lifecycle = matches[0]?.lifecycle
  return lifecycle === 'started' || lifecycle === 'completed' ? lifecycle : 'unknown'
}

function candidate(
  projectId: string,
  input: Record<string, unknown>,
  snapshot?: ProjectStateSnapshot
): ChangeImpactViewModel | undefined {
  if (input.signalType !== 'potential_file_overlap') {
    return undefined
  }
  const affectedFiles = strings(input.affectedFiles)
  const taskIds = strings(input.taskIds)
  if (
    !affectedFiles ||
    affectedFiles.length !== 1 ||
    !taskIds ||
    taskIds.length < 2 ||
    !Array.isArray(input.taskEvidence)
  ) {
    return undefined
  }
  const path = affectedFiles[0]
  if (normalizeActivityGraphPath(path) !== path) {
    return undefined
  }
  const signalId = ['change-impact', 'v1', projectId, 'potential_file_overlap', path]
    .map(encodeURIComponent)
    .join(':')
  if (input.signalId !== signalId) {
    return undefined
  }
  const fileNodeId = activityGraphNodeId(projectId, 'file', path)
  const participants = new Map<string, ChangeImpactTaskViewModel>()
  for (const evidence of input.taskEvidence) {
    if (!isRecord(evidence) || !isText(evidence.taskId) || !taskIds.includes(evidence.taskId)) {
      return undefined
    }
    const taskNodeId = activityGraphNodeId(projectId, 'task', evidence.taskId)
    const relationshipIds = strings(evidence.relationshipIds)
    const evidenceRefs = strings(evidence.evidenceRefs)
    if (
      evidence.taskNodeId !== taskNodeId ||
      evidence.fileNodeId !== fileNodeId ||
      !evidenceRefs ||
      !relationshipIds ||
      relationshipIds.length !== 1 ||
      relationshipIds[0] !== activityGraphEdgeId(projectId, 'CHANGED', taskNodeId, fileNodeId)
    ) {
      return undefined
    }
    const task: ChangeImpactTaskViewModel = {
      taskId: evidence.taskId,
      taskNodeId,
      fileNodeId,
      relationshipIds,
      evidenceRefs,
      lifecycle: lifecycleFor(projectId, evidence.taskId, taskNodeId, snapshot)
    }
    const previous = participants.get(task.taskId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(task)) {
      return undefined
    }
    participants.set(task.taskId, task)
  }
  if (participants.size !== taskIds.length) {
    return undefined
  }
  const tasks = taskIds.map((taskId) => participants.get(taskId)!)
  // Only relationship evidence attributes participation; aggregate/snapshot refs are never copied.
  const contentRevision = `change-impact-content:v1:${JSON.stringify({ signalId, projectId, category: 'potential_file_overlap', affectedFiles, tasks: tasks.map(({ lifecycle: _lifecycle, ...evidence }) => evidence) })}`
  return {
    signalId,
    projectId,
    category: 'potential_file_overlap',
    affectedFiles,
    taskIds,
    tasks,
    contentRevision,
    explanation: translate(
      'changeImpact.explanation',
      '{{count}} distinct tasks have evidence-backed CHANGED relationships to the same file. Review suggested.',
      { count: tasks.length }
    ),
    observationLimitations: [
      translate(
        'changeImpact.limitations.historical',
        'Historical observations may be stale. Tasks may have finished or the file may have changed since observation.'
      ),
      translate(
        'changeImpact.limitations.inference',
        'Potential file overlap does not establish a merge conflict, dependency, causal impact or concurrent execution.'
      ),
      translate(
        'changeImpact.limitations.falsePositive',
        'Changes may concern different lines or compatible edits. Supporting evidence does not establish the current file contents.'
      )
    ]
  }
}

export function toChangeImpactViewModels(
  projectId: string,
  signals: readonly ChangeImpactSignal[],
  snapshot?: ProjectStateSnapshot
): ChangeImpactViewModel[] {
  if (!isText(projectId) || !Array.isArray(signals)) {
    return []
  }
  const accepted = new Map<string, ChangeImpactViewModel>()
  const rejected = new Set<string>()
  for (const input of signals) {
    if (!isRecord(input) || input.projectId !== projectId || !isText(input.signalId)) {
      continue
    }
    const view = candidate(projectId, input, snapshot)
    const previous = accepted.get(input.signalId)
    if (!view || (previous && previous.contentRevision !== view.contentRevision)) {
      rejected.add(input.signalId)
      accepted.delete(input.signalId)
    } else if (!rejected.has(view.signalId)) {
      accepted.set(view.signalId, view)
    }
  }
  return [...accepted.values()].sort((left, right) =>
    left.signalId < right.signalId ? -1 : left.signalId > right.signalId ? 1 : 0
  )
}
