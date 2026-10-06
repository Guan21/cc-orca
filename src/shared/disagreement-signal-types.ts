import type { ReviewFindingCategory } from './review-result-types'

export type DisagreementSeverity = 'low' | 'medium' | 'high'

export type DisagreementKind =
  | 'verdict_conflict'
  | 'severity_conflict'
  | 'category_conflict'
  | 'interpretation_conflict'
  | 'verification_conflict'

export type DisagreementSignal = {
  signalId: string
  subjectId: string
  kind: DisagreementKind
  severity: DisagreementSeverity
  reviewers: {
    id: string
    provider?: string
  }[]
  categories: ReviewFindingCategory[]
  summary: string
  reviewIds: string[]
  findingRefs: string[]
  evidenceRefs: string[]
  detectedAt: string
}
