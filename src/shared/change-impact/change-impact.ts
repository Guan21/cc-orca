import type { ActivityGraphEdgeId, ActivityGraphNodeId } from '../activity-graph/activity-graph'

export type ChangeImpactTaskEvidence = {
  taskId: string
  taskNodeId: ActivityGraphNodeId
  fileNodeId: ActivityGraphNodeId
  relationshipIds: ActivityGraphEdgeId[]
  evidenceRefs: string[]
}

export type ChangeImpactSignal = {
  signalId: string
  projectId: string
  signalType: 'potential_file_overlap'
  taskIds: string[]
  affectedFiles: string[]
  evidenceRefs: string[]
  taskEvidence: ChangeImpactTaskEvidence[]
  explanation: string
}
