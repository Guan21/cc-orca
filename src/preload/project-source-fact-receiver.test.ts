import { describe, expect, it, vi } from 'vitest'
import { installSelectedPrPreloadReceiver } from './project-source-fact-receiver'

const NOW = Date.parse('2026-10-25T13:00:00.000Z')
const SHA = 'a'.repeat(40)
const FACT = 'devCrew:privateSelectedPrFacts:v1'
const CLEAR = 'devCrew:clearPrivateSelectedPrFacts:v1'
function packet(revision = 0) {
  return {
    revision,
    packet: {
      version: 1, projectId: 'p', prNumber: 42, headSha: SHA,
      snapshot: {
        version: 1, projectId: 'p', bindingRevision: 7,
        repository: { host: 'github.com', id: 23, owner: 'Acme', name: 'Demo' },
        fetchedAt: new Date(NOW - 1000).toISOString(),
        facts: [
          { kind: 'pull_request', number: 42, headSha: SHA, state: 'open', updatedAt: new Date(NOW - 2000).toISOString() },
          { kind: 'commit', sha: SHA },
          { kind: 'check_run', id: 12, headSha: SHA, status: 'completed', conclusion: 'success' }
        ],
        attestation: 'not_verified_by_projection',
        agentExecution: 'unknown', taskCompletion: 'unknown'
      }
    }
  }
}
function fixture() {
  const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
  const ipc = {
    on: vi.fn((name: string, callback: (_event: unknown, payload: unknown) => void) => {
      listeners.set(name, callback)
    }),
    removeListener: vi.fn((name: string) => { listeners.delete(name) })
  }
  const received = vi.fn()
  const cleared = vi.fn()
  const emit = (name: string, payload: unknown) => listeners.get(name)?.({}, payload)
  return { listeners, ipc, received, cleared, emit }
}

describe('G2-C3 Preload receiver remains opt-in and default-off', () => {
  it('installs zero IPC listeners when disabled', () => {
    const f = fixture()
    const stop = installSelectedPrPreloadReceiver(f.ipc, {
      onFacts: f.received, onClear: f.cleared, nowMs: () => NOW
    })
    f.emit(FACT, packet())
    expect(f.ipc.on).not.toHaveBeenCalled()
    expect(f.received).not.toHaveBeenCalled()
    stop()
  })

  it('accepts one clean fact, clears on higher revision and rejects old replay', () => {
    const f = fixture()
    const stop = installSelectedPrPreloadReceiver(f.ipc, {
      enabled: true, onFacts: f.received, onClear: f.cleared, nowMs: () => NOW
    })
    f.emit(FACT, packet(0))
    f.emit(FACT, packet(0))
    f.emit(CLEAR, { revision: 1 })
    f.emit(FACT, packet(0))
    expect(f.received).toHaveBeenCalledTimes(1)
    expect(f.cleared).toHaveBeenCalledTimes(1)
    stop()
    expect(f.cleared).toHaveBeenCalledTimes(2)
    expect(f.listeners.size).toBe(0)
  })

  it('refuses a stale clear after a more recent packet', () => {
    const f = fixture()
    const stop = installSelectedPrPreloadReceiver(f.ipc, {
      enabled: true, onFacts: f.received, onClear: f.cleared, nowMs: () => NOW
    })
    f.emit(FACT, packet(3))
    f.emit(CLEAR, { revision: 2 })
    expect(f.cleared).not.toHaveBeenCalled()
    stop()
  })

  it('permanently retires on unexpected payload and clears protected view', () => {
    const f = fixture()
    const stop = installSelectedPrPreloadReceiver(f.ipc, {
      enabled: true, onFacts: f.received, onClear: f.cleared, nowMs: () => NOW
    })
    f.emit(FACT, packet())
    f.emit(FACT, { ...packet(1), unexpected: 'sensitive' })
    f.emit(FACT, packet(2))
    expect(f.received).toHaveBeenCalledTimes(1)
    expect(f.cleared).toHaveBeenCalledTimes(1)
    expect(f.listeners.size).toBe(0)
    stop()
  })

  it('handles reentrant teardown from the fact callback', () => {
    const f = fixture()
    let stop = () => undefined
    const onFacts = vi.fn(() => stop())
    stop = installSelectedPrPreloadReceiver(f.ipc, {
      enabled: true, onFacts, onClear: f.cleared, nowMs: () => NOW
    })
    f.emit(FACT, packet())
    expect(onFacts).toHaveBeenCalledOnce()
    expect(f.cleared).toHaveBeenCalledOnce()
    expect(f.listeners.size).toBe(0)
  })
})
