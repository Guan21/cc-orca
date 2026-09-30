import {
  commitDevelopmentEventFixture,
  fileChangedDevelopmentEventFixture,
  humanActionDevelopmentEventFixture,
  pullRequestDevelopmentEventFixture,
  reviewDevelopmentEventFixture,
  taskLifecycleDevelopmentEventFixture,
  testCompletedDevelopmentEventFixture
} from '../../../../shared/development-event-fixtures'
import type { DevelopmentEvent } from '../../../../shared/development-event-types'

type AgentDevelopmentEvent = Extract<
  DevelopmentEvent,
  { eventType: 'agent.started' | 'agent.completed' | 'agent.failed' }
>

function agentDevelopmentEventFixture(
  overrides: Partial<AgentDevelopmentEvent> & Pick<AgentDevelopmentEvent, 'eventType'>
): AgentDevelopmentEvent {
  return {
    version: 1,
    eventId: 'pulse-agent-event',
    occurredAt: '2026-09-30T00:00:00.000Z',
    projectId: 'project-1',
    source: 'devcrew.fixture',
    actor: { type: 'agent', id: 'agent-1', provider: 'codex' },
    payload: { agentId: 'agent-1', status: 'started' },
    ...overrides
  } as AgentDevelopmentEvent
}

export const projectPulseDemoEvents: DevelopmentEvent[] = [
  taskLifecycleDevelopmentEventFixture({
    eventId: 'pulse-task-started-42',
    eventType: 'task.started',
    occurredAt: '2026-09-30T14:22:00.000Z',
    taskId: '42',
    actor: { type: 'system', id: 'devcrew' },
    payload: { title: 'Build Project Pulse timeline MVP' }
  }),
  agentDevelopmentEventFixture({
    eventId: 'pulse-agent-started-claude',
    eventType: 'agent.started',
    occurredAt: '2026-09-30T14:24:00.000Z',
    taskId: '42',
    sessionId: 'session-claude-1',
    actor: { type: 'agent', id: 'claude-1', provider: 'claude' },
    payload: { agentId: 'claude-1', status: 'started' }
  }),
  fileChangedDevelopmentEventFixture({
    eventId: 'pulse-file-changed-projection',
    occurredAt: '2026-09-30T14:25:00.000Z',
    taskId: '42',
    sessionId: 'session-claude-1',
    payload: {
      path: 'src/renderer/src/components/project-pulse/ProjectPulsePage.tsx',
      changeType: 'added'
    }
  }),
  testCompletedDevelopmentEventFixture({
    eventId: 'pulse-tests-passed',
    occurredAt: '2026-09-30T14:28:00.000Z',
    taskId: '42',
    payload: { status: 'passed', suite: 'project-pulse projection', passed: 5, failed: 0 }
  }),
  commitDevelopmentEventFixture({
    eventId: 'pulse-commit-created',
    occurredAt: '2026-09-30T14:31:00.000Z',
    taskId: '42',
    payload: {
      sha: 'abc1234def5678',
      message: 'Add Project Pulse timeline MVP',
      branch: 'feature/issue-78-project-pulse-timeline'
    }
  }),
  pullRequestDevelopmentEventFixture({
    eventId: 'pulse-pr-created',
    occurredAt: '2026-09-30T14:32:00.000Z',
    taskId: '42',
    payload: {
      provider: 'github',
      pullRequestId: '105',
      url: 'https://github.com/Guan21/cc-orca/pull/105',
      title: 'Build Project Pulse timeline MVP'
    }
  }),
  humanActionDevelopmentEventFixture({
    eventId: 'pulse-review-requested',
    occurredAt: '2026-09-30T14:34:00.000Z',
    taskId: '42',
    payload: {
      provider: 'github',
      reviewId: 'review-105',
      status: 'requested',
      pullRequestId: '105'
    }
  }),
  agentDevelopmentEventFixture({
    eventId: 'pulse-agent-failed-codex',
    eventType: 'agent.failed',
    occurredAt: '2026-09-30T14:36:00.000Z',
    taskId: '43',
    sessionId: 'session-codex-1',
    actor: { type: 'agent', id: 'codex-1', provider: 'codex' },
    payload: {
      agentId: 'codex-1',
      status: 'failed',
      errorMessage: 'UI test failed on empty state copy.'
    }
  }),
  reviewDevelopmentEventFixture({
    eventId: 'pulse-review-completed',
    occurredAt: '2026-09-30T14:42:00.000Z',
    taskId: '42',
    payload: {
      provider: 'github',
      reviewId: 'review-105',
      status: 'completed',
      pullRequestId: '105'
    }
  }),
  taskLifecycleDevelopmentEventFixture({
    eventId: 'pulse-task-completed-42',
    eventType: 'task.completed',
    occurredAt: '2026-09-30T14:45:00.000Z',
    taskId: '42',
    payload: { title: 'Build Project Pulse timeline MVP', result: 'MVP ready for validation' }
  })
]
