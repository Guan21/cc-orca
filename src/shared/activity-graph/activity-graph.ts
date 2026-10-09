import type {
  NormalizedReviewSeverity,
  NormalizedReviewVerdict,
  ReviewFindingCategory
} from '../review-result-types'

export const ACTIVITY_GRAPH_VERSION = 1 as const
export const ACTIVITY_GRAPH_NODE_TYPES = [
  'project',
  'human',
  'agent',
  'task',
  'run',
  'workspace',
  'code_change',
  'file',
  'module',
  'test_result',
  'review_finding',
  'review_package',
  'pull_request',
  'evidence'
] as const
export const ACTIVITY_GRAPH_EDGE_TYPES = [
  'ASSIGNED_TO',
  'EXECUTED_BY',
  'OCCURRED_IN',
  'PRODUCED',
  'CHANGED',
  'BELONGS_TO',
  'DEPENDS_ON',
  'IMPACTS',
  'REVIEWED_BY',
  'HAS_FINDING',
  'EVIDENCED_BY',
  'RESULTED_IN'
] as const
export type ActivityGraphNodeType = (typeof ACTIVITY_GRAPH_NODE_TYPES)[number]
export type ActivityGraphEdgeType = (typeof ACTIVITY_GRAPH_EDGE_TYPES)[number]
export type ActivityGraphNodeId = string
export type ActivityGraphEdgeId = string
export type ActivityGraphObservation = { occurredAt: string; sourceEventId: string }

export type ActivityGraphMetadataByType = {
  project: { projectId: string }
  human: { actorId: string }
  agent: { agentId: string; provider?: string }
  task: { taskId: string; status?: 'started' | 'completed' }
  run: { runId: string; status?: 'started' | 'completed' | 'failed' }
  workspace: { workspaceId: string }
  code_change: {
    changeId: string
    kind: 'file_event' | 'commit'
    sha?: string
    changeType?: 'added' | 'modified' | 'deleted' | 'renamed'
    oldPath?: string
  }
  file: { path: string }
  module: { moduleId: string }
  test_result: {
    resultId: string
    status: 'passed' | 'failed' | 'skipped'
    suite?: string
    passed?: number
    failed?: number
    skipped?: number
  }
  review_finding: {
    findingId: string
    category: ReviewFindingCategory
    severity?: NormalizedReviewSeverity
  }
  review_package: {
    reviewId: string
    provider: string
    status?: 'requested' | 'completed'
    verdict?: NormalizedReviewVerdict
    subjectId?: string
  }
  pull_request: { pullRequestId: string; provider: string }
  evidence: { evidenceId: string; kind: 'development_event' | 'review_reference' }
}

export type ActivityGraphNodeOfType<T extends ActivityGraphNodeType> = {
  id: ActivityGraphNodeId
  type: T
  projectId: string
  createdAt: string
  updatedAt: string
  sourceEventId: string
  evidenceRefs: string[]
  metadata: ActivityGraphMetadataByType[T]
  fieldVersions?: Partial<Record<keyof ActivityGraphMetadataByType[T], ActivityGraphObservation>>
}
export type ActivityGraphNode = {
  [T in ActivityGraphNodeType]: ActivityGraphNodeOfType<T>
}[ActivityGraphNodeType]
export type ActivityGraphActorNode = Extract<ActivityGraphNode, { type: 'human' | 'agent' }>
export type ActivityGraphEdge = {
  id: ActivityGraphEdgeId
  type: ActivityGraphEdgeType
  projectId: string
  from: ActivityGraphNodeId
  to: ActivityGraphNodeId
  evidenceRefs: string[]
}
export type ActivityGraph = {
  version: typeof ACTIVITY_GRAPH_VERSION
  nodes: ActivityGraphNode[]
  edges: ActivityGraphEdge[]
}
export type ActivityGraphUpdate = {
  projectId: string
  upsertNodes: ActivityGraphNode[]
  upsertEdges: ActivityGraphEdge[]
}
