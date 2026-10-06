import { describe, expect, it } from 'vitest'
import { normalizeReviewResults } from './review-result-normalization'
import type { NormalizedReviewResult } from './review-result-types'

function reviewFixture(overrides: Partial<NormalizedReviewResult> = {}): NormalizedReviewResult {
  return {
    reviewId: 'review-codex',
    subjectId: 'project-1:pull_request:github:80',
    reviewer: {
      id: 'codex',
      type: 'agent',
      provider: 'codex'
    },
    verdict: 'issue',
    findings: [
      {
        findingId: 'finding-b',
        category: 'security',
        severity: 'high',
        summary: 'Security finding',
        evidenceRefs: ['file:auth/session.ts', 'file:auth/session.ts']
      },
      {
        findingId: 'finding-a',
        category: 'correctness',
        severity: 'medium',
        summary: 'Correctness finding',
        evidenceRefs: ['test:123']
      }
    ],
    reviewedAt: '2026-10-06T00:00:00.000Z',
    evidenceRefs: ['review:codex', 'review:codex'],
    ...overrides
  }
}

describe('normalizeReviewResults', () => {
  it('deduplicates replayed review IDs and returns stable provider-neutral fields', () => {
    const rawReview = {
      ...reviewFixture(),
      rawProviderPayload: 'raw-secret-marker'
    } as NormalizedReviewResult & { rawProviderPayload: string }

    const normalized = normalizeReviewResults([rawReview, rawReview])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toEqual({
      reviewId: 'review-codex',
      subjectId: 'project-1:pull_request:github:80',
      reviewer: {
        id: 'codex',
        type: 'agent',
        provider: 'codex'
      },
      verdict: 'issue',
      findings: [
        {
          findingId: 'finding-a',
          category: 'correctness',
          severity: 'medium',
          summary: 'Correctness finding',
          evidenceRefs: ['test:123']
        },
        {
          findingId: 'finding-b',
          category: 'security',
          severity: 'high',
          summary: 'Security finding',
          evidenceRefs: ['file:auth/session.ts']
        }
      ],
      reviewedAt: '2026-10-06T00:00:00.000Z',
      evidenceRefs: ['review:codex']
    })
    expect(JSON.stringify(normalized)).not.toContain('raw-secret-marker')
  })

  it('orders normalized review results deterministically', () => {
    const codex = reviewFixture({ reviewId: 'review-codex' })
    const claude = reviewFixture({
      reviewId: 'review-claude',
      reviewer: { id: 'claude', type: 'agent', provider: 'claude' },
      verdict: 'pass',
      findings: [],
      evidenceRefs: ['review:claude']
    })

    expect(normalizeReviewResults([codex, claude])).toEqual(normalizeReviewResults([claude, codex]))
  })
})
