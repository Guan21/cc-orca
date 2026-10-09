import { parseDevelopmentEvent } from '../development-event-schema'
import {
  buildReviewSubjectIndex,
  resolveReviewSubjectIdentity
} from '../review-queue-subject-identity'
import type { ActivityGraphNode, ActivityGraphUpdate } from './activity-graph'
import { normalizeActivityGraphPath } from './activity-graph-identities'
import { ActivityGraphUpdateBuilder } from './activity-graph-update-builder'

export function projectDevelopmentEventToGraphUpdates(
  raw: unknown
): ActivityGraphUpdate | undefined {
  const parsed = parseDevelopmentEvent(raw)
  if (!parsed.ok) {
    return undefined
  }
  const event = parsed.value
  const b = new ActivityGraphUpdateBuilder(event.projectId, event.occurredAt, event.eventId)
  const project = b.node('project', [], { projectId: event.projectId })
  const task = event.taskId ? b.node('task', [event.taskId], { taskId: event.taskId }) : undefined
  const run = event.sessionId
    ? b.node('run', [event.sessionId], { runId: event.sessionId })
    : undefined
  if (task) {
    b.edge('BELONGS_TO', task, project)
  }
  if (run) {
    b.edge('BELONGS_TO', run, task ?? project)
  }
  b.actor(event.actor)
  const produced = (node: ActivityGraphNode) => {
    if (task) {
      b.edge('PRODUCED', task, node)
    }
    if (run) {
      b.edge('PRODUCED', run, node)
    }
    if (!task && !run) {
      b.edge('BELONGS_TO', node, project)
    }
  }
  switch (event.eventType) {
    case 'task.started':
    case 'task.completed':
      if (event.taskId) {
        b.node('task', [event.taskId], {
          taskId: event.taskId,
          status: event.eventType === 'task.started' ? 'started' : 'completed'
        })
      }
      break
    case 'agent.started':
    case 'agent.completed':
    case 'agent.failed': {
      const agent = b.node('agent', [event.actor.provider ?? '', event.payload.agentId], {
        agentId: event.payload.agentId,
        ...(event.actor.provider ? { provider: event.actor.provider } : {})
      })
      if (run && event.sessionId) {
        b.node('run', [event.sessionId], {
          runId: event.sessionId,
          status:
            event.eventType === 'agent.started'
              ? 'started'
              : event.eventType === 'agent.completed'
                ? 'completed'
                : 'failed'
        })
        b.edge('EXECUTED_BY', run, agent)
      }
      break
    }
    case 'file.changed': {
      const path = normalizeActivityGraphPath(event.payload.path)
      if (!path) {
        break
      }
      const oldPath = event.payload.oldPath && normalizeActivityGraphPath(event.payload.oldPath)
      const file = b.node('file', [path], { path })
      const change = b.node('code_change', ['file_event', event.eventId], {
        changeId: event.eventId,
        kind: 'file_event',
        changeType: event.payload.changeType,
        ...(oldPath ? { oldPath } : {})
      })
      produced(change)
      b.edge('CHANGED', change, file)
      if (run) {
        b.edge('CHANGED', run, file)
      }
      if (task) {
        b.edge('CHANGED', task, file)
      }
      b.edge('BELONGS_TO', file, project)
      break
    }
    case 'commit.created':
      produced(
        b.node('code_change', ['commit', event.payload.sha], {
          changeId: event.payload.sha,
          kind: 'commit',
          sha: event.payload.sha
        })
      )
      break
    case 'pull_request.created':
      produced(
        b.node('pull_request', [event.payload.provider, event.payload.pullRequestId], {
          provider: event.payload.provider,
          pullRequestId: event.payload.pullRequestId
        })
      )
      break
    case 'test.completed':
      produced(
        b.node('test_result', [event.eventId], {
          resultId: event.eventId,
          status: event.payload.status,
          ...(event.payload.suite ? { suite: event.payload.suite } : {}),
          ...(event.payload.passed !== undefined ? { passed: event.payload.passed } : {}),
          ...(event.payload.failed !== undefined ? { failed: event.payload.failed } : {}),
          ...(event.payload.skipped !== undefined ? { skipped: event.payload.skipped } : {})
        })
      )
      break
    case 'review.requested':
    case 'review.completed': {
      const subject = resolveReviewSubjectIdentity(event, buildReviewSubjectIndex([event]))
      const review = b.node(
        'review_package',
        [event.payload.provider, subject?.key ?? 'unresolved', event.payload.reviewId],
        {
          provider: event.payload.provider,
          reviewId: event.payload.reviewId,
          ...(subject ? { subjectId: subject.key } : {}),
          status: event.eventType === 'review.requested' ? 'requested' : 'completed'
        }
      )
      produced(review)
      if (event.payload.pullRequestId) {
        const pr = b.node('pull_request', [event.payload.provider, event.payload.pullRequestId], {
          provider: event.payload.provider,
          pullRequestId: event.payload.pullRequestId
        })
        b.edge('BELONGS_TO', review, pr)
      }
      if (event.eventType === 'review.completed') {
        const reviewer = b.actor(event.actor)
        if (reviewer) {
          b.edge('REVIEWED_BY', review, reviewer)
        }
      }
      break
    }
  }
  b.attachEvidence(event.eventId)
  return b.update
}
