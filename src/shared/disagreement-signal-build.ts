import type {
  DisagreementKind,
  DisagreementSeverity,
  DisagreementSignal
} from './disagreement-signal-types'
import type {
  NormalizedReviewFinding,
  NormalizedReviewResult,
  NormalizedReviewSeverity,
  ReviewFindingCategory
} from './review-result-types'

export type DisagreementFindingRecord = {
  review: NormalizedReviewResult
  finding: NormalizedReviewFinding
}

const DISAGREEMENT_SEVERITY_RANK: Record<DisagreementSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2
}

export const REVIEW_SEVERITY_RANK: Record<NormalizedReviewSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

export function buildDisagreementSignal(input: {
  subjectId: string
  kind: DisagreementKind
  severity: DisagreementSeverity
  reviews: readonly NormalizedReviewResult[]
  findings: readonly DisagreementFindingRecord[]
  categories: readonly ReviewFindingCategory[]
  summary: string
  detectedAt: string
}): DisagreementSignal {
  const reviewers = uniqueReviewers(input.reviews)
  const categories = uniqueSorted(input.categories)

  return {
    signalId: buildSignalId({
      subjectId: input.subjectId,
      kind: input.kind,
      categories,
      reviewers
    }),
    subjectId: input.subjectId,
    kind: input.kind,
    severity: input.severity,
    reviewers,
    categories,
    summary: input.summary,
    reviewIds: uniqueSorted(input.reviews.map((review) => review.reviewId)),
    findingRefs: uniqueSorted(input.findings.map(toFindingRef)),
    evidenceRefs: evidenceRefsForSignal(input.reviews, input.findings),
    detectedAt: input.detectedAt
  }
}

export function findingsWithReview(review: NormalizedReviewResult): DisagreementFindingRecord[] {
  return review.findings.map((finding) => ({ review, finding }))
}

export function categoriesForReviews(
  reviews: readonly NormalizedReviewResult[]
): ReviewFindingCategory[] {
  return uniqueSorted(
    reviews.flatMap((review) => review.findings.map((finding) => finding.category))
  )
}

export function compareFindingRecordsBySeverity(
  left: DisagreementFindingRecord,
  right: DisagreementFindingRecord
): number {
  const leftSeverity = left.finding.severity ? REVIEW_SEVERITY_RANK[left.finding.severity] : -1
  const rightSeverity = right.finding.severity ? REVIEW_SEVERITY_RANK[right.finding.severity] : -1
  const severityDelta = leftSeverity - rightSeverity

  if (severityDelta !== 0) {
    return severityDelta
  }

  return toFindingRef(left).localeCompare(toFindingRef(right))
}

export function sortDisagreementSignals(
  signals: readonly DisagreementSignal[]
): DisagreementSignal[] {
  return [...signals].sort((left, right) => {
    const severityDelta =
      DISAGREEMENT_SEVERITY_RANK[right.severity] - DISAGREEMENT_SEVERITY_RANK[left.severity]

    if (severityDelta !== 0) {
      return severityDelta
    }

    const categoryDelta = left.categories.join(',').localeCompare(right.categories.join(','))

    if (categoryDelta !== 0) {
      return categoryDelta
    }

    return left.signalId.localeCompare(right.signalId)
  })
}

function buildSignalId(input: {
  subjectId: string
  kind: DisagreementKind
  categories: readonly ReviewFindingCategory[]
  reviewers: readonly { id: string; provider?: string }[]
}): string {
  const categoryKey = input.categories.length > 0 ? input.categories.join(',') : 'uncategorized'
  const reviewerKey = input.reviewers
    .map((reviewer) => `${reviewer.id}@${reviewer.provider ?? ''}`)
    .join(',')

  return `disagreement:${input.subjectId}:${input.kind}:${categoryKey}:${reviewerKey}`
}

function evidenceRefsForSignal(
  reviews: readonly NormalizedReviewResult[],
  findings: readonly DisagreementFindingRecord[]
): string[] {
  return uniqueSorted([
    ...reviews.flatMap((review) => review.evidenceRefs),
    ...findings.flatMap((record) => record.finding.evidenceRefs)
  ])
}

function uniqueReviewers(
  reviews: readonly NormalizedReviewResult[]
): DisagreementSignal['reviewers'] {
  const reviewers = new Map<string, DisagreementSignal['reviewers'][number]>()

  for (const review of reviews) {
    reviewers.set(reviewerSignalKey(review), {
      id: review.reviewer.id,
      ...(review.reviewer.provider ? { provider: review.reviewer.provider } : {})
    })
  }

  return [...reviewers.values()].sort((left, right) =>
    reviewerObjectKey(left).localeCompare(reviewerObjectKey(right))
  )
}

function reviewerSignalKey(review: NormalizedReviewResult): string {
  return `${review.reviewer.id}@${review.reviewer.provider ?? ''}`
}

function reviewerObjectKey(reviewer: { id: string; provider?: string }): string {
  return `${reviewer.id}@${reviewer.provider ?? ''}`
}

function toFindingRef(record: DisagreementFindingRecord): string {
  return `${record.review.reviewId}:${record.finding.findingId}`
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}
