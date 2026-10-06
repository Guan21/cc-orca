// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import type { DisagreementSignal } from '../../../../shared/disagreement-signal-types'
import { ReviewQueuePage } from './ReviewQueuePage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
const openUrl = vi.fn<(url: string) => Promise<void>>()

type ReviewQueueTestWindow = {
  api?: {
    shell: {
      openUrl: (url: string) => Promise<void>
    }
  }
}

async function renderPage(props: Parameters<typeof ReviewQueuePage>[0]): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ReviewQueuePage {...props} />)
  })
}

function text(): string {
  return container?.textContent ?? ''
}

function eventAt<T extends DevelopmentEvent>(event: T, occurredAt: string): T {
  return { ...event, occurredAt }
}

function clickByText(label: string): void {
  const target = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  )
  expect(target).toBeTruthy()
  act(() => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  openUrl.mockReset().mockResolvedValue(undefined)
  ;(window as unknown as ReviewQueueTestWindow).api = { shell: { openUrl } }
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  Reflect.deleteProperty(window, 'api')
})

describe('ReviewQueuePage', () => {
  it('renders prioritized human-review work from DevelopmentEvent input', async () => {
    await renderPage({
      events: [
        eventAt(
          pullRequestDevelopmentEventFixture({
            eventId: 'pr-created',
            sessionId: 'session-review-ui',
            payload: {
              provider: 'github',
              pullRequestId: '85',
              url: 'https://github.com/Guan21/cc-orca/pull/85',
              title: 'Build review queue foundation'
            }
          }),
          '2026-09-30T14:20:00Z'
        ),
        eventAt(
          fileChangedDevelopmentEventFixture({
            eventId: 'auth-file',
            sessionId: 'session-review-ui',
            payload: { path: 'src/auth/session-policy.ts', changeType: 'modified' }
          }),
          '2026-09-30T14:21:00Z'
        ),
        eventAt(
          testCompletedDevelopmentEventFixture({
            eventId: 'failed-tests',
            sessionId: 'session-review-ui',
            payload: {
              status: 'failed',
              suite: 'review-queue.test.ts',
              passed: 21,
              failed: 2,
              metadata: { secret: 'DO_NOT_RENDER_SECRET_MARKER' }
            }
          }),
          '2026-09-30T14:22:00Z'
        ),
        eventAt(
          commitDevelopmentEventFixture({
            eventId: 'commit',
            sessionId: 'session-review-ui',
            payload: { sha: '315933b4d9a1', message: 'Build review queue foundation' }
          }),
          '2026-09-30T14:23:00Z'
        ),
        eventAt(
          humanActionDevelopmentEventFixture({
            eventId: 'review-request',
            sessionId: 'session-review-ui',
            payload: {
              provider: 'github',
              reviewId: 'review-85',
              status: 'requested',
              pullRequestId: '85'
            }
          }),
          '2026-09-30T14:24:00Z'
        )
      ]
    })

    expect(text()).toContain('DevCrew Review Queue')
    expect(text()).toContain('Build review queue foundation')
    expect(text()).toContain('High')
    expect(text()).toContain('FAILED')
    expect(text()).toContain('Tests failed')
    expect(text()).toContain('Security-sensitive area changed')
    expect(text()).toContain('21 passed')
    expect(text()).toContain('2 failed')
    expect(text()).toContain('Related events')
    expect(text()).toContain('test.completed')
    expect(text()).toContain('review-queue.test.ts')
    expect(text()).not.toContain('DO_NOT_RENDER_SECRET_MARKER')
    expect(text()).toContain('Human judgment')
    expect(text()).toContain('Confirm the security-sensitive path is intentional and safe.')

    clickByText('Open review target')

    expect(openUrl).toHaveBeenCalledWith('https://github.com/Guan21/cc-orca/pull/85')
  })

  it('preserves domain queue ordering and updates selected detail deterministically', async () => {
    await renderPage({
      events: [
        eventAt(
          pullRequestDevelopmentEventFixture({
            eventId: 'medium-pr',
            sessionId: 'session-medium',
            payload: {
              provider: 'github',
              pullRequestId: '105',
              url: 'https://github.com/Guan21/cc-orca/pull/105',
              title: 'Review pending change'
            }
          }),
          '2026-09-30T15:10:00Z'
        ),
        eventAt(
          humanActionDevelopmentEventFixture({
            eventId: 'medium-review-request',
            sessionId: 'session-medium',
            payload: {
              provider: 'github',
              reviewId: 'review-105',
              status: 'requested',
              pullRequestId: '105'
            }
          }),
          '2026-09-30T15:11:00Z'
        ),
        eventAt(
          pullRequestDevelopmentEventFixture({
            eventId: 'low-pr',
            sessionId: 'session-low',
            payload: {
              provider: 'github',
              pullRequestId: '106',
              url: 'https://github.com/Guan21/cc-orca/pull/106',
              title: 'Already reviewed change'
            }
          }),
          '2026-09-30T15:20:00Z'
        ),
        eventAt(
          testCompletedDevelopmentEventFixture({
            eventId: 'low-tests',
            sessionId: 'session-low',
            payload: { status: 'passed', suite: 'review-queue.test.ts', passed: 12 }
          }),
          '2026-09-30T15:21:00Z'
        ),
        eventAt(
          reviewDevelopmentEventFixture({
            eventId: 'low-review-completed',
            sessionId: 'session-low',
            payload: {
              provider: 'github',
              reviewId: 'review-106',
              status: 'completed',
              pullRequestId: '106'
            }
          }),
          '2026-09-30T15:22:00Z'
        ),
        eventAt(
          pullRequestDevelopmentEventFixture({
            eventId: 'high-pr',
            sessionId: 'session-high',
            payload: {
              provider: 'github',
              pullRequestId: '104',
              url: 'https://github.com/Guan21/cc-orca/pull/104',
              title: 'Failed tests change'
            }
          }),
          '2026-09-30T15:00:00Z'
        ),
        eventAt(
          testCompletedDevelopmentEventFixture({
            eventId: 'high-tests',
            sessionId: 'session-high',
            payload: { status: 'failed', suite: 'review-queue.test.ts', passed: 3, failed: 1 }
          }),
          '2026-09-30T15:01:00Z'
        )
      ]
    })

    expect(text().indexOf('Failed tests change')).toBeLessThan(
      text().indexOf('Review pending change')
    )
    expect(text().indexOf('Review pending change')).toBeLessThan(
      text().indexOf('Already reviewed change')
    )
    expect(container?.querySelector('[data-review-queue-detail]')?.textContent).toContain(
      'Failed tests change'
    )

    clickByText('Review pending change')

    const detailText = container?.querySelector('[data-review-queue-detail]')?.textContent ?? ''
    expect(detailText).toContain('Review pending change')
    expect(detailText).toContain('Review requested but not completed')
    expect(detailText).toContain('Complete the requested human review.')
  })

  it('renders explicit reason and reviewed evidence labels from demo DevelopmentEvents', async () => {
    await renderPage({})

    expect(text()).toContain('3Needs review')
    expect(text()).toContain('Agent execution failed')
    expect(text()).toContain('Document Review Queue rollout')

    clickByText('Document Review Queue rollout')

    expect(container?.querySelector('[data-review-queue-detail]')?.textContent).toContain('PASS')
    expect(text()).toContain('Review completed')
  })

  it('does not render an open-target action for unsafe subject URL schemes', async () => {
    await renderPage({
      events: [
        pullRequestDevelopmentEventFixture({
          eventId: 'unsafe-pr',
          payload: {
            provider: 'github',
            pullRequestId: '111',
            url: 'javascript:DO_NOT_OPEN_SECRET_MARKER',
            title: 'Unsafe target'
          }
        }),
        humanActionDevelopmentEventFixture({
          eventId: 'unsafe-review-request',
          payload: {
            provider: 'github',
            reviewId: 'unsafe-review',
            status: 'requested',
            pullRequestId: '111'
          }
        })
      ]
    })

    expect(text()).toContain('Unsafe target')
    expect(text()).not.toContain('Open review target')
    expect(text()).not.toContain('DO_NOT_OPEN_SECRET_MARKER')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('does not mutate the input event array before projection', async () => {
    const events = [
      pullRequestDevelopmentEventFixture({
        eventId: 'pr-created',
        payload: {
          provider: 'github',
          pullRequestId: '90',
          url: 'https://github.com/Guan21/cc-orca/pull/90',
          title: 'Review immutable input'
        }
      }),
      humanActionDevelopmentEventFixture({
        eventId: 'review-request',
        payload: {
          provider: 'github',
          reviewId: 'review-90',
          status: 'requested',
          pullRequestId: '90'
        }
      })
    ]
    const originalOrder = events.map((event) => event.eventId)

    await renderPage({ events })

    expect(events.map((event) => event.eventId)).toEqual(originalOrder)
    expect(text()).toContain('Review immutable input')
  })

  it('renders review disagreement reason, summary, guidance, and review-event evidence count', async () => {
    await renderPage({
      events: [
        eventAt(
          pullRequestDevelopmentEventFixture({
            eventId: 'pr-disagreement',
            payload: {
              provider: 'github',
              pullRequestId: '80',
              url: 'https://github.com/Guan21/cc-orca/pull/80',
              title: 'Resolve review disagreement'
            }
          }),
          '2026-10-06T00:00:00Z'
        ),
        eventAt(
          reviewDevelopmentEventFixture({
            eventId: 'review-claude-event',
            actor: { type: 'agent', id: 'claude', provider: 'claude' },
            payload: {
              provider: 'github',
              reviewId: 'review-claude',
              status: 'completed',
              pullRequestId: '80'
            }
          }),
          '2026-10-06T00:01:00Z'
        ),
        eventAt(
          reviewDevelopmentEventFixture({
            eventId: 'review-codex-event',
            actor: { type: 'agent', id: 'codex', provider: 'codex' },
            payload: {
              provider: 'github',
              reviewId: 'review-codex',
              status: 'completed',
              pullRequestId: '80',
              metadata: { rawProviderPayload: 'DO_NOT_RENDER_PROVIDER_SECRET' }
            }
          }),
          '2026-10-06T00:02:00Z'
        )
      ],
      disagreementSignals: [
        disagreementSignalFixture({
          evidenceRefs: ['finding:sec-4', 'DO_NOT_RENDER_PROVIDER_SECRET'],
          summary: 'Reviewers disagree on whether the change contains an issue.'
        })
      ]
    })

    expect(text()).toContain('Resolve review disagreement')
    expect(text()).toContain('High')
    expect(text()).toContain('Reviewer disagreement')
    expect(text()).toContain('Reviewers disagree on whether the change contains an issue.')
    expect(text()).toContain('2 supporting events')
    expect(text()).toContain('Resolve the reviewer disagreement before proceeding.')
    expect(text()).toContain('review.completed')
    expect(text()).not.toContain('DO_NOT_RENDER_PROVIDER_SECRET')
  })

  it('renders empty, loading, and error states', async () => {
    await renderPage({ events: [] })
    expect(text()).toContain('Nothing needs review')

    await act(async () => {
      root?.render(<ReviewQueuePage events={[]} state="loading" />)
    })
    expect(text()).toContain('Loading review queue...')

    await act(async () => {
      root?.render(
        <ReviewQueuePage events={[]} state="error" errorMessage="Review events unavailable" />
      )
    })
    expect(text()).toContain('Review Queue is unavailable')
    expect(text()).toContain('Review events unavailable')
  })
})

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
    evidenceRefs: ['finding:sec-4'],
    detectedAt: '2026-10-06T00:00:00.000Z',
    ...overrides
  }
}
