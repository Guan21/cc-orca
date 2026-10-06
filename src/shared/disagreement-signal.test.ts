import { describe, expect, it } from 'vitest'
import { detectDisagreements } from './disagreement-signal'
import type {
  NormalizedReviewFinding,
  NormalizedReviewResult,
  ReviewFindingCategory,
  NormalizedReviewSeverity,
  NormalizedReviewVerdict
} from './review-result-types'

const DETECTED_AT = '2026-10-06T00:00:00.000Z'
const SUBJECT_ID = 'project-1:pull_request:github:80'

function reviewFixture(
  reviewerId: string,
  verdict: NormalizedReviewVerdict,
  overrides: Partial<NormalizedReviewResult> = {}
): NormalizedReviewResult {
  return {
    reviewId: `review-${reviewerId}`,
    subjectId: SUBJECT_ID,
    reviewer: {
      id: reviewerId,
      type: 'agent',
      provider: reviewerId
    },
    verdict,
    findings: [],
    reviewedAt: '2026-10-06T00:00:00.000Z',
    evidenceRefs: [`evidence:${reviewerId}`],
    ...overrides
  }
}

function findingFixture(
  category: ReviewFindingCategory,
  severity: NormalizedReviewSeverity,
  overrides: Partial<NormalizedReviewFinding> = {}
): NormalizedReviewFinding {
  return {
    findingId: `finding-${category}-${severity}`,
    category,
    severity,
    summary: `${category} ${severity} finding`,
    evidenceRefs: [`finding-evidence:${category}:${severity}`],
    ...overrides
  }
}

function detect(reviews: readonly NormalizedReviewResult[]) {
  return detectDisagreements(reviews, { detectedAt: DETECTED_AT })
}

