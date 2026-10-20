import { describe, expect, it } from 'vitest'
import {
  GITHUB_REGISTRATION_QUERY,
  GITHUB_SELECTED_PR_QUERY,
  parseRepositoryRegistrationResponse,
  parseSelectedPrResponse,
  repositoryRegistrationVariables,
  selectedPrVariables
} from './project-source-native-operations'

const HEAD = 'a'.repeat(40)
const repo = { id: 'R_1', databaseId: 321, nameWithOwner: 'Acme/Repo' }
const account = { owner: 'Acme', name: 'Repo', principalId: 'user:1', credentialGeneration: 2 }
const selected = {
  source: {
    projectId: 'p',
    bindingRevision: 3,
    repository: { host: 'github.com', id: 321, owner: 'Acme', name: 'Repo' }
  },
  repositoryNodeId: 'R_1',
  prNumber: 42
}
function fixture() {
  return {
    data: {
      node: {
        ...repo,
        pullRequest: {
          id: 'PR_42',
          number: 42,
          state: 'OPEN',
          merged: false,
          headRefOid: HEAD,
          updatedAt: '2026-10-18T00:00:00Z',
          headRepository: { ...repo },
          commits: {
            nodes: [
              {
                commit: {
                  oid: HEAD,
                  repository: { ...repo },
                  checkSuites: {
                    totalCount: 1,
                    pageInfo: { hasNextPage: false },
                    nodes: [
                      {
                        id: 'CS_1',
                        databaseId: 71,
                        commit: { oid: HEAD },
                        repository: { ...repo },
                        checkRuns: {
                          totalCount: 1,
                          pageInfo: { hasNextPage: false },
                          nodes: [
                            {
                              id: 'CR_1',
                              databaseId: 99,
                              status: 'COMPLETED',
                              conclusion: 'SUCCESS',
                              repository: { ...repo },
                              checkSuite: { id: 'CS_1' }
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
const parse = (input: unknown) =>
  parseSelectedPrResponse(input, selected, HEAD, Date.parse('2026-10-18T00:00:01Z'))

describe('fixed native GraphQL operations', () => {
  it('builds only fixed read operations and strictly validated variables', () => {
    expect(GITHUB_REGISTRATION_QUERY).toContain('query RepositoryRegistration')
    expect(GITHUB_SELECTED_PR_QUERY).toContain('query SelectedPrRead')
    expect(GITHUB_SELECTED_PR_QUERY).not.toMatch(/mutation|\$query|\$endpoint/)
    expect(repositoryRegistrationVariables(account)).toEqual({ owner: 'Acme', name: 'Repo' })
    expect(selectedPrVariables(selected, HEAD)).toEqual({ repositoryId: 'R_1', prNumber: 42 })
  })
  it.each(['x/y', '-bad', 'a\n', '', 'x'.repeat(101)])(
    'refuses invalid repository names: %s',
    (name) => {
      expect(repositoryRegistrationVariables({ ...account, name })).toBeNull()
    }
  )
  it('rejects invalid selection, endpoint and SHA inputs', () => {
    expect(selectedPrVariables({ ...selected, prNumber: 0 }, HEAD)).toBeNull()
    expect(
      selectedPrVariables(
        {
          ...selected,
          source: {
            ...selected.source,
            repository: { ...selected.source.repository, host: 'evil.test' }
          }
        },
        HEAD
      )
    ).toBeNull()
    expect(selectedPrVariables(selected, 'not-a-sha')).toBeNull()
  })
  it('registers only allowlisted immutable repository identity and current principal', () => {
    const value = parseRepositoryRegistrationResponse(
      { data: { repository: { ...repo, token: 'secret' } } },
      account
    )
    expect(value).toEqual({
      host: 'github.com',
      id: 321,
      nodeId: 'R_1',
      nameWithOwner: 'Acme/Repo',
      principalId: 'user:1',
      credentialGeneration: 2
    })
    expect(Object.isFrozen(value)).toBe(true)
  })
  it.each([
    { id: 4, nodeId: 'R_1' },
    { id: 321, nodeId: 'R_other' }
  ])('rejects changed registered IDs', (expectedIdentity) => {
    expect(
      parseRepositoryRegistrationResponse(
        { data: { repository: repo } },
        { ...account, expectedIdentity }
      )
    ).toBeNull()
  })
  it('rejects malformed principal and credential generations', () => {
    const input = { data: { repository: repo } }
    expect(parseRepositoryRegistrationResponse(input, { ...account, principalId: '' })).toBeNull()
    expect(
      parseRepositoryRegistrationResponse(input, { ...account, credentialGeneration: -1 })
    ).toBeNull()
    expect(
      parseRepositoryRegistrationResponse(input, { ...account, credentialGeneration: Number.NaN })
    ).toBeNull()
  })
  it('rejects accessors without invoking untrusted response properties', () => {
    let reads = 0
    const input = Object.defineProperty({}, 'data', {
      get() {
        reads += 1
        return { repository: repo }
      }
    })
    expect(parseRepositoryRegistrationResponse(input, account)).toBeNull()
    expect(parse(input).status).toBe('invalid')
    expect(reads).toBe(0)
  })
  it.each([
    null,
    {},
    { errors: [] },
    { data: { repository: null } },
    { data: { repository: { ...repo, nameWithOwner: 'Other/Repo' } } }
  ])('rejects unavailable/partial registration', (value) => {
    expect(parseRepositoryRegistrationResponse(value, account)).toBeNull()
  })
  it('reuses projection facts without exposing raw fields or claiming task completion', () => {
    const value = parse(fixture())
    expect(value.status).toBe('ready')
    expect(value).toMatchObject({
      snapshot: { agentExecution: 'unknown', taskCompletion: 'unknown' }
    })
    expect(JSON.stringify(value)).not.toContain('CS_1')
  })
  it('rejects different PR, HEAD, repository and run-to-suite identity', () => {
    const input = fixture()
    input.data.node.pullRequest.number = 43
    expect(parse(input).status).not.toBe('ready')
    input.data.node.pullRequest.number = 42
    input.data.node.pullRequest.headRefOid = 'b'.repeat(40)
    expect(parse(input).status).not.toBe('ready')
    const raw = fixture()
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.nodes[0].checkSuite.id =
      'CS_other'
    expect(parse(raw).status).not.toBe('ready')
    const other = fixture()
    other.data.node.pullRequest.headRepository.id = 'R_other'
    expect(parse(other).status).not.toBe('ready')
  })
  it('rejects null, partial errors and incomplete pagination', () => {
    expect(parse({ ...fixture(), errors: [{ message: 'sensitive token' }] })).toEqual({
      status: 'invalid'
    })
    expect(parse({ data: { node: null } }).status).not.toBe('ready')
    const raw = fixture()
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.pageInfo.hasNextPage = true
    expect(parse(raw).status).toBe('incomplete')
  })
  it('does not turn hidden/empty checks or count mismatch into success', () => {
    const raw = fixture()
    raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns.nodes = []
    expect(parse(raw).status).not.toBe('ready')
    const empty = fixture()
    empty.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes = []
    empty.data.node.pullRequest.commits.nodes[0].commit.checkSuites.totalCount = 0
    expect(parse(empty).status).toBe('unavailable')
  })
  it('rejects duplicate suite/run IDs and over-capacity responses', () => {
    const raw = fixture()
    const suites = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites
    suites.nodes.push(structuredClone(suites.nodes[0]))
    suites.totalCount = 2
    expect(parse(raw).status).not.toBe('ready')
    suites.nodes = Array.from({ length: 11 }, () => structuredClone(suites.nodes[0]))
    suites.totalCount = 11
    expect(parse(raw).status).toBe('incomplete')
  })
  it('rejects check run duplicates, missing identities and over-capacity run sets', () => {
    const raw = fixture()
    const runs = raw.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].checkRuns
    runs.nodes.push(structuredClone(runs.nodes[0]))
    runs.totalCount = 2
    expect(parse(raw).status).not.toBe('ready')
    runs.nodes = Array.from({ length: 9 }, () => structuredClone(runs.nodes[0]))
    runs.totalCount = 9
    expect(parse(raw).status).toBe('incomplete')
    const missing = fixture()
    missing.data.node.pullRequest.commits.nodes[0].commit.checkSuites.nodes[0].id = ''
    expect(parse(missing).status).not.toBe('ready')
  })
})
