import { describe, expect, it } from 'vitest'
import type { ProjectStateSnapshot, ProjectTaskState } from '../project-state/project-state'
import { planEngineeringManagerSuggestions } from './engineering-manager-plan'

function task(overrides: Partial<ProjectTaskState> = {}): ProjectTaskState {
  return {
    projectId: 'project-a',
    taskId: 'task-1',
    taskNodeId: 'task-node-1',
    lifecycle: 'started',
    runs: [],
    changedFiles: [],
    testResults: { passed: 0, failed: 0, skipped: 0 },
    reviews: { requested: 0, completed: 0 },
    observedSignals: {
      failedTest: false,
      failedRun: false,
      reviewRequested: false
    },
    evidenceRefs: [],
    lastObservedAt: '2020-01-01T00:00:00Z',
    ...overrides
  }
}

function snapshot(tasks: ProjectTaskState[]): ProjectStateSnapshot {
  return {
    projectId: 'project-a',
    tasks,
    summary: {
      total: tasks.length,
      unknown: 0,
      started: tasks.length,
      completed: 0,
      withRequestedReviews: 0,
      withFailedTests: 0,
      withFailedRuns: 0
    }
  }
}

const options = { nowMs: 50_000, staleAfterMs: 10_000, clockId: 'local-observer-a' }

describe('AI Engineering Manager M0 — inert diagnostic planning', () => {
  it('generates no task status from an old event timestamp alone', () => {
    expect(planEngineeringManagerSuggestions(snapshot([task()]), options).suggestions).toEqual([])
  })

  it('keeps failed test observations distinct from task failure or automatic repair', () => {
    const result = planEngineeringManagerSuggestions(
      snapshot([
        task({
          testResults: { passed: 0, failed: 1, skipped: 0 },
          observedSignals: { failedTest: true, failedRun: false, reviewRequested: false },
          evidenceRefs: ['test-id', 'test-id', 'run-id']
        })
      ]),
      options
    )
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]).toMatchObject({
      reason: 'test_result_needs_review',
      suggestedAction: 'inspect_test_evidence',
      priority: 'high',
      evidenceRefs: ['run-id', 'test-id'],
      evidenceStatus: 'referenced',
      authorization: 'human_decision_required',
      execution: 'not_authorized'
    })
    expect(result.suggestions[0].explanation).toContain('does not establish the current result')
  })

  it('proposes investigation for a failed run without asserting task failure', () => {
    const result = planEngineeringManagerSuggestions(
      snapshot([
        task({
          runs: [{ runId: 'run-1', status: 'failed', agentNodeIds: [], evidenceRefs: [] }],
          observedSignals: { failedTest: false, failedRun: true, reviewRequested: false }
        })
      ]),
      options
    )
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]).toMatchObject({
      reason: 'failed_run_needs_investigation',
      evidenceStatus: 'not_linked'
    })
    expect(result.suggestions[0].explanation).toContain('does not mean the task failed')
  })

  it('does not infer pending review from aggregated historical request counts', () => {
    const result = planEngineeringManagerSuggestions(
      snapshot([task({ reviews: { requested: 1, completed: 1 } })]),
      options
    )
    expect(result.suggestions[0]).toMatchObject({
      reason: 'review_status_needs_confirmation',
      suggestedAction: 'verify_review_state'
    })
    expect(result.suggestions[0].explanation).toContain('do not prove a review remains pending')
  })

  it('requires same-project same-clock local receipts before suggesting a freshness check', () => {
    const receipts = [
      { projectId: 'project-b', taskId: 'task-1', receivedAtMs: 1, clockId: options.clockId },
      { projectId: 'project-a', taskId: 'task-1', receivedAtMs: 1, clockId: 'remote-clock' }
    ]
    expect(
      planEngineeringManagerSuggestions(snapshot([task()]), {
        ...options,
        trustedReceipts: receipts
      }).suggestions
    ).toEqual([])

    const result = planEngineeringManagerSuggestions(snapshot([task()]), {
      ...options,
      trustedReceipts: [
        { projectId: 'project-a', taskId: 'task-1', receivedAtMs: 1, clockId: options.clockId }
      ]
    })
    expect(result.suggestions.map((suggestion) => suggestion.reason)).toEqual([
      'activity_freshness_needs_confirmation'
    ])
    expect(result.suggestions[0].explanation).toContain('not proof that the Agent stopped')
  })

  it('ignores future receipts, completed tasks and cross-project task records', () => {
    const tasks = [
      task({ taskId: 'done', lifecycle: 'completed', reviews: { requested: 1, completed: 0 } }),
      task({ taskId: 'elsewhere', projectId: 'project-b', reviews: { requested: 1, completed: 0 } }),
      task({ taskId: 'future' })
    ]
    expect(
      planEngineeringManagerSuggestions(snapshot(tasks), {
        ...options,
        trustedReceipts: [
          { projectId: 'project-a', taskId: 'future', receivedAtMs: 60_000, clockId: options.clockId }
        ]
      }).suggestions
    ).toEqual([])
  })

  it('deduplicates logical suggestions and returns a stable order with no side effects', () => {
    const a = task({
      taskId: 'a',
      reviews: { requested: 1, completed: 0 },
      testResults: { passed: 0, failed: 1, skipped: 0 },
      observedSignals: { failedTest: true, failedRun: false, reviewRequested: true }
    })
    const b = task({ taskId: 'b', reviews: { requested: 1, completed: 0 } })
    const first = planEngineeringManagerSuggestions(snapshot([b, a, a]), options)
    const second = planEngineeringManagerSuggestions(snapshot([a, b]), options)
    expect(first).toEqual(second)
    expect(first.suggestions.map((item) => item.reason)).toEqual([
      'test_result_needs_review',
      'review_status_needs_confirmation',
      'review_status_needs_confirmation'
    ])
    expect(first.suggestions.every((item) => item.execution === 'not_authorized')).toBe(true)
  })

  it('rejects invalid observation-clock parameters', () => {
    expect(() =>
      planEngineeringManagerSuggestions(snapshot([task()]), {
        nowMs: Number.NaN,
        staleAfterMs: options.staleAfterMs,
        clockId: options.clockId
      })
    ).toThrow('Invalid engineering manager observation clock')
    expect(() =>
      planEngineeringManagerSuggestions(snapshot([task()]), { ...options, staleAfterMs: 0 })
    ).toThrow('Invalid engineering manager observation clock')
  })
})
