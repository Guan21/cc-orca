import { describe, expect, it, vi } from 'vitest'
import {
  MainSelectedPrGrantRegistry,
  type TrustedSelectedPrBinding,
  type VerifiedSourceDocument
} from './project-source-grant-registry'

const IDENTITY: VerifiedSourceDocument = {
  profile: 'personal-packaged',
  executionRealm: 'native',
  installationId: 'desktop-a',
  windowId: 10,
  webContentsId: 20,
  frameProcessId: 21,
  frameRoutingId: 22,
  documentId: 'document-1',
  sessionPartition: 'persist:personal',
  principalId: 'github-user-1',
  credentialGeneration: 1
}

const BINDING: TrustedSelectedPrBinding = {
  projectId: 'project-a',
  workspaceKind: 'worktree',
  workspaceId: 'worktree-a',
  hostSetupId: 'host-setup-a',
  executionHostId: 'native-local-a',
  repository: {
    host: 'github.com',
    id: 432,
    nodeId: 'R_kwREAL_ID_CANDIDATE',
    owner: 'Alice',
    name: 'source'
  },
  prNumber: 12
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('#152 Main-only selected PR consent and scope fence', () => {
  it('selection cannot confer a read grant; explicit confirmation is required', async () => {
    const confirm = vi.fn(async () => true)
    const registry = new MainSelectedPrGrantRegistry(confirm)
    const deliver = vi.fn()
    expect(registry.select(IDENTITY, BINDING)).toBe(true)
    expect(await registry.run(() => IDENTITY, async () => 'value', deliver)).toEqual({
      status: 'denied'
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
    expect(await registry.requestGrant(() => IDENTITY)).toBe(true)
    const result = await registry.run(() => IDENTITY, async () => 'value', deliver)
    expect(result).toEqual({ status: 'delivered' })
    expect(deliver).toHaveBeenCalledExactlyOnceWith('value')
  })

  it('denied confirmation never grants and cannot be reused', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => false)
    expect(registry.select(IDENTITY, BINDING)).toBe(true)
    expect(await registry.requestGrant(() => IDENTITY)).toBe(false)
    expect(await registry.run(() => IDENTITY, async () => 1, vi.fn())).toEqual({
      status: 'denied'
    })
  })

  it('drops a late confirmation after A→B→A, even with identical repo/pr and identity', async () => {
    const prompt = deferred<boolean>()
    const registry = new MainSelectedPrGrantRegistry(() => prompt.promise)
    registry.select(IDENTITY, BINDING)
    const pending = registry.requestGrant(() => IDENTITY)
    registry.select(IDENTITY, { ...BINDING, projectId: 'project-b' })
    registry.select(IDENTITY, BINDING)
    prompt.resolve(true)
    expect(await pending).toBe(false)
    expect(await registry.run(() => IDENTITY, async () => 1, vi.fn())).toEqual({
      status: 'denied'
    })
  })

  it('a revoked grant cannot be reinstated by a pending user confirmation', async () => {
    const prompt = deferred<boolean>()
    const registry = new MainSelectedPrGrantRegistry(() => prompt.promise)
    registry.select(IDENTITY, BINDING)
    const pending = registry.requestGrant(() => IDENTITY)
    registry.revoke(IDENTITY)
    prompt.resolve(true)
    expect(await pending).toBe(false)
    expect(await registry.run(() => IDENTITY, async () => 1, vi.fn())).toEqual({
      status: 'denied'
    })
  })

  it('rejects a foreign window, frame, document, session, principal or credential', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    expect(await registry.requestGrant(() => IDENTITY)).toBe(true)
    const cases: VerifiedSourceDocument[] = [
      { ...IDENTITY, windowId: 30 },
      { ...IDENTITY, webContentsId: 30 },
      { ...IDENTITY, frameProcessId: 30 },
      { ...IDENTITY, frameRoutingId: 30 },
      { ...IDENTITY, documentId: 'document-2' },
      { ...IDENTITY, sessionPartition: 'persist:other' },
      { ...IDENTITY, principalId: 'github-user-2' },
      { ...IDENTITY, credentialGeneration: 2 },
      { ...IDENTITY, installationId: 'desktop-b' },
      { ...IDENTITY, executionRealm: 'wsl' as 'native' },
      { ...IDENTITY, profile: 'corporate' as 'personal-packaged' }
    ]
    for (const candidate of cases) {
      const loader = vi.fn(async () => 1)
      expect(await registry.run(() => candidate, loader, vi.fn())).toEqual({
        status: 'denied'
      })
      expect(loader).not.toHaveBeenCalled()
    }
  })

  it('blocks invalid Personal realm and unregistered/inconsistent binding candidates', () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    expect(
      registry.select({ ...IDENTITY, executionRealm: 'wsl' as 'native' }, BINDING)
    ).toBe(false)
    expect(
      registry.select(IDENTITY, {
        ...BINDING,
        repository: { ...BINDING.repository, host: 'enterprise.github.com' as 'github.com' }
      })
    ).toBe(false)
    expect(registry.select(IDENTITY, { ...BINDING, prNumber: 0 })).toBe(false)
    expect(
      registry.select(IDENTITY, {
        ...BINDING,
        repository: { ...BINDING.repository, id: 0 }
      })
    ).toBe(false)
  })

  it('invalid new selection discards an older authorization rather than preserving it', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    expect(registry.select(IDENTITY, BINDING)).toBe(true)
    expect(await registry.requestGrant(() => IDENTITY)).toBe(true)
    expect(registry.select(IDENTITY, { ...BINDING, prNumber: 0 })).toBe(false)
    const loader = vi.fn(async () => 'sensitive-old-project')
    expect(await registry.run(() => IDENTITY, loader, vi.fn())).toEqual({
      status: 'denied'
    })
    expect(loader).not.toHaveBeenCalled()
  })

  it('expires granted reads after 15 minutes, without auto renewal', async () => {
    let now = 1_000
    const registry = new MainSelectedPrGrantRegistry(async () => true, () => now)
    registry.select(IDENTITY, BINDING)
    expect(await registry.requestGrant(() => IDENTITY)).toBe(true)
    now += 15 * 60_000
    const loader = vi.fn(async () => 'data')
    expect(await registry.run(() => IDENTITY, loader, vi.fn())).toEqual({
      status: 'expired'
    })
    expect(loader).not.toHaveBeenCalled()
    expect(await registry.run(() => IDENTITY, loader, vi.fn())).toEqual({
      status: 'denied'
    })
  })

  it('drops responses after grant expiry while the loader is awaiting', async () => {
    let now = 10_000
    const registry = new MainSelectedPrGrantRegistry(async () => true, () => now)
    const response = deferred<string>()
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    const delivered = vi.fn()
    const result = registry.run(() => IDENTITY, async () => response.promise, delivered)
    now += 15 * 60_000
    response.resolve('sensitive')
    expect(await result).toEqual({ status: 'expired' })
    expect(delivered).not.toHaveBeenCalled()
  })

  it('aborts and discards late GitHub facts when Project/PR selection changes', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    const response = deferred<string>()
    let signal: AbortSignal | undefined
    const delivery = vi.fn()
    const pending = registry.run(
      () => IDENTITY,
      async (_scope, abort) => {
        signal = abort
        return response.promise
      },
      delivery
    )
    registry.select(IDENTITY, { ...BINDING, prNumber: 13 })
    expect(signal?.aborted).toBe(true)
    response.resolve('old PR facts')
    expect(await pending).toEqual({ status: 'revoked' })
    expect(delivery).not.toHaveBeenCalled()
  })

  it('revalidates the current document after await and just before delivery', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    const later = { ...IDENTITY, documentId: 'reloaded-document' }
    let current = IDENTITY
    const loader = vi.fn(async () => {
      current = later
      return 'old'
    })
    const delivered = vi.fn()
    expect(await registry.run(() => current, loader, delivered)).toEqual({
      status: 'revoked'
    })
    expect(delivered).not.toHaveBeenCalled()
  })

  it('serializes one in-flight read per binding and sends only one result', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    const response = deferred<string>()
    const delivered = vi.fn()
    const first = registry.run(() => IDENTITY, async () => response.promise, delivered)
    const loader = vi.fn(async () => 'second')
    expect(await registry.run(() => IDENTITY, loader, delivered)).toEqual({
      status: 'denied'
    })
    expect(loader).not.toHaveBeenCalled()
    response.resolve('first')
    expect(await first).toEqual({ status: 'delivered' })
    expect(delivered).toHaveBeenCalledTimes(1)
  })

  it('retire after navigation and restart clears all grants without persistence', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    registry.retireWebContents(IDENTITY.webContentsId)
    expect(await registry.run(() => IDENTITY, async () => 'old', vi.fn())).toEqual({
      status: 'denied'
    })
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    registry.retireAll()
    expect(await registry.run(() => IDENTITY, async () => 'old', vi.fn())).toEqual({
      status: 'denied'
    })
    const newSession = new MainSelectedPrGrantRegistry(async () => true)
    expect(newSession.getIncarnation()).not.toBe(registry.getIncarnation())
    expect(await newSession.run(() => IDENTITY, async () => 'old', vi.fn())).toEqual({
      status: 'denied'
    })
  })

  it('copies input binding so later external mutation does not redirect an active read', async () => {
    const mutableBinding = {
      ...BINDING,
      repository: { ...BINDING.repository }
    }
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, mutableBinding)
    await registry.requestGrant(() => IDENTITY)
    mutableBinding.repository.name = 'other-repository'
    const seen: string[] = []
    await registry.run(
      () => IDENTITY,
      async (bound) => {
        seen.push(bound.repository.name)
        return 1
      },
      vi.fn()
    )
    expect(seen).toEqual(['source'])
  })

  it('does not deliver a rejected read, nor reuse a grant for a different window', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(IDENTITY, BINDING)
    await registry.requestGrant(() => IDENTITY)
    const delivered = vi.fn()
    await expect(
      registry.run(
        () => IDENTITY,
        async () => {
          throw new Error('offline')
        },
        delivered
      )
    ).rejects.toThrow('offline')
    expect(delivered).not.toHaveBeenCalled()
    const other = { ...IDENTITY, windowId: 99, webContentsId: 99 }
    registry.select(other, { ...BINDING, projectId: 'other-project' })
    expect(await registry.run(() => other, async () => 'old', delivered)).toEqual({
      status: 'denied'
    })
  })
})
