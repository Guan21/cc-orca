import { describe, expect, it } from 'vitest'
import { selectedPrFactsView, type SelectedPrUiState } from './selected-pr-facts-view'
import type { GitHubProjectFactScope } from '../../../../shared/github/project-facts-read-model'

const NOW = Date.parse('2026-10-21T12:01:00Z')
const HEAD = 'a'.repeat(40)
const OTHER_HEAD = 'b'.repeat(40)
const scope: GitHubProjectFactScope = {
  projectId: 'p',
  bindingRevision: 5,
  repository: { host: 'github.com', id: 1001, owner: 'Team', name: 'service' }
}
function snapshot(facts: unknown[] = [
  { kind: 'pull_request', number: 12, headSha: HEAD, state: 'open', updatedAt: '2026-10-21T11:59:00Z' },
  { kind: 'commit', sha: HEAD },
  { kind: 'check_run', id: 80, headSha: HEAD, status: 'in_progress', conclusion: null }
]): unknown {
  return {
    version: 1,
    projectId: scope.projectId,
    bindingRevision: scope.bindingRevision,
    repository: scope.repository,
    fetchedAt: '2026-10-21T12:00:00Z',
    facts
  }
}
function delivered(value: unknown = snapshot(), patch: Record<string, unknown> = {}): SelectedPrUiState {
  return {
    status: 'ready',
    snapshot: value,
    expected: { scope, prNumber: 12, headSha: HEAD },
    nowMs: NOW,
    ...patch
  } as SelectedPrUiState
}
describe('B5b selected PR presentation boundary', () => {
  it('never shows facts when disabled, denied, offline, loading or unavailable', () => {
    for (const status of ['disabled', 'not_selected', 'loading', 'denied', 'incomplete', 'stale', 'rate_limited', 'unavailable', 'error', 'offline'] as const) {
      expect(selectedPrFactsView({ status })).toEqual({ status })
    }
  })

  it('projects a single matching PR, commit and observed check without inventing task or CI success', () => {
    const result = selectedPrFactsView(delivered())
    expect(result).toEqual({
      status: 'ready',
      repository: 'Team/service',
      projectId: 'p',
      pr: { kind: 'pull_request', number: 12, headSha: HEAD, state: 'open', updatedAt: '2026-10-21T11:59:00Z' },
      commitSha: HEAD,
      checks: [{ kind: 'check_run', id: 80, headSha: HEAD, status: 'in_progress', conclusion: null }],
      fetchedAt: '2026-10-21T12:00:00Z'
    })
    expect(JSON.stringify(result)).not.toContain('taskCompletion')
  })

  it('rejects mismatched Project, Repo, Revision, PR and HEAD without rendering prior facts', () => {
    for (const patch of [
      { projectId: 'other' },
      { bindingRevision: 4 },
      { repository: { ...scope.repository, id: 999 } }
    ]) {
      expect(selectedPrFactsView(delivered({ ...(snapshot() as object), ...patch }))).toEqual({ status: 'unavailable' })
    }
    expect(selectedPrFactsView(delivered(snapshot(), { expected: { scope, prNumber: 13, headSha: HEAD } }))).toEqual({ status: 'incomplete' })
    expect(selectedPrFactsView(delivered(snapshot(), { expected: { scope, prNumber: 12, headSha: OTHER_HEAD } }))).toEqual({ status: 'incomplete' })
  })

  it('rejects stale, empty, malformed and partial PR/commit evidence', () => {
    expect(selectedPrFactsView(delivered(snapshot(), { nowMs: NOW + 6 * 60_000 }))).toEqual({ status: 'stale' })
    expect(selectedPrFactsView(delivered(snapshot([])))).toEqual({ status: 'incomplete' })
    expect(selectedPrFactsView(delivered({ ...snapshot() as object, facts: [{ kind: 'commit', sha: HEAD }] }))).toEqual({ status: 'incomplete' })
    expect(selectedPrFactsView(delivered({ ...snapshot() as object, facts: [{ kind: 'pull_request', number: 12, headSha: HEAD, state: 'open', updatedAt: '2026-10-21T11:59:00Z' }] }))).toEqual({ status: 'incomplete' })
    expect(selectedPrFactsView(delivered({ ...snapshot() as object, facts: [{ kind: 'check_run', id: 80, status: 'completed', conclusion: 'success', headSha: 'bad' }] }))).toEqual({ status: 'unavailable' })
    expect(selectedPrFactsView(delivered(null))).toEqual({ status: 'unavailable' })
  })

  it('rejects a cross-HEAD check even when the check is individually well-formed', () => {
    const facts = (snapshot() as { facts: Record<string, unknown>[] }).facts
    expect(selectedPrFactsView(delivered(snapshot([
      ...facts.slice(0, 2),
      { kind: 'check_run', id: 80, headSha: OTHER_HEAD, status: 'completed', conclusion: 'success' }
    ])))).toEqual({ status: 'incomplete' })
  })

  it('does not upgrade missing check evidence into an all-green CI claim', () => {
    const facts = (snapshot() as { facts: Record<string, unknown>[] }).facts
    const result = selectedPrFactsView(delivered(snapshot(facts.slice(0, 2))))
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.checks).toEqual([])
    }
  })
})
