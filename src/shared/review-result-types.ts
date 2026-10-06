import type { ReviewActorType } from './review-queue-types'

export type NormalizedReviewVerdict = 'pass' | 'issue' | 'uncertain'

export type ReviewFindingCategory =
  | 'security'
  | 'correctness'
  | 'architecture'
  | 'requirement'
  | 'performance'
  | 'testing'
  | 'maintainability'
  | 'other'

export type NormalizedReviewSeverity = 'low' | 'medium' | 'high' | 'critical'

export type NormalizedReviewFinding = {
  findingId: string
  category: ReviewFindingCategory
  severity?: NormalizedReviewSeverity
  summary: string
  evidenceRefs: string[]
}

export type NormalizedReviewResult = {
  reviewId: string
  subjectId: string
  reviewer: {
    id: string
    type: ReviewActorType
    provider?: string
  }
  verdict: NormalizedReviewVerdict
  findings: NormalizedReviewFinding[]
  reviewedAt: string
  evidenceRefs: string[]
}
