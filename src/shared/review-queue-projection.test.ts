import { describe, expect, it } from 'vitest'
import type { DevelopmentEvent } from './development-event-types'
import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from './development-event-fixtures'
import { projectReviewQueue, sortReviewQueueItems } from './review-queue-projection'

const PR_CONTEXT = {
  taskId: 'task-review-1',
  sessionId: 'session-review-1'
} as const

function agentFailedDevelopmentEventFixture(
  overrides: Partial<Extract<DevelopmentEvent, { eventType: 'agent.failed' }>> = {}
): Extract<DevelopmentEvent, { eventType: 'agent.failed' }> {
  return {
    version: 1,
    eventId: 'evt-agent-failed',
    eventType: 'agent.failed',
    occurredAt: '2026-09-30T00:00:00.000Z',
    projectId: 'project-1',
    sessionId: 'session-1',
    actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
    source: 'devcrew.fixture',
    payload: { agentId: 'agent-1', status: 'failed' },
    ...overrides
  }
}

describe('Review Queue projection', () => {
  it('creates a review item for a pull request event', () => {
    const items = projectReviewQueue([pullRequestDevelopmentEventFixture(PR_CONTEXT)])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'project-1:pull_request:github:42',
      projectId: 'project-1',
      taskId: 'task-review-1',
      sessionId: 'session-review-1',
      subject: {
        type: 'pull_request',
        id: '42',
        provider: 'github',
        url: 'https://github.com/Guan21/cc-orca/pull/42',
        title: 'Introduce DevelopmentEvent v1'
      },
      state: 'review_required',
      priority: 'low'
    })
  })

  it('deduplicates multiple events for one pull request into one logical review item', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      humanActionDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-review-requested',
        eventType: 'review.requested',
        occurredAt: '2026-09-30T01:00:00.000Z',
        payload: {
          provider: 'github',
          reviewId: 'review-1',
          status: 'requested',
          pullRequestId: '42'
        }
      }),
      testCompletedDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-test-failed',
        occurredAt: '2026-09-30T02:00:00.000Z',
        payload: { status: 'failed', failed: 1, passed: 24 }
      }),
      reviewDevelopmentEventFixture({
        ...PR_CONTEXT,
        occurredAt: '2026-09-30T03:00:00.000Z'
      })
    ])

    expect(items).toHaveLength(1)
    expect(items[0]?.relatedEventIds).toEqual([
      'evt-pull-request-created',
      'evt-review-requested',
      'evt-test-failed',
      'evt-review-completed'
    ])
  })

  it('adds a high-priority failed-test reason when verification fails', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      testCompletedDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-test-failed',
        payload: { status: 'failed', failed: 2, passed: 10 }
      })
    ])

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.state).toBe('blocked')
    expect(items[0]?.reasons).toContainEqual({
      type: 'failed_tests',
      severity: 'high',
      summary: 'Tests failed',
      evidenceEventIds: ['evt-test-failed']
    })
    expect(items[0]?.evidence.tests).toEqual({ status: 'failed', passed: 10, failed: 2 })
  })

  it('adds a pending-review reason until the same review is completed', () => {
    const requested = humanActionDevelopmentEventFixture({
      ...PR_CONTEXT,
      eventId: 'evt-review-requested',
      eventType: 'review.requested',
      payload: {
        provider: 'github',
        reviewId: 'review-1',
        status: 'requested',
        pullRequestId: '42'
      }
    })

    const pendingItems = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      requested
    ])

    expect(pendingItems[0]?.state).toBe('in_review')
    expect(pendingItems[0]?.priority).toBe('medium')
    expect(pendingItems[0]?.reasons).toContainEqual({
      type: 'review_pending',
      severity: 'medium',
      summary: 'Review requested but not completed',
      evidenceEventIds: ['evt-review-requested']
    })

    const completedItems = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      requested,
      reviewDevelopmentEventFixture(PR_CONTEXT)
    ])

    expect(completedItems[0]?.state).toBe('reviewed')
    expect(completedItems[0]?.reasons.some((reason) => reason.type === 'review_pending')).toBe(
      false
    )
    expect(completedItems[0]?.evidence.review).toEqual({ requested: true, completed: true })
  })

  it('adds an explicit agent-failure reason for a correlated failed agent event', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      agentFailedDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-agent-failed',
        eventType: 'agent.failed',
        payload: { agentId: 'agent-1', status: 'failed', errorMessage: 'Tool execution failed' }
      })
    ])

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.reasons).toContainEqual({
      type: 'agent_failure',
      severity: 'high',
      summary: 'Agent failed',
      evidenceEventIds: ['evt-agent-failed']
    })
    expect(items[0]?.evidence.agent).toEqual({ failed: true })
  })

  it('preserves multiple explicit reasons while resolving priority from the strongest severity', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      humanActionDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-review-requested',
        eventType: 'review.requested',
        payload: {
          provider: 'github',
          reviewId: 'review-1',
          status: 'requested',
          pullRequestId: '42'
        }
      }),
      testCompletedDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-test-failed',
        payload: { status: 'failed', failed: 1 }
      })
    ])

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.reasons.map((reason) => reason.type)).toEqual([
      'failed_tests',
      'review_pending'
    ])
  })

  it('adds a security-sensitive-change reason for supported changed-file evidence', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      fileChangedDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-auth-changed',
        payload: { path: 'src/auth/session-policy.ts', changeType: 'modified' }
      })
    ])

    expect(items[0]?.priority).toBe('high')
    expect(items[0]?.reasons).toContainEqual({
      type: 'security_sensitive_change',
      severity: 'high',
      summary: 'Security-sensitive area changed',
      evidenceEventIds: ['evt-auth-changed']
    })
    expect(items[0]?.evidence.changedFiles).toEqual(['src/auth/session-policy.ts'])
  })

  it('sorts queue items by priority descending and newest update within a priority', () => {
    const olderMedium = projectReviewQueue([
      pullRequestDevelopmentEventFixture({
        taskId: 'older',
        eventId: 'evt-older-pr',
        occurredAt: '2026-09-30T00:00:00.000Z',
        payload: {
          provider: 'github',
          pullRequestId: '100',
          url: 'https://github.com/Guan21/cc-orca/pull/100',
          title: 'Older medium'
        }
      }),
      humanActionDevelopmentEventFixture({
        taskId: 'older',
        eventId: 'evt-older-review',
        eventType: 'review.requested',
        occurredAt: '2026-09-30T01:00:00.000Z',
        payload: {
          provider: 'github',
          reviewId: 'review-older',
          status: 'requested',
          pullRequestId: '100'
        }
      })
    ])[0]!
    const newerMedium = projectReviewQueue([
      pullRequestDevelopmentEventFixture({
        taskId: 'newer',
        eventId: 'evt-newer-pr',
        occurredAt: '2026-09-30T00:00:00.000Z',
        payload: {
          provider: 'github',
          pullRequestId: '101',
          url: 'https://github.com/Guan21/cc-orca/pull/101',
          title: 'Newer medium'
        }
      }),
      humanActionDevelopmentEventFixture({
        taskId: 'newer',
        eventId: 'evt-newer-review',
        eventType: 'review.requested',
        occurredAt: '2026-09-30T02:00:00.000Z',
        payload: {
          provider: 'github',
          reviewId: 'review-newer',
          status: 'requested',
          pullRequestId: '101'
        }
      })
    ])[0]!
    const high = projectReviewQueue([
      pullRequestDevelopmentEventFixture({
        taskId: 'high',
        eventId: 'evt-high-pr',
        payload: {
          provider: 'github',
          pullRequestId: '102',
          url: 'https://github.com/Guan21/cc-orca/pull/102',
          title: 'High'
        }
      }),
      testCompletedDevelopmentEventFixture({
        taskId: 'high',
        eventId: 'evt-high-test',
        occurredAt: '2026-09-30T00:30:00.000Z',
        payload: { status: 'failed', failed: 1 }
      })
    ])[0]!

    expect(
      sortReviewQueueItems([olderMedium, newerMedium, high]).map((item) => item.subject.id)
    ).toEqual(['102', '101', '100'])
  })

  it('derives the same completed-review state from out-of-order replayed events', () => {
    const requested = humanActionDevelopmentEventFixture({
      ...PR_CONTEXT,
      eventId: 'evt-review-requested',
      eventType: 'review.requested',
      occurredAt: '2026-09-30T01:00:00.000Z',
      payload: {
        provider: 'github',
        reviewId: 'review-1',
        status: 'requested',
        pullRequestId: '42'
      }
    })
    const completed = reviewDevelopmentEventFixture({
      ...PR_CONTEXT,
      eventId: 'evt-review-completed',
      occurredAt: '2026-09-30T02:00:00.000Z',
      payload: {
        provider: 'github',
        reviewId: 'review-1',
        status: 'completed',
        pullRequestId: '42'
      }
    })

    const inOrder = projectReviewQueue([
      pullRequestDevelopmentEventFixture(PR_CONTEXT),
      requested,
      completed
    ])
    const outOfOrder = projectReviewQueue([
      completed,
      requested,
      pullRequestDevelopmentEventFixture(PR_CONTEXT)
    ])

    expect(outOfOrder).toEqual(inOrder)
    expect(outOfOrder[0]?.state).toBe('reviewed')
  })

  it('summarizes commit evidence without exposing raw metadata or secrets', () => {
    const items = projectReviewQueue([
      pullRequestDevelopmentEventFixture({
        ...PR_CONTEXT,
        payload: {
          provider: 'github',
          pullRequestId: '42',
          url: 'https://github.com/Guan21/cc-orca/pull/42',
          title: 'Secret-free projection',
          metadata: { secret: 'super-secret-token', credentials: { password: 'p@ss' } }
        }
      }),
      commitDevelopmentEventFixture({
        ...PR_CONTEXT,
        eventId: 'evt-commit',
        payload: {
          sha: 'abc1234',
          message: 'Update code',
          metadata: { environment: { API_TOKEN: 'super-secret-token' } }
        }
      })
    ])

    expect(items[0]?.evidence.latestCommitSha).toBe('abc1234')
    expect(JSON.stringify(items[0])).not.toContain('super-secret-token')
    expect(JSON.stringify(items[0])).not.toContain('credentials')
    expect(JSON.stringify(items[0])).not.toContain('environment')
  })
})
