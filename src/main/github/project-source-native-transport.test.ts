import { describe, expect, it, vi } from 'vitest'
import { MainNativeGitHubTransport } from './project-source-native-transport'
import { MainNativeGitHubPrincipal } from './project-source-native-principal'

const execute = vi.hoisted(() => vi.fn())
const whenIdle = vi.hoisted(() => vi.fn())
vi.mock('../git/command-runner/project-source-native-gh', () => ({
  createProjectSourceNativeGhRunner: vi.fn(() => ({ execute, whenIdle })),
  ProjectSourceNativeGhError: class extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  }
}))

const now = Date.now()
const head = 'a'.repeat(40)
function fixture(enabled = true) {
  whenIdle.mockReset().mockResolvedValue(undefined)
  execute.mockReset().mockResolvedValue(
    JSON.stringify({
      data: {
        repository: {
          id: 'R_1',
          databaseId: 123,
          nameWithOwner: 'acme/repo'
        }
      }
    })
  )
  const retire = vi.fn()
  const principal = new MainNativeGitHubPrincipal(
    () => ({
      host: 'github.com',
      principalId: 'user:1',
      credentialGeneration: 2,
      source: 'os-keyring',
      configDir: '/trusted/gh',
      identityFingerprint: 'key-2',
      policyReviewReceipt: 'review',
      loginVerified: true
    }),
    retire
  )
  const transport = new MainNativeGitHubTransport({
    enabled,
    principal,
    runner: {
      executable: {
        path: '/gh',
        realPath: '/gh',
        sha256: 'a'.repeat(64),
        dev: 1,
        ino: 2,
        size: 4,
        mtimeMs: 1
      },
      runtime: () => ({ packaged: true, profile: 'personal', execution: 'native' }),
      environment: {},
      confinement: { assertConfined() {} }
    }
  })
  const lease = {
    operation: 'repositoryRegistration' as const,
    document: {
      profile: 'personal-packaged' as const,
      executionRealm: 'native' as const,
      installationId: 'install',
      windowId: 1,
      webContentsId: 2,
      frameProcessId: 3,
      frameRoutingId: 4,
      documentId: 'doc',
      sessionPartition: 'session',
      principalId: 'user:1',
      credentialGeneration: 2
    },
    projectId: 'project',
    workspaceId: 'folder',
    selectionRevision: 1,
    bindingRevision: 2,
    grantRevision: 3,
    sessionIncarnation: 'incarnation',
    actionId: 'action-1',
    expiresAtMs: now + 60_000,
    isCurrent: () => true,
    signal: new AbortController().signal,
    repository: { host: 'github.com' as const, owner: 'acme', name: 'repo' }
  }
  return { transport, lease, principal, retire }
}

describe('Main native transport composition', () => {
  it('defaults to disabled with zero process calls', async () => {
    const { transport, lease, principal } = fixture(false)
    const readPrincipal = vi.spyOn(principal, 'current')
    expect(await transport.register(lease)).toEqual({ status: 'disabled' })
    expect(execute).not.toHaveBeenCalled()
    expect(readPrincipal).not.toHaveBeenCalled()
  })
  it('registers only once per independent registration action', async () => {
    const { transport, lease } = fixture()
    expect((await transport.register(lease)).status).toBe('registered')
    expect(await transport.register(lease)).toEqual({ status: 'denied' })
    expect(await transport.register({ ...lease })).toEqual({ status: 'denied' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toMatchObject({
      operation: 'repositoryRegistration',
      variables: { owner: 'acme', name: 'repo' }
    })
  })
  it('PR refresh authority cannot authorize repository registration', async () => {
    const { transport, lease } = fixture()
    expect(await transport.register({ ...lease, operation: 'selectedPrRead' } as never)).toEqual({
      status: 'denied'
    })
    expect(execute).not.toHaveBeenCalled()
  })
  it.each(['documentId', 'principalId', 'credentialGeneration'] as const)(
    'rejects mutated %s evidence',
    async (field) => {
      const { transport, lease } = fixture()
      const pending = Promise.withResolvers<string>()
      execute.mockReturnValue(pending.promise)
      const result = transport.register(lease)
      Object.assign(lease.document, { [field]: field === 'credentialGeneration' ? 3 : 'changed' })
      pending.resolve('{}')
      expect(await result).toEqual({ status: 'revoked' })
    }
  )
  it('drops async revocation and A→B→A with advanced revision', async () => {
    const { transport, lease } = fixture()
    const pending = Promise.withResolvers<string>()
    execute.mockReturnValue(pending.promise)
    const result = transport.register(lease)
    lease.selectionRevision += 2
    pending.resolve('{}')
    expect(await result).toEqual({ status: 'revoked' })
  })
  it('aborts in-flight reads on retirement and blocks concurrent requests', async () => {
    const { transport, lease } = fixture()
    const pending = Promise.withResolvers<string>()
    execute.mockReturnValue(pending.promise)
    const result = transport.register(lease)
    expect(await transport.register({ ...lease })).toEqual({ status: 'busy' })
    transport.retireAll()
    expect(execute.mock.calls[0][0].signal.aborted).toBe(true)
    pending.resolve('{}')
    expect(await result).toEqual({ status: 'revoked' })
  })
  it('sanitizes thrown failures and malformed responses', async () => {
    const { transport, lease } = fixture()
    execute.mockRejectedValue(new Error('token=secret raw response'))
    expect(await transport.register(lease)).toEqual({ status: 'unavailable' })
    execute.mockResolvedValue('token=secret')
    expect(await transport.register({ ...lease, actionId: 'action-2' })).toEqual({
      status: 'unavailable'
    })
  })
  it('holds the shared permit across transport instances until termination is proven', async () => {
    const first = fixture()
    const barrier = Promise.withResolvers<void>()
    whenIdle.mockReturnValue(barrier.promise)
    expect((await first.transport.register(first.lease)).status).toBe('registered')
    const second = fixture()
    expect(await second.transport.register(second.lease)).toEqual({ status: 'busy' })
    barrier.resolve()
    await Promise.resolve()
    expect((await second.transport.register(second.lease)).status).toBe('registered')
  })
  it('rejects absent, expired, revoked or mismatched Main authority before execution', async () => {
    const { transport, lease, principal } = fixture()
    expect(await transport.register({ ...lease, expiresAtMs: 0 })).toEqual({ status: 'denied' })
    expect(await transport.register({ ...lease, isCurrent: () => false })).toEqual({
      status: 'denied'
    })
    expect(
      await transport.register({ ...lease, document: { ...lease.document, principalId: 'wrong' } })
    ).toEqual({ status: 'denied' })
    principal.revoke()
    expect(await transport.register({ ...lease })).toEqual({ status: 'denied' })
    expect(execute).not.toHaveBeenCalled()
  })
  it('never starts registration as a side-effect of PR read', async () => {
    const { transport, lease } = fixture()
    const result = await transport.readSelected({
      ...lease,
      operation: 'selectedPrRead',
      binding: {
        projectId: 'project',
        workspaceKind: 'folder',
        workspaceId: 'folder',
        hostSetupId: 'setup',
        executionHostId: 'local',
        prNumber: 42,
        repository: { ...lease.repository, id: 123, nodeId: 'R_1' }
      },
      headSha: head
    })
    expect(result.status).toBe('invalid')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0].operation).toBe('selectedPrRead')
  })
})
