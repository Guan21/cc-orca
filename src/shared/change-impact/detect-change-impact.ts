import { ACTIVITY_GRAPH_VERSION, type ActivityGraph } from '../activity-graph/activity-graph'
import {
  activityGraphEdgeId,
  activityGraphNodeId,
  normalizeActivityGraphPath
} from '../activity-graph/activity-graph-identities'
import type { ChangeImpactSignal, ChangeImpactTaskEvidence } from './change-impact'

type FileParticipation = {
  projectId: string
  path: string
  tasks: Map<string, ChangeImpactTaskEvidence>
}

const sortedUnique = (values: string[]) => [...new Set(values)].sort()

export function detectChangeImpact(graph: ActivityGraph): ChangeImpactSignal[] {
  if (graph.version !== ACTIVITY_GRAPH_VERSION) {
    throw new Error('Unsupported Activity Graph version')
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const files = new Map<string, FileParticipation>()
  for (const edge of graph.edges) {
    if (edge.type !== 'CHANGED') {
      continue
    }
    const task = nodes.get(edge.from)
    const file = nodes.get(edge.to)
    if (
      task?.type !== 'task' ||
      file?.type !== 'file' ||
      task.projectId !== edge.projectId ||
      file.projectId !== edge.projectId ||
      typeof task.metadata.taskId !== 'string' ||
      !task.metadata.taskId.trim() ||
      typeof file.metadata.path !== 'string'
    ) {
      continue
    }
    const path = normalizeActivityGraphPath(file.metadata.path)
    if (
      !path ||
      task.id !== activityGraphNodeId(edge.projectId, 'task', task.metadata.taskId) ||
      file.id !== activityGraphNodeId(edge.projectId, 'file', path) ||
      edge.id !== activityGraphEdgeId(edge.projectId, 'CHANGED', task.id, file.id)
    ) {
      continue
    }
    // Shared file-node evidence includes other tasks; only the relationship attributes a change.
    const refs: unknown[] = Array.isArray(edge.evidenceRefs) ? edge.evidenceRefs : []
    const evidenceRefs = sortedUnique(
      refs.filter((ref): ref is string => {
        if (typeof ref !== 'string' || !ref.trim()) {
          return false
        }
        const evidence = nodes.get(activityGraphNodeId(edge.projectId, 'evidence', ref))
        return (
          evidence?.type === 'evidence' &&
          evidence.projectId === edge.projectId &&
          evidence.metadata.kind === 'development_event' &&
          evidence.metadata.evidenceId === ref
        )
      })
    )
    if (!evidenceRefs.length) {
      continue
    }
    const participation = files.get(file.id) ?? {
      projectId: edge.projectId,
      path,
      tasks: new Map<string, ChangeImpactTaskEvidence>()
    }
    const previous = participation.tasks.get(task.metadata.taskId)
    participation.tasks.set(task.metadata.taskId, {
      taskId: task.metadata.taskId,
      taskNodeId: task.id,
      fileNodeId: file.id,
      relationshipIds: sortedUnique([...(previous?.relationshipIds ?? []), edge.id]),
      evidenceRefs: sortedUnique([...(previous?.evidenceRefs ?? []), ...evidenceRefs])
    })
    files.set(file.id, participation)
  }
  const signals: ChangeImpactSignal[] = []
  for (const { projectId, path, tasks } of files.values()) {
    if (tasks.size < 2) {
      continue
    }
    const taskIds = [...tasks.keys()].sort()
    const taskEvidence = taskIds.map((id) => tasks.get(id)!)
    signals.push({
      signalId: ['change-impact', 'v1', projectId, 'potential_file_overlap', path]
        .map(encodeURIComponent)
        .join(':'),
      projectId,
      signalType: 'potential_file_overlap',
      taskIds,
      affectedFiles: [path],
      evidenceRefs: sortedUnique(taskEvidence.flatMap((entry) => entry.evidenceRefs)),
      taskEvidence,
      explanation: `${tasks.size} distinct tasks have evidence-backed CHANGED relationships to ${path}. This potential file overlap does not establish a conflict, dependency, causal impact or temporal concurrency.`
    })
  }
  return signals.sort((a, b) => (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0))
}