describe('detectDisagreements', () => {
  it('returns no signal when reviewers agree the change passes', () => {
    expect(detect([reviewFixture('claude', 'pass'), reviewFixture('codex', 'pass')])).toEqual([])
  })

  it('returns no signal when reviewers agree on the same issue category and severity', () => {
    const reviews = [
      reviewFixture('claude', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'claude-security' })]
      }),
      reviewFixture('codex', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'codex-security' })]
      })
    ]

    expect(detect(reviews)).toEqual([])
  })

  it('surfaces a high-severity verdict conflict for PASS vs ISSUE', () => {
    const signals = detect([
      reviewFixture('claude', 'pass', { evidenceRefs: ['test:123'] }),
      reviewFixture('codex', 'issue', {
        findings: [
          findingFixture('security', 'high', {
            findingId: 'sec-4',
            evidenceRefs: ['finding:sec-4', 'file:auth/session.ts']
          })
        ]
      })
    ])

    expect(signals).toMatchObject([
      {
        signalId:
          'disagreement:project-1:pull_request:github:80:verdict_conflict:security:claude@claude,codex@codex',
        subjectId: SUBJECT_ID,
        kind: 'verdict_conflict',
        severity: 'high',
        categories: ['security'],
        summary: 'Reviewers disagree on whether the change contains an issue.',
        reviewIds: ['review-claude', 'review-codex'],
        findingRefs: ['review-codex:sec-4'],
        evidenceRefs: ['evidence:codex', 'file:auth/session.ts', 'finding:sec-4', 'test:123'],
        detectedAt: DETECTED_AT
      }
    ])
  })

  it('surfaces a medium-severity verdict conflict for PASS vs UNCERTAIN', () => {
    const signals = detect([reviewFixture('claude', 'pass'), reviewFixture('gemini', 'uncertain')])

    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      kind: 'verdict_conflict',
      severity: 'medium',
      reviewIds: ['review-claude', 'review-gemini']
    })
  })

  it('surfaces a severity conflict for material same-category severity differences', () => {
    const signals = detect([
      reviewFixture('claude', 'issue', {
        findings: [findingFixture('security', 'low', { findingId: 'claude-low' })]
      }),
      reviewFixture('codex', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'codex-high' })]
      })
    ])

    expect(signals).toMatchObject([
      {
        kind: 'severity_conflict',
        severity: 'high',
        categories: ['security'],
        summary: 'Reviewers disagree on security severity: LOW vs HIGH.',
        findingRefs: ['review-claude:claude-low', 'review-codex:codex-high']
      }
    ])
  })

  it('does not signal adjacent severity differences', () => {
    const signals = detect([
      reviewFixture('claude', 'issue', {
        findings: [findingFixture('security', 'medium', { findingId: 'claude-medium' })]
      }),
      reviewFixture('codex', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'codex-high' })]
      })
    ])

    expect(signals).toEqual([])
  })

  it('does not treat severity differences within one reviewer as a disagreement', () => {
    const signals = detect([
      reviewFixture('codex', 'issue', {
        findings: [
          findingFixture('security', 'low', { findingId: 'codex-low' }),
          findingFixture('security', 'high', { findingId: 'codex-high' })
        ]
      })
    ])

    expect(signals).toEqual([])
  })

  it('aggregates three reviewers into one minority-finding verdict conflict without majority voting', () => {
    const signals = detect([
      reviewFixture('claude', 'pass'),
      reviewFixture('codex', 'pass'),
      reviewFixture('gemini', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'gemini-security' })]
      })
    ])

    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      kind: 'verdict_conflict',
      severity: 'high',
      categories: ['security'],
      reviewIds: ['review-claude', 'review-codex', 'review-gemini'],
      findingRefs: ['review-gemini:gemini-security']
    })
    expect(signals[0]?.summary).not.toContain('2 vs 1')
    expect(signals[0]?.summary).not.toContain('therefore')
  })

  it('does not turn a majority PASS into an automatic approval decision', () => {
    const signals = detect([
      reviewFixture('claude', 'pass'),
      reviewFixture('codex', 'pass'),
      reviewFixture('gemini', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'gemini-security' })]
      })
    ])

    expect(JSON.stringify(signals)).not.toContain('APPROVE')
    expect(JSON.stringify(signals)).not.toContain('REJECT')
    expect(JSON.stringify(signals)).not.toContain('BLOCK MERGE')
    expect(signals[0]?.findingRefs).toEqual(['review-gemini:gemini-security'])
  })

  it('preserves multiple structured categories in deterministic category conflicts', () => {
    const signals = detect([
      reviewFixture('claude', 'issue', {
        findings: [findingFixture('correctness', 'high', { findingId: 'correctness-1' })]
      }),
      reviewFixture('codex', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'security-1' })]
      })
    ])

    expect(signals).toMatchObject([
      {
        kind: 'category_conflict',
        severity: 'low',
        categories: ['correctness', 'security'],
        findingRefs: ['review-claude:correctness-1', 'review-codex:security-1']
      }
    ])
  })

  it('does not duplicate logical signals for replayed review input', () => {
    const codexIssue = reviewFixture('codex', 'issue', {
      findings: [findingFixture('security', 'high', { findingId: 'codex-security' })]
    })

    const signals = detect([reviewFixture('claude', 'pass'), codexIssue, codexIssue])

    expect(signals).toHaveLength(1)
  })

  it('returns the same logical output for shuffled review input', () => {
    const reviews = [
      reviewFixture('gemini', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'gemini-security' })]
      }),
      reviewFixture('claude', 'pass'),
      reviewFixture('codex', 'pass')
    ]

    expect(detect(reviews)).toEqual(detect(reviews.toReversed()))
  })

  it('preserves evidence references from conflicting reviews and findings', () => {
    const signals = detect([
      reviewFixture('claude', 'pass', { evidenceRefs: ['test:123'] }),
      reviewFixture('codex', 'issue', {
        evidenceRefs: ['review:codex'],
        findings: [
          findingFixture('security', 'high', {
            findingId: 'sec-4',
            evidenceRefs: ['finding:sec-4', 'file:auth/session.ts']
          })
        ]
      })
    ])

    expect(signals[0]?.evidenceRefs).toEqual([
      'file:auth/session.ts',
      'finding:sec-4',
      'review:codex',
      'test:123'
    ])
  })

  it('does not leak arbitrary raw provider metadata into generated signals', () => {
    const rawReview = {
      ...reviewFixture('codex', 'issue', {
        findings: [findingFixture('security', 'high', { findingId: 'codex-security' })]
      }),
      rawProviderPayload: 'raw-secret-marker'
    } as NormalizedReviewResult & { rawProviderPayload: string }

    const signals = detect([reviewFixture('claude', 'pass'), rawReview])

    expect(JSON.stringify(signals)).not.toContain('raw-secret-marker')
  })
})
