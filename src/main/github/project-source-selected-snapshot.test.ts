import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectSourceNativeGhRunner } from '../git/command-runner/project-source-native-gh'
import { MainNativeGitHubPrincipal } from './project-source-native-principal'
import {
  MainNativeGitHubTransport,
  type MainNativeFixedReadRequest
} from './project-source-native-transport'
import {
  GITHUB_SELECTED_PR_QUERY,
  parseSelectedPrSnapshotResponse
} from './project-source-native-operations'

vi.mock('../git/command-runner/project-source-native-gh', () => ({
  createProjectSourceNativeGhRunner: vi.fn(),
  ProjectSourceNativeGhError: class extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  }
}))

const HEAD = 'b'.repeat(40)
const REPO = { id: 'R_1', databaseId: 123, nameWithOwner: 'acme/repo' }
const SCOPE = {
  source: {
    projectId: 'p',
    bindingRevision: 2,
    repository: { host: 'github.com', id: 123, owner: 'acme', name: 'repo' }
  },
  repositoryNodeId: 'R_1',
  prNumber: 42
}
function response() {
  const run = {
    id: 'CR_1',
    databaseId: 99,
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
    repository: REPO,
    checkSuite: { id: 'CS_1' }
  }
  const suite = {
    id: 'CS_1',
    databaseId: 71,
    commit: { oid: HEAD },
    repository: REPO,
    checkRuns: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [run] }
  }
  return {
    data: {
      node: {
        ...REPO,
        pullRequest: {
          id: 'PR_42',
          number: 42,
          state: 'OPEN',
          merged: false,
          headRefOid: HEAD,
          updatedAt: new Date().toISOString(),
          headRepository: REPO,
          commits: {
            nodes: [
              {
                commit: {
                  oid: HEAD,
                  repository: REPO,
                  checkSuites: { totalCount: 1, pageInfo: { hasNextPage: false }, nodes: [suite] }
                }
              }
            ]
          }
        }
      }
    }
  }
}
function fixture(enabled = true) {
  const principal = new MainNativeGitHubPrincipal(
    () => ({
      host: 'github.com',
      source: 'os-keyring',
      principalId: 'user:1',
      credentialGeneration: 2,
      configDir: '/offline',
      identityFingerprint: 'offline',
      policyReviewReceipt: 'offline',
      loginVerified: true
    }),
    vi.fn()
  )
  const executeRaw = vi.fn<(_request: MainNativeFixedReadRequest) => Promise<string>>(async () =>
    JSON.stringify(response())
  )
  const transport = new MainNativeGitHubTransport({
    enabled,
    principal,
    executeRaw,
    runner: {
      executable: { path: '', realPath: '', dev: 0, ino: 0, size: 0, mtimeMs: 0, sha256: '' },
      environment: {},
      runtime: () => ({ packaged: false, profile: 'development', execution: 'native' })
    }
  })
  const lease = {
    operation: 'selectedPrRead' as const,
    document: {
      profile: 'personal-packaged' as const,
      executionRealm: 'native' as const,
      installationId: 'installation',
      windowId: 1,
      webContentsId: 2,
      frameProcessId: 3,
      frameRoutingId: 4,
      documentId: 'doc',
      sessionPartition: 'session',
      principalId: 'user:1',
      credentialGeneration: 2
    },
    projectId: 'p',
    workspaceId: 'w',
    selectionRevision: 1,
    bindingRevision: 2,
    grantRevision: 3,
    sessionIncarnation: 'incarnation',
    actionId: 'action',
    expiresAtMs: Date.now() + 60_000,
    signal: new AbortController().signal,
    isCurrent: () => true,
    binding: {
      projectId: 'p',
      workspaceKind: 'worktree' as const,
      workspaceId: 'w',
      hostSetupId: 'setup',
      executionHostId: 'local',
      repository: {
        host: 'github.com' as const,
        id: 123,
        nodeId: 'R_1',
        owner: 'acme',
        name: 'repo'
      },
      prNumber: 42
    }
  }
  return { transport, executeRaw, lease }
}
afterEach(() => vi.useRealTimers())

