import {
  projectGitHubFacts,
  type GitHubFact,
  type GitHubProjectFactScope
} from '../../../../shared/github/project-facts-read-model'

export type SelectedPrUiStatus =
  | 'disabled'
  | 'not_selected'
  | 'loading'
  | 'denied'
  | 'incomplete'
  | 'stale'
  | 'rate_limited'
  | 'unavailable'
  | 'error'
  | 'offline'

export type SelectedPrUiState =
  | Readonly<{ status: SelectedPrUiStatus }>
  | Readonly<{
      status: 'ready'
      /** Future B5c Main-delivered, document-fenced evidence only. Never renderer session data. */
      snapshot: unknown
      /** Main-pinned expected selection: never derived from arbitrary snapshot fields. */
      expected: Readonly<{
        scope: GitHubProjectFactScope
        prNumber: number
        headSha: string
      }>
      nowMs: number
    }>

type PullRequestFact = Extract<GitHubFact, { kind: 'pull_request' }>
type CheckFact = Extract<GitHubFact, { kind: 'check_run' }>

export type SelectedPrFactsView =
  | Readonly<{ status: SelectedPrUiStatus }>
  | Readonly<{
      status: 'ready'
      repository: string
      projectId: string
      pr: PullRequestFact
      commitSha: string
      checks: readonly CheckFact[]
      fetchedAt: string
    }>

const MAX_AGE_MS = 5 * 60_000
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i

/**
 * Presentation-only projection. This function cannot establish provenance,
 * consent or authorization; B5c must guard every fact delivery in Main.
 */
export function selectedPrFactsView(state: SelectedPrUiState): SelectedPrFactsView {
  if (state.status !== 'ready') {
    return { status: state.status }
  }

  const { expected } = state
  if (
    !expected ||
    !Number.isSafeInteger(expected.prNumber) ||
    expected.prNumber <= 0 ||
    typeof expected.headSha !== 'string' ||
    !SHA.test(expected.headSha)
  ) {
    return { status: 'unavailable' }
  }

  const result = projectGitHubFacts(state.snapshot, expected.scope, state.nowMs, MAX_AGE_MS)
  if (result.status === 'stale') {
    return { status: 'stale' }
  }
  if (result.status === 'empty') {
    return { status: 'incomplete' }
  }
  if (result.status !== 'ready') {
    return { status: 'unavailable' }
  }

  const facts = result.snapshot.facts
  const prs = facts.filter((fact): fact is PullRequestFact => fact.kind === 'pull_request')
  const commits = facts.filter((fact) => fact.kind === 'commit')
  const checks = facts.filter((fact): fact is CheckFact => fact.kind === 'check_run')
  const head = expected.headSha.toLowerCase()
  if (
    prs.length !== 1 ||
    prs[0].number !== expected.prNumber ||
    prs[0].headSha !== head ||
    commits.length !== 1 ||
    commits[0].sha !== head ||
    checks.some((check) => check.headSha !== head)
  ) {
    return { status: 'incomplete' }
  }

  return {
    status: 'ready',
    repository: `${result.snapshot.repository.owner}/${result.snapshot.repository.name}`,
    projectId: result.snapshot.projectId,
    pr: prs[0],
    commitSha: head,
    checks,
    fetchedAt: result.snapshot.fetchedAt
  }
}
