import { describe, expect, it } from 'vitest'
import {
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture
} from './development-event-fixtures'
import type { DevelopmentEvent } from './development-event-types'
import type { DisagreementSignal } from './disagreement-signal-types'
import { buildDisagreementReviewReasons } from './review-queue-disagreement'

const SUBJECT_ID = 'project-1:pull_request:github:80'

function signalFixture(overrides: Partial<DisagreementSignal> = {}): DisagreementSignal {
  return {
    signalId: 'disagreement-1',
    subjectId: SUBJECT_ID,
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

function reviewEvent(
  reviewId: string,
  eventId: string,
  pullRequestId = '80'
): Extract<DevelopmentEvent, { eventType: 'review.completed' }> {
  return reviewDevelopmentEventFixture({
    eventId,
    payload: {
      provider: 'github',
      reviewId,
      status: 'completed',
      pullRequestId
    }
  })
}

function subjectEvent(
  pullRequestId = '80'
): Extract<DevelopmentEvent, { eventType: 'pull_request.created' }> {
  return pullRequestDevelopmentEventFixture({
    eventId: `pr-${pullRequestId}`,
    payload: {
      provider: 'github',
      pullRequestId,
      url: `https://github.com/Guan21/cc-orca/pull/${pullRequestId}`,
      title: `PR ${pullRequestId}`
    }
  })
}

function reasons(events: readonly DevelopmentEvent[], signals: readonly DisagreementSignal[]) {
  return buildDisagreementReviewReasons(events, signals).get(SUBJECT_ID) ?? []
}

describe('buildDisagreementReviewReasons', () => {
  it('maps high disagreement signals to high review disagreement reasons', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signalFixture({ severity: 'high' })]
      )
    ).toEqual([
      {
        type: 'review_disagreement',
        severity: 'high',
        summary: 'Reviewers disagree on whether the change contains an issue.',
        evidenceEventIds: ['event-claude', 'event-codex']
      }
    ])
  })

  it('maps medium disagreement signals to medium review disagreement reasons', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signalFixture({ severity: 'medium' })]
      )[0]?.severity
    ).toBe('medium')
  })

  it('maps low disagreement signals to medium review disagreement reasons for human attention', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signalFixture({ severity: 'low' })]
      )[0]?.severity
    ).toBe('medium')
  })

  it('resolves signal review IDs to real review DevelopmentEvent IDs', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signalFixture()]
      )[0]?.evidenceEventIds
    ).toEqual(['event-claude', 'event-codex'])
  })

  it('does not copy generic disagreement evidence refs into review evidence event IDs', () => {
    const [reason] = reasons(
      [subjectEvent(), reviewEvent('review-claude', 'event-claude')],
      [
        signalFixture({
          reviewIds: ['review-claude'],
          evidenceRefs: ['finding:sec-4', 'file:auth/session.ts', 'DO_NOT_USE_AS_EVENT_ID']
        })
      ]
    )

    expect(reason?.evidenceEventIds).toEqual(['event-claude'])
    expect(reason?.evidenceEventIds).not.toContain('DO_NOT_USE_AS_EVENT_ID')
  })

  it('skips signals with no matching review DevelopmentEvent evidence', () => {
    expect(reasons([subjectEvent()], [signalFixture()])).toEqual([])
  })

  it('rejects matching review IDs that resolve to a different subject', () => {
    expect(
      reasons(
        [
          subjectEvent('80'),
          subjectEvent('81'),
          reviewEvent('review-claude', 'event-claude-81', '81')
        ],
        [signalFixture({ reviewIds: ['review-claude'] })]
      )
    ).toEqual([])
  })

  it('uses partial valid review evidence without fabricating missing review event IDs', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signalFixture({ reviewIds: ['review-claude', 'review-codex', 'review-gemini'] })]
      )[0]?.evidenceEventIds
    ).toEqual(['event-claude', 'event-codex'])
  })

  it('deduplicates duplicate signals into one logical review disagreement reason', () => {
    const signal = signalFixture()

    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [signal, signal]
      )
    ).toHaveLength(1)
  })

  it('deduplicates replayed review events in evidence event IDs', () => {
    const event = reviewEvent('review-claude', 'event-claude')

    expect(
      reasons([subjectEvent(), event, event], [signalFixture({ reviewIds: ['review-claude'] })])[0]
        ?.evidenceEventIds
    ).toEqual(['event-claude'])
  })

  it('aggregates multiple disagreement signals for one subject into one reason', () => {
    const result = reasons(
      [
        subjectEvent(),
        reviewEvent('review-claude', 'event-claude'),
        reviewEvent('review-codex', 'event-codex')
      ],
      [
        signalFixture({ signalId: 'signal-verdict', kind: 'verdict_conflict', severity: 'medium' }),
        signalFixture({
          signalId: 'signal-severity',
          kind: 'severity_conflict',
          severity: 'high',
          summary: 'Reviewers disagree on security severity: LOW vs HIGH.'
        })
      ]
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'review_disagreement',
      severity: 'high',
      evidenceEventIds: ['event-claude', 'event-codex']
    })
    expect(result[0]?.summary).toContain('Multiple reviewers disagree')
  })

  it('uses the highest disagreement severity when aggregating signals', () => {
    expect(
      reasons(
        [
          subjectEvent(),
          reviewEvent('review-claude', 'event-claude'),
          reviewEvent('review-codex', 'event-codex')
        ],
        [
          signalFixture({ signalId: 'low', severity: 'low' }),
          signalFixture({ signalId: 'high', severity: 'high' })
        ]
      )[0]?.severity
    ).toBe('high')
  })
})
