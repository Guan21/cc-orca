import { describe, expect, it, vi } from 'vitest'
import {
  AUTHORITY,
  NOW,
  context,
  deferred,
  head,
  ready,
  setup
} from './__fixtures__/selected-pr-head-provider'

describe('offline selected PR HEAD retirement', () => {
  it.each(['project', 'repository', 'pr'] as const)(
    'rejects a pending response after unnotified %s replacement',
    async (identity) => {
      const f = setup()
      const pending = deferred<unknown>()
      f.readEvidence.mockReturnValue(pending.promise)
      const operation = f.acquire()
      const replacement = {
        ...AUTHORITY,
        binding: {
          ...AUTHORITY.binding,
          projectId: identity === 'project' ? 'another-project' : AUTHORITY.binding.projectId,
          prNumber: AUTHORITY.binding.prNumber + (identity === 'pr' ? 1 : 0),
          repository: {
            ...AUTHORITY.binding.repository,
            id: AUTHORITY.binding.repository.id + (identity === 'repository' ? 1 : 0)
          }
        }
      }
      f.setCurrent(replacement)
      pending.resolve(head())
      expect(await operation).toEqual({ status: 'stale' })
      f.provider.dispose()
    }
  )

  it('retires a receipt across observed selection ABA', async () => {
    const f = setup()
    const receipt = await f.acquire()
    expect(receipt.status).toBe('verified')
    if (receipt.status !== 'verified') {
      throw new Error('Expected offline receipt')
    }
    f.setCurrent({ ...AUTHORITY, selectionRevision: AUTHORITY.selectionRevision + 1 })
    f.authorityChanged()
    f.setCurrent(AUTHORITY)
    f.authorityChanged()
    const send = vi.fn()
    expect(f.provider.handoff(receipt.evidence, ready(), send)).toBe(false)
    expect(send).not.toHaveBeenCalled()
    f.provider.dispose()
  })

  it('rejects a reentrant adapter change while its read returns evidence', async () => {
    const f = setup()
    let nested: ReturnType<typeof f.acquire> | undefined
    f.readEvidence.mockImplementation(async () => {
      f.adapterChanged()
      nested = f.acquire()
      return head()
    })
    expect(await f.acquire()).toEqual({ status: 'stale' })
    expect(await nested).toEqual({ status: 'denied' })
    f.provider.dispose()
  })

  it('keeps a new receipt current when a retired adapter response resolves late', async () => {
    const f = setup()
    const pending = deferred<unknown>()
    f.readEvidence.mockReturnValueOnce(pending.promise)
    const old = f.acquire()
    f.adapterChanged()
    expect(await old).toEqual({ status: 'stale' })
    const current = await f.acquire()
    expect(current.status).toBe('verified')
    if (current.status !== 'verified') {
      throw new Error('Expected offline receipt')
    }
    pending.resolve(head())
    await Promise.resolve()
    const send = vi.fn()
    expect(f.provider.handoff(current.evidence, ready(), send)).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    f.provider.dispose()
  })

  it.each(['authority', 'clock'] as const)(
    'does not issue a receipt after the final %s callback retires its context',
    async (callback) => {
      const clock = vi.fn(() => NOW)
      const f = setup({ nowMs: clock })
      let live = true
      const operationContext = { ...context(), isCurrent: () => live }
      expect((await f.acquire(operationContext)).status).toBe('verified')
      const finalCall = (callback === 'authority' ? f.readCurrent : clock).mock.calls.length
      let calls = 0
      const revoke = (): void => {
        if (++calls === finalCall) {
          live = false
        }
      }
      if (callback === 'authority') {
        f.readCurrent.mockImplementation(() => {
          revoke()
          return AUTHORITY
        })
      } else {
        clock.mockImplementation(() => {
          revoke()
          return NOW
        })
      }
      expect((await f.acquire(operationContext)).status).not.toBe('verified')
      expect(live).toBe(false)
      f.provider.dispose()
    }
  )

  it.each(['authority', 'clock'] as const)(
    'rechecks operation retirement from the final %s callback before handoff',
    async (callback) => {
      const clock = vi.fn(() => NOW)
      const f = setup({ nowMs: clock })
      let live = true
      const operationContext = { ...context(), isCurrent: () => live }
      const first = await f.acquire(operationContext)
      if (first.status !== 'verified') {
        throw new Error('Expected offline receipt')
      }
      const callbackMock = callback === 'authority' ? f.readCurrent : clock
      callbackMock.mockClear()
      expect(f.provider.handoff(first.evidence, ready(), vi.fn())).toBe(true)
      // Measure the successful path so retirement targets its last external callback.
      const finalCall = callbackMock.mock.calls.length
      const second = await f.acquire(operationContext)
      if (second.status !== 'verified') {
        throw new Error('Expected offline receipt')
      }
      let calls = 0
      const revoke = (): void => {
        if (++calls === finalCall) {
          live = false
        }
      }
      if (callback === 'authority') {
        f.readCurrent.mockImplementation(() => {
          revoke()
          return AUTHORITY
        })
      } else {
        clock.mockImplementation(() => {
          revoke()
          return NOW
        })
      }
      const send = vi.fn()
      expect(f.provider.handoff(second.evidence, ready(), send)).toBe(false)
      expect(live).toBe(false)
      expect(send).not.toHaveBeenCalled()
      expect(f.provider.handoff(second.evidence, ready(), send)).toBe(false)
      f.provider.dispose()
    }
  )
})
