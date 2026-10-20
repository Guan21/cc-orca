/** Main-only fixed reads. No transport, consent, IPC or credential authority is installed here. */
import {
  projectSelectedGitHubPrResponse,
  type SelectedGitHubPrProjection,
  type SelectedGitHubPrScope
} from '../../shared/github/selected-pr-graphql-projection'
import type { MainVerifiedRepositoryIdentity } from './project-source-main-repository-registration'

// Public schema documentation reviewed; authenticated schema and Checks ACLs remain NOT VERIFIED.
export const GITHUB_REGISTRATION_QUERY = `query RepositoryRegistration($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id databaseId nameWithOwner }
}`

export const GITHUB_SELECTED_PR_QUERY = `query SelectedPrRead($repositoryId: ID!, $prNumber: Int!) {
  node(id: $repositoryId) { ... on Repository {
    id databaseId nameWithOwner
    pullRequest(number: $prNumber) {
      id number state merged headRefOid updatedAt
      headRepository { id databaseId nameWithOwner }
      commits(last: 1) { nodes { commit {
        oid repository { id databaseId nameWithOwner }
        checkSuites(first: 10) {
          totalCount pageInfo { hasNextPage }
          nodes {
            id databaseId commit { oid } repository { id databaseId nameWithOwner }
            checkRuns(first: 8, filterBy: { checkType: ALL }) {
              totalCount pageInfo { hasNextPage }
              nodes {
                id databaseId status conclusion
                repository { id databaseId nameWithOwner }
                checkSuite { id }
              }
            }
          }
        }
      } } }
    }
  } }
}`

export type RegistrationExpectation = Readonly<{
  owner: string
  name: string
  principalId: string
  credentialGeneration: number
  expectedIdentity?: Readonly<{ id: number; nodeId: string }>
}>

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return null
  }
  if (!Object.values(Object.getOwnPropertyDescriptors(value)).every((x) => 'value' in x)) {
    return null
  }
  return value as RecordValue
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value)
}

function nodeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_+/=-]{1,256}$/.test(value)
}

function namePart(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)
}

export function repositoryRegistrationVariables(
  repository: Readonly<{ owner: string; name: string }>
): Readonly<{ owner: string; name: string }> | null {
  return repository && namePart(repository.owner) && namePart(repository.name)
    ? Object.freeze({ owner: repository.owner, name: repository.name })
    : null
}

export function selectedPrVariables(
  selected: SelectedGitHubPrScope,
  expectedHeadSha: string
): Readonly<{ repositoryId: string; prNumber: number }> | null {
  const repository = selected?.source?.repository
  if (
    !repository ||
    repository.host !== 'github.com' ||
    !positive(repository.id) ||
    !repositoryRegistrationVariables(repository) ||
    !nodeId(selected.repositoryNodeId) ||
    !positive(selected.prNumber) ||
    selected.prNumber > 2_147_483_647 ||
    typeof expectedHeadSha !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(expectedHeadSha)
  ) {
    return null
  }
  return Object.freeze({ repositoryId: selected.repositoryNodeId, prNumber: selected.prNumber })
}

export function parseRepositoryRegistrationResponse(
  input: unknown,
  expected: RegistrationExpectation
): MainVerifiedRepositoryIdentity | null {
  if (
    !repositoryRegistrationVariables(expected) ||
    !bounded(expected.principalId) ||
    !Number.isSafeInteger(expected.credentialGeneration) ||
    expected.credentialGeneration < 0
  ) {
    return null
  }
  const response = record(input)
  if (!response || response.errors !== undefined) {
    return null
  }
  const repository = record(record(response.data)?.repository)
  if (
    !repository ||
    !positive(repository.databaseId) ||
    !nodeId(repository.id) ||
    typeof repository.nameWithOwner !== 'string' ||
    repository.nameWithOwner.toLowerCase() !== `${expected.owner}/${expected.name}`.toLowerCase() ||
    (expected.expectedIdentity &&
      (repository.databaseId !== expected.expectedIdentity.id ||
        repository.id !== expected.expectedIdentity.nodeId))
  ) {
    return null
  }
  return Object.freeze({
    host: 'github.com',
    id: repository.databaseId,
    nodeId: repository.id,
    nameWithOwner: repository.nameWithOwner,
    principalId: expected.principalId,
    credentialGeneration: expected.credentialGeneration
  })
}

