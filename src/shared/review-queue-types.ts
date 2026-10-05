export type ReviewSubjectType = 'pull_request' | 'change'

export type ReviewActorType = 'human' | 'agent' | 'system'

export type ReviewState = 'review_required' | 'in_review' | 'reviewed' | 'blocked'

export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical'

export type ReviewPrioritySeverity = Exclude<ReviewPriority, 'low'>

export type ReviewPriorityReasonType =
  | 'failed_tests'
  | 'review_pending'
  | 'agent_failure'
  | 'security_sensitive_change'
  | 'large_change'
  | 'review_disagreement'

export type ReviewPriorityReason = {
  type: ReviewPriorityReasonType
  severity: ReviewPrioritySeverity
  summary: string
  evidenceEventIds: string[]
}

export type ReviewEvidenceSummary = {
  tests: {
    status: 'passed' | 'failed' | 'mixed' | 'unknown'
    passed?: number
    failed?: number
  }
  review: {
    requested: boolean
    completed: boolean
  }
  agent: {
    failed: boolean
  }
  changedFiles?: string[]
  latestCommitSha?: string
  evidenceEventIds: string[]
}

export type ReviewItem = {
  id: string
  projectId: string
  taskId?: string
  sessionId?: string
  subject: {
    type: ReviewSubjectType
    id: string
    provider?: string
    url?: string
    title?: string
  }
  actor: {
    type: ReviewActorType
    id?: string
    provider?: string
  }
  state: ReviewState
  priority: ReviewPriority
  reasons: ReviewPriorityReason[]
  evidence: ReviewEvidenceSummary
  relatedEventIds: string[]
  lastUpdatedAt: string
}
