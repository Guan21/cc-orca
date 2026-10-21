import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrimaryStateWriteOperations } from './primary-state-writes'
import {
  installWriteSchedulingOperationsContext,
  scheduleSave,
  WriteSchedulingOperations
} from './write-scheduling'

const { enqueueWriteMock } = vi.hoisted(() => ({ enqueueWriteMock: vi.fn() }))
vi.mock('./primary-state-writes', () => ({ enqueueWrite: enqueueWriteMock }))

type SchedulingRuntime = ConstructorParameters<typeof WriteSchedulingOperations>[0]

function scheduling() {
  const runtime: SchedulingRuntime = {
    activeViewPreference: {
      waitForPendingWrite: async () => {}
    } as SchedulingRuntime['activeViewPreference'],
    automationListProjectionCache: null,
    firstPendingSaveAt: null,
    pendingWrite: null,
    quitFlushStarted: false,
    writeGeneration: 0,
    writeTimer: null
  }
  const writes = {} as PrimaryStateWriteOperations
  const owner = new WriteSchedulingOperations(runtime, writes)
  return { owner, runtime, writes }
}

describe('Store synchronous mutation subscriptions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    enqueueWriteMock.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('observes both A to B to A mutations before the debounced write', () => {
    const { owner, runtime, writes } = scheduling()
    let selection = 'A'
    const observed: string[] = []
    owner.subscribeMutations(() => observed.push(selection))
    selection = 'B'
    scheduleSave(owner)
    selection = 'A'
    scheduleSave(owner)
    expect(observed).toEqual(['B', 'A'])
    expect(runtime.writeGeneration).toBe(2)
    expect(enqueueWriteMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(enqueueWriteMock).toHaveBeenCalledExactlyOnceWith(writes)
  })

  it('notifies even when quit persistence has finalized', () => {
    const { owner, runtime } = scheduling()
    runtime.quitFlushStarted = true
    const listener = vi.fn()
    owner.subscribeMutations(listener)
    scheduleSave(owner)
    expect(listener).toHaveBeenCalledOnce()
    expect(runtime.writeTimer).toBeNull()
    expect(runtime.writeGeneration).toBe(0)
  })

  it('supports idempotent unsubscription', () => {
    const { owner } = scheduling()
    const listener = vi.fn()
    const unsubscribe = owner.subscribeMutations(listener)
    unsubscribe()
    unsubscribe()
    scheduleSave(owner)
    expect(listener).not.toHaveBeenCalled()
  })

  it('attempts the original listener snapshot despite removal or failure', () => {
    const { owner } = scheduling()
    const second = vi.fn()
    let removeSecond = () => {}
    owner.subscribeMutations(() => {
      removeSecond()
      throw new Error('private listener failure')
    })
    removeSecond = owner.subscribeMutations(second)
    const third = vi.fn()
    owner.subscribeMutations(third)
    expect(() => scheduleSave(owner)).not.toThrow()
    expect(second).toHaveBeenCalledOnce()
    expect(third).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_000)
    expect(enqueueWriteMock).toHaveBeenCalledOnce()
    scheduleSave(owner)
    expect(second).toHaveBeenCalledOnce()
    expect(third).toHaveBeenCalledTimes(2)
  })

  it('defers listeners added during notification until the next mutation', () => {
    const { owner } = scheduling()
    const added = vi.fn()
    owner.subscribeMutations(() => owner.subscribeMutations(added))
    scheduleSave(owner)
    expect(added).not.toHaveBeenCalled()
    scheduleSave(owner)
    expect(added).toHaveBeenCalledOnce()
  })

  it('isolates listeners between Store domain contexts', () => {
    const first = scheduling().owner
    const second = scheduling().owner
    const listener = vi.fn()
    first.subscribeMutations(listener)
    scheduleSave(second)
    expect(listener).not.toHaveBeenCalled()
    scheduleSave(first)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('shares subscriptions with the composed Store context', () => {
    const { owner } = scheduling()
    const composed = Object.create(WriteSchedulingOperations.prototype) as WriteSchedulingOperations
    installWriteSchedulingOperationsContext(composed, owner)
    const listener = vi.fn()
    composed.subscribeMutations(listener)
    scheduleSave(owner)
    expect(listener).toHaveBeenCalledOnce()
  })
})
