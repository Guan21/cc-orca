import {
  ACTIVITY_GRAPH_VERSION,
  type ActivityGraph,
  type ActivityGraphNode,
  type ActivityGraphObservation,
  type ActivityGraphUpdate
} from './activity-graph'
import { activityGraphEdgeId } from './activity-graph-identities'

export function createActivityGraph(): ActivityGraph {
  return { version: ACTIVITY_GRAPH_VERSION, nodes: [], edges: [] }
}

const unique = (values: string[]) => [...new Set(values)].sort()
function compareObservation(a: ActivityGraphObservation, b: ActivityGraphObservation): number {
  return (
    Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
    (a.sourceEventId < b.sourceEventId ? -1 : a.sourceEventId > b.sourceEventId ? 1 : 0)
  )
}

function mergeNode(
  previous: ActivityGraphNode | undefined,
  incoming: ActivityGraphNode
): ActivityGraphNode {
  const metadata = { ...previous?.metadata }
  const fieldVersions = { ...previous?.fieldVersions }
  const observation = { occurredAt: incoming.updatedAt, sourceEventId: incoming.sourceEventId }
  for (const [field, value] of Object.entries(incoming.metadata)) {
    if (value === undefined) {
      continue
    }
    const incomingVersion =
      (incoming.fieldVersions as Record<string, ActivityGraphObservation> | undefined)?.[field] ??
      observation
    const oldVersion = (fieldVersions as Record<string, ActivityGraphObservation>)[field]
    if (!oldVersion || compareObservation(incomingVersion, oldVersion) >= 0) {
      Object.assign(metadata, { [field]: value })
      Object.assign(fieldVersions, { [field]: incomingVersion })
    }
  }
  const previousObservation = previous && {
    occurredAt: previous.updatedAt,
    sourceEventId: previous.sourceEventId
  }
  const latest =
    previousObservation && compareObservation(previousObservation, observation) > 0
      ? previousObservation
      : observation
  return {
    ...incoming,
    metadata,
    fieldVersions,
    createdAt:
      previous && Date.parse(previous.createdAt) < Date.parse(incoming.createdAt)
        ? previous.createdAt
        : incoming.createdAt,
    updatedAt: latest.occurredAt,
    sourceEventId: latest.sourceEventId,
    evidenceRefs: unique([...(previous?.evidenceRefs ?? []), ...incoming.evidenceRefs])
  } as ActivityGraphNode
}

export function applyActivityGraphUpdate(
  graph: ActivityGraph,
  update: ActivityGraphUpdate
): ActivityGraph {
  if (graph.version !== ACTIVITY_GRAPH_VERSION) {
    throw new Error('Unsupported Activity Graph version')
  }
  const prefix = `project:${encodeURIComponent(update.projectId)}:`
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  for (const node of update.upsertNodes) {
    const previous = nodes.get(node.id)
    if (
      node.projectId !== update.projectId ||
      !node.id.startsWith(prefix) ||
      (previous && (previous.type !== node.type || previous.projectId !== update.projectId))
    ) {
      throw new Error('Invalid Activity Graph node project or type')
    }
    nodes.set(node.id, mergeNode(previous, node))
  }
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]))
  for (const edge of update.upsertEdges) {
    if (
      edge.projectId !== update.projectId ||
      nodes.get(edge.from)?.projectId !== update.projectId ||
      nodes.get(edge.to)?.projectId !== update.projectId ||
      edge.id !== activityGraphEdgeId(update.projectId, edge.type, edge.from, edge.to)
    ) {
      throw new Error('Invalid Activity Graph edge or endpoint')
    }
    edges.set(edge.id, {
      ...edge,
      evidenceRefs: unique([...(edges.get(edge.id)?.evidenceRefs ?? []), ...edge.evidenceRefs])
    })
  }
  return {
    version: ACTIVITY_GRAPH_VERSION,
    nodes: [...nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }
}
