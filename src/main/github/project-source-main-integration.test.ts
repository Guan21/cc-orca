import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ window: vi.fn(), dialog: vi.fn(), process: vi.fn() }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { fromWebContents: mocks.window },
  dialog: { showMessageBox: mocks.dialog }
}))
vi.mock('node:fs/promises', () => ({
  realpath: vi.fn(async (path) => path),
  stat: vi.fn(async () => ({ dev: 1, ino: 2, size: 4, mtimeMs: 1, isFile: () => true })),
  readFile: vi.fn(async () => Buffer.from([77, 90, 0, 0]))
}))
vi.mock('../git/command-runner/exec-file-capture', () => ({
  execFileCaptureToTermination: mocks.process
}))

import { MainProjectSourceIntegration } from './project-source-main-integration'
import { MainProjectSourceCatalog } from './project-source-main-catalog'
import { MainCredentialEvidenceProvider } from './project-source-main-credential'
import type { Project, ProjectHostSetup } from '../../shared/project-types'
import type { Repo } from '../../shared/repo-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'

const HEAD = 'a'.repeat(40)
const URL = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'
const REPO = { id: 'R_1', databaseId: 321, nameWithOwner: 'Acme/Repo' }

function response() {
  const checkRuns = {
    totalCount: 1,
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: 'CR_1',
        databaseId: 99,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        repository: REPO,
        checkSuite: { id: 'CS_1' }
      }
    ]
  }
  const checkSuites = {
    totalCount: 1,
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: 'CS_1',
        databaseId: 71,
        commit: { oid: HEAD },
        repository: REPO,
        checkRuns
      }
    ]
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
          updatedAt: new Date(Date.now() - 1000).toISOString(),
          headRepository: REPO,
          commits: { nodes: [{ commit: { oid: HEAD, repository: REPO, checkSuites } }] }
        }
      }
    }
  }
}

function fixture(enabled = true) {
  const project: Project = {
    id: 'p',
    displayName: 'P',
    badgeColor: 'blue',
    sourceRepoIds: ['r'],
    createdAt: 1,
    updatedAt: 1,
    providerIdentity: { provider: 'github', owner: 'Acme', repo: 'Repo' }
  }
  const repo: Repo = {
    id: 'r',
    displayName: 'R',
    badgeColor: 'blue',
    path: '/repo',
    kind: 'git',
    addedAt: 1,
    gitRemoteIdentity: { canonicalKey: 'github.com/Acme/Repo' } as Repo['gitRemoteIdentity']
  }
  const setup: ProjectHostSetup = {
    id: 's',
    projectId: 'p',
    repoId: 'r',
    hostId: 'local',
    path: '/repo',
    displayName: 'S',
    setupState: 'ready',
    setupMethod: 'cloned',
    createdAt: 1,
    updatedAt: 1
  }
  const catalog = new MainProjectSourceCatalog({
    getSettings: () => ({ localWindowsRuntimeDefault: { kind: 'windows-host' as const } }),
    getProjects: () => [project],
    getProjectHostSetups: () => [setup],
    getRepos: () => [repo],
    subscribeMutations: () => () => {},
    getUnambiguousWorktreeMetaForHost: () =>
      ({
        instanceId: 'workspace-1',
        projectId: 'p',
        projectHostSetupId: 's',
        hostId: 'local'
      }) as WorktreeMeta
  })
  const selected = {
    projectId: 'p',
    repoId: 'r',
    hostSetupId: 's',
    workspaceKind: 'worktree' as const,
    workspaceId: 'r::/repo/w',
    prNumber: 42
  }
  expect(catalog.selectCurrent(selected)).toBe(true)
  let evidence = {
    host: 'github.com',
    source: 'os-keyring',
    principalId: 'user:1',
    credentialGeneration: 2,
    configDir: resolve('trusted-gh'),
    identityFingerprint: 'key-2',
    policyReviewReceipt: 'offline-fixture-only',
    loginVerified: true
  }
  let change!: () => void
  const readEvidence = vi.fn(() => evidence)
  const credential = new MainCredentialEvidenceProvider({
    adapter: {
      readEvidence,
      subscribeChanges: (listener) => {
        change = listener
        return () => {}
      }
    }
  })
  const frame = { processId: 2, routingId: 3, url: URL, isDestroyed: () => false }
  const session = { label: 'approved' }
  const sender = Object.assign(new EventEmitter(), {
    id: 5,
    session,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  })
  mocks.window.mockReturnValue({ id: 6, webContents: sender, isDestroyed: () => false })
  const event = { sender, senderFrame: frame }
  const path = resolve('trusted-gh.exe')
  const options = {
    enabled,
    approvedWebContents: sender as never,
    catalog,
    credential,
    origin: {
      approvedSession: session as never,
      expectedDocumentUrl: URL,
      currentAppProfile: () => 'personal' as const
    },
    runner: {
      executable: {
        path,
        realPath: path,
        dev: 1,
        ino: 2,
        size: 4,
        mtimeMs: 1,
        sha256: createHash('sha256')
          .update(Buffer.from([77, 90, 0, 0]))
          .digest('hex')
      },
      runtime: () => ({ packaged: true, profile: 'personal', execution: 'native' }),
      environment: {},
      confinement: { assertConfined: vi.fn() }
    }
  }
  const integration = new MainProjectSourceIntegration(options)
  return {
    integration,
    catalog,
    selected,
    event,
    sender,
    frame,
    project,
    repo,
    setup,
    options,
    readEvidence,
    rotate: () => {
      evidence = { ...evidence, credentialGeneration: 3 }
      change()
    }
  }
}

