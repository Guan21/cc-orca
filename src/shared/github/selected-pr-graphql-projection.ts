/**
 * #116 G2-B: PURE, offline-only adapter for the proposed fixed GraphQL read.
 *
 * A validated GraphQL-shaped object is not authenticated evidence. Electron
 * Main must independently establish the GitHub principal, repository binding,
 * current document/session grant and provenance before this can be used.
 * This module never performs I/O, grants access or infers Agent/Task execution.
 */
import {
  GITHUB_FACT_SNAPSHOT_VERSION,
  projectGitHubFacts,
  type GitHubFact,
  type GitHubFactSnapshot,
  type GitHubProjectFactScope
} from './project-facts-read-model'

export type SelectedGitHubPrScope = Readonly<{
  source: GitHubProjectFactScope
  repositoryNodeId: string
  prNumber: number
}>

export type SelectedGitHubPrProjection =
  | { status: 'ready'; snapshot: GitHubFactSnapshot }
  | { status: 'incomplete' | 'invalid' | 'scope_mismatch' | 'unavailable' | 'stale' }

type JsonRecord = Record<string, unknown>
type CheckFact = Extract<GitHubFact, { kind: 'check_run' }>
type CheckStatus = CheckFact['status']
type CheckConclusion = CheckFact['conclusion']

const STATUSES = [
  'WAITING',
  'REQUESTED',
  'PENDING',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETED'
] as const
const CONCLUSIONS = [
  'SUCCESS',
  'FAILURE',
  'NEUTRAL',
  'CANCELLED',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'SKIPPED',
  'STALE',
  'STARTUP_FAILURE'
] as const

function record(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  if (!Object.values(Object.getOwnPropertyDescriptors(value)).every((x) => 'value' in x)) {
    return null
  }
  return value as JsonRecord
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function hexSha(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)
}

function status(value: unknown): CheckStatus | null {
  if (typeof value !== 'string' || !STATUSES.some((candidate) => candidate === value)) {
    return null
  }
  return value.toLowerCase() as CheckStatus
}

function conclusion(value: unknown): CheckConclusion | undefined {
  if (value === null) return null
  if (typeof value !== 'string' || !CONCLUSIONS.some((candidate) => candidate === value)) {
    return undefined
  }
  return value.toLowerCase() as Exclude<CheckConclusion, null>
}

function connection(value: unknown, max: number): JsonRecord[] | 'incomplete' | null {
  const candidate = record(value)
  const page = record(candidate?.pageInfo)
  const rawNodes = candidate?.nodes
  if (!page || typeof page.hasNextPage !== 'boolean' || !Array.isArray(rawNodes)) {
    return null
  }
  if (page.hasNextPage || rawNodes.length > max) return 'incomplete'
  const nodes: JsonRecord[] = []
  for (const item of rawNodes) {
    const node = record(item)
    if (!node) return null
    nodes.push(node)
  }
  return nodes
}

function sameRepoId(value: unknown, expected: number): boolean {
  return record(value)?.databaseId === expected
}

/**
 * Normalize only bounded, explicitly selected GitHub PR facts. The caller
 * supplies fetchedAt from trusted Main time, never from a renderer/API body.
 *
 * 'incomplete' means pagination/limit exceeded, never "all checks passed".
 * No API error message, unexpected field, title, body or URL is returned.
 */
