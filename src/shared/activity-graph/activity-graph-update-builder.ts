import type {
  ActivityGraphEdgeType,
  ActivityGraphMetadataByType,
  ActivityGraphNode,
  ActivityGraphNodeOfType,
  ActivityGraphNodeType,
  ActivityGraphUpdate
} from './activity-graph'
import { activityGraphEdgeId, activityGraphNodeId } from './activity-graph-identities'

export class ActivityGraphUpdateBuilder {
  readonly update: ActivityGraphUpdate
  constructor(
    readonly projectId: string,
    readonly occurredAt: string,
    readonly sourceEventId: string,
    readonly sourceEvidenceRefs = [sourceEventId]
  ) {
    this.occurredAt = new Date(occurredAt).toISOString()
    this.update = { projectId, upsertNodes: [], upsertEdges: [] }
  }

  node<T extends ActivityGraphNodeType>(
    type: T,
    identity: string[],
    metadata: ActivityGraphMetadataByType[T]
  ): ActivityGraphNodeOfType<T> {
    const node = {
      id: activityGraphNodeId(this.projectId, type, ...identity),
      type,
      projectId: this.projectId,
      createdAt: this.occurredAt,
      updatedAt: this.occurredAt,
      sourceEventId: this.sourceEventId,
      evidenceRefs: [...this.sourceEvidenceRefs],
      metadata
    }
    this.update.upsertNodes.push(node as ActivityGraphNode)
    return node
  }

  edge(
    type: ActivityGraphEdgeType,
    from: { id: string },
    to: { id: string },
    evidenceRefs = this.sourceEvidenceRefs
  ): void {
    this.update.upsertEdges.push({
      id: activityGraphEdgeId(this.projectId, type, from.id, to.id),
      type,
      projectId: this.projectId,
      from: from.id,
      to: to.id,
      evidenceRefs
    })
  }

  actor(actor: {
    type: 'human' | 'agent' | 'system'
    id: string
    provider?: string
  }): ActivityGraphNode | undefined {
    if (actor.type === 'system') {
      return undefined
    }
    return actor.type === 'human'
      ? this.node('human', [actor.id], { actorId: actor.id })
      : this.node('agent', [actor.provider ?? '', actor.id], {
          agentId: actor.id,
          ...(actor.provider ? { provider: actor.provider } : {})
        })
  }

  attachEvidence(
    evidenceId: string,
    kind: 'development_event' | 'review_reference' = 'development_event',
    subjects = [...this.update.upsertNodes]
  ): void {
    const evidence = this.node('evidence', [evidenceId], { evidenceId, kind })
    for (const node of subjects) {
      node.evidenceRefs = [...new Set([...node.evidenceRefs, evidenceId])].sort()
      this.edge('EVIDENCED_BY', node, evidence, [evidenceId])
    }
  }
}
