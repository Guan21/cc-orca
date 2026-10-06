import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'
import { translate } from '@/i18n/i18n'

type AgentFailedDevelopmentEvent = Extract<DevelopmentEvent, { eventType: 'agent.failed' }>

function at<T extends DevelopmentEvent>(event: T, occurredAt: string): T {
  return { ...event, occurredAt }
}

function agentFailedDevelopmentEventFixture(
  overrides: Partial<AgentFailedDevelopmentEvent> = {}
): AgentFailedDevelopmentEvent {
  return {
    version: 1,
    eventId: 'review-demo-agent-failed',
    eventType: 'agent.failed',
    occurredAt: '2026-09-30T15:11:00.000Z',
    projectId: 'project-devcrew-control-plane',
    taskId: 'issue-79',
    sessionId: 'session-review-demo',
    actor: { type: 'agent', id: 'codex-reviewer', provider: 'codex' },
    source: 'devcrew.review-queue.demo',
    payload: {
      agentId: 'codex-reviewer',
      status: 'failed',
      errorMessage: 'Verifier could not prove the migration path.'
    },
    ...overrides
  }
}

export function createReviewQueueDemoEvents(): DevelopmentEvent[] {
  const foundationTitle = translate(
    'auto.components.reviewQueue.demo.foundationTitle',
    'Build Review Queue foundation'
  )

  return [
    at(
      pullRequestDevelopmentEventFixture({
        eventId: 'review-demo-pr-85',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-79',
        sessionId: 'session-review-ui',
        payload: {
          provider: 'github',
          pullRequestId: '85',
          url: 'https://github.com/Guan21/cc-orca/pull/85',
          title: foundationTitle
        }
      }),
      '2026-09-30T15:00:00.000Z'
    ),
    at(
      fileChangedDevelopmentEventFixture({
        eventId: 'review-demo-security-file',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-79',
        sessionId: 'session-review-ui',
        payload: { path: 'src/main/security/review-policy.ts', changeType: 'modified' }
      }),
      '2026-09-30T15:02:00.000Z'
    ),
    at(
      testCompletedDevelopmentEventFixture({
        eventId: 'review-demo-tests-failed',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-79',
        sessionId: 'session-review-ui',
        payload: {
          status: 'failed',
          suite: 'review-queue-projection.test.ts',
          passed: 44,
          failed: 2
        }
      }),
      '2026-09-30T15:04:00.000Z'
    ),
    at(
      commitDevelopmentEventFixture({
        eventId: 'review-demo-commit',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-79',
        sessionId: 'session-review-ui',
        payload: {
          sha: '315933b4d9a1',
          message: foundationTitle
        }
      }),
      '2026-09-30T15:05:00.000Z'
    ),
    at(
      humanActionDevelopmentEventFixture({
        eventId: 'review-demo-review-request',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-79',
        sessionId: 'session-review-ui',
        payload: {
          provider: 'github',
          reviewId: 'review-85',
          status: 'requested',
          pullRequestId: '85'
        }
      }),
      '2026-09-30T15:06:00.000Z'
    ),
    at(
      pullRequestDevelopmentEventFixture({
        eventId: 'review-demo-pr-91',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-91',
        sessionId: 'session-verifier',
        payload: {
          provider: 'github',
          pullRequestId: '91',
          url: 'https://github.com/Guan21/cc-orca/pull/91',
          title: translate(
            'auto.components.reviewQueue.demo.verifierTitle',
            'Tighten verifier handoff states'
          )
        }
      }),
      '2026-09-30T15:08:00.000Z'
    ),
    at(
      agentFailedDevelopmentEventFixture({
        eventId: 'review-demo-verifier-failed',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-91',
        sessionId: 'session-verifier'
      }),
      '2026-09-30T15:11:00.000Z'
    ),
    at(
      pullRequestDevelopmentEventFixture({
        eventId: 'review-demo-pr-93',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-93',
        payload: {
          provider: 'github',
          pullRequestId: '93',
          url: 'https://github.com/Guan21/cc-orca/pull/93',
          title: translate(
            'auto.components.reviewQueue.demo.projectPulseTitle',
            'Polish Project Pulse summaries'
          )
        }
      }),
      '2026-09-30T15:20:00.000Z'
    ),
    at(
      humanActionDevelopmentEventFixture({
        eventId: 'review-demo-pr-93-request',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-93',
        payload: {
          provider: 'github',
          reviewId: 'review-93',
          status: 'requested',
          pullRequestId: '93'
        }
      }),
      '2026-09-30T15:22:00.000Z'
    ),
    at(
      pullRequestDevelopmentEventFixture({
        eventId: 'review-demo-pr-94',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-94',
        sessionId: 'session-reviewed',
        payload: {
          provider: 'github',
          pullRequestId: '94',
          url: 'https://github.com/Guan21/cc-orca/pull/94',
          title: translate(
            'auto.components.reviewQueue.demo.rolloutTitle',
            'Document Review Queue rollout'
          )
        }
      }),
      '2026-09-30T15:30:00.000Z'
    ),
    at(
      testCompletedDevelopmentEventFixture({
        eventId: 'review-demo-pr-94-tests',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-94',
        sessionId: 'session-reviewed',
        payload: { status: 'passed', suite: 'review-queue-page.test.tsx', passed: 18 }
      }),
      '2026-09-30T15:31:00.000Z'
    ),
    at(
      reviewDevelopmentEventFixture({
        eventId: 'review-demo-pr-94-review',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-94',
        sessionId: 'session-reviewed',
        payload: {
          provider: 'github',
          reviewId: 'review-94',
          status: 'completed',
          pullRequestId: '94'
        }
      }),
      '2026-09-30T15:32:00.000Z'
    ),
    at(
      pullRequestDevelopmentEventFixture({
        eventId: 'review-demo-pr-96',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-80',
        sessionId: 'session-disagreement',
        payload: {
          provider: 'github',
          pullRequestId: '96',
          url: 'https://github.com/Guan21/cc-orca/pull/96',
          title: translate(
            'auto.components.reviewQueue.demo.disagreementTitle',
            'Resolve reviewer disagreement'
          )
        }
      }),
      '2026-09-30T15:40:00.000Z'
    ),
    at(
      reviewDevelopmentEventFixture({
        eventId: 'review-demo-pr-96-claude-review',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-80',
        sessionId: 'session-disagreement',
        actor: { type: 'agent', id: 'claude', provider: 'claude' },
        payload: {
          provider: 'github',
          reviewId: 'review-claude-96',
          status: 'completed',
          pullRequestId: '96'
        }
      }),
      '2026-09-30T15:41:00.000Z'
    ),
    at(
      reviewDevelopmentEventFixture({
        eventId: 'review-demo-pr-96-codex-review',
        projectId: 'project-devcrew-control-plane',
        taskId: 'issue-80',
        sessionId: 'session-disagreement',
        actor: { type: 'agent', id: 'codex', provider: 'codex' },
        payload: {
          provider: 'github',
          reviewId: 'review-codex-96',
          status: 'completed',
          pullRequestId: '96'
        }
      }),
      '2026-09-30T15:42:00.000Z'
    )
  ]
}
