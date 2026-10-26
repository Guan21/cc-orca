import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installSelectedPrPreloadReceiver } from '../../preload/project-source-fact-receiver'
import type { MainSelectedPrFactPacket } from './project-source-main-pr-evidence-delivery'
import { MainSelectedPrRendererFactSink, PROJECT_SOURCE_CLEAR_CHANNEL, PROJECT_SOURCE_FACT_CHANNEL } from './project-source-main-renderer-sink'

const mocks = vi.hoisted(() => ({ fromWebContents: vi.fn(), packaged: { isPackaged: true } }))
vi.mock('electron', () => ({
  app: mocks.packaged,
  BrowserWindow: { fromWebContents: mocks.fromWebContents }
}))

const HEAD = 'a'.repeat(40)
const NOW = Date.parse('2026-10-25T12:00:00.000Z')
const URL = 'file:///DevCrew/resources/app.asar/out/renderer/index.html'

function create(enabled = true) {
  const frame = { processId: 3, routingId: 4, url: URL, isDestroyed: () => false }
  const session = {}
  const send = vi.fn()
  const contents = {
    id: 22,
    mainFrame: frame,
    session,
    send,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false
  }
  const window = { id: 11, webContents: contents, isDestroyed: () => false }
  mocks.fromWebContents.mockReturnValue(window)
  let authorized = true
  let profile: 'personal' | 'corporate' | 'development' = 'personal'
  let head: ReturnType<typeof pinnedHead> | null = pinnedHead()
  let change: () => void = () => {}
  const unsub = vi.fn()
  const subscribeRetirement = vi.fn((listener: () => void) => {
    change = listener
    return unsub
  })
  const options = {
    enabled,
    window: window as never,
    expectedDocumentUrl: URL,
    currentAppProfile: () => profile,
    isAuthorizedNow: () => authorized,
    readCurrent: () => head,
    subscribeRetirement,
    nowMs: () => NOW
  }
  const sink = new MainSelectedPrRendererFactSink(options)
  return {
    sink,
    options,
    window,
    contents,
    frame,
    session,
    send,
    subscribeRetirement,
    unsub,
    change: () => change(),
    setAuthorized: (value: boolean) => { authorized = value },
    setProfile: (value: 'personal' | 'corporate' | 'development') => { profile = value },
    setHead: (value: ReturnType<typeof pinnedHead> | null) => { head = value }
  }
}

function pinnedHead() {
  return {
    document: {
      profile: 'personal-packaged' as const,
      executionRealm: 'native' as const,
      installationId: 'native-install',
      windowId: 11,
      webContentsId: 22,
      frameProcessId: 3,
      frameRoutingId: 4,
      documentId: 'doc-1',
      sessionPartition: 'default',
      principalId: 'account-1',
      credentialGeneration: 1
    },
    binding: {
      projectId: 'p',
      workspaceKind: 'worktree' as const,
      workspaceId: 'worktree',
      hostSetupId: 'setup',
      executionHostId: 'local',
      repository: {
        host: 'github.com' as const,
        id: 77,
        nodeId: 'R_77',
        owner: 'Acme',
        name: 'Repo'
      },
      prNumber: 42
    },
    bindingRevision: 2,
    selectionRevision: 3,
    grantRevision: 4,
    sessionIncarnation: 'one-session',
    headSha: HEAD,
    observedAtMs: NOW - 1000
  }
}

function packet(): MainSelectedPrFactPacket {
  return {
    version: 1,
    projectId: 'p',
    prNumber: 42,
    headSha: HEAD,
    snapshot: {
      version: 1,
      projectId: 'p',
      bindingRevision: 2,
      repository: { host: 'github.com', id: 77, owner: 'Acme', name: 'Repo' },
      fetchedAt: new Date(NOW - 1000).toISOString(),
      facts: [
        {
          kind: 'pull_request',
          number: 42,
          headSha: HEAD,
          state: 'open',
          updatedAt: new Date(NOW - 2000).toISOString()
        },
        { kind: 'commit', sha: HEAD },
        { kind: 'check_run', id: 7, headSha: HEAD, status: 'completed', conclusion: 'success' }
      ],
      attestation: 'not_verified_by_projection',
      agentExecution: 'unknown',
      taskCompletion: 'unknown'
    }
  }
}

