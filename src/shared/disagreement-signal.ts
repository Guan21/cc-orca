import {
  buildDisagreementSignal,
  categoriesForReviews,
  compareFindingRecordsBySeverity,
  findingsWithReview,
  REVIEW_SEVERITY_RANK,
  sortDisagreementSignals,
  type DisagreementFindingRecord
} from './disagreement-signal-build'
import type { DisagreementSignal } from './disagreement-signal-types'
import { normalizeReviewResults } from './review-result-normalization'
import type { NormalizedReviewResult, ReviewFindingCategory } from './review-result-types'

type DetectDisagreementsOptions = {
  detectedAt?: string
}

const MATERIAL_SEVERITY_GAP = 2

export function detectDisagreements(
  reviews: readonly NormalizedReviewResult[],
  options: DetectDisagreementsOptions = {}
): DisagreementSignal[] {
  const normalizedReviews = normalizeReviewResults(reviews)
  const detectedAt = options.detectedAt ?? latestReviewedAt(normalizedReviews)
  const signalsById = new Map<string, DisagreementSignal>()

  for (const subjectReviews of groupBySubject(normalizedReviews).values()) {
    for (const signal of detectSubjectDisagreements(subjectReviews, detectedAt)) {
      signalsById.set(signal.signalId, signal)
    }
  }

  return sortDisagreementSignals([...signalsById.values()])
}

function detectSubjectDisagreements(
  reviews: readonly NormalizedReviewResult[],
  detectedAt: string
): DisagreementSignal[] {
  const signals: DisagreementSignal[] = []
  const verdictConflict = detectVerdictConflict(reviews, detectedAt)

  if (verdictConflict) {
    signals.push(verdictConflict)
  }

  signals.push(...detectSeverityConflicts(reviews, detectedAt))

  const categoryConflict = detectCategoryConflict(reviews, detectedAt)

  if (categoryConflict) {
    signals.push(categoryConflict)
  }

  return signals
}

function detectVerdictConflict(
  reviews: readonly NormalizedReviewResult[],
  detectedAt: string
): DisagreementSignal | undefined {
  const passReviews = reviews.filter((review) => review.verdict === 'pass')
  const issueReviews = reviews.filter((review) => review.verdict === 'issue')
  const uncertainReviews = reviews.filter((review) => review.verdict === 'uncertain')

  if (passReviews.length > 0 && issueReviews.length > 0) {
    return buildDisagreementSignal({
      subjectId: reviews[0]!.subjectId,
      kind: 'verdict_conflict',
      severity: 'high',
      reviews: [...passReviews, ...issueReviews],
      findings: issueReviews.flatMap(findingsWithReview),
      categories: categoriesForReviews(issueReviews),
      summary: 'Reviewers disagree on whether the change contains an issue.',
      detectedAt
    })
  }

  if (passReviews.length > 0 && uncertainReviews.length > 0) {
    return buildDisagreementSignal({
      subjectId: reviews[0]!.subjectId,
      kind: 'verdict_conflict',
      severity: 'medium',
      reviews: [...passReviews, ...uncertainReviews],
      findings: uncertainReviews.flatMap(findingsWithReview),
      categories: categoriesForReviews(uncertainReviews),
      summary: 'Reviewers disagree on whether the change is ready or still uncertain.',
      detectedAt
    })
  }

  return undefined
}

function detectSeverityConflicts(
  reviews: readonly NormalizedReviewResult[],
  detectedAt: string
): DisagreementSignal[] {
  const findingsByCategory = new Map<ReviewFindingCategory, DisagreementFindingRecord[]>()

  for (const record of reviews.flatMap(findingsWithReview)) {
    if (!record.finding.severity) {
      continue
    }

    const records = findingsByCategory.get(record.finding.category) ?? []
    records.push(record)
    findingsByCategory.set(record.finding.category, records)
  }

  const signals: DisagreementSignal[] = []

  for (const [category, records] of [...findingsByCategory.entries()].sort()) {
    if (new Set(records.map(reviewerDisagreementKey)).size < 2) {
      continue
    }

    const rankedRecords = records
      .filter((record) => record.finding.severity)
      .sort(compareFindingRecordsBySeverity)
    const lowest = rankedRecords[0]
    const highest = rankedRecords.at(-1)

    if (!lowest?.finding.severity || !highest?.finding.severity) {
      continue
    }

    const severityGap =
      REVIEW_SEVERITY_RANK[highest.finding.severity] - REVIEW_SEVERITY_RANK[lowest.finding.severity]

    if (severityGap < MATERIAL_SEVERITY_GAP) {
      continue
    }

    signals.push(
      buildDisagreementSignal({
        subjectId: reviews[0]!.subjectId,
        kind: 'severity_conflict',
        severity: 'high',
        reviews: records.map((record) => record.review),
        findings: records,
        categories: [category],
        summary: `Reviewers disagree on ${category} severity: ${lowest.finding.severity.toUpperCase()} vs ${highest.finding.severity.toUpperCase()}.`,
        detectedAt
      })
    )
  }

  return signals
}

function detectCategoryConflict(
  reviews: readonly NormalizedReviewResult[],
  detectedAt: string
): DisagreementSignal | undefined {
  const reviewsWithFindings = reviews.filter(
    (review) => review.verdict !== 'pass' && review.findings.length > 0
  )

  if (reviewsWithFindings.length < 2) {
    return undefined
  }

  const categorySets = reviewsWithFindings.map((review) => categoriesForReviews([review]).join(','))

  if (new Set(categorySets).size < 2) {
    return undefined
  }

  const categories = categoriesForReviews(reviewsWithFindings)

  if (categories.length < 2) {
    return undefined
  }

  return buildDisagreementSignal({
    subjectId: reviews[0]!.subjectId,
    kind: 'category_conflict',
    severity: 'low',
    reviews: reviewsWithFindings,
    findings: reviewsWithFindings.flatMap(findingsWithReview),
    categories,
    summary: 'Reviewers identified different finding categories for the same subject.',
    detectedAt
  })
}

function groupBySubject(
  reviews: readonly NormalizedReviewResult[]
): Map<string, NormalizedReviewResult[]> {
  const reviewsBySubject = new Map<string, NormalizedReviewResult[]>()

  for (const review of reviews) {
    const subjectReviews = reviewsBySubject.get(review.subjectId) ?? []
    subjectReviews.push(review)
    reviewsBySubject.set(review.subjectId, subjectReviews)
  }

  return reviewsBySubject
}

function latestReviewedAt(reviews: readonly NormalizedReviewResult[]): string {
  return (
    reviews
      .map((review) => review.reviewedAt)
      .sort()
      .at(-1) ?? ''
  )
}

function reviewerDisagreementKey(record: DisagreementFindingRecord): string {
  return `${record.review.reviewer.id}@${record.review.reviewer.provider ?? ''}`
}