describe('one-response selected PR snapshot', () => {
  it('derives HEAD from one strict, fully linked response without a supplied HEAD', () => {
    const result = parseSelectedPrSnapshotResponse(response(), SCOPE, Date.now())
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.snapshot.facts.find((fact) => fact.kind === 'pull_request')).toMatchObject({
        headSha: HEAD
      })
    }
  })
  it.each(['count', 'pagination', 'linkage', 'repository', 'partial', 'no-checks'])(
    'does not accept incomplete or mismatched %s evidence',
    (kind) => {
      const input = response()
      const commit = input.data.node.pullRequest.commits.nodes[0].commit
      if (kind === 'count') {
        commit.checkSuites.totalCount = 2
      }
      if (kind === 'pagination') {
        commit.checkSuites.pageInfo.hasNextPage = true
      }
      if (kind === 'linkage') {
        commit.oid = 'a'.repeat(40)
      }
      if (kind === 'repository') {
        input.data.node.databaseId = 999
      }
      if (kind === 'no-checks') {
        commit.checkSuites.totalCount = 0
        commit.checkSuites.nodes = []
      }
      const result = parseSelectedPrSnapshotResponse(
        kind === 'partial' ? { ...input, errors: [] } : input,
        SCOPE,
        Date.now()
      )
      expect(result.status).not.toBe('ready')
    }
  )
  it('calls only the injected fixed selected operation and never constructs a native runner', async () => {
    const f = fixture()
    expect((await f.transport.readSelectedSnapshot(f.lease)).status).toBe('ready')
    expect(f.executeRaw).toHaveBeenCalledOnce()
    expect(f.executeRaw.mock.calls[0][0]).toMatchObject({
      operation: 'selectedPrRead',
      query: GITHUB_SELECTED_PR_QUERY,
      variables: { repositoryId: 'R_1', prNumber: 42 }
    })
    expect(createProjectSourceNativeGhRunner).not.toHaveBeenCalled()
    expect(await f.transport.readSelectedSnapshot({ ...f.lease })).toEqual({ status: 'denied' })
    expect(f.executeRaw).toHaveBeenCalledOnce()
  })
  it('remains disabled without invoking the injected executor', async () => {
    const f = fixture(false)
    expect(await f.transport.readSelectedSnapshot(f.lease)).toEqual({ status: 'disabled' })
    expect(f.executeRaw).not.toHaveBeenCalled()
  })
  it('rejects cross-project and cross-workspace leases before reading', async () => {
    const f = fixture()
    expect(await f.transport.readSelectedSnapshot({ ...f.lease, projectId: 'other' })).toEqual({
      status: 'denied'
    })
    expect(await f.transport.readSelectedSnapshot({ ...f.lease, workspaceId: 'other' })).toEqual({
      status: 'denied'
    })
    expect(f.executeRaw).not.toHaveBeenCalled()
  })
  it('discards a delayed result after grant revision changes', async () => {
    const f = fixture()
    const gate = Promise.withResolvers<string>()
    f.executeRaw.mockReturnValue(gate.promise)
    const pending = f.transport.readSelectedSnapshot(f.lease)
    f.lease.grantRevision++
    gate.resolve(JSON.stringify(response()))
    expect(await pending).toEqual({ status: 'revoked' })
  })
  it('rejects reentrant refreshes while its one response is pending', async () => {
    const f = fixture()
    const gate = Promise.withResolvers<string>()
    f.executeRaw.mockReturnValue(gate.promise)
    const first = f.transport.readSelectedSnapshot(f.lease)
    expect(await f.transport.readSelectedSnapshot({ ...f.lease, actionId: 'reentrant' })).toEqual({
      status: 'busy'
    })
    gate.resolve(JSON.stringify(response()))
    expect((await first).status).toBe('ready')
    expect(f.executeRaw).toHaveBeenCalledOnce()
  })
  it('rejects oversized injected responses', async () => {
    const f = fixture()
    f.executeRaw.mockResolvedValue(' '.repeat(1024 * 1024 + 1))
    expect(await f.transport.readSelectedSnapshot(f.lease)).toEqual({
      status: 'transport_error',
      code: 'RESPONSE_TOO_LARGE'
    })
  })
  it('bounds an uncooperative executor and consumes its late rejection', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const gate = Promise.withResolvers<string>()
    f.executeRaw.mockReturnValue(gate.promise)
    const pending = f.transport.readSelectedSnapshot(f.lease)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await pending).toEqual({ status: 'transport_error', code: 'DEADLINE' })
    expect(f.executeRaw.mock.calls[0][0].signal.aborted).toBe(true)
    gate.reject(new Error('late secret failure'))
  })
  it('never begins a read after preflight has consumed the entire deadline', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let first = true
    f.lease.isCurrent = () => {
      if (first) {
        first = false
        vi.setSystemTime(Date.now() + 16_000)
      }
      return true
    }
    expect(await f.transport.readSelectedSnapshot(f.lease)).toEqual({
      status: 'transport_error',
      code: 'DEADLINE'
    })
    expect(f.executeRaw).not.toHaveBeenCalled()
  })
  it('cancels promptly when a source ignores the aborted lease', async () => {
    const f = fixture()
    const gate = Promise.withResolvers<string>()
    f.executeRaw.mockReturnValue(gate.promise)
    const controller = new AbortController()
    const pending = f.transport.readSelectedSnapshot({ ...f.lease, signal: controller.signal })
    controller.abort()
    expect(await pending).toEqual({ status: 'revoked' })
    gate.resolve(JSON.stringify(response()))
  })
})
