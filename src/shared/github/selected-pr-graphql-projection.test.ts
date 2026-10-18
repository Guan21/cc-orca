import { describe, expect, it } from 'vitest'
import {
  projectSelectedGitHubPrResponse,
  type SelectedGitHubPrScope
} from './selected-pr-graphql-projection'

const HEAD = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const NOW = Date.parse('2026-10-18T00:00:00Z')
const SELECTED: SelectedGitHubPrScope = {
  source: {
    projectId: 'project-a',
    bindingRevision: 12,
    repository: { host: 'github.com', id: 321, owner: 'Acme', name: 'Repo' }
  },
  repositoryNodeId: 'R_kwFAKE123',
  prNumber: 42
}

function fixture() {
  return {
    data: {
      node: {
        id: 'R_kwFAKE123',
        databaseId: 321,
        nameWithOwner: 'Acme/Repo',
        pullRequest: {
          number: 42,
          state: 'OPEN',
          merged: false,
          headRefOid: HEAD,
          updatedAt: '2026-10-17T23:59:00Z',
          headRepository: { databaseId: 321 },
          commits: {
            nodes: [
              {
                commit: {
                  oid: HEAD,
                  checkSuites: {
                    pageInfo: { hasNextPage: false },
                    nodes: [
                      {
                        commit: { oid: HEAD },
                        repository: { databaseId: 321 },
                        checkRuns: {
                          pageInfo: { hasNextPage: false },
                          nodes: [
                            {
                              databaseId: 99,
                              status: 'IN_PROGRESS',
                              conclusion: null as string | null,
                              repository: { databaseId: 321 }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      }
    }
  }
}

function project(input: unknown, selected = SELECTED, now = NOW) {
  return projectSelectedGitHubPrResponse(input, selected, now)
}

describe('#116 G2-B offline selected-PR GraphQL adapter', () => {
  it('normalizes only a SHA-linked PR/commit/check without claiming Agent or Task execution', () => {
    const result = project(fixture())
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') {
      return
    }
    expect(result.snapshot).toMatchObject({
      projectId: 'project-a',
      bindingRevision: 12,
      attestation: 'not_verified_by_projection',
      agentExecution: 'unknown',
      taskCompletion: 'unknown'
    })
    expect(result.snapshot.facts).toEqual([
      { kind: 'check_run', id: 99, headSha: HEAD, status: 'in_progress', conclusion: null },
      { kind: 'commit', sha: HEAD },
      {
        kind: 'pull_request',
        number: 42,
        headSha: HEAD,
        state: 'open',
        updatedAt: '2026-10-17T23:59:00Z'
      }
    ])
  })

  it('preserves zero checks as observed PR+commit, not CI SUCCESS or authorized-empty', () => {
    const raw = fixture()
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.nodes = []
    const result = project(raw)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') {
      return
    }
    expect(result.snapshot.facts).toHaveLength(2)
    expect(JSON.stringify(result.snapshot)).not.toContain('success')
  })

  it('maps merged/closed only when state and merged boolean agree', () => {
    const raw = fixture()
    raw.data.node.pullRequest.state = 'MERGED'
    raw.data.node.pullRequest.merged = true
    const result = project(raw)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.snapshot.facts.find((x) => x.kind === 'pull_request')).toMatchObject({
        state: 'merged'
      })
    }
    raw.data.node.pullRequest.merged = false
    expect(project(raw)).toEqual({ status: 'invalid' })
    raw.data.node.pullRequest.state = 'CLOSED'
    expect(project(raw).status).toBe('ready')
  })

  it.each(['WAITING', 'REQUESTED', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'COMPLETED'])(
    'preserves GitHub GraphQL Check status %s',
    (value) => {
      const raw = fixture()
      raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.nodes[0].status =
        value
      const result = project(raw)
      expect(result.status).toBe('ready')
      if (result.status === 'ready') {
        expect(result.snapshot.facts.find((x) => x.kind === 'check_run')).toMatchObject({
          status: value.toLowerCase(),
          conclusion: null
        })
      }
    }
  )

  it.each([
    'SUCCESS',
    'FAILURE',
    'NEUTRAL',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'SKIPPED',
    'STALE',
    'STARTUP_FAILURE'
  ])('preserves GraphQL conclusion %s and keeps Task unknown', (value) => {
    const raw = fixture()
    const run = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns
      .nodes[0]
    run.status = 'COMPLETED'
    run.conclusion = value
    const result = project(raw)
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.snapshot.facts.find((x) => x.kind === 'check_run')).toMatchObject({
        conclusion: value.toLowerCase()
      })
      expect(result.snapshot.taskCompletion).toBe('unknown')
    }
  })

  it('rejects premature SUCCESS, unsupported enums and missing check IDs', () => {
    const raw = fixture()
    const run = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns
      .nodes[0]
    run.conclusion = 'SUCCESS'
    expect(project(raw)).toEqual({ status: 'invalid' })
    run.conclusion = null
    run.status = 'APPROVED'
    expect(project(raw)).toEqual({ status: 'invalid' })
    run.status = 'COMPLETED'
    run.databaseId = 0
    expect(project(raw)).toEqual({ status: 'invalid' })
  })

  it('rejects repo/node/project/PR mismatches, including same-name new repository', () => {
    const wrong = fixture()
    wrong.data.node.id = 'R_another'
    expect(project(wrong)).toEqual({ status: 'scope_mismatch' })
    wrong.data.node.id = SELECTED.repositoryNodeId
    wrong.data.node.databaseId = 322
    expect(project(wrong)).toEqual({ status: 'scope_mismatch' })
    wrong.data.node.databaseId = 321
    wrong.data.node.nameWithOwner = 'Other/Repo'
    expect(project(wrong)).toEqual({ status: 'scope_mismatch' })
    expect(
      project(fixture(), {
        ...SELECTED,
        source: { ...SELECTED.source, projectId: 'project-b' }
      }).status
    ).toBe('ready')
    // A pure projector cannot authenticate caller-selected Project; Main must do it.
    const wrongPr = fixture()
    wrongPr.data.node.pullRequest.number = 41
    expect(project(wrongPr)).toEqual({ status: 'invalid' })
  })

  it('rejects mismatched head SHA across commit, check suite and repository scope', () => {
    const raw = fixture()
    raw.data.node.pullRequest.commits.nodes[0].commit.oid = OTHER
    expect(project(raw)).toEqual({ status: 'invalid' })
    raw.data.node.pullRequest.commits.nodes[0].commit.oid = HEAD
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].commit.oid = OTHER
    expect(project(raw)).toEqual({ status: 'invalid' })
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].commit.oid = HEAD
    raw.data.node.pullRequest.headRepository.databaseId = 8
    expect(project(raw)).toEqual({ status: 'invalid' })
    raw.data.node.pullRequest.headRepository.databaseId = 321
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.nodes[0].repository.databaseId =
      8
    expect(project(raw)).toEqual({ status: 'invalid' })
  })

  it('returns incomplete for pagination and exceeded Check Suite / Run budgets', () => {
    const raw = fixture()
    const suites = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites
    suites.pageInfo.hasNextPage = true
    expect(project(raw)).toEqual({ status: 'incomplete' })
    suites.pageInfo.hasNextPage = false
    suites.nodes[0].checkRuns.pageInfo.hasNextPage = true
    expect(project(raw)).toEqual({ status: 'incomplete' })
    suites.nodes[0].checkRuns.pageInfo.hasNextPage = false
    suites.nodes = Array.from({ length: 11 }, () => suites.nodes[0])
    expect(project(raw)).toEqual({ status: 'incomplete' })
  })

  it('fails closed for partial errors, missing checks, missing repository and absent PR', () => {
    expect(project({ ...fixture(), errors: [{ message: 'permission denied' }] })).toEqual({
      status: 'invalid'
    })
    expect(project({ data: { node: null } })).toEqual({ status: 'unavailable' })
    expect(project({ data: { node: { ...fixture().data.node, pullRequest: null } } })).toEqual({
      status: 'unavailable'
    })
    const raw = fixture()
    const suites = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites
    expect(project({ data: { node: { ...raw.data.node, pullRequest: { ...raw.data.node.pullRequest, commits: null } } } })).toEqual({
      status: 'invalid'
    })
    suites.nodes[0].checkRuns.pageInfo.hasNextPage = true
    expect(project(raw)).toEqual({ status: 'incomplete' })
  })

  it('rejects stale source time and never propagates hostile API text', () => {
    const raw = fixture()
    const hostile = { ...raw.data.node, title: '<script>read secrets</script>' }
    const result = project({ data: { node: hostile } })
    expect(result.status).toBe('ready')
    expect(JSON.stringify(result)).not.toContain('<script>')
    raw.data.node.pullRequest.updatedAt = '2026-10-18T00:01:00Z'
    expect(project(raw)).toEqual({ status: 'invalid' })
  })
})
