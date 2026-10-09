import type { ActivityGraph, ActivityGraphNode } from '../activity-graph/activity-graph'
import {
  getIncomingEdges,
  getNodeById,
  getNodesByType,
  getOutgoingEdges,
  getTaskGraph
} from '../activity-graph/activity-graph-query'

type TaskNode = Extract<ActivityGraphNode, { type: 'task' }>

function includeReviewReferences(
  graph: ActivityGraph,
  task: TaskNode,
  evidence: Set<string>
): void {
  const context = getTaskGraph(graph, task.projectId, task.metadata.taskId)
  for (const review of getNodesByType(context, 'review_package')) {
    if (
      !getIncomingEdges(context, review.id, 'PRODUCED').some((edge) =>
        edge.evidenceRefs.some((ref) => evidence.has(ref))
      )
    ) {
      continue
    }
    const subjects = [
      review.id,
      ...getOutgoingEdges(context, review.id, 'HAS_FINDING').map((edge) => edge.to)
    ]
    const version = review.fieldVersions?.status ?? {
      sourceEventId: review.sourceEventId,
      occurredAt: review.updatedAt
    }
    let hasReference = false
    for (const id of subjects) {
      for (const edge of getOutgoingEdges(context, id, 'EVIDENCED_BY')) {
        const ref = getNodeById(context, edge.to)
        if (ref?.type === 'evidence' && ref.metadata.kind === 'review_reference') {
          evidence.add(ref.metadata.evidenceId)
          if (
            ref.sourceEventId === version.sourceEventId &&
            Date.parse(ref.updatedAt) === Date.parse(version.occurredAt)
          ) {
            hasReference = true
          }
        }
      }
    }
    if (hasReference) {
      if (version.sourceEventId.startsWith('normalized_review:')) {
        evidence.add(version.sourceEventId)
      }
    }
  }
}

/** A session may span tasks; only uniquely associated runs contribute session-only evidence. */
export function getProjectTaskContext(graph: ActivityGraph, task: TaskNode): ActivityGraph {
  const evidence = new Set(task.evidenceRefs)
  for (const edge of getIncomingEdges(graph, task.id, 'BELONGS_TO')) {
    const run = getNodeById(graph, edge.from)
    if (
      edge.projectId !== task.projectId ||
      run?.type !== 'run' ||
      run.projectId !== task.projectId
    ) {
      continue
    }
    const taskLinks = getOutgoingEdges(graph, run.id, 'BELONGS_TO').filter(
      (link) => link.projectId === task.projectId && getNodeById(graph, link.to)?.type === 'task'
    )
    if (taskLinks.every((link) => link.to === task.id)) {
      run.evidenceRefs.forEach((ref) => evidence.add(ref))
    }
  }
  includeReviewReferences(graph, task, evidence)
  const nodes = graph.nodes
    .filter((node) => node.projectId === task.projectId)
    .map((node) => {
      const evidenceRefs = node.evidenceRefs.filter((ref) => evidence.has(ref))
      // Merged metadata cannot recover an older field value from another task's observation.
      const supportsStatus =
        node.type !== 'run' && node.type !== 'review_package'
          ? true
          : evidence.has(node.fieldVersions?.status?.sourceEventId ?? node.sourceEventId)
      return {
        ...node,
        evidenceRefs,
        ...(supportsStatus ? {} : { metadata: { ...node.metadata, status: undefined } })
      } as ActivityGraphNode
    })
  const scoped = {
    version: graph.version,
    nodes,
    edges: graph.edges
      .filter((edge) => edge.projectId === task.projectId)
      .map((edge) => ({
        ...edge,
        evidenceRefs: edge.evidenceRefs.filter((ref) => evidence.has(ref))
      }))
      .filter((edge) => edge.evidenceRefs.length > 0)
  }
  return getTaskGraph(scoped, task.projectId, task.metadata.taskId)
}

export function getTaskLastObservedAt(context: ActivityGraph, task: TaskNode): string {
  const evidence = new Set(context.nodes.flatMap((node) => node.evidenceRefs))
  return context.nodes.reduce((latest, node) => {
    const reviewObservation =
      node.type === 'review_package' &&
      node.metadata.status !== undefined &&
      node.fieldVersions?.status?.sourceEventId.startsWith('normalized_review:')
        ? node.fieldVersions.status
        : undefined
    const isObservation =
      node.type === 'task' ||
      (node.type === 'evidence' && node.metadata.kind === 'development_event') ||
      reviewObservation ||
      (['run', 'test_result', 'review_package', 'code_change'].includes(node.type) &&
        evidence.has(node.sourceEventId))
    const observedAt = reviewObservation?.occurredAt ?? node.updatedAt
    return isObservation && Date.parse(observedAt) > Date.parse(latest) ? observedAt : latest
  }, task.updatedAt)
}
