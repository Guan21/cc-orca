import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOURCE_LIFECYCLE_DOMAINS } from './project-source-main-composition'
import { AUTHORITY, NOW, deferred, head, ready } from './__fixtures__/selected-pr-head-provider'
import { setup } from './__fixtures__/selected-pr-source-composition'
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
afterEach(() => vi.useRealTimers())

describe('#169 offline Main source composition', () => {
  it('defaults disabled without touching injected sources or readiness', async () => {
    const f = await setup({ enabled: undefined })
    expect(await f.run()).toEqual({ status: 'denied' })
    f.composition.invalidate()
    f.composition.dispose()
    expect(f.readCurrent).not.toHaveBeenCalled()
    expect(f.readProjection).not.toHaveBeenCalled()
    expect(f.readiness.owner).not.toHaveBeenCalled()
    expect(f.lifecycle.project).not.toHaveBeenCalled()
    expect(f.authority.retireAll).not.toHaveBeenCalled()
  })

  it('composes the real one-use grant, Task B receipt and Task A G1 fence', async () => {
    const f = await setup()
    expect(await f.run()).toEqual({ status: 'delivered' })
    expect(f.send).toHaveBeenCalledOnce()
    expect(f.send.mock.calls[0][0]).toMatchObject({
      version: 1,
      headSha: 'a'.repeat(40),
      prNumber: 12
    })
    expect(await f.run()).toEqual({ status: 'denied' })
    expect(f.readProjection).toHaveBeenCalledOnce()
  })

  it.each([
    'authority',
    'provider',
    'readCurrent',
    'readProjection',
    'readiness',
    'lifecycle'
  ] as const)('requires the independent %s source', async (key) => {
    const f = await setup({ [key]: undefined })
    expect(await f.run()).toEqual({ status: 'unavailable' })
    expect(f.send).not.toHaveBeenCalled()
    expect(f.readProjection).not.toHaveBeenCalled()
    expect(f.lifecycle.project).not.toHaveBeenCalled()
  })

  it.each(['owner', 'exactSha', 'nativeQa', 'effectiveAcl', 'nativeCustody'] as const)(
    'requires explicit current %s readiness and reserves busy before readiness',
    async (key) => {
      const f = await setup()
      f.readiness[key].mockReturnValue(false)
      expect(await f.run()).toEqual({ status: 'denied' })
      expect(f.readProjection).not.toHaveBeenCalled()
      f.readiness[key].mockImplementation(() => {
        void f.run().then((result) => expect(result.status).toBe('denied'))
        return true
      })
      expect(await f.run()).toEqual({ status: 'delivered' })
      expect(f.send).toHaveBeenCalledOnce()
      const missing = await setup({ readiness: { ...f.readiness, [key]: undefined } })
      expect(await missing.run()).toEqual({ status: 'unavailable' })
    }
  )

  it.each(SOURCE_LIFECYCLE_DOMAINS)('requires %s lifecycle subscription', async (domain) => {
    const f = await setup()
    const missing = await setup({ lifecycle: { ...f.lifecycle, [domain]: undefined } })
    expect(await missing.run()).toEqual({ status: 'unavailable' })
    expect(missing.send).not.toHaveBeenCalled()
    f.composition.dispose()
  })

  it.each(SOURCE_LIFECYCLE_DOMAINS)(
    'retires %s ABA during both HEAD and projection awaits',
    async (domain) => {
      for (const phase of ['head', 'projection'] as const) {
        const f = await setup()
        const pending = deferred<unknown>()
        const entered = deferred<boolean>()
        if (phase === 'head') {
          f.readEvidence.mockImplementation(async () => {
            entered.resolve(true)
            return (await pending.promise) as ReturnType<typeof head>
          })
        } else {
          f.readProjection.mockImplementation(async () => {
            entered.resolve(true)
            return await pending.promise
          })
        }
        const operation = f.run()
        await entered.promise
        const original = f.getCurrent()
        f.change(domain)
        f.setCurrent({ ...original, selectionRevision: original.selectionRevision + 1 })
        f.change(domain)
        f.setCurrent(original)
        expect(f.authority.retireAll).toHaveBeenCalled()
        expect((await operation).status).not.toBe('delivered')
        pending.resolve(phase === 'head' ? head(original) : ready())
        await Promise.resolve()
        expect(f.send).not.toHaveBeenCalled()
        expect(await f.run()).toEqual({ status: 'denied' })
        f.composition.dispose()
      }
    }
  )

  it.each(SOURCE_LIFECYCLE_DOMAINS)(
    'blocks %s invalidation inside a final authority callback',
    async (domain) => {
      const f = await setup()
      const original = f.readCurrent.getMockImplementation()!
      f.readProjection.mockImplementation(async () => {
        f.readCurrent.mockImplementationOnce(() => {
          const current = original()
          f.change(domain)
          return current
        })
        return ready()
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.send).not.toHaveBeenCalled()
    }
  )

  it('makes installation races and failures permanently unavailable and cleans every installed source', async () => {
    const f = await setup()
    const race = await setup({
      lifecycle: {
        ...f.lifecycle,
        frame: (listener) => {
          listener()
          return f.cleanup
        }
      }
    })
    expect(await race.run()).toEqual({ status: 'unavailable' })
    expect(f.cleanup).toHaveBeenCalledTimes(6)
    const failed = await setup({
      lifecycle: {
        ...f.lifecycle,
        frame: () => {
          throw new Error('credential secret')
        }
      }
    })
    expect(await failed.run()).toEqual({ status: 'unavailable' })
    expect(f.cleanup).toHaveBeenCalledTimes(11)
    const malformed = await setup({
      lifecycle: { ...f.lifecycle, project: () => undefined as never }
    })
    expect(await malformed.run()).toEqual({ status: 'unavailable' })
    f.composition.dispose()
  })

  it.each([
    'document',
    'binding',
    'bindingRevision',
    'grantRevision',
    'sessionIncarnation'
  ] as const)('requires authenticated %s to match the actual registry operation', async (field) => {
    const f = await setup()
    f.readCurrent.mockImplementation(() => ({
      ...f.getCurrent(),
      [field]:
        field === 'binding'
          ? { ...AUTHORITY.binding, prNumber: 99 }
          : field === 'document'
            ? { ...AUTHORITY.document, principalId: 'other' }
            : field.endsWith('Revision')
              ? 999
              : 'other'
    }))
    expect(await f.run()).toEqual({ status: 'denied' })
    expect(f.readProjection).not.toHaveBeenCalled()
    expect(f.send).not.toHaveBeenCalled()
  })

  it.each(['pr', 'repo', 'head', 'checks', 'g1', 'disclaimer'] as const)(
    'rejects malformed or mismatched %s facts even when registry delivery returns delivered',
    async (field) => {
      const f = await setup()
      f.readProjection.mockImplementation(async () => {
        const value = structuredClone(ready()) as Mutable<ReturnType<typeof ready>>
        value.snapshot.bindingRevision = f.getCurrent().bindingRevision
        if (field === 'pr') {
          value.snapshot.facts = [
            {
              kind: 'pull_request',
              number: 99,
              headSha: head().headSha,
              state: 'open',
              updatedAt: value.snapshot.fetchedAt
            },
            ...value.snapshot.facts.slice(1)
          ]
        }
        if (field === 'repo') {
          value.snapshot.repository.id = 999
        }
        if (field === 'head') {
          value.snapshot.facts = [{ kind: 'commit', sha: 'b'.repeat(40) }]
        }
        if (field === 'checks') {
          value.snapshot.facts = [
            ...value.snapshot.facts,
            {
              kind: 'check_run',
              id: 99,
              headSha: 'b'.repeat(40),
              status: 'completed',
              conclusion: 'success'
            }
          ]
        }
        if (field === 'g1') {
          value.snapshot.version = 2 as never
        }
        if (field === 'disclaimer') {
          value.snapshot.attestation = 'verified' as never
        }
        return value
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.send).not.toHaveBeenCalled()
    }
  )

  it('clones hostile projection access before the final synchronous fence', async () => {
    const f = await setup()
    f.readProjection.mockImplementation(async () => ({
      status: 'ready',
      get snapshot() {
        f.change('document')
        return ready().snapshot
      }
    }))
    expect((await f.run()).status).not.toBe('delivered')
    expect(f.send).not.toHaveBeenCalled()
  })

  it('rechecks attestation and readiness after asynchronous reads', async () => {
    const f = await setup()
    f.readProjection.mockImplementation(async () => {
      f.readiness.effectiveAcl.mockReturnValue(false)
      return ready()
    })
    expect((await f.run()).status).not.toBe('delivered')
    expect(f.send).not.toHaveBeenCalled()
    const other = await setup()
    other.readProjection.mockImplementation(async () => {
      other.authority.attest.mockReturnValue({ ...AUTHORITY.document, documentId: 'other' })
      return ready()
    })
    expect((await other.run()).status).not.toBe('delivered')
    expect(other.send).not.toHaveBeenCalled()
  })

  it('preserves actual registry revoke and expiry during reads', async () => {
    for (const revoke of [true, false]) {
      const f = await setup()
      f.readProjection.mockImplementation(async () => {
        if (revoke) {
          f.registry.revoke(AUTHORITY.document)
        } else {
          f.setNow(NOW + 16 * 60_000)
        }
        return ready()
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.send).not.toHaveBeenCalled()
    }
  })

  it('bounds pending work to 15 seconds, rejects duplicates and ignores late completion', async () => {
    vi.useFakeTimers()
    const f = await setup()
    const pending = deferred<unknown>()
    const entered = deferred<boolean>()
    f.readProjection.mockImplementation(async () => {
      entered.resolve(true)
      return pending.promise
    })
    const operation = f.run()
    await entered.promise
    expect(await f.run()).toEqual({ status: 'denied' })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await operation).toEqual({ status: 'stale' })
    expect(f.readProjection.mock.calls[0][2].aborted).toBe(true)
    expect(await f.run()).toEqual({ status: 'denied' })
    pending.resolve(ready())
    await Promise.resolve()
    expect(f.send).not.toHaveBeenCalled()
  })

  it('cancels without awaiting an uncooperative source and disposes all subscriptions once', async () => {
    const f = await setup()
    const entered = deferred<boolean>()
    f.readProjection.mockImplementation(() => {
      entered.resolve(true)
      return new Promise(() => {})
    })
    const controller = new AbortController()
    const operation = f.run(controller.signal)
    await entered.promise
    controller.abort()
    expect(await operation).toEqual({ status: 'stale' })
    f.composition.dispose()
    f.composition.dispose()
    expect(f.cleanup).toHaveBeenCalledTimes(SOURCE_LIFECYCLE_DOMAINS.length)
    expect(await f.run()).toEqual({ status: 'unavailable' })
    expect(f.send).not.toHaveBeenCalled()
  })

  it('sanitizes callback failures and cleans up even when unsubscribe throws', async () => {
    const f = await setup()
    f.readProjection.mockRejectedValue(new Error('secret-token'))
    expect(await f.run()).toEqual({ status: 'unavailable' })
    f.cleanup.mockImplementation(() => {
      throw new Error('secret-token')
    })
    expect(() => f.composition.dispose()).not.toThrow()
    expect(f.cleanup).toHaveBeenCalledTimes(SOURCE_LIFECYCLE_DOMAINS.length)
    expect(f.send).not.toHaveBeenCalled()
  })

  it.each(['readCurrent', 'attest'] as const)(
    'blocks direct registry revocation inside final %s callback',
    async (callback) => {
      const f = await setup()
      f.beforeDeliver(() => {
        const revoke = () => {
          f.registry.revoke(AUTHORITY.document)
          return f.getCurrent()
        }
        if (callback === 'readCurrent') {
          f.readCurrent.mockImplementationOnce(revoke)
        } else {
          f.authority.attest.mockImplementationOnce(() => revoke().document)
        }
      })
      expect((await f.run()).status).not.toBe('delivered')
      expect(f.send).not.toHaveBeenCalled()
    }
  )

  it('exposes sanitized offline readiness and reserves its callback reentrancy', async () => {
    const disabled = await setup({ enabled: undefined })
    expect(disabled.composition.readiness()).toEqual({ status: 'disabled' })
    const missing = await setup({ provider: undefined })
    expect(missing.composition.readiness()).toEqual({ status: 'unavailable' })
    const f = await setup()
    f.readiness.owner.mockImplementation(() => {
      expect(f.composition.readiness()).toEqual({ status: 'busy' })
      return true
    })
    expect(f.composition.readiness()).toEqual({ status: 'offline_ready' })
    f.readiness.exactSha.mockReturnValue(false)
    expect(f.composition.readiness()).toEqual({ status: 'denied' })
    f.composition.dispose()
    expect(f.composition.readiness()).toEqual({ status: 'disposed' })
  })

  it('retires an existing grant when the input signal is already cancelled', async () => {
    const f = await setup()
    const controller = new AbortController()
    controller.abort()
    expect(await f.run(controller.signal)).toEqual({ status: 'denied' })
    expect(await f.run()).toEqual({ status: 'denied' })
    expect(f.readProjection).not.toHaveBeenCalled()
  })
})
