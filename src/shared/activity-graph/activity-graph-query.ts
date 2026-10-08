import type {
  ActivityGraph,
  ActivityGraphEdge,
  ActivityGraphNode,
  ActivityGraphEdgeType,
  ActivityGraphNodeType
} from './activity-graph'
import { activityGraphNodeId, normalizeActivityGraphPath } from './activity-graph-identities'

export function getNodeById(graph: ActivityGraph, id: string): ActivityGraphNode | undefined {
  return graph.nodes.find((node) => node.id === id)
}

export function getNodesByType<T extends ActivityGraphNodeType>(
  graph: ActivityGraph,
  type: T,
  projectId?: string
): Extract<ActivityGraphNode, { type: T }>[] {
  return graph.nodes.filter(
    (node): node is Extract<ActivityGraphNode, { type: T }> =>
      node.type === type && (projectId === undefined || node.projectId === projectId)
  )
}

export function getOutgoingEdges(
  graph: ActivityGraph,
  from: string,
  type?: ActivityGraphEdgeType
): ActivityGraphEdge[] {
  return graph.edges.filter(
    (edge) => edge.from === from && (type === undefined || edge.type === type)
  )
}

export function getIncomingEdges(
  graph: ActivityGraph,
  to: string,
  type?: ActivityGraphEdgeType
): ActivityGraphEdge[] {
  return graph.edges.filter((edge) => edge.to === to && (type === undefined || edge.type === type))
}

export function getTaskGraph(
  graph: ActivityGraph,
  projectId: string,
  taskId: string
): ActivityGraph {
  const root = activityGraphNodeId(projectId, 'task', taskId)
  const runs = getIncomingEdges(graph, root, 'BELONGS_TO')
    .map((edge) => edge.from)
    .filter((id) => getNodeById(graph, id)?.type === 'run')
  return contextGraph(graph, projectId, [root, ...runs])
}

export function getRunGraph(
  graph: ActivityGraph,
  projectId: string,
  sessionId: string
): ActivityGraph {
  return contextGraph(graph, projectId, [activityGraphNodeId(projectId, 'run', sessionId)])
}

// Traverse produced artifacts and evidence, never back through shared actors/files to other tasks.
function contextGraph(graph: ActivityGraph, projectId: string, roots: string[]): ActivityGraph {
  const ids = new Set(roots.filter((id) => getNodeById(graph, id)?.projectId === projectId))
  const contextEvidence = new Set(
    [...ids].flatMap((id) => getNodeById(graph, id)?.evidenceRefs ?? [])
  )
  let expanded = true
  while (expanded) {
    expanded = false
    for (const edge of graph.edges) {
      if (edge.projectId !== projectId || !ids.has(edge.from) || ids.has(edge.to)) {
        continue
      }
      const sourceType = getNodeById(graph, edge.from)?.type
      if (
        edge.type === 'EVIDENCED_BY' &&
        sourceType &&
        ['file', 'module', 'workspace', 'human', 'agent', 'project', 'pull_request'].includes(
          sourceType
        )
      ) {
        continue
      }
      const source = getNodeById(graph, edge.from)
      if (
        edge.type === 'EVIDENCED_BY' &&
        source?.type === 'code_change' &&
        source.metadata.kind === 'commit' &&
        !edge.evidenceRefs.some((ref) => contextEvidence.has(ref))
      ) {
        continue
      }
      if (
        ![
          'PRODUCED',
          'CHANGED',
          'EXECUTED_BY',
          'HAS_FINDING',
          'REVIEWED_BY',
          'EVIDENCED_BY',
          'OCCURRED_IN'
        ].includes(edge.type)
      ) {
        continue
      }
      ids.add(edge.to)
      expanded = true
    }
  }
  const evidenceIds = new Set(
    graph.nodes
      .filter((node) => ids.has(node.id) && node.type === 'evidence')
      .map((node) => (node.type === 'evidence' ? node.metadata.evidenceId : ''))
  )
  return {
    version: graph.version,
    nodes: graph.nodes
      .filter((node) => ids.has(node.id) && node.projectId === projectId)
      .map((node) => ({
        ...node,
        evidenceRefs: node.evidenceRefs.filter((ref) => evidenceIds.has(ref))
      })),
    edges: graph.edges
      .filter((edge) => edge.projectId === projectId && ids.has(edge.from) && ids.has(edge.to))
      .map((edge) => ({
        ...edge,
        evidenceRefs: edge.evidenceRefs.filter((ref) => evidenceIds.has(ref))
      }))
  }
}

export function getTasksChangingFile(
  graph: ActivityGraph,
  projectId: string,
  path: string
): Extract<ActivityGraphNode, { type: 'task' }>[] {
  const normalized = normalizeActivityGraphPath(path)
  if (!normalized) {
    return []
  }
  const fileId = activityGraphNodeId(projectId, 'file', normalized)
  return getNodesByType(graph, 'task', projectId).filter((task) =>
    getTaskGraph(graph, projectId, task.metadata.taskId).edges.some(
      (edge) => edge.type === 'CHANGED' && edge.to === fileId
    )
  )
}
