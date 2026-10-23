import { describe, expect, it, vi } from 'vitest'
import {
  MainSelectedPrGrantRegistry,
  type MainSelectedPrOperationContext,
  type TrustedSelectedPrBinding,
  type VerifiedSourceDocument
} from './project-source-grant-registry'

const document: VerifiedSourceDocument = {
  profile: 'personal-packaged',
  executionRealm: 'native',
  installationId: 'desktop',
  windowId: 1,
  webContentsId: 2,
  frameProcessId: 3,
  frameRoutingId: 4,
  documentId: 'document',
  sessionPartition: 'personal',
  principalId: 'user',
  credentialGeneration: 1
}
const binding: TrustedSelectedPrBinding = {
  projectId: 'project',
  workspaceKind: 'worktree',
  workspaceId: 'worktree',
  hostSetupId: 'setup',
  executionHostId: 'native',
  prNumber: 1,
  repository: { host: 'github.com', id: 1, nodeId: 'repo', owner: 'owner', name: 'repo' }
}

describe('#174 grant callback publication fences', () => {
  it.each(['context', 'delivery'] as const)(
    'checks expiry after the final %s attestation',
    async (phase) => {
      let now = 100
      let reads = 0
      let armed = false
      const registry = new MainSelectedPrGrantRegistry(
        async () => true,
        () => now
      )
      registry.select(document, binding)
      await registry.requestGrant(() => document)
      const delivered = vi.fn()
      const result = await registry.run(
        () => {
          reads += 1
          if (armed && (phase === 'context' || reads === 3)) {
            now += 15 * 60_000
          }
          return document
        },
        async (_binding, _signal, context) => {
          armed = true
          if (phase === 'context') {
            expect(context.isCurrent()).toBe(false)
          }
          return 'expired'
        },
        delivered
      )
      expect(result.status).not.toBe('delivered')
      expect(delivered).not.toHaveBeenCalled()
    }
  )

  it.each(['revoke', 'retireWebContents', 'retireAll', 'select'] as const)(
    '%s retires authority before abort callbacks and rejects reentrant selection',
    async (method) => {
      const registry = new MainSelectedPrGrantRegistry(async () => true)
      registry.select(document, binding)
      await registry.requestGrant(() => document)
      let release!: (value: string) => void
      const pending = new Promise<string>((resolve) => {
        release = resolve
      })
      let observedGrant: Promise<boolean> | undefined
      let selected: boolean | undefined
      const delivered = vi.fn()
      const result = registry.run(
        () => document,
        async (_scope, signal) => {
          signal.addEventListener(
            'abort',
            () => {
              registry.revoke(document)
              selected = registry.select(document, binding)
              observedGrant = registry.requestGrant(() => document)
            },
            { once: true }
          )
          return pending
        },
        delivered
      )
      if (method === 'revoke') {
        registry.revoke(document)
      } else if (method === 'retireWebContents') {
        registry.retireWebContents(document.webContentsId)
      } else if (method === 'select') {
        registry.select(document, { ...binding, prNumber: 2 })
      } else {
        registry.retireAll()
      }
      expect(selected).toBe(false)
      expect(await observedGrant).toBe(false)
      release('stale')
      expect(await result).toEqual({ status: 'revoked' })
      expect(delivered).not.toHaveBeenCalled()
      expect(registry.select(document, binding)).toBe(true)
      expect(await registry.requestGrant(() => document)).toBe(true)
      expect(
        await registry.run(
          () => document,
          async () => 'fresh',
          delivered
        )
      ).toEqual({ status: 'delivered' })
      expect(delivered).toHaveBeenCalledExactlyOnceWith('fresh')
    }
  )

  it.each(['attestation', 'clock'] as const)(
    'rejects revocation inside the final %s callback',
    async (callback) => {
      let armed = false
      let reads = 0
      const registry = new MainSelectedPrGrantRegistry(
        async () => true,
        () => {
          if (armed && callback === 'clock') {
            registry.revoke(document)
          }
          return 100
        }
      )
      registry.select(document, binding)
      await registry.requestGrant(() => document)
      const deliver = vi.fn()
      const result = await registry.run(
        () => {
          reads += 1
          if (callback === 'attestation' && reads === 3) {
            registry.revoke(document)
          }
          return document
        },
        async () => {
          armed = true
          return 'stale'
        },
        deliver
      )
      expect(result).toEqual({ status: 'revoked' })
      expect(deliver).not.toHaveBeenCalled()
    }
  )

  it('rechecks grant identity after context attestation reenters revoke', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(document, binding)
    await registry.requestGrant(() => document)
    let armed = false
    let context!: MainSelectedPrOperationContext
    const result = registry.run(
      () => {
        if (armed) {
          registry.revoke(document)
        }
        return document
      },
      async (_scope, _signal, operation) => {
        context = operation
        armed = true
        expect(context.isCurrent()).toBe(false)
        return 'stale'
      },
      vi.fn()
    )
    expect(await result).toEqual({ status: 'revoked' })
  })

  it('cannot reinstate consent when its clock reenters revoke', async () => {
    let armed = false
    const registry = new MainSelectedPrGrantRegistry(
      async () => true,
      () => {
        if (armed) {
          registry.revoke(document)
        }
        return 100
      }
    )
    registry.select(document, binding)
    armed = true
    expect(await registry.requestGrant(() => document)).toBe(false)
    armed = false
    const load = vi.fn(async () => 'stale')
    expect(await registry.run(() => document, load, vi.fn())).toEqual({ status: 'denied' })
    expect(load).not.toHaveBeenCalled()
  })

  it('never starts a loader after the initial clock revokes its grant', async () => {
    let armed = false
    const registry = new MainSelectedPrGrantRegistry(
      async () => true,
      () => {
        if (armed) {
          registry.revoke(document)
        }
        return 100
      }
    )
    registry.select(document, binding)
    await registry.requestGrant(() => document)
    armed = true
    const load = vi.fn(async () => 'stale')
    expect(await registry.run(() => document, load, vi.fn())).toEqual({ status: 'revoked' })
    expect(load).not.toHaveBeenCalled()
  })

  it('retireAll invalidates every document before the first abort callback', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    const other = { ...document, webContentsId: 22 }
    for (const identity of [document, other]) {
      registry.select(identity, binding)
      await registry.requestGrant(() => identity)
    }
    const otherLoad = vi.fn(async () => 'stale')
    let nested!: Promise<unknown>
    const result = registry.run(
      () => document,
      async (_scope, signal) => {
        signal.addEventListener(
          'abort',
          () => {
            nested = registry.run(() => other, otherLoad, vi.fn())
          },
          { once: true }
        )
        registry.retireAll()
        return 'stale'
      },
      vi.fn()
    )
    expect(await result).toEqual({ status: 'revoked' })
    expect(await nested).toEqual({ status: 'denied' })
    expect(otherLoad).not.toHaveBeenCalled()
  })
  it('preserves nested revocation of another document during abort', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    const other = { ...document, webContentsId: 22 }
    for (const identity of [document, other]) {
      registry.select(identity, binding)
      await registry.requestGrant(() => identity)
    }
    const result = registry.run(
      () => document,
      async (_scope, signal) => {
        signal.addEventListener('abort', () => registry.revoke(other), { once: true })
        registry.revoke(document)
        return 'stale'
      },
      vi.fn()
    )
    expect(await result).toEqual({ status: 'revoked' })
    const load = vi.fn(async () => 'stale')
    expect(await registry.run(() => other, load, vi.fn())).toEqual({ status: 'denied' })
    expect(load).not.toHaveBeenCalled()
  })
  it('does not publish an outer selection after an abort callback retires all authority', async () => {
    const registry = new MainSelectedPrGrantRegistry(async () => true)
    registry.select(document, binding)
    await registry.requestGrant(() => document)
    const result = registry.run(
      () => document,
      async (_scope, signal) => {
        signal.addEventListener('abort', () => registry.retireAll(), { once: true })
        expect(registry.select(document, { ...binding, prNumber: 2 })).toBe(false)
        return 'stale'
      },
      vi.fn()
    )
    expect(await result).toEqual({ status: 'revoked' })
    expect(await registry.requestGrant(() => document)).toBe(false)
  })
})
