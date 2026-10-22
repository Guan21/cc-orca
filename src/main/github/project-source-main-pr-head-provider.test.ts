import { describe, expect, it, vi } from 'vitest'
import { MainSelectedPrGrantRegistry } from './project-source-grant-registry'
import type {
  MainSelectedPrHeadAuthority,
  MainSelectedPrHeadEvidence
} from './project-source-main-pr-head-contract'
import { MainTrustedSelectedPrHeadProvider } from './project-source-main-pr-head-provider'
import {
  NOW,
  HEAD,
  OTHER_HEAD,
  AUTHORITY,
  head,
  context,
  ready,
  deferred,
  setup
} from './__fixtures__/selected-pr-head-provider'

describe('#167 trusted Main selected PR HEAD provider contract', () => {
  it('defaults disabled and does not touch authority or adapter callbacks', async () => {
    const f = setup({ enabled: undefined })
    expect(await f.acquire()).toEqual({ status: 'denied' })
    expect(f.readCurrent).not.toHaveBeenCalled()
    expect(f.readEvidence).not.toHaveBeenCalled()
    expect(f.subscribeAuthority).not.toHaveBeenCalled()
    expect(f.subscribeAdapter).not.toHaveBeenCalled()
  })

  it('requires explicit Owner authority and both independent Main sources', async () => {
    for (const options of [{ isOwnerAuthorized: undefined }, { isOwnerAuthorized: () => false }]) {
      const f = setup(options)
      expect(await f.acquire()).toEqual({ status: 'denied' })
      expect(f.readCurrent).not.toHaveBeenCalled()
      expect(f.readEvidence).not.toHaveBeenCalled()
    }
    for (const options of [{ authority: undefined }, { adapter: undefined }]) {
      const f = setup(options)
      expect(await f.acquire()).toEqual({ status: 'unavailable' })
      expect(f.readEvidence).not.toHaveBeenCalled()
      expect(f.subscribeAuthority).not.toHaveBeenCalled()
      expect(f.subscribeAdapter).not.toHaveBeenCalled()
    }
  })

  it('returns an immutable detached versioned receipt and sends selected G1 facts once', async () => {
    const f = setup()
    const result = await f.acquire()
    expect(result.status).toBe('verified')
    if (result.status !== 'verified') {
      throw new Error('Expected offline HEAD evidence')
    }
    expect(result.evidence).toEqual(head())
    expect(result.evidence).not.toBe(f.raw)
    expect(Object.isFrozen(result.evidence)).toBe(true)
    expect(Object.isFrozen(result.evidence.document)).toBe(true)
    expect(Object.isFrozen(result.evidence.binding.repository)).toBe(true)
    f.raw.binding.repository.name = 'changed-after-read'
    expect(result.evidence.binding.repository.name).toBe('service')
    const send = vi.fn()
    expect(f.provider.handoff(result.evidence, ready(), send)).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toMatchObject({ version: 1, headSha: HEAD, prNumber: 12 })
    expect(f.provider.handoff(result.evidence, ready(), send)).toBe(false)
    expect(send).toHaveBeenCalledOnce()
  })

  it('rejects copied and foreign receipts without consuming the original', async () => {
    const f = setup()
    const other = setup()
    const result = await f.acquire()
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    const send = vi.fn()
    expect(f.provider.handoff(structuredClone(result.evidence), ready(), send)).toBe(false)
    expect(other.provider.handoff(result.evidence, ready(), send)).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(f.provider.handoff(result.evidence, ready(), send)).toBe(true)
  })

  it('projects evidence through an allowlist that removes unknown credential-bearing fields', async () => {
    const f = setup()
    f.readEvidence.mockResolvedValue({
      ...head(),
      rawResponse: 'private',
      accessToken: 'private',
      document: { ...AUTHORITY.document, password: 'private' },
      binding: {
        ...AUTHORITY.binding,
        token: 'private',
        repository: { ...AUTHORITY.binding.repository, secret: 'private' }
      }
    })
    const result = await f.acquire()
    expect(result.status).toBe('verified')
    expect(JSON.stringify(result)).not.toMatch(
      /private|rawResponse|accessToken|password|secret|token/
    )
  })

  it('retires old receipts when another acquisition starts', async () => {
    const f = setup()
    const first = await f.acquire()
    const second = await f.acquire()
    if (first.status !== 'verified' || second.status !== 'verified') {
      throw new Error('Expected receipts')
    }
    expect(f.provider.handoff(first.evidence, ready(), vi.fn())).toBe(false)
    expect(f.provider.handoff(second.evidence, ready(), vi.fn())).toBe(true)
  })

  it.each(['invalidate', 'authorityChanged', 'adapterChanged', 'dispose'] as const)(
    'revokes issued evidence on %s',
    async (change) => {
      const f = setup()
      const result = await f.acquire()
      if (result.status !== 'verified') {
        throw new Error('Expected receipt')
      }
      if (change === 'invalidate' || change === 'dispose') {
        f.provider[change]()
      } else {
        f[change]()
      }
      const send = vi.fn()
      expect(f.provider.handoff(result.evidence, ready(), send)).toBe(false)
      expect(send).not.toHaveBeenCalled()
    }
  )

  it('dispose is permanent, idempotent, and releases subscriptions exactly once', async () => {
    const f = setup()
    f.provider.dispose()
    f.provider.dispose()
    f.authorityChanged()
    f.adapterChanged()
    expect(await f.acquire()).not.toMatchObject({ status: 'verified' })
    expect(f.readEvidence).not.toHaveBeenCalled()
    expect(f.unlistenAuthority).toHaveBeenCalledOnce()
    expect(f.unlistenAdapter).toHaveBeenCalledOnce()
  })

  it('rejects missing current authority before adapter invocation', async () => {
    const f = setup()
    f.setCurrent(null)
    expect(await f.acquire()).not.toMatchObject({ status: 'verified' })
    expect(f.readEvidence).not.toHaveBeenCalled()
  })

  it('compares source binding with the actual registry operation binding before reading', async () => {
    const authority = { ...AUTHORITY, binding: { ...AUTHORITY.binding, prNumber: 13 } }
    const f = setup()
    f.setCurrent(authority)
    f.readEvidence.mockResolvedValue(head(authority))
    expect(await f.acquire()).not.toMatchObject({ status: 'verified' })
    expect(f.readEvidence).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { version: 2 },
    { ...head(), version: 2 },
    { ...head(), headSha: 'local-branch' },
    { ...head(), headSha: '' },
    { ...head(), observedAtMs: Number.NaN },
    { ...head(), observedAtMs: Infinity },
    { ...head(), document: { ...AUTHORITY.document, documentId: '' } },
    { ...head(), document: { ...AUTHORITY.document, profile: 'corporate' } },
    { ...head(), document: { ...AUTHORITY.document, executionRealm: 'remote' } },
    { ...head(), binding: { ...AUTHORITY.binding, workspaceKind: 'folder' } },
    {
      ...head(),
      binding: {
        ...AUTHORITY.binding,
        repository: { ...AUTHORITY.binding.repository, host: 'gitlab.com' }
      }
    },
    { ...head(), binding: { ...AUTHORITY.binding, prNumber: 0 } },
    {
      ...head(),
      binding: { ...AUTHORITY.binding, repository: { ...AUTHORITY.binding.repository, id: 0 } }
    }
  ])('rejects malformed adapter payload %# without exposing raw data', async (payload) => {
    const f = setup()
    f.readEvidence.mockResolvedValue(payload)
    expect(await f.acquire()).toEqual({ status: 'incomplete' })
  })

  it.each([NOW + 1, NOW - 5 * 60_000 - 1])(
    'rejects future or expired evidence at %i',
    async (observedAtMs) => {
      const f = setup()
      f.raw.observedAtMs = observedAtMs
      expect(await f.acquire()).toEqual({ status: 'stale' })
    }
  )

  it.each([
    { bindingRevision: 7 },
    { selectionRevision: 10 },
    { grantRevision: 13 },
    { sessionIncarnation: 'restarted' },
    ...Object.entries(AUTHORITY.document).map(([key, value]) => ({
      document: {
        ...AUTHORITY.document,
        [key]: typeof value === 'number' ? value + 1 : `${value}-other`
      }
    })),
    ...['projectId', 'workspaceId', 'hostSetupId', 'executionHostId'].map((key) => ({
      binding: { ...AUTHORITY.binding, [key]: 'different' }
    })),
    { binding: { ...AUTHORITY.binding, prNumber: 13 } },
    ...Object.entries(AUTHORITY.binding.repository).map(([key, value]) => ({
      binding: {
        ...AUTHORITY.binding,
        repository: {
          ...AUTHORITY.binding.repository,
          [key]: typeof value === 'number' ? value + 1 : `${value}-other`
        }
      }
    }))
  ])('rejects every changed evidence scope dimension %#', async (patch) => {
    const f = setup()
    f.readEvidence.mockResolvedValue({ ...head(), ...patch })
    expect(await f.acquire()).not.toMatchObject({ status: 'verified' })
  })

  it.each([
    { bindingRevision: 7 },
    { grantRevision: 11 },
    { sessionIncarnation: 'another-session' },
    { expiresAtMs: NOW },
    { expiresAtMs: Number.NaN },
    { expiresAtMs: Infinity },
    { document: { ...AUTHORITY.document, principalId: 'another-user' } },
    { isCurrent: () => false }
  ])('rejects invalid or retired operation context %#', async (patch) => {
    const f = setup()
    expect(await f.acquire({ ...context(), ...patch })).not.toMatchObject({ status: 'verified' })
    expect(f.readEvidence).not.toHaveBeenCalled()
  })

  it('quarantines adapter and authority exceptions without propagating raw errors', async () => {
    const f = setup()
    f.readEvidence.mockRejectedValue(new Error('secret upstream token rawResponse'))
    expect(await f.acquire()).toEqual({ status: 'unavailable' })
    f.readCurrent.mockImplementation(() => {
      throw new Error('private authority state')
    })
    expect(await f.acquire()).toEqual({ status: 'unavailable' })
  })

  it('aborts before reading on caller cancellation and rejects late resolution', async () => {
    const f = setup()
    const cancelled = new AbortController()
    cancelled.abort()
    expect(await f.acquire(context(), cancelled.signal)).not.toMatchObject({ status: 'verified' })
    expect(f.readEvidence).not.toHaveBeenCalled()
    const pending = deferred<unknown>()
    f.readEvidence.mockReturnValue(pending.promise)
    const caller = new AbortController()
    const work = f.acquire(context(), caller.signal)
    caller.abort()
    expect(f.readEvidence.mock.calls[0][1].aborted).toBe(true)
    pending.resolve(head())
    expect(await work).not.toMatchObject({ status: 'verified' })
  })

  it('rejects a concurrent acquire and aborts an invalidated in-flight adapter', async () => {
    const f = setup()
    const pending = deferred<unknown>()
    f.readEvidence.mockReturnValue(pending.promise)
    const work = f.acquire()
    expect(await f.acquire()).toEqual({ status: 'denied' })
    expect(f.readEvidence).toHaveBeenCalledOnce()
    f.provider.invalidate()
    expect(f.readEvidence.mock.calls[0][1].aborted).toBe(true)
    pending.resolve(head())
    expect(await work).toEqual({ status: 'stale' })
  })

  it.each(['invalidate', 'caller', 'authority', 'adapter'] as const)(
    'settles %s cancellation even when the adapter never resolves',
    async (event) => {
      const f = setup()
      f.readEvidence.mockReturnValue(new Promise<unknown>(() => {}))
      const caller = new AbortController()
      const work = f.acquire(context(), caller.signal)
      if (event === 'caller') {
        caller.abort()
      } else if (event === 'invalidate') {
        f.provider.invalidate()
      } else if (event === 'authority') {
        f.authorityChanged()
      } else {
        f.adapterChanged()
      }
      expect(await work).toEqual({ status: 'stale' })
      expect(f.readEvidence.mock.calls[0][1].aborted).toBe(true)
    }
  )

  it('bounds an unresponsive offline adapter to fifteen seconds', async () => {
    vi.useFakeTimers()
    try {
      const f = setup()
      f.readEvidence.mockReturnValue(new Promise<unknown>(() => {}))
      const work = f.acquire()
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await work).toEqual({ status: 'stale' })
      expect(f.readEvidence.mock.calls[0][1].aborted).toBe(true)
      f.provider.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects authority A to B to A during asynchronous evidence acquisition', async () => {
    const f = setup()
    const pending = deferred<unknown>()
    f.readEvidence.mockReturnValue(pending.promise)
    const work = f.acquire()
    f.setCurrent({ ...AUTHORITY, selectionRevision: 10 })
    f.authorityChanged()
    f.setCurrent(AUTHORITY)
    f.authorityChanged()
    pending.resolve(head())
    expect(await work).toEqual({ status: 'stale' })
  })

  it('rechecks Owner acceptance and operation liveness after evidence resolves', async () => {
    for (const revokeOwner of [false, true]) {
      const f = setup()
      const pending = deferred<unknown>()
      let current = true
      f.readEvidence.mockReturnValue(pending.promise)
      const work = f.acquire({ ...context(), isCurrent: () => current })
      if (revokeOwner) {
        f.owner.mockReturnValue(false)
      } else {
        current = false
      }
      pending.resolve(head())
      expect(await work).not.toMatchObject({ status: 'verified' })
    }
  })

  it('rejects reentrant acquisition from adapter and final authorization callbacks', async () => {
    const f = setup()
    let nested: ReturnType<typeof f.acquire> | undefined
    f.readEvidence.mockImplementation(async () => {
      nested = f.acquire()
      return head()
    })
    const result = await f.acquire()
    expect(await nested).toEqual({ status: 'denied' })
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    f.owner.mockImplementation(() => {
      nested = f.acquire()
      return true
    })
    expect(f.provider.handoff(result.evidence, ready(), vi.fn())).toBe(true)
    expect(await nested).toEqual({ status: 'denied' })
  })

  it('consumes the receipt before calling a reentrant synchronous sender', async () => {
    const f = setup()
    const result = await f.acquire()
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    const nested = vi.fn()
    const send = vi.fn(() => {
      expect(f.provider.handoff(result.evidence, ready(), nested)).toBe(false)
    })
    expect(f.provider.handoff(result.evidence, ready(), send)).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    expect(nested).not.toHaveBeenCalled()
  })

  it('rejects revocation from the last Owner callback and authority callback', async () => {
    for (const revoke of ['owner', 'authority'] as const) {
      const f = setup()
      const result = await f.acquire()
      if (result.status !== 'verified') {
        throw new Error('Expected receipt')
      }
      if (revoke === 'owner') {
        f.owner.mockImplementation(() => {
          f.provider.invalidate()
          return true
        })
      } else {
        f.readCurrent.mockImplementation(() => {
          f.authorityChanged()
          return AUTHORITY
        })
      }
      const send = vi.fn()
      expect(f.provider.handoff(result.evidence, ready(), send)).toBe(false)
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('rechecks revocation after a callback reports the operation current', async () => {
    const f = setup()
    let revoke = false
    const operation = {
      ...context(),
      isCurrent: () => {
        if (revoke) {
          f.provider.invalidate()
        }
        return true
      }
    }
    const result = await f.acquire(operation)
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    revoke = true
    const send = vi.fn()
    expect(f.provider.handoff(result.evidence, ready(), send)).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('checks caller cancellation after acquisition and before final delivery', async () => {
    const f = setup()
    const caller = new AbortController()
    const result = await f.acquire(context(), caller.signal)
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    caller.abort()
    expect(f.provider.handoff(result.evidence, ready(), vi.fn())).toBe(false)
  })

  it('expires issued evidence and revalidates current document, selection and grant', async () => {
    const changes = [
      () => ({ ...AUTHORITY, selectionRevision: 10 }),
      () => ({ ...AUTHORITY, grantRevision: 13 }),
      () => ({ ...AUTHORITY, document: { ...AUTHORITY.document, documentId: 'replacement' } })
    ]
    for (const changed of changes) {
      const f = setup()
      const result = await f.acquire()
      if (result.status !== 'verified') {
        throw new Error('Expected receipt')
      }
      f.setCurrent(changed())
      expect(f.provider.handoff(result.evidence, ready(), vi.fn())).toBe(false)
    }
    const f = setup()
    const result = await f.acquire()
    if (result.status !== 'verified') {
      throw new Error('Expected receipt')
    }
    f.setNow(NOW + 5 * 60_000)
    expect(f.provider.handoff(result.evidence, ready(), vi.fn())).toBe(false)
  })

  it('uses the G1 fence to reject wrong selected PR, PR HEAD, commit and Check HEAD', async () => {
    for (const kind of ['pull_request', 'pr_head', 'commit', 'check_run']) {
      const f = setup()
      const result = await f.acquire()
      if (result.status !== 'verified') {
        throw new Error('Expected receipt')
      }
      const projection = ready(
        ready().snapshot.facts.map((fact) => {
          if (fact.kind === 'pull_request' && kind === 'pull_request') {
            return { ...fact, number: 99 }
          }
          if (fact.kind === 'pull_request' && kind === 'pr_head') {
            return { ...fact, headSha: OTHER_HEAD }
          }
          if (fact.kind === 'commit' && kind === 'commit') {
            return { ...fact, sha: OTHER_HEAD }
          }
          if (fact.kind === 'check_run' && kind === 'check_run') {
            return { ...fact, headSha: OTHER_HEAD }
          }
          return fact
        })
      )
      const send = vi.fn()
      expect(f.provider.handoff(result.evidence, projection, send)).toBe(false)
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('fails closed for throwing subscriptions and synchronously retired initialization', async () => {
    for (const synchronousChange of [false, true]) {
      const readEvidence = vi.fn(async () => head())
      const provider = new MainTrustedSelectedPrHeadProvider({
        enabled: true,
        isOwnerAuthorized: () => true,
        authority: {
          readCurrent: () => AUTHORITY,
          subscribeChanges: (listener) => {
            if (!synchronousChange) {
              throw new Error('subscription failed')
            }
            listener()
            return () => {}
          }
        },
        adapter: { readEvidence, subscribeChanges: () => () => {} },
        nowMs: () => NOW
      })
      expect(
        await provider.acquire(context(), new AbortController().signal, AUTHORITY.binding)
      ).toEqual({ status: 'unavailable' })
      expect(readEvidence).not.toHaveBeenCalled()
    }
  })

  it('fails closed when a subscription returns no unsubscribe function', async () => {
    const authority = { readCurrent: () => AUTHORITY, subscribeChanges: () => () => {} }
    Object.defineProperty(authority, 'subscribeChanges', { value: () => undefined })
    const readEvidence = vi.fn(async () => head())
    const provider = new MainTrustedSelectedPrHeadProvider({
      enabled: true,
      isOwnerAuthorized: () => true,
      authority,
      adapter: { readEvidence, subscribeChanges: () => () => {} },
      nowMs: () => NOW
    })
    expect(
      await provider.acquire(context(), new AbortController().signal, AUTHORITY.binding)
    ).toEqual({ status: 'unavailable' })
    expect(readEvidence).not.toHaveBeenCalled()
    provider.dispose()
  })

  it('requires real registry consent and rejects revoke and ABA inside registry operations', async () => {
    for (const event of ['consent', 'revoke', 'ABA'] as const) {
      const registry = new MainSelectedPrGrantRegistry(
        async () => true,
        () => NOW
      )
      registry.select(AUTHORITY.document, AUTHORITY.binding)
      const adapter = vi.fn(async (authority: MainSelectedPrHeadAuthority) => head(authority))
      const withoutGrant = vi.fn()
      expect(await registry.run(() => AUTHORITY.document, withoutGrant, vi.fn())).toEqual({
        status: 'denied'
      })
      expect(withoutGrant).not.toHaveBeenCalled()
      expect(await registry.requestGrant(() => AUTHORITY.document)).toBe(true)
      const send = vi.fn()
      await registry.run(
        () => AUTHORITY.document,
        async (binding, signal, operation) => {
          const authority: MainSelectedPrHeadAuthority = {
            ...AUTHORITY,
            document: operation.document,
            bindingRevision: operation.bindingRevision,
            grantRevision: operation.grantRevision,
            sessionIncarnation: operation.sessionIncarnation
          }
          const f = setup({
            authority: { readCurrent: () => authority, subscribeChanges: () => () => {} },
            adapter: { readEvidence: adapter, subscribeChanges: () => () => {} }
          })
          const result = await f.provider.acquire(operation, signal, binding)
          expect(result.status).toBe('verified')
          if (result.status !== 'verified') {
            throw new Error('Expected registry-scoped receipt')
          }
          if (event === 'revoke') {
            registry.revoke(AUTHORITY.document)
          }
          if (event === 'ABA') {
            registry.select(AUTHORITY.document, { ...AUTHORITY.binding, prNumber: 13 })
            registry.select(AUTHORITY.document, AUTHORITY.binding)
          }
          const original = ready()
          const projection = {
            ...original,
            snapshot: { ...original.snapshot, bindingRevision: operation.bindingRevision }
          }
          expect(f.provider.handoff(result.evidence, projection, send)).toBe(event === 'consent')
          f.provider.dispose()
          return 'offline'
        },
        vi.fn()
      )
      expect(send).toHaveBeenCalledTimes(event === 'consent' ? 1 : 0)
      expect(await registry.run(() => AUTHORITY.document, vi.fn(), vi.fn())).toEqual({
        status: 'denied'
      })
    }
  })

  it('accepts identities independent of Main object field order', async () => {
    const f = setup()
    const { credentialGeneration, ...document } = AUTHORITY.document
    const { id, nodeId, ...repository } = AUTHORITY.binding.repository
    const result = await f.provider.acquire(
      { ...context(), document: { credentialGeneration, ...document } },
      new AbortController().signal,
      { ...AUTHORITY.binding, repository: { ...repository, id, nodeId } }
    )
    expect(result.status).toBe('verified')
  })

  it('composes registry loader and synchronous delivery without outliving the operation', async () => {
    for (const deliverNow of [true, false]) {
      const registry = new MainSelectedPrGrantRegistry(
        async () => true,
        () => NOW
      )
      registry.select(AUTHORITY.document, AUTHORITY.binding)
      await registry.requestGrant(() => AUTHORITY.document)
      const f = setup()
      let evidence: MainSelectedPrHeadEvidence | undefined
      let projection = ready()
      const send = vi.fn()
      const outcome = await registry.run(
        () => AUTHORITY.document,
        async (binding, signal, operation) => {
          const authority = {
            ...AUTHORITY,
            binding,
            document: operation.document,
            bindingRevision: operation.bindingRevision,
            grantRevision: operation.grantRevision,
            sessionIncarnation: operation.sessionIncarnation
          }
          f.setCurrent(authority)
          f.readEvidence.mockResolvedValue(head(authority))
          projection = {
            ...projection,
            snapshot: { ...projection.snapshot, bindingRevision: operation.bindingRevision }
          }
          return f.provider.acquire(operation, signal, binding)
        },
        (result) => {
          if (result.status !== 'verified') {
            throw new Error('Expected registry-scoped evidence')
          }
          evidence = result.evidence
          if (deliverNow) {
            expect(f.provider.handoff(evidence, projection, send)).toBe(true)
          }
        }
      )
      expect(outcome).toEqual({ status: 'delivered' })
      expect(send).toHaveBeenCalledTimes(deliverNow ? 1 : 0)
      if (!evidence) {
        throw new Error('Expected evidence before registry completion')
      }
      expect(f.provider.handoff(evidence, projection, send)).toBe(false)
      f.provider.dispose()
    }
  })

  it('rejects an earlier source invalidating while the second subscription installs', async () => {
    let invalidateAuthority = () => {}
    const f = setup({
      authority: {
        readCurrent: () => AUTHORITY,
        subscribeChanges: (listener) => {
          invalidateAuthority = listener
          return () => {}
        }
      },
      adapter: {
        readEvidence: async () => head(),
        subscribeChanges: () => {
          invalidateAuthority()
          return () => {}
        }
      }
    })
    expect(await f.acquire()).toEqual({ status: 'unavailable' })
  })

  it.each([5, 6])(
    'rejects evidence expiry in final reauthentication callback %i',
    async (expireAt) => {
      const f = setup()
      const result = await f.acquire({ ...context(), expiresAtMs: NOW + 15 * 60_000 })
      if (result.status !== 'verified') {
        throw new Error('Expected receipt')
      }
      let reads = 0
      f.readCurrent.mockImplementation(() => {
        if (++reads === expireAt) {
          f.setNow(NOW + 5 * 60_000)
        }
        return AUTHORITY
      })
      const send = vi.fn()
      expect(f.provider.handoff(result.evidence, ready(), send)).toBe(false)
      expect(send).not.toHaveBeenCalled()
    }
  )
})