export function projectSelectedGitHubPrResponse(
  input: unknown,
  selected: SelectedGitHubPrScope,
  nowMs: number
): SelectedGitHubPrProjection {
  const scope = selected?.source
  if (
    !scope ||
    scope.repository.host.toLowerCase() !== 'github.com' ||
    !positive(scope.repository.id) ||
    !positive(selected.prNumber) ||
    typeof selected.repositoryNodeId !== 'string' ||
    selected.repositoryNodeId.length < 1 ||
    selected.repositoryNodeId.length > 256 ||
    !Number.isFinite(nowMs) ||
    Math.abs(nowMs) > 8.64e15
  ) {
    return { status: 'invalid' }
  }

  const response = record(input)
  if (!response || response.errors !== undefined) return { status: 'invalid' }
  const data = record(response.data)
  if (!data) return { status: 'invalid' }
  if (data.node === null) return { status: 'unavailable' }
  const repository = record(data.node)
  if (!repository) return { status: 'invalid' }
  if (
    repository.id !== selected.repositoryNodeId ||
    repository.databaseId !== scope.repository.id ||
    typeof repository.nameWithOwner !== 'string' ||
    repository.nameWithOwner.toLowerCase() !==
      (scope.repository.owner + '/' + scope.repository.name).toLowerCase()
  ) {
    return { status: 'scope_mismatch' }
  }

  if (repository.pullRequest === null) return { status: 'unavailable' }
  const pr = record(repository.pullRequest)
  const head = pr?.headRefOid
  if (
    !pr ||
    pr.number !== selected.prNumber ||
    !hexSha(head) ||
    typeof pr.updatedAt !== 'string' ||
    !sameRepoId(pr.headRepository, scope.repository.id)
  ) {
    return { status: 'invalid' }
  }
  if (
    !(
      (pr.state === 'OPEN' && pr.merged === false) ||
      (pr.state === 'CLOSED' && pr.merged === false) ||
      (pr.state === 'MERGED' && pr.merged === true)
    )
  ) {
    return { status: 'invalid' }
  }

  // The frozen GraphQL query requests commits(last: 1) with nodes, but no pageInfo.
  const commitConnection = record(pr.commits)
  const commitNodes = commitConnection?.nodes
  if (!Array.isArray(commitNodes) || commitNodes.length !== 1) {
    return { status: 'invalid' }
  }
  const commitNode = record(commitNodes[0])
  const commit = record(commitNode?.commit)
  if (!commit || !hexSha(commit.oid) || commit.oid.toLowerCase() !== head.toLowerCase()) {
    return { status: 'invalid' }
  }

  const suites = connection(commit.checkSuites, 10)
  if (suites === 'incomplete') return { status: 'incomplete' }
  if (!suites) return { status: 'invalid' }

  const facts: GitHubFact[] = [
    {
      kind: 'pull_request',
      number: selected.prNumber,
      headSha: head,
      state: pr.state === 'MERGED' ? 'merged' : pr.state === 'OPEN' ? 'open' : 'closed',
      updatedAt: pr.updatedAt
    },
    { kind: 'commit', sha: head }
  ]
  for (const suite of suites) {
    const suiteCommit = record(suite.commit)
    if (
      !hexSha(suiteCommit?.oid) ||
      suiteCommit.oid.toLowerCase() !== head.toLowerCase() ||
      !sameRepoId(suite.repository, scope.repository.id)
    ) {
      return { status: 'invalid' }
    }
    const runs = connection(suite.checkRuns, 8)
    if (runs === 'incomplete') return { status: 'incomplete' }
    if (!runs) return { status: 'invalid' }
    for (const run of runs) {
      const runStatus = status(run.status)
      const runConclusion = conclusion(run.conclusion)
      if (
        !positive(run.databaseId) ||
        !runStatus ||
        runConclusion === undefined ||
        !sameRepoId(run.repository, scope.repository.id)
      ) {
        return { status: 'invalid' }
      }
      facts.push({
        kind: 'check_run',
        id: run.databaseId,
        headSha: head,
        status: runStatus,
        conclusion: runConclusion
      })
    }
  }

  const projection = projectGitHubFacts(
    {
      version: GITHUB_FACT_SNAPSHOT_VERSION,
      projectId: scope.projectId,
      bindingRevision: scope.bindingRevision,
      repository: scope.repository,
      fetchedAt: new Date(nowMs).toISOString(),
      facts
    },
    scope,
    nowMs,
    5 * 60_000
  )
  if (projection.status === 'ready') return projection
  return { status: projection.status === 'empty' ? 'invalid' : projection.status }
}