describe('G2-C2 private Main -> Renderer sink (inert, offline)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.packaged.isPackaged = true
  })

  it('denies by default and does not install a subscription or send', () => {
    const f = create(false)
    expect(f.sink.publish(packet())).toBe(false)
    expect(f.subscribeRetirement).not.toHaveBeenCalled()
    expect(f.send).not.toHaveBeenCalled()
    f.sink.dispose()
  })

  it('synchronously sends an allowlisted one-PR packet to approved Main document only', () => {
    const f = create()
    expect(f.sink.publish(packet())).toBe(true)
    expect(f.send).toHaveBeenCalledTimes(1)
    const [channel, payload] = f.send.mock.calls[0]
    expect(channel).toBe(PROJECT_SOURCE_FACT_CHANNEL)
    expect(payload).toMatchObject({ revision: 1, packet: { projectId: 'p', prNumber: 42, headSha: HEAD } })
    expect(payload.packet.snapshot.agentExecution).toBe('unknown')
    f.sink.dispose()
  })

  it.each([
    ['wrong project', { projectId: 'other' }],
    ['wrong PR', { prNumber: 99 }],
    ['wrong HEAD', { headSha: 'b'.repeat(40) }],
    ['wrong binding', { snapshot: { ...packet().snapshot, bindingRevision: 99 } }],
    ['false completion', { snapshot: { ...packet().snapshot, taskCompletion: 'completed' } }],
    ['malicious fact', { snapshot: { ...packet().snapshot, facts: [{ kind: 'prompt', secret: 'no' }] } }]
  ])('denies %s without emitting facts', (_name, change) => {
    const f = create()
    expect(f.sink.publish({ ...packet(), ...change } as MainSelectedPrFactPacket)).toBe(false)
    expect(f.send).not.toHaveBeenCalled()
    f.sink.dispose()
  })

  it('rejects untrusted frame, Session, profile and unpackaged runtime', () => {
    const f = create()
    f.contents.mainFrame = { ...f.frame, url: 'https://evil.invalid' }
    expect(f.sink.publish(packet())).toBe(false)
    f.contents.mainFrame = f.frame
    f.contents.session = {}
    expect(f.sink.publish(packet())).toBe(false)
    f.contents.session = f.session
    f.setProfile('corporate')
    expect(f.sink.publish(packet())).toBe(false)
    f.setProfile('personal')
    mocks.packaged.isPackaged = false
    expect(f.sink.publish(packet())).toBe(false)
    expect(f.send).not.toHaveBeenCalled()
    f.sink.dispose()
  })

  it('clears exactly once on known retirement and blocks an unauthorized old packet', () => {
    const f = create()
    expect(f.sink.publish(packet())).toBe(true)
    f.setAuthorized(false)
    f.change()
    f.change()
    expect(f.send.mock.calls.map((call) => call[0])).toEqual([
      PROJECT_SOURCE_FACT_CHANNEL,
      PROJECT_SOURCE_CLEAR_CHANNEL
    ])
    expect(f.send.mock.calls[1][1]).toEqual({ revision: 2 })
    expect(f.sink.publish(packet())).toBe(false)
    f.sink.dispose()
  })

  it('can deliver FACT -> CLEAR -> FACT after a fresh valid authorization', () => {
    const f = create()
    const facts: number[] = []
    const cleared = vi.fn()
    const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
    const stop = installSelectedPrPreloadReceiver(
      {
        on: (channel, listener) => {
          listeners.set(channel, listener)
        },
        removeListener: (channel) => {
          listeners.delete(channel)
        }
      },
      {
        enabled: true,
        nowMs: () => NOW,
        onFacts: (message) => {
          facts.push(message.revision)
        },
        onClear: cleared
      }
    )
    f.send.mockImplementation((channel: string, payload: unknown) => {
      listeners.get(channel)?.({}, payload)
    })

    expect(f.sink.publish(packet())).toBe(true)
    f.setAuthorized(false)
    f.change()
    // A stale event with the same revision as the preceding FACT cannot revive it.
    listeners.get(PROJECT_SOURCE_FACT_CHANNEL)?.({}, {
      revision: 1,
      packet: packet()
    })
    f.setAuthorized(true)
    expect(f.sink.publish(packet())).toBe(true)
    expect(facts).toEqual([1, 3])
    expect(cleared).toHaveBeenCalledTimes(1)
    expect(f.send.mock.calls.map((call) => [call[0], call[1].revision])).toEqual([
      [PROJECT_SOURCE_FACT_CHANNEL, 1],
      [PROJECT_SOURCE_CLEAR_CHANNEL, 2],
      [PROJECT_SOURCE_FACT_CHANNEL, 3]
    ])
    stop()
    f.sink.dispose()
  })

  it('issues newer revisions for consecutive successful refreshes and each retirement', () => {
    const f = create()
    expect(f.sink.publish(packet())).toBe(true)
    expect(f.sink.publish(packet())).toBe(true)
    f.change()
    expect(f.sink.publish(packet())).toBe(true)
    expect(f.send.mock.calls.map((call) => call[1].revision)).toEqual([1, 2, 3, 4])
    f.sink.dispose()
  })

  it('denies revision overflow without delivering a wrapped or nonnumeric FACT', () => {
    const f = create()
    const internal = f.sink as unknown as { epoch: number }
    internal.epoch = Number.MAX_SAFE_INTEGER
    expect(f.sink.publish(packet())).toBe(false)
    expect(f.send).not.toHaveBeenCalled()
    f.sink.dispose()
  })

  it('rejects missing current receipt and head replacement without sending facts', () => {
    const f = create()
    f.setHead(null)
    expect(f.sink.publish(packet())).toBe(false)
    f.setHead({ ...pinnedHead(), headSha: 'b'.repeat(40) })
    expect(f.sink.publish(packet())).toBe(false)
    expect(f.send).not.toHaveBeenCalled()
    f.sink.dispose()
  })

  it('blocks reentrant publication and sends clear after a retirement during dispatch', () => {
    const f = create()
    const channels: string[] = []
    f.send.mockImplementation((channel: string) => {
      channels.push(channel)
      if (channel === PROJECT_SOURCE_FACT_CHANNEL) {
        expect(f.sink.publish(packet())).toBe(false)
        f.setAuthorized(false)
        f.change()
      }
    })
    expect(f.sink.publish(packet())).toBe(false)
    expect(channels).toEqual([PROJECT_SOURCE_FACT_CHANNEL, PROJECT_SOURCE_CLEAR_CHANNEL])
    f.sink.dispose()
  })

  it('never sends to an invalidated document, even to clear an old display', () => {
    const f = create()
    expect(f.sink.publish(packet())).toBe(true)
    f.contents.mainFrame = { ...f.frame, url: 'file:///replacement.html' }
    f.change()
    expect(f.send).toHaveBeenCalledTimes(1)
    f.sink.dispose()
  })

  it('permanently denies an interrupted or failing retirement subscription', () => {
    const f = create(false)
    const callback = vi.fn()
    const sync = new MainSelectedPrRendererFactSink({
      ...f.options,
      enabled: true,
      subscribeRetirement: (listener) => {
        listener()
        return callback
      }
    })
    expect(sync.publish(packet())).toBe(false)
    expect(callback).toHaveBeenCalledOnce()
    const broken = new MainSelectedPrRendererFactSink({
      ...f.options,
      enabled: true,
      subscribeRetirement: () => { throw new Error('no event source') }
    })
    expect(broken.publish(packet())).toBe(false)
    sync.dispose()
    broken.dispose()
    f.sink.dispose()
  })

  it('clears and disposes subscriptions; never restores after dispose', () => {
    const f = create()
    expect(f.sink.publish(packet())).toBe(true)
    f.sink.dispose()
    expect(f.unsub).toHaveBeenCalledOnce()
    expect(f.send.mock.calls.at(-1)?.[0]).toBe(PROJECT_SOURCE_CLEAR_CHANNEL)
    expect(f.sink.publish(packet())).toBe(false)
  })
})