describe('B4c actual authorization → registration → native transport composition (offline)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dialog.mockResolvedValue({ response: 1 })
    mocks.process.mockImplementation(async (_path, _args, options) => {
      options.onChildTerminated()
      const query = JSON.parse(options.stdin).query as string
      return {
        stdout: JSON.stringify(
          query.includes('RepositoryRegistration') ? { data: { repository: REPO } } : response()
        ),
        stderr: ''
      }
    })
  })

  it('defaults disabled with zero credential, confirmation or process calls', async () => {
    const f = fixture(false)
    expect(await f.integration.register(f.event as never)).toBe('denied')
    expect(await f.integration.refresh(f.event as never, HEAD, vi.fn())).toEqual({
      status: 'denied'
    })
    expect(f.readEvidence).not.toHaveBeenCalled()
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(mocks.process).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it.each(['missing', 'malformed', 'throwing', 'synchronous'])(
    'permanently denies a %s catalog subscription',
    async (kind) => {
      const f = fixture()
      f.integration.dispose()
      const unsubscribe = vi.fn()
      const subscribe =
        kind === 'missing'
          ? undefined
          : (listener: () => void) => {
              if (kind === 'throwing') {
                throw new Error('subscription unavailable')
              }
              if (kind === 'synchronous') {
                listener()
              }
              return kind === 'malformed' ? undefined : unsubscribe
            }
      const integration = new MainProjectSourceIntegration({
        ...f.options,
        catalog: {
          readCatalog: () => f.catalog.readCatalog(),
          readSelection: () => f.catalog.readSelection(),
          isCurrentWorktree: (selection) => f.catalog.isCurrentWorktree(selection),
          subscribe
        } as never
      })
      expect(await integration.register(f.event as never)).toBe('denied')
      expect(mocks.process).not.toHaveBeenCalled()
      integration.dispose()
      if (kind === 'synchronous') {
        expect(unsubscribe).toHaveBeenCalledOnce()
      }
    }
  )

  it('disposes every subscription and origin listener even when one unsubscribe throws', async () => {
    const f = fixture()
    f.integration.dispose()
    const credentialUnsubscribe = vi.fn()
    const integration = new MainProjectSourceIntegration({
      ...f.options,
      catalog: {
        readCatalog: () => f.catalog.readCatalog(),
        readSelection: () => f.catalog.readSelection(),
        isCurrentWorktree: (selection) => f.catalog.isCurrentWorktree(selection),
        subscribe: () => () => {
          throw new Error('cleanup failed')
        }
      },
      credential: {
        current: () => f.options.credential.current(),
        principal: f.options.credential.principal,
        subscribeRevocation: () => credentialUnsubscribe
      }
    })
    expect(await integration.register(f.event as never)).toBe('registered')
    expect(() => integration.dispose()).not.toThrow()
    expect(() => integration.dispose()).not.toThrow()
    expect(credentialUnsubscribe).toHaveBeenCalledOnce()
    expect(f.sender.eventNames()).toEqual([])
    expect(await integration.register(f.event as never)).toBe('denied')
  })

  it('continues removing lifecycle listeners after an Electron listener removal throws', async () => {
    const f = fixture()
    expect(await f.integration.register(f.event as never)).toBe('registered')
    const remove = f.sender.removeListener.bind(f.sender)
    vi.spyOn(f.sender, 'removeListener').mockImplementation((name, listener) => {
      if (name === 'did-start-navigation') {
        throw new Error('detachment failed')
      }
      return remove(name, listener)
    })
    expect(() => f.integration.dispose()).not.toThrow()
    expect(f.sender.listenerCount('will-navigate')).toBe(0)
    expect(f.sender.listenerCount('destroyed')).toBe(0)
    expect(await f.integration.register(f.event as never)).toBe('denied')
  })

  it('requires independent default-Cancel native registration and read confirmations', async () => {
    const f = fixture()
    const deliver = vi.fn()
    expect(await f.integration.refresh(f.event as never, HEAD, deliver)).toEqual({
      status: 'denied'
    })
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(await f.integration.register(f.event as never)).toBe('registered')
    expect(mocks.process).toHaveBeenCalledTimes(1)
    expect(await f.integration.refresh(f.event as never, HEAD, deliver)).toEqual({
      status: 'delivered'
    })
    expect(deliver).toHaveBeenCalledOnce()
    expect(deliver.mock.calls[0][0].status).toBe('ready')
    expect(mocks.dialog.mock.calls.map((call) => call[1].title)).toEqual([
      'DevCrew — GitHub repository registration',
      'DevCrew — GitHub project read'
    ])
    for (const call of mocks.dialog.mock.calls) {
      expect(call[1]).toMatchObject({ defaultId: 0, cancelId: 0 })
    }
    f.integration.dispose()
  })

  it.each(['registration', 'read'])(
    'Cancel %s never authorizes its operation',
    async (operation) => {
      const f = fixture()
      if (operation === 'read') {
        expect(await f.integration.register(f.event as never)).toBe('registered')
      }
      mocks.dialog.mockResolvedValue({ response: 0 })
      const before = mocks.process.mock.calls.length
      if (operation === 'registration') {
        expect(await f.integration.register(f.event as never)).toBe('denied')
      } else {
        expect(await f.integration.refresh(f.event as never, HEAD, vi.fn())).toEqual({
          status: 'denied'
        })
      }
      expect(mocks.process).toHaveBeenCalledTimes(before)
      f.integration.dispose()
    }
  )

  it.each(['projectId', 'repoId', 'workspaceId'])('forged %s cannot register', async (field) => {
    const f = fixture()
    f.catalog.selectCurrent({ ...f.selected, [field]: 'forged' })
    expect(await f.integration.register(f.event as never)).toBe('denied')
    expect(mocks.process).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it.each(['subframe', 'session', 'window', 'document'])('rejects wrong %s', async (kind) => {
    const f = fixture()
    if (kind === 'subframe') {
      f.event.senderFrame = { ...f.frame }
    }
    if (kind === 'session') {
      f.sender.session = { label: 'replacement' }
    }
    if (kind === 'window') {
      mocks.window.mockReturnValue(null)
    }
    if (kind === 'document') {
      f.frame.url = 'https://evil.test'
    }
    expect(await f.integration.register(f.event as never)).toBe('denied')
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(mocks.process).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it('pins actual Main WebContents in addition to Session/document URL', async () => {
    const f = fixture()
    const other = { ...f.event, sender: Object.assign(new EventEmitter(), f.sender, { id: 7 }) }
    expect(await f.integration.register(other as never)).toBe('denied')
    expect(mocks.process).not.toHaveBeenCalled()
    f.integration.dispose()
  })

  it.each(['did-start-navigation', 'destroyed', 'render-process-gone'])(
    'drops delayed registration on %s',
    async (name) => {
      const f = fixture()
      const gate = Promise.withResolvers<{ response: number }>()
      mocks.dialog.mockReturnValue(gate.promise)
      const pending = f.integration.register(f.event as never)
      await vi.waitFor(() => expect(mocks.dialog).toHaveBeenCalledOnce())
      f.sender.emit(name)
      gate.resolve({ response: 1 })
      expect(await pending).toBe('stale')
      expect(mocks.process).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )

  it.each(['ABA', 'delete/recreate', 'rebind', 'host', 'credential', 'revoke', 'restart'])(
    'revokes registration and pending read after %s',
    async (kind) => {
      const f = fixture()
      expect(await f.integration.register(f.event as never)).toBe('registered')
      const gate = Promise.withResolvers<{ stdout: string; stderr: string }>()
      mocks.process.mockImplementation(async (_path, _args, options) => {
        const result = await gate.promise
        options.onChildTerminated()
        return result
      })
      const deliver = vi.fn()
      const pending = f.integration.refresh(f.event as never, HEAD, deliver)
      await vi.waitFor(() => expect(mocks.process).toHaveBeenCalledTimes(2))
      if (kind === 'ABA') {
        f.catalog.selectCurrent({ ...f.selected, prNumber: 43 })
        f.catalog.selectCurrent(f.selected)
      } else if (kind === 'credential') {
        f.rotate()
      } else if (kind === 'revoke') {
        f.integration.revoke()
      } else if (kind === 'restart') {
        f.integration.dispose()
      } else {
        f.catalog.invalidate()
        if (kind === 'rebind') {
          f.project.updatedAt++
        }
        if (kind === 'host') {
          f.setup.executionHostId = 'ssh:remote'
        }
        f.catalog.selectCurrent(f.selected)
      }
      expect(mocks.process.mock.calls[1][2].signal.aborted).toBe(true)
      gate.resolve({ stdout: JSON.stringify(response()), stderr: '' })
      expect((await pending).status).not.toBe('delivered')
      expect(deliver).not.toHaveBeenCalled()
      expect((await f.integration.refresh(f.event as never, HEAD, deliver)).status).toBe('denied')
      f.integration.dispose()
    }
  )

  it('denies duplicate reads while consent is pending', async () => {
    const f = fixture()
    expect(await f.integration.register(f.event as never)).toBe('registered')
    const gate = Promise.withResolvers<{ response: number }>()
    mocks.dialog.mockReturnValue(gate.promise)
    const first = f.integration.refresh(f.event as never, HEAD, vi.fn())
    expect(await f.integration.refresh(f.event as never, HEAD, vi.fn())).toEqual({
      status: 'denied'
    })
    gate.resolve({ response: 0 })
    expect(await first).toEqual({ status: 'denied' })
    f.integration.dispose()
  })

  it.each(['registration', 'read'] as const)(
    'does not inherit %s authority when IDs and revisions repeat after replacement',
    async (phase) => {
      const old = fixture()
      if (phase === 'read') {
        expect(await old.integration.register(old.event as never)).toBe('registered')
      }
      const revision = old.catalog.readSelection()!.selectionRevision
      const generation = old.options.credential.current()!.credentialGeneration
      const gate = Promise.withResolvers<{ stdout: string; stderr: string }>()
      mocks.process.mockImplementation(async (_path, _args, options) => {
        const result = await gate.promise
        options.onChildTerminated()
        return result
      })
      const deliver = vi.fn()
      const pending =
        phase === 'registration'
          ? old.integration.register(old.event as never)
          : old.integration.refresh(old.event as never, HEAD, deliver)
      const calls = phase === 'registration' ? 1 : 2
      await vi.waitFor(() => expect(mocks.process).toHaveBeenCalledTimes(calls))
      old.integration.dispose()
      old.options.credential.dispose()
      old.catalog.dispose()
      const restarted = fixture()
      expect(restarted.sender.id).toBe(old.sender.id)
      expect(restarted.frame.processId).toBe(old.frame.processId)
      expect(restarted.catalog.readSelection()!.selectionRevision).toBe(revision)
      expect(restarted.options.credential.current()!.credentialGeneration).toBe(generation)
      expect(await restarted.integration.refresh(restarted.event as never, HEAD, deliver)).toEqual({
        status: 'denied'
      })
      expect(await restarted.integration.refresh(old.event as never, HEAD, deliver)).toEqual({
        status: 'denied'
      })
      gate.resolve({
        stdout: JSON.stringify(
          phase === 'registration' ? { data: { repository: REPO } } : response()
        ),
        stderr: ''
      })
      expect(await pending).toEqual(phase === 'registration' ? 'stale' : { status: 'unavailable' })
      expect(await restarted.integration.refresh(restarted.event as never, HEAD, deliver)).toEqual({
        status: 'denied'
      })
      expect(deliver).not.toHaveBeenCalled()
      expect(mocks.process).toHaveBeenCalledTimes(calls)
      expect(old.options.credential.current()).toBeNull()
      restarted.integration.dispose()
      restarted.options.credential.dispose()
      restarted.catalog.dispose()
    }
  )

  it.each(['registration', 'read'])(
    'settles pending %s confirmation immediately on disposal without user interaction',
    async (operation) => {
      const f = fixture()
      if (operation === 'read') {
        expect(await f.integration.register(f.event as never)).toBe('registered')
      }
      const gate = Promise.withResolvers<{ response: number }>()
      mocks.dialog.mockReturnValue(gate.promise)
      let settled = false
      const deliver = vi.fn()
      const pending = (
        operation === 'registration'
          ? f.integration.register(f.event as never)
          : f.integration.refresh(f.event as never, HEAD, deliver)
      ).then((result) => {
        settled = true
        return result
      })
      await vi.waitFor(() =>
        expect(mocks.dialog).toHaveBeenCalledTimes(operation === 'read' ? 2 : 1)
      )
      const options = mocks.dialog.mock.lastCall![1]
      f.integration.dispose()
      await vi.waitFor(() => expect(settled).toBe(true), { timeout: 200 })
      expect(options.signal.aborted).toBe(true)
      expect(await pending).toEqual(operation === 'registration' ? 'stale' : { status: 'denied' })
      gate.reject(new Error('late native rejection must be consumed'))
      expect(deliver).not.toHaveBeenCalled()
    }
  )

  it.each(['partial', 'HEAD', 'repository', 'checks', 'secret'])(
    'does not deliver %s failure or expose raw errors',
    async (kind) => {
      const f = fixture()
      expect(await f.integration.register(f.event as never)).toBe('registered')
      const input = response()
      if (kind === 'HEAD') {
        input.data.node.pullRequest.headRefOid = 'b'.repeat(40)
      }
      if (kind === 'repository') {
        input.data.node.databaseId = 999
      }
      if (kind === 'checks') {
        input.data.node.pullRequest.commits.nodes[0].commit.checkSuites.totalCount = 2
      }
      mocks.process.mockImplementation(async (_path, _args, options) => {
        options.onChildTerminated()
        if (kind === 'secret') {
          throw new Error('token=DO_NOT_LEAK')
        }
        return {
          stdout: JSON.stringify(
            kind === 'partial' ? { ...input, errors: [{ message: 'secret' }] } : input
          )
        }
      })
      const deliver = vi.fn()
      const result = await f.integration.refresh(f.event as never, HEAD, deliver)
      expect(result).toEqual({ status: 'unavailable' })
      expect(JSON.stringify(result)).not.toMatch(/secret|DO_NOT_LEAK/)
      expect(deliver).not.toHaveBeenCalled()
      f.integration.dispose()
    }
  )
})
