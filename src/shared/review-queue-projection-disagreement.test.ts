import { describe, expect, it } from 'vitest'
import {
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from './development-event-fixtures'
import { detectDisagreements } from './disagreement-signal'
import type { DisagreementSignal } from './disagreement-signal-types'
import { projectReviewQueue } from './review-queue-projection'
import type { NormalizedReviewResult } from './review-result-types'

const PR_CONTEXT = {
  taskId: 'task-review-1',
  sessionId: 'session-review-1'
} as const

describe('Review Queue disagreement projection', () => {
  it('preserves exact legacy Review Queue behavior when no disagreement signals are provided', () => {
    const events = [
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      humanActionDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-review-requested',
        payload: {
          provider: 'github',
          reviewId: 'review-1',
          status: 'requested',
          pullRequestId: '42'
        }
      })
    ]

    expect(projectReviewQueue(events, {})).toEqual(projectReviewQueue(events))
  })

  it('integrates high detector output into a high review disagreement reason', () => {
    const events = [
      pullRequestDevelopmentEventFixture({
        ...PR_CONTEXT,
        payload: {
          provider: 'github',
          pullRequestId: '80',
          url: 'https://github.com/Guan21/cc-orca/pull/80',
          title: 'Disagreement integration'
        }
      }),
      reviewDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-review-claude',
        actor: { type: 'agent', id: 'claude', provider: 'claude' },
        payload: {
          provider: 'github',
          reviewId: 'review-claude',
          status: 'completed',
          pullRequestId: '80'
        }
      }),
      reviewDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-review-codex',
        actor: { type: 'agent', id: 'codex', provider: 'codex' },
        payload: {
          provider: 'github',
          reviewId: 'review-codex',
          status: 'completed',
          pullRequestId: '80'
        }
      })
    ]
    const reviews: NormalizedReviewResult[] = [
      reviewResultFixture('review-claude', 'claude', 'pass'),
      reviewResultFixture('review-codex', 'codex', 'issue', {
        findings: [
          {
            findingId: 'sec-4',
            category: 'security',
            severity: 'high',
            summary: 'Session authorization bypass',
            evidenceRefs: ['file:auth/session.ts']
          }
        ]
      })
    ]
    const disagreementSignals = detectDisagreements(reviews, {
      detectedAt: '2026-10-06T00:00:00.000Z'
    })

    const items = projectReviewQueue(events, { disagreementSignals })

    expect(disagreementSignals).toHaveLength(1)
    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.state).toBe('reviewed')
    expect(items[0]?.reasons).toContainEqual({
      type: 'review_disagreement',
      severity: 'high',
      summary: 'Reviewers disagree on whether the change contains an issue.',
      evidenceEventIds: ['evt-review-claude', 'evt-review-codex']
    })
  })

  it('does not add review disagreement for agreeing PASS review results', () => {
    const events = [
      pullRequestDevelopmentEventFixture({
        payload: {
          provider: 'github',
          pullRequestId: '80',
          url: 'https://github.com/Guan21/cc-orca/pull/80',
          title: 'Agreement integration'
        }
      }),
      reviewDevelopmentEventFixture({
        eventId: 'evt-review-claude',
        payload: {
          provider: 'github',
          reviewId: 'review-claude',
          status: 'completed',
          pullRequestId: '80'
        }
      }),
      reviewDevelopmentEventFixture({
        eventId: 'evt-review-codex',
        payload: {
          provider: 'github',
          reviewId: 'review-codex',
          status: 'completed',
          pullRequestId: '80'
        }
      })
    ]
    const disagreementSignals = detectDisagreements([
      reviewResultFixture('review-claude', 'claude', 'pass'),
      reviewResultFixture('review-codex', 'codex', 'pass')
    ])

    const items = projectReviewQueue(events, { disagreementSignals })

    expect(disagreementSignals).toEqual([])
    expect(items[0]?.reasons.some((reason) => reason.type === 'review_disagreement')).toBe(false)
  })

  it('preserves high failed-test priority while adding medium review disagreement', () => {
    const items = projectReviewQueue(
      [
        pullRequestDevelopmentEventFixture({
          ...PR_CONTEXT,
          payload: {
            provider: 'github',
            pullRequestId: '80',
            url: 'https://github.com/Guan21/cc-orca/pull/80',
            title: 'Failed tests with disagreement'
          }
        }),
        testCompletedDevelopmentEventFixture({
          ...PR_CONTEXT,
          eventId: 'evt-test-failed',
          payload: { status: 'failed', failed: 1 }
        }),
        reviewDevelopmentEventFixture({
          ...PR_CONTEXT,
          eventId: 'evt-review-claude',
          payload: {
            provider: 'github',
            reviewId: 'review-claude',
            status: 'completed',
            pullRequestId: '80'
          }
        })
      ],
      {
        disagreementSignals: [
          disagreementSignalFixture({
            severity: 'medium',
            reviewIds: ['review-claude']
          })
        ]
      }
    )

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.reasons.map((reason) => reason.type)).toEqual([
      'failed_tests',
      'review_disagreement'
    ])
  })

  it('raises pending-review priority when a high disagreement is present without blocking state', () => {
    const items = projectReviewQueue(
      [
        pullRequestDevelopmentEventFixture({
          ...PR_CONTEXT,
          payload: {
            provider: 'github',
            pullRequestId: '80',
            url: 'https://github.com/Guan21/cc-orca/pull/80',
            title: 'Pending review with disagreement'
          }
        }),
        humanActionDevelopmentEventFixture({
          ...PR_CONTEXT,
          eventId: 'evt-review-requested',
          payload: {
            provider: 'github',
            reviewId: 'review-claude',
            status: 'requested',
            pullRequestId: '80'
          }
        })
      ],
      {
        disagreementSignals: [
          disagreementSignalFixture({
            severity: 'high',
            reviewIds: ['review-claude']
          })
        ]
      }
    )

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.state).toBe('in_review')
    expect(items[0]?.reasons.map((reason) => reason.type)).toEqual([
      'review_disagreement',
      'review_pending'
    ])
  })
})

function reviewResultFixture(
  reviewId: string,
  reviewerId: string,
  verdict: NormalizedReviewResult['verdict'],
  overrides: Partial<NormalizedReviewResult> = {}
): NormalizedReviewResult {
  return {
    reviewId,
    subjectId: 'project-1:pull_request:github:80',
    reviewer: {
      id: reviewerId,
      type: 'agent',
      provider: reviewerId
    },
    verdict,
    findings: [],
    reviewedAt: '2026-10-06T00:00:00.000Z',
    evidenceRefs: [`review:${reviewerId}`],
    ...overrides
  }
}

function disagreementSignalFixture(
  overrides: Partial<DisagreementSignal> = {}
): DisagreementSignal {
  return {
    signalId: 'disagreement-1',
    subjectId: 'project-1:pull_request:github:80',
    kind: 'verdict_conflict',
    severity: 'high',
    reviewers: [
      { id: 'claude', provider: 'claude' },
      { id: 'codex', provider: 'codex' }
    ],
    categories: ['security'],
    summary: 'Reviewers disagree on whether the change contains an issue.',
    reviewIds: ['review-claude', 'review-codex'],
    findingRefs: ['review-codex:sec-4'],
    evidenceRefs: ['finding:sec-4', 'file:auth/session.ts'],
    detectedAt: '2026-10-06T00:00:00.000Z',
    ...overrides
  }
}
