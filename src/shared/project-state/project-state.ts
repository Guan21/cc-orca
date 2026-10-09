import type { ActivityGraph } from '../activity-graph/activity-graph'
import {
  getNodeById,
  getNodesByType,
  getOutgoingEdges,
  getTaskGraph
} from '../activity-graph/activity-graph-query'

export type ProjectTaskLifecycle = 'unknown' | 'started' | 'completed'
export type ProjectTaskRunStatus = 'unknown' | 'started' | 'completed' | 'failed'

export type ProjectTaskRun = {
  runId: string
  status: ProjectTaskRunStatus
  agentIds: string[]
  evidenceRefs: string[]
}

export type ProjectTaskState = {
  projectId: string
  taskId: string
  taskNodeId: string
  lifecycle: ProjectTaskLifecycle
  runs: ProjectTaskRun[]
  changedFiles: string[]
  testResults: { passed: number; failed: number; skipped: number }
  reviews: { requested: number; completed: number }
  /** Observed facts, not a computed risk score or a mandate to take action. */
  observedSignals: {
    failedTest: boolean
    failedRun: boolean
    reviewRequested: boolean
  }
  evidenceRefs: string[]
  lastObservedAt: string
}

export type ProjectStateSnapshot = {
  projectId: string
  tasks: ProjectTaskState[]
  summary: {
    total: number
    unknown: number
    started: number
    completed: number
    withRequestedReviews: number
    withFailedTests: number
    withFailedRuns: number
  }
}

const unique = (values: string[]): string[] => [...new Set(values)].sort()
const byId = <T extends { id: string }>(left: T, right: T): number =>
  left.id.localeCompare(right.id)

/**
 * Read-only, project-scoped selector. An absent relationship remains unknown:
 * a task actor is not its owner, a shared file is not a dependency, and a
 * failed run is not proof of a failed task.
 */
export function projectActivityGraphState(
  graph: ActivityGraph,
  projectId: string
): ProjectStateSnapshot {
  const tasks = getNodesByType(graph, 'task', projectId).sort(byId).map((task) => {
    const context = getTaskGraph(graph, projectId, task.metadata.taskId)
    const runs = getNodesByType(context, 'run').sort(byId).map((run): ProjectTaskRun => {
      const agentIds = getOutgoingEdges(context, run.id, 'EXECUTED_BY')
        .map((edge) => getNodeById(context, edge.to))
        .filter((node): node is NonNullable<typeof node> => node !== undefined)
        .filter((node) => node.type === 'agent')
        .map((node) => node.id)
      return {
        runId: run.metadata.runId,
        status: run.metadata.status ?? 'unknown',
        agentIds: unique(agentIds),
        evidenceRefs: unique(run.evidenceRefs)
      }
    })
    const changedFiles = unique(getNodesByType(context, 'file').map((file) => file.metadata.path))
    const results = getNodesByType(context, 'test_result')
    const packages = getNodesByType(context, 'review_package')
    const requested = packages.filter((review) => review.metadata.status === 'requested').length
    const completed = packages.filter((review) => review.metadata.status === 'completed').length
    const testResults = {
      passed: results.filter((result) => result.metadata.status === 'passed').length,
      failed: results.filter((result) => result.metadata.status === 'failed').length,
      skipped: results.filter((result) => result.metadata.status === 'skipped').length
    }
    return {
      projectId,
      taskId: task.metadata.taskId,
      taskNodeId: task.id,
      lifecycle: task.metadata.status ?? 'unknown',
      runs,
      changedFiles,
      testResults,
      reviews: { requested, completed },
      observedSignals: {
        failedTest: testResults.failed > 0,
        failedRun: runs.some((run) => run.status === 'failed'),
        reviewRequested: requested > 0
      },
      evidenceRefs: unique([
        ...context.nodes.flatMap((node) => node.evidenceRefs),
        ...context.edges.flatMap((edge) => edge.evidenceRefs)
      ]),
      lastObservedAt: context.nodes.reduce(
        (latest, node) => (node.updatedAt > latest ? node.updatedAt : latest),
        task.updatedAt
      )
    }
  })

  return {
    projectId,
    tasks,
    summary: {
      total: tasks.length,
      unknown: tasks.filter((task) => task.lifecycle === 'unknown').length,
      started: tasks.filter((task) => task.lifecycle === 'started').length,
      completed: tasks.filter((task) => task.lifecycle === 'completed').length,
      withRequestedReviews: tasks.filter((task) => task.observedSignals.reviewRequested).length,
      withFailedTests: tasks.filter((task) => task.observedSignals.failedTest).length,
      withFailedRuns: tasks.filter((task) => task.observedSignals.failedRun).length
    }
  }
}
