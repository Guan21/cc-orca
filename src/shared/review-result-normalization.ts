import type { NormalizedReviewFinding, NormalizedReviewResult } from './review-result-types'

export function normalizeReviewResults(
  reviews: readonly NormalizedReviewResult[]
): NormalizedReviewResult[] {
  const reviewsById = new Map<string, NormalizedReviewResult>()

  for (const review of reviews) {
    const normalized = normalizeReviewResult(review)
    const existing = reviewsById.get(normalized.reviewId)

    if (!existing || stableReviewComparisonKey(normalized) < stableReviewComparisonKey(existing)) {
      reviewsById.set(normalized.reviewId, normalized)
    }
  }

  return [...reviewsById.values()].sort(compareNormalizedReviews)
}

export function normalizeReviewResult(review: NormalizedReviewResult): NormalizedReviewResult {
  const reviewer = {
    id: review.reviewer.id,
    type: review.reviewer.type,
    ...(review.reviewer.provider ? { provider: review.reviewer.provider } : {})
  }

  return {
    reviewId: review.reviewId,
    subjectId: review.subjectId,
    reviewer,
    verdict: review.verdict,
    findings: review.findings.map(normalizeFinding).sort(compareFindings),
    reviewedAt: review.reviewedAt,
    evidenceRefs: uniqueSorted(review.evidenceRefs)
  }
}

function normalizeFinding(finding: NormalizedReviewFinding): NormalizedReviewFinding {
  return {
    findingId: finding.findingId,
    category: finding.category,
    ...(finding.severity ? { severity: finding.severity } : {}),
    summary: finding.summary,
    evidenceRefs: uniqueSorted(finding.evidenceRefs)
  }
}

function compareNormalizedReviews(
  left: NormalizedReviewResult,
  right: NormalizedReviewResult
): number {
  return stableReviewComparisonKey(left).localeCompare(stableReviewComparisonKey(right))
}

function compareFindings(left: NormalizedReviewFinding, right: NormalizedReviewFinding): number {
  return stableFindingComparisonKey(left).localeCompare(stableFindingComparisonKey(right))
}

function stableReviewComparisonKey(review: NormalizedReviewResult): string {
  return [
    review.subjectId,
    reviewerKey(review),
    review.reviewId,
    review.verdict,
    review.reviewedAt,
    review.findings.map(stableFindingComparisonKey).join('|'),
    review.evidenceRefs.join('|')
  ].join('\u001f')
}

function stableFindingComparisonKey(finding: NormalizedReviewFinding): string {
  return [
    finding.category,
    finding.severity ?? '',
    finding.findingId,
    finding.summary,
    finding.evidenceRefs.join('|')
  ].join('\u001f')
}

function reviewerKey(review: NormalizedReviewResult): string {
  return `${review.reviewer.provider ?? ''}@${review.reviewer.id}`
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