function sameRepository(value: unknown, selected: SelectedGitHubPrScope): boolean {
  const repository = record(value)
  const expected = selected.source.repository
  return (
    repository?.id === selected.repositoryNodeId &&
    repository?.databaseId === expected.id &&
    typeof repository.nameWithOwner === 'string' &&
    repository.nameWithOwner.toLowerCase() === `${expected.owner}/${expected.name}`.toLowerCase()
  )
}

function completeCount(value: RecordValue, nodes: unknown[]): boolean {
  return Number.isSafeInteger(value.totalCount) && value.totalCount === nodes.length
}

/** Reuse #157 facts; additional guards attest only response linkage, never actual ACL completeness. */
export function parseSelectedPrResponse(
  input: unknown,
  selected: SelectedGitHubPrScope,
  expectedHeadSha: string,
  nowMs: number
): SelectedGitHubPrProjection {
  if (!selectedPrVariables(selected, expectedHeadSha)) {
    return { status: 'invalid' }
  }
  const projected = projectSelectedGitHubPrResponse(input, selected, nowMs)
  if (projected.status !== 'ready') {
    return projected
  }
  const repository = record(record(record(input)?.data)?.node)
  const pr = record(repository?.pullRequest)
  const commits = record(pr?.commits)?.nodes as unknown[]
  const commit = record(record(commits[0])?.commit)
  if (
    !nodeId(pr?.id) ||
    typeof pr?.headRefOid !== 'string' ||
    pr.headRefOid.toLowerCase() !== expectedHeadSha.toLowerCase() ||
    !sameRepository(pr.headRepository, selected) ||
    !sameRepository(commit?.repository, selected)
  ) {
    return { status: 'scope_mismatch' }
  }
  const suites = record(commit?.checkSuites)!
  const suiteNodes = suites.nodes as unknown[]
  if (!completeCount(suites, suiteNodes)) {
    return { status: 'incomplete' }
  }
  if (suiteNodes.length === 0) {
    return { status: 'unavailable' }
  }
  const suiteIds = new Set<string>()
  const suiteDatabaseIds = new Set<number>()
  const runIds = new Set<string>()
  const runDatabaseIds = new Set<number>()
  for (const item of suiteNodes) {
    const suite = record(item)!
    if (
      !nodeId(suite.id) ||
      !positive(suite.databaseId) ||
      suiteIds.has(suite.id) ||
      suiteDatabaseIds.has(suite.databaseId) ||
      !sameRepository(suite.repository, selected)
    ) {
      return { status: 'invalid' }
    }
    suiteIds.add(suite.id)
    suiteDatabaseIds.add(suite.databaseId)
    const runs = record(suite.checkRuns)!
    const runNodes = runs.nodes as unknown[]
    if (!completeCount(runs, runNodes)) {
      return { status: 'incomplete' }
    }
    if (runNodes.length === 0) {
      return { status: 'unavailable' }
    }
    for (const item of runNodes) {
      const run = record(item)!
      if (
        !nodeId(run.id) ||
        !positive(run.databaseId) ||
        runIds.has(run.id) ||
        runDatabaseIds.has(run.databaseId) ||
        record(run.checkSuite)?.id !== suite.id ||
        !sameRepository(run.repository, selected)
      ) {
        return { status: 'invalid' }
      }
      runIds.add(run.id)
      runDatabaseIds.add(run.databaseId)
    }
  }
  return projected
}
